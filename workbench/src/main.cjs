'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, dialog, safeStorage, net, session, shell, Menu, Tray } = require('electron');
const { KeyVault } = require('./vault.cjs');
const { DahlClient, MODELS } = require('./dahl.cjs');
const { Workspace } = require('./workspace.cjs');
const { Permissions } = require('./permissions.cjs');
const { AgentBrowser } = require('./browser.cjs');
const { Extensions } = require('./extensions.cjs');
const { ToolRegistry } = require('./tools.cjs');
const { AgentEngine } = require('./engine.cjs');
const { GitHubProjects } = require('./shared.cjs')('github-projects');
const FILE = path.join(__dirname, 'renderer/index.html'); const URL = pathToFileURL(FILE).href;
let window; let tray; let vault; let client; let engine; let browser; let extensions; let github; let tools; let permissions;
let workspace = new Workspace(null); let quitting = false; let closePending = false; let setupBusy = false; let warning = null;
app.setName('Orbit Agent');
// Separate profile/data from ATLAS, Arena Desktop and the user's Chrome profile.
app.setPath('userData', path.join(app.getPath('appData'), 'Orbit-Agent'));
const ICON = path.join(__dirname, '../assets/icon.png');
function state() {
  const g = github?.snapshot();
  return { version: app.getVersion(), platform: process.platform, models: MODELS, keys: vault?.status(), pool: client?.status(), project: workspace.root,
    engine: engine?.snapshot(), browser: browser?.status(), extensions: extensions?.status() || [], setupBusy, warning,
    github: g ? { status: g.status, busy: g.busy, account: g.account?.login || null, deviceCode: g.deviceCode, message: g.message,
      dependencies: { git: Boolean(g.dependencies.git), gh: Boolean(g.dependencies.gh) }, sources: g.toolSources, preview: g.preview } : null };
}
function publish() { if (window && !window.isDestroyed() && !window.webContents.isLoadingMainFrame()) window.webContents.send('orbit:update', state()); }
async function confirm(title, detail, button = 'می‌پذیرم', signal = engine?.controller?.signal) {
  if (!window || window.isDestroyed() || signal?.aborted) return false;
  window.show(); const answer = await dialog.showMessageBox(window, { type: 'warning', title, message: title, detail: vault ? vault.clean(detail) : detail,
    buttons: [button, 'لغو'], defaultId: 1, cancelId: 1, noLink: true, signal }); return answer.response === 0;
}
function trusted(event) { return Boolean(window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url === URL); }
const ACTIONS = new Set(['keys-save', 'keys-reset', 'project-choose', 'run', 'stop', 'new', 'open-task', 'browser-login', 'browser-close', 'github-check', 'github-login', 'github-device', 'extension-install', 'extension-remove']);
async function action(name, payload) {
  if (name === 'stop') { await engine.stop(); publish(); return state(); }
  if (name === 'github-device') { if (!github.state.deviceCode) throw new Error('کد ورود فعالی وجود ندارد.'); await shell.openExternal('https://github.com/login/device'); return state(); }
  if (engine.promise || setupBusy || github.busy) throw new Error('ابتدا کار/ورود جاری را متوقف یا کامل کنید.');
  switch (name) {
    case 'keys-save': vault.save(payload?.keys, payload?.remember); client.reset(); break;
    case 'keys-reset': client.reset(); break;
    case 'project-choose': {
      const result = await dialog.showOpenDialog(window, { title: 'انتخاب پوشهٔ پروژهٔ عامل', properties: ['openDirectory'] });
      if (!result.canceled && result.filePaths.length === 1) { permissions.revoke(); workspace = new Workspace(result.filePaths[0]); engine.clear(); } break;
    }
    case 'run': if (!vault.keys.length) throw new Error('کلید تازهٔ Dahl را فقط در تنظیمات امن وارد کنید.'); await engine.run(payload, workspace); break;
    case 'new': engine.clear(); break;
    case 'open-task': engine.open(payload?.id, workspace.root); break;
    case 'browser-login': setupBusy = true; publish(); try { await browser.login(); warning = 'در Chrome جداگانه وارد Arena شوید و گفتگو/Agent و مخزن مجاز را انتخاب کنید؛ سپس به Orbit برگردید. رمز و CAPTCHA را خودتان انجام دهید.'; } finally { setupBusy = false; } break;
    case 'browser-close': await browser.close(); break;
    case 'github-check': await github.check(); break;
    case 'github-login': await github.login(); break;
    case 'extension-install': {
      const result = await dialog.showOpenDialog(window, { title: 'نصب Skill متنی یا manifest افزونهٔ MCP مورداعتماد', properties: ['openFile'], filters: [{ name: 'Skill / MCP manifest', extensions: ['json', 'md'] }] });
      if (!result.canceled && result.filePaths.length === 1) await extensions.install(result.filePaths[0]); break;
    }
    case 'extension-remove': await extensions.remove(payload?.id); break;
    default: throw new Error('عمل مجاز نیست.');
  }
  publish(); return state();
}
function makeTray() {
  if (tray) return;
  tray = new Tray(ICON); tray.setToolTip('Orbit Agent · عامل محلی'); tray.on('double-click', () => window?.show());
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'بازکردن Orbit', click: () => window?.show() }, { label: 'توقف کار', click: () => void engine?.stop() },
    { type: 'separator' }, { label: 'خروج و توقف', click: () => { quitting = true; app.quit(); } }]));
}
function createWindow() {
  window = new BrowserWindow({ width: 1450, height: 930, minWidth: 980, minHeight: 680, backgroundColor: '#121619', icon: ICON, show: false,
    title: 'Orbit Agent', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== URL) event.preventDefault(); });
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.on('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => {
    publish();
    if (app.commandLine.hasSwitch('orbit-self-test')) {
      void require('./native-check.cjs').run({ window, resourcesPath: process.resourcesPath, getState: state }).then(() => { console.log('ORBIT_NATIVE_SELF_TEST_OK'); quitting = true; app.exit(0); }).catch((error) => { console.error('ORBIT_NATIVE_SELF_TEST_FAILED', vault.clean(error.message)); app.exit(1); });
    }
  });
  window.on('close', (event) => {
    if (!quitting && engine.promise) {
      event.preventDefault(); if (closePending) return; closePending = true;
      void dialog.showMessageBox(window, { type: 'question', title: 'کار عامل هنوز فعال است', message: 'با بستن پنجره چه شود؟', detail: 'ادامه در پس‌زمینه، مجوز و محدودیت زمانی همین کار را تغییر نمی‌دهد؛ آیکون کنار ساعت برای بازکردن و توقف می‌ماند.', buttons: ['ادامه در پس‌زمینه', 'توقف و خروج', 'لغو'], defaultId: 2, cancelId: 2, noLink: true }).then(async ({ response }) => {
        if (response === 0) { makeTray(); window.hide(); } else if (response === 1) { await engine.stop(); quitting = true; app.quit(); }
      }).finally(() => { closePending = false; });
    }
  });
  void window.loadFile(FILE);
}
let shutdown = false;
app.on('before-quit', (event) => {
  if (!shutdown && engine) { event.preventDefault(); shutdown = true; quitting = true; void engine.stop().catch(() => {}).finally(() => { tools.dispose(); tray?.destroy(); app.quit(); }); }
});
app.on('window-all-closed', () => { if (!tray || quitting) app.quit(); });
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  ipcMain.handle('orbit:state', (event) => { if (!trusted(event)) throw new Error('Untrusted frame'); return state(); });
  ipcMain.handle('orbit:action', async (event, name, payload) => {
    if (!trusted(event) || !ACTIONS.has(name) || Buffer.byteLength(JSON.stringify(payload ?? {})) > 65536) throw new Error('Untrusted action');
    try { return await action(name, payload); } catch (error) { throw new Error(vault.clean(error.message)); }
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('io.github.mahdiyar1388mm1.orbit-agent');
    const directory = app.getPath('userData');
    vault = new KeyVault({ directory, storage: { isEncryptionAvailable: () => safeStorage.isEncryptionAvailable() && (process.platform === 'win32' || safeStorage.getSelectedStorageBackend?.() !== 'basic_text'), encryptString: (text) => safeStorage.encryptString(text), decryptString: (bytes) => safeStorage.decryptString(bytes) } }); vault.load();
    const clean = (text) => vault.clean(text);
    permissions = new Permissions({ confirm });
    browser = new AgentBrowser({ profile: path.join(directory, 'managed-chrome'), permissions, onUpdate: publish });
    extensions = new Extensions({ directory: path.join(directory, 'extensions'), confirm, clean }); extensions.load();
    github = new GitHubProjects({ getWindow: () => window, dialog, autoPoll: false, resolveProxy: (url) => session.defaultSession.resolveProxy(url), onUpdate: publish });
    tools = new ToolRegistry({ browser, github, permissions, confirm, clean, resourcesPath: process.resourcesPath });
    client = new DahlClient({ vault, fetch: (url, options) => net.fetch(url, options), onEvent: (event) => { engine?.modelEvent(event); publish(); } });
    engine = new AgentEngine({ client, tools, permissions, extensions, clean, onUpdate: publish });
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    createWindow();
  }).catch((error) => { dialog.showErrorBox('Orbit Agent', 'راه‌اندازی انجام نشد: ' + (vault ? vault.clean(error.message) : 'خطای پیکربندی')); app.quit(); });
}
