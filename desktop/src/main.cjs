'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  app, BrowserWindow, WebContentsView, Menu, dialog, ipcMain, session, shell, screen, clipboard,
} = require('electron');
const {
  APP_URL, isAppUrl, isEmbeddedUrl, isSafeExternalUrl, isAllowedPopup,
  navigationKind, originLabel, isAllowedAction, isTrustedSender, canGrantPermission, isAllowedTerminalAction, isTrustedTerminalSender, isAllowedGitHubAction,
} = require('./policy.cjs');
const { readWindowState, saveWindowState } = require('./window-state.cjs');
const { diagnosticReport, diagnosticSummary } = require('./diagnostics.cjs');
const { TerminalAgent } = require('./terminal-agent.cjs');
const { GitHubProjects } = require('./github-projects.cjs');

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
let terminalAgent = null;
let terminalOpen = false;
let githubProjects = null;
let githubOpen = false;
let layoutSite = null;
const popups = new Set();
let state = {
  ready: false,
  loading: true,
  canGoBack: false,
  canGoForward: false,
  origin: 'arena.ai',
  error: null,
  terminalOpen: false,
  githubOpen: false,
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
    await Promise.all([terminalAgent?.disable(), githubProjects?.cancel()]);
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
        { label: 'عیب‌یابی اتصال', click: () => void showDiagnostics() },
        { label: 'پروژه‌های GitHub', accelerator: 'CmdOrCtrl+Shift+G', click: () => perform('github') },
        { label: 'ترمینال AI (آزمایشی)', accelerator: 'CmdOrCtrl+Shift+T', click: () => perform('terminal') },
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
            detail: 'نسخهٔ دسکتاپ غیررسمی برای arena.ai؛ وابسته یا مورد تأیید Arena نیست.\n\nبه اینترنت نیاز دارد. دوربین، میکروفون، موقعیت مکانی و ضبط صفحه غیرفعال‌اند. هیچ مدل هوش مصنوعی به‌صورت محلی اجرا نمی‌شود. پل آزمایشی PowerShell مجوز یک‌بارهٔ جلسه برای اجرای خودکار و مجوز مستقل ارسال خروجی دارد؛ پیش‌فرض هر دو خاموش است. موارد علامت‌خورده نیازمند بررسی دستی‌اند؛ تشخیص خطر ناقص و پوشهٔ پروژه sandbox نیست. این پل ابزار رسمی Agent نیست و امکانات سمت سرور حساب را باز نمی‌کند. Git و GitHub CLI در نسخهٔ Windows همراه برنامه‌اند؛ حساب شما فقط با ورود خودتان متصل می‌شود؛ اتصال مخزن خصوصی در خود Arena مستقل است.\n\nاگر سایت یا سرویس ورود اجازهٔ استفاده در این محیط را ندهد، از گزینهٔ «بازکردن در مرورگر» استفاده کنید. نشست ورود مرورگر با این برنامه جداست.',
            icon: ICON,
          });
        } },
      ],
    },
  ]);
}

let diagnosticPending = false;
async function showDiagnostics() {
  if (diagnosticPending || !mainWindow) return;
  diagnosticPending = true;
  try {
    const report = diagnosticReport({ version: app.getVersion(), platform: process.platform, arch: process.arch, electron: process.versions?.electron,
      siteUrl: siteContents()?.getURL(), siteReady: state.ready, siteLoading: state.loading, siteError: state.error?.code,
      adapter: await terminalAgent?.diagnostics(), terminal: terminalAgent?.snapshot(), github: githubProjects?.snapshot() });
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const result = await dialog.showMessageBox(mainWindow, { type: 'info', title: 'عیب‌یابی Arena Desktop',
      message: 'بررسی خواندنی اتصال؛ هیچ فرمانی اجرا یا پیامی به مدل ارسال نشد.',
      detail: diagnosticSummary(report) + '\n\nگزارش فقط وضعیت فنی است؛ نام مخزن/حساب، مسیر، متن چت، فرمان و اعتبارنامه در آن نیست. با دکمهٔ کپی می‌توانید خودتان آن را برای رفع مشکل بفرستید. هیچ گزارش خودکاری ارسال نمی‌شود.',
      buttons: ['کپی گزارش فنی', 'بستن'], defaultId: 1, cancelId: 1, noLink: true });
    if (result.response === 0) clipboard.writeText(JSON.stringify(report, null, 2));
  } finally { diagnosticPending = false; }
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
    case 'diagnostics': return showDiagnostics();
    case 'menu': applicationMenu?.popup({ window: mainWindow }); break;
    case 'terminal':
      terminalOpen = !terminalOpen;
      githubOpen = false;
      layoutSite?.();
      publish({ terminalOpen, githubOpen });
      break;
    case 'github':
      githubOpen = !githubOpen;
      terminalOpen = false;
      layoutSite?.();
      publish({ terminalOpen, githubOpen });
      break;
    default: throw new Error('Unsupported action');
  }
}

