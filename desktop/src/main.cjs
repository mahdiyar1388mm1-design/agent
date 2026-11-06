'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, session, shell, screen,
} = require('electron');
const {
  APP_URL, isAppUrl, isEmbeddedUrl, isSafeExternalUrl, isAllowedPopup,
  navigationKind, originLabel, isAllowedAction, isTrustedSender, canGrantPermission,
} = require('./policy.cjs');
const { readWindowState, saveWindowState } = require('./window-state.cjs');

const APP_ID = 'io.github.mahdiyar1388mm1.arena-desktop';
const PARTITION = 'persist:arena-desktop';
const TOOLBAR_HEIGHT = 76;
const ICON = path.join(__dirname, '../assets/icon.png');
const SHELL_FILE = path.join(__dirname, 'renderer/index.html');
const SHELL_URL = pathToFileURL(SHELL_FILE).href;
const SECURE_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  nodeIntegrationInWorker: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
  allowRunningInsecureContent: false,
});

app.setName('Arena Desktop');
// Never reuse a browser profile or another application's cookies.
app.setPath('userData', path.join(app.getPath('appData'), 'ArenaDesktopUnofficial'));

let mainWindow = null;
let siteView = null;
let applicationMenu = null;
let pendingExternal = false;
const popups = new Set();
let state = {
  ready: false,
  loading: true,
  canGoBack: false,
  canGoForward: false,
  origin: 'arena.ai',
  error: null,
};

function siteContents() {
  return siteView && !siteView.webContents.isDestroyed() ? siteView.webContents : null;
}

function publish(patch = {}) {
  state = { ...state, ...patch };
  const contents = siteContents();
  if (contents) {
    state.canGoBack = contents.navigationHistory.canGoBack();
    state.canGoForward = contents.navigationHistory.canGoForward();
    state.origin = originLabel(contents.getURL() || APP_URL);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    // The site is a separate, sandboxed WebContentsView. Only this local shell
    // receives state messages, and only it has the preload bridge.
    if (!mainWindow.webContents.isLoadingMainFrame()) {
      mainWindow.webContents.send('arena:state-changed', state);
    }
    siteView?.setVisible(state.ready && !state.error);
  }
}

function fail(code, description) {
  publish({ ready: false, loading: false, error: { code, description } });
}

async function loadHome() {
  const contents = siteContents();
  if (!contents) return;
  publish({ error: null, loading: true });
  try {
    await contents.loadURL(APP_URL);
  } catch (error) {
    // Replaced navigations produce ERR_ABORTED and are not connection failures.
    if (error.code === 'ERR_ABORTED' || error.errno === -3) return;
    // did-fail-load supplies a safe, useful error code. Never bypass TLS errors.
    if (!state.error && !contents.isDestroyed() && !contents.isLoading()) {
      fail('CONNECTION', 'امکان برقراری ارتباط با سایت وجود ندارد.');
    }
  }
}

async function requestExternal(value) {
  if (!isSafeExternalUrl(value) || pendingExternal || !mainWindow) return;
  pendingExternal = true;
  try {
    const target = new URL(value);
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'بازکردن پیوند خارجی',
      message: 'این پیوند خارج از Arena باز می‌شود.',
      detail: `مقصد: ${target.protocol === 'mailto:' ? 'برنامهٔ ایمیل' : target.host}\n\n${target.href}`,
      buttons: ['بازکردن', 'لغو'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) await shell.openExternal(target.href);
  } catch {
    // Closing a window while a dialog is open must not crash the app.
  } finally {
    pendingExternal = false;
  }
}

async function openInBrowser() {
  const current = siteContents()?.getURL();
  // Do not send an OAuth provider's transient URL to a different browser.
  const target = isAppUrl(current) ? current : APP_URL;
  try {
    await shell.openExternal(target);
  } catch {
    if (mainWindow) await dialog.showMessageBox(mainWindow, {
      type: 'error',
      message: 'مرورگر پیش‌فرض باز نشد.',
      detail: 'می‌توانید https://arena.ai را مستقیماً در مرورگر خود باز کنید.',
    });
  }
}

function guardNavigation(contents) {
  const guard = (event, url) => {
    if (isEmbeddedUrl(url)) return;
    event.preventDefault();
    if (navigationKind(url) === 'external') void requestExternal(url);
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedPopup(url, contents.getURL())) {
      if (isSafeExternalUrl(url)) void requestExternal(url);
      return { action: 'deny' };
    }
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: mainWindow,
        width: 540,
        height: 740,
        minWidth: 420,
        minHeight: 540,
        icon: ICON,
        autoHideMenuBar: true,
        webPreferences: { ...SECURE_PREFERENCES, partition: PARTITION, preload: undefined },
      },
    };
  });
  contents.on('did-create-window', (popup) => {
    popups.add(popup);
    popup.setMenu(null);
    popup.on('closed', () => popups.delete(popup));
    guardNavigation(popup.webContents);
    const updateTitle = () => {
      if (!popup.isDestroyed()) popup.setTitle(`${originLabel(popup.webContents.getURL())} — ورود به Arena`);
    };
    popup.webContents.on('page-title-updated', (event) => {
      event.preventDefault();
      updateTitle();
    });
    popup.webContents.on('did-navigate', updateTitle);
  });
}

function configureSession(profile) {
  profile.setPermissionCheckHandler((_contents, permission, origin, details) => (
    canGrantPermission(permission, origin, details?.isMainFrame !== false)
  ));
  profile.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(canGrantPermission(
      permission, details?.requestingUrl || contents.getURL(), details?.isMainFrame !== false,
    ));
  });
  profile.setDevicePermissionHandler(() => false);
  profile.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  profile.on('will-download', (_event, item) => {
    // Always use Chromium's native Save As dialog. Never execute a downloaded file.
    item.setSaveDialogOptions({
      title: 'ذخیرهٔ فایل از Arena',
      defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())),
      buttonLabel: 'ذخیره',
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
  });
}

async function clearLocalData(profile) {
  if (!mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'پاک‌کردن داده‌های محلی',
    message: 'از حساب خود در این برنامه خارج می‌شوید.',
    detail: 'کوکی‌ها، حافظهٔ موقت و داده‌های محلی سایت حذف می‌شوند. داده‌های ذخیره‌نشده ممکن است از دست بروند. این کار حساب یا گفتگوهای روی سرور Arena را حذف نمی‌کند.',
    buttons: ['پاک‌کردن داده‌ها', 'لغو'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (response !== 0) return;
  try {
    for (const popup of popups) if (!popup.isDestroyed()) popup.close();
    siteContents()?.stop();
    await profile.clearStorageData();
    await profile.clearCache();
    await loadHome();
  } catch {
    if (mainWindow) await dialog.showMessageBox(mainWindow, {
      type: 'error', message: 'پاک‌کردن داده‌ها کامل نشد. برنامه را ببندید و دوباره امتحان کنید.',
    });
  }
}

function zoom(delta) {
  const contents = siteContents();
  if (contents) contents.setZoomFactor(Math.min(2, Math.max(0.5, contents.getZoomFactor() + delta)));
}

function createMenu(profile) {
  return Menu.buildFromTemplate([
    {
      label: 'برنامه',
      submenu: [
        { label: 'صفحهٔ اصلی Arena', accelerator: 'Alt+Home', click: () => void loadHome() },
        { label: 'بازکردن در مرورگر', click: () => void openInBrowser() },
        { type: 'separator' },
        { label: 'پاک‌کردن داده‌های محلی…', click: () => void clearLocalData(profile) },
        { type: 'separator' },
        { label: 'خروج', role: 'quit' },
      ],
    },
    {
      label: 'ویرایش',
      submenu: [
        { label: 'واگرد', role: 'undo' },
        { label: 'انجام دوباره', role: 'redo' },
        { type: 'separator' },
        { label: 'برش', role: 'cut' },
        { label: 'رونوشت', role: 'copy' },
        { label: 'چسباندن', role: 'paste' },
        { label: 'انتخاب همه', role: 'selectAll' },
      ],
    },
    {
      label: 'نمایش',
      submenu: [
        { label: 'بارگذاری دوباره', accelerator: 'CmdOrCtrl+R', click: () => siteContents()?.reload() },
        { label: 'بارگذاری بدون حافظهٔ موقت', accelerator: 'CmdOrCtrl+Shift+R', click: () => siteContents()?.reloadIgnoringCache() },
        { label: 'بازگشت', accelerator: 'Alt+Left', click: () => perform('back') },
        { label: 'جلو', accelerator: 'Alt+Right', click: () => perform('forward') },
        { type: 'separator' },
        { label: 'بزرگ‌نمایی', accelerator: 'CmdOrCtrl+=', click: () => zoom(0.1) },
        { label: 'کوچک‌نمایی', accelerator: 'CmdOrCtrl+-', click: () => zoom(-0.1) },
        { label: 'اندازهٔ اصلی', accelerator: 'CmdOrCtrl+0', click: () => siteContents()?.setZoomFactor(1) },
        { type: 'separator' },
        { label: 'تمام‌صفحه', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'راهنما',
      submenu: [
        { label: 'دربارهٔ برنامه', click: () => {
          if (mainWindow) void dialog.showMessageBox(mainWindow, {
            type: 'info', title: 'دربارهٔ Arena Desktop',
            message: `Arena Desktop ${app.getVersion()}`,
            detail: 'نسخهٔ دسکتاپ غیررسمی برای arena.ai؛ وابسته یا مورد تأیید Arena نیست.\n\nبه اینترنت نیاز دارد. دوربین، میکروفون، موقعیت مکانی و ضبط صفحه غیرفعال‌اند. هیچ مدل هوش مصنوعی به‌صورت محلی اجرا نمی‌شود.\n\nاگر سایت یا سرویس ورود اجازهٔ استفاده در این محیط را ندهد، از گزینهٔ «بازکردن در مرورگر» استفاده کنید. نشست ورود مرورگر با این برنامه جداست.',
            icon: ICON,
          });
        } },
      ],
    },
  ]);
}

function perform(action) {
  const contents = siteContents();
  if (!contents) return;
  switch (action) {
    case 'back':
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      break;
    case 'forward':
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      break;
    case 'home': return loadHome();
    case 'reload':
      publish({ error: null, loading: true });
      return state.ready ? contents.reload() : loadHome();
    case 'open-browser': return openInBrowser();
    case 'menu': applicationMenu?.popup({ window: mainWindow }); break;
    default: throw new Error('Unsupported action');
  }
}

function createWindow(profile) {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const bounds = readWindowState(stateFile, workArea);
  state = { ready: false, loading: true, canGoBack: false, canGoForward: false, origin: 'arena.ai', error: null };
  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: Math.min(800, workArea.width),
    minHeight: Math.min(540, workArea.height),
    show: false,
    center: true,
    backgroundColor: '#11151e',
    title: 'Arena Desktop — غیررسمی',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { ...SECURE_PREFERENCES, preload: path.join(__dirname, 'preload.cjs') },
  });
  mainWindow = win;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== SHELL_URL) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('page-title-updated', (event) => event.preventDefault());
  void win.webContents.setVisualZoomLevelLimits(1, 1);

  const view = new WebContentsView({
    webPreferences: { ...SECURE_PREFERENCES, partition: PARTITION },
  });
  siteView = view;
  view.setBackgroundColor('#ffffff');
  view.setVisible(false);
  win.contentView.addChildView(view);
  const resize = () => {
    if (win.isDestroyed()) return;
    const [width, height] = win.getContentSize();
    view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(0, height - TOOLBAR_HEIGHT) });
  };
  resize();
  win.on('resize', resize);
  guardNavigation(view.webContents);

  view.webContents.on('did-start-loading', () => publish({ loading: true, error: null }));
  // Show challenge/login pages as soon as their DOM is ready. Do not conceal them
  // behind a spinner while waiting for every third-party resource to finish.
  view.webContents.on('dom-ready', () => {
    if (!state.error) publish({ ready: true });
  });
  view.webContents.on('did-finish-load', () => {
    if (!state.error) publish({ ready: true, loading: false });
  });
  view.webContents.on('did-stop-loading', () => publish({ loading: false }));
  view.webContents.on('did-navigate', () => publish());
  view.webContents.on('did-navigate-in-page', () => publish());
  view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) fail(code, description);
  });
  view.webContents.on('render-process-gone', () => fail('RENDERER', 'صفحه به‌طور غیرمنتظره بسته شد. دوباره بارگذاری کنید.'));
  view.webContents.on('context-menu', (_event, params) => {
    /** @type {import('electron').MenuItemConstructorOptions[]} */
    const items = params.isEditable
      ? [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' }]
      : [{ role: 'copy', enabled: Boolean(params.selectionText) }, { role: 'selectAll' }];
    Menu.buildFromTemplate(items).popup({ window: win });
  });

  win.once('ready-to-show', () => {
    if (bounds.maximized) win.maximize();
    win.show();
  });
  win.on('close', () => {
    const normalBounds = win.getNormalBounds();
    saveWindowState(stateFile, { width: normalBounds.width, height: normalBounds.height, maximized: win.isMaximized() });
  });
  win.on('closed', () => {
    for (const popup of popups) if (!popup.isDestroyed()) popup.destroy();
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    siteView = null;
    mainWindow = null;
  });
  win.webContents.once('did-finish-load', () => {
    publish();
    void loadHome();
  });
  void win.loadFile(SHELL_FILE).catch(() => {
    dialog.showErrorBox('Arena Desktop', 'رابط برنامه بارگذاری نشد. برنامه را دوباره نصب کنید.');
    app.quit();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  ipcMain.handle('arena:state', (event) => {
    if (!isTrustedSender(event, mainWindow?.webContents)) throw new Error('Untrusted sender');
    return state;
  });
  ipcMain.handle('arena:action', (event, action) => {
    if (!isTrustedSender(event, mainWindow?.webContents) || !isAllowedAction(action)) {
      throw new Error('Untrusted action');
    }
    return perform(action);
  });
  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    const profile = session.fromPartition(PARTITION);
    configureSession(profile);
    applicationMenu = createMenu(profile);
    Menu.setApplicationMenu(applicationMenu);
    createWindow(profile);
    app.on('activate', () => {
      if (!mainWindow) createWindow(profile);
    });
  }).catch(() => {
    dialog.showErrorBox('Arena Desktop', 'برنامه شروع نشد. دسترسی به پوشهٔ داده‌های کاربر را بررسی کنید.');
    app.quit();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