function createWindow(profile) {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const bounds = readWindowState(stateFile, workArea);
  terminalOpen = false;
  githubOpen = false;
  state = { ready: false, loading: true, canGoBack: false, canGoForward: false, origin: 'arena.ai', error: null, terminalOpen: false, githubOpen: false };
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
    const panelWidth = terminalOpen || githubOpen ? Math.min(420, Math.floor(width * 0.6)) : 0;
    view.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width: width - panelWidth, height: Math.max(0, height - TOOLBAR_HEIGHT) });
  };
  layoutSite = resize;
  resize();
  terminalAgent = new TerminalAgent({
    getWindow: () => mainWindow,
    getContents: siteContents,
    dialog,
    onUpdate: (snapshot) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!terminalOpen && ((snapshot.status === 'review' && (!snapshot.autoExecute || snapshot.reviewReasons.length))
        || (snapshot.status === 'result' && (!snapshot.autoShare || snapshot.reviewReasons.length)))) {
        terminalOpen = true;
        githubOpen = false;
        layoutSite?.();
        publish({ terminalOpen, githubOpen });
      }
      if (!mainWindow.webContents.isLoadingMainFrame()) {
        mainWindow.webContents.send('arena:terminal-state-changed', snapshot);
      }
    },
  });
  githubProjects = new GitHubProjects({
    getWindow: () => mainWindow, getSiteUrl: () => siteContents()?.getURL() || '', dialog,
    resolveProxy: typeof profile.resolveProxy === 'function' ? (url) => profile.resolveProxy(url) : undefined,
    isTerminalActive: () => Boolean(terminalAgent?.session || terminalAgent?.busy),
    onProject: (project) => terminalAgent?.attachProject(project),
    onHandoff: (message, guard) => terminalAgent.sendProjectMessage(message, guard),
    onUpdate: (snapshot) => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
        mainWindow.webContents.send('arena:github-state-changed', snapshot);
      }
    },
  });
  win.on('resize', resize);
  guardNavigation(view.webContents);

  view.webContents.on('did-start-loading', () => publish({ loading: true, error: null }));
  view.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) { terminalAgent?.onDocumentChange(); githubProjects?.onDocumentChange(); }
  });
  // Show challenge/login pages as soon as their DOM is ready. Do not conceal them
  // behind a spinner while waiting for every third-party resource to finish.
  view.webContents.on('dom-ready', () => {
    if (!state.error) publish({ ready: true });
  });
  view.webContents.on('did-finish-load', () => {
    if (!state.error) publish({ ready: true, loading: false });
  });
  view.webContents.on('did-stop-loading', () => publish({ loading: false }));
  const navigated = () => {
    terminalAgent?.onNavigation(view.webContents.getURL());
    githubProjects?.onNavigation(view.webContents.getURL());
    publish();
  };
  view.webContents.on('did-navigate', navigated);
  view.webContents.on('did-navigate-in-page', navigated);
  view.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) {
      terminalAgent?.onDocumentChange('ارتباط صفحه قطع شد؛ اتصال ترمینال و مجوزهای خودکار باطل شدند.');
      githubProjects?.onDocumentChange();
      fail(code, description);
    }
  });
  view.webContents.on('render-process-gone', () => {
    terminalAgent?.pause('صفحه بسته شد؛ اتصال ترمینال متوقف شد.');
    githubProjects?.onDocumentChange();
    fail('RENDERER', 'صفحه به‌طور غیرمنتظره بسته شد. دوباره بارگذاری کنید.');
  });
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
  let finishingTerminal = false;
  let allowClose = false;
  win.on('close', (event) => {
    if (!allowClose && (terminalAgent?.busy || githubProjects?.busy)) {
      event.preventDefault();
      if (!finishingTerminal) {
        finishingTerminal = true;
        void Promise.all([terminalAgent.disable(), githubProjects.cancel()]).then(async ([snapshot, github]) => {
          const stopWarning = snapshot.stopWarning || github?.stopWarning;
          if (stopWarning && !win.isDestroyed()) {
            const result = await dialog.showMessageBox(win, {
              type: 'warning', title: 'توقف فرایند تأیید نشد', message: stopWarning,
              detail: 'ممکن است فرمان یا فرایندهای جداشده هنوز فعال باشند. Task Manager را بررسی کنید؛ بستن برنامه تغییرات را برنمی‌گرداند.',
              buttons: ['بازگشت به برنامه', 'بستن برنامه'], defaultId: 0, cancelId: 0, noLink: true,
            });
            if (result.response !== 1) { finishingTerminal = false; return; }
          }
          allowClose = true;
          if (!win.isDestroyed()) win.close();
        }).catch(() => { finishingTerminal = false; });
      }
      return;
    }
    void terminalAgent?.disable();
    void githubProjects?.cancel();
    const normalBounds = win.getNormalBounds();
    saveWindowState(stateFile, { width: normalBounds.width, height: normalBounds.height, maximized: win.isMaximized() });
  });
  win.on('closed', () => {
    void terminalAgent?.disable();
    terminalAgent = null;
    const closingGitHub = githubProjects;
    githubProjects = null;
    void closingGitHub?.cancel().finally(() => closingGitHub.dispose());
    layoutSite = null;
    for (const popup of popups) if (!popup.isDestroyed()) popup.destroy();
    if (!view.webContents.isDestroyed()) view.webContents.close({ waitForBeforeUnload: false });
    siteView = null;
    mainWindow = null;
  });
  win.webContents.once('did-finish-load', () => {
    publish();
    if (app.commandLine?.hasSwitch('arena-self-test')) {
      // Explicit CI diagnostic: real sandboxed preload/exact-file IPC, packaged
      // tools and offline editors. Never grant a session or run model commands.
      const check = 'Promise.all([window.arenaDesktop.getTerminalState(), window.arenaDesktop.getGitHubState()]).then(([s, g]) => g.checked === false && g.repositories.length === 0 && g.branches.length === 0 && g.preview === null && g.watching === false && g.account === null && g.project === null && g.busy === false && typeof window.arenaDesktop.github === "function" && s.status === "off" && s.session === null && s.pending === null && s.autoExecute === false && s.autoShare === false && s.expiresAt === null && s.supported === true && typeof window.arenaDesktop.terminal === "function")';
      void win.webContents.executeJavaScript(check).then(async (healthy) => {
        if (!healthy) throw new Error('Packaged bridge defaults were not safe');
        const checks = require('./compat-check.cjs');
        await checks.checkTools(process.resourcesPath);
        await checks.checkComposer(view.webContents);
        console.log('ARENA_DESKTOP_BRIDGE_SELF_TEST_OK');
        app.exit(0);
      }).catch((error) => {
        console.error('ARENA_DESKTOP_BRIDGE_SELF_TEST_FAILED', error.message);
        app.exit(1);
      });
      return;
    }
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
  ipcMain.handle('arena:terminal-state', (event) => {
    if (!isTrustedTerminalSender(event, mainWindow?.webContents, SHELL_URL)) throw new Error('Untrusted terminal sender');
    return terminalAgent?.snapshot();
  });
  ipcMain.handle('arena:terminal', (event, action, payload) => {
    if (!isTrustedTerminalSender(event, mainWindow?.webContents, SHELL_URL) || !isAllowedTerminalAction(action)) {
      throw new Error('Untrusted terminal action');
    }
    if (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 65536)) throw new Error('Invalid terminal payload');
    if (githubProjects?.busy) throw new Error('ابتدا عملیات GitHub را تمام یا متوقف کنید.');
    if (['start', 'choose-folder'].includes(action)) void githubProjects?.stopWatch('با انتخاب/اجرای ترمینال محلی، دریافت خودکار GitHub متوقف شد.');
    return terminalAgent?.handle(action, payload);
  });
  ipcMain.handle('arena:github-state', (event) => {
    if (!isTrustedTerminalSender(event, mainWindow?.webContents, SHELL_URL)) throw new Error('Untrusted GitHub sender');
    return githubProjects?.snapshot();
  });
  ipcMain.handle('arena:github', (event, action, payload) => {
    if (!isTrustedTerminalSender(event, mainWindow?.webContents, SHELL_URL) || !isAllowedGitHubAction(action)) throw new Error('Untrusted GitHub action');
    if (payload !== undefined && (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 16384)) throw new Error('Invalid GitHub payload');
    const links = { 'install-git': 'https://github.com/git-for-windows/git/releases/latest',
      'install-gh': 'https://github.com/cli/cli/releases/latest', 'open-device': 'https://github.com/login/device' };
    if (Object.hasOwn(links, action)) return requestExternal(links[action]).then(() => githubProjects?.snapshot());
    if (action === 'open-repo') {
      const url = githubProjects?.snapshot().project?.repo?.url;
      return (url ? requestExternal(url) : Promise.resolve()).then(() => githubProjects?.snapshot());
    }
    return githubProjects?.handle(action, payload);
  });
  ipcMain.handle('arena:action', (event, action) => {
    if (!isTrustedSender(event, mainWindow?.webContents) || !isAllowedAction(action)
      || (action === 'diagnostics' && !isTrustedTerminalSender(event, mainWindow?.webContents, SHELL_URL))) {
      throw new Error('Untrusted action');
    }
    return perform(action);
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    const profile = session.fromPartition(PARTITION);
    if (app.commandLine?.hasSwitch('arena-self-test')) await require('./compat-check.cjs').installFixture(profile);
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
