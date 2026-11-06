'use strict';

// Exercise the actual main-process wiring with Electron API doubles. The CI
// workflow separately launches the real packaged executable on Windows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { EventEmitter } = require('node:events');

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function setup(t, { lock = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-main-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const windows = [];
  const views = [];
  const opened = [];
  const dialogs = [];
  const responses = [];
  const handlers = new Map();
  let terminalAgent;
  let githubProjects;
  const { GitHubProjects } = require('../src/github-projects.cjs');
  class ObservedGitHubProjects extends GitHubProjects {
    constructor(options) { super(options); githubProjects = this; }
  }
  t.after(async () => { await githubProjects?.cancel(); githubProjects?.dispose(); });
  const { TerminalAgent } = require('../src/terminal-agent.cjs');
  class ObservedTerminalAgent extends TerminalAgent {
    constructor(options) { super(options); terminalAgent = this; }
  }
  t.after(() => terminalAgent?.disable());
  let quit = false;

  class Contents extends EventEmitter {
    constructor() {
      super();
      this.url = '';
      this.mainFrame = {};
      this.destroyed = false;
      this.messages = [];
      this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    }
    isDestroyed() { return this.destroyed; }
    isLoadingMainFrame() { return false; }
    isLoading() { return false; }
    send(channel, value) { this.messages.push({ channel, value: structuredClone(value) }); }
    getURL() { return this.url; }
    async loadURL(url) { this.url = url; this.emit('did-start-loading'); }
    setWindowOpenHandler(handler) { this.popupHandler = handler; }
    async setVisualZoomLevelLimits() {}
    close() { this.destroyed = true; }
    reload() { this.reloaded = true; }
    reloadIgnoringCache() { this.reloaded = true; }
    stop() {}
  }
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new Contents();
      this.contentView = { addChildView() {} };
      this.destroyed = false;
      windows.push(this);
    }
    getContentSize() { return [1200, 800]; }
    getNormalBounds() { return { width: 1200, height: 800 }; }
    isDestroyed() { return this.destroyed; }
    isMaximized() { return false; }
    maximize() { this.maximized = true; }
    show() { this.shown = true; }
    setMenu() {}
    setTitle(title) { this.title = title; }
    async loadFile(file) {
      this.webContents.url = pathToFileURL(file).href;
      this.webContents.mainFrame.url = this.webContents.url;
      this.webContents.emit('did-finish-load');
      this.emit('ready-to-show');
    }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  class SiteView {
    constructor(options) { this.options = options; this.webContents = new Contents(); views.push(this); }
    setBackgroundColor() {}
    setVisible(visible) { this.visible = visible; }
    setBounds(bounds) { this.bounds = bounds; }
  }
  const profile = new EventEmitter();
  for (const name of ['PermissionCheck', 'PermissionRequest', 'DevicePermission', 'DisplayMediaRequest']) {
    profile[`set${name}Handler`] = (handler) => { profile[name] = handler; };
  }
  profile.clearStorageData = async () => {};
  profile.clearCache = async () => {};
  const app = new EventEmitter();
  const paths = { appData: directory, downloads: path.join(directory, 'downloads') };
  app.setName = () => {};
  app.getPath = (key) => paths[key];
  app.setPath = (key, value) => { paths[key] = value; };
  app.requestSingleInstanceLock = () => lock;
  app.whenReady = async () => {};
  app.quit = () => { quit = true; };
  app.setAppUserModelId = () => {};
  app.getVersion = () => '1.0.0';
  const electron = {
    app, BrowserWindow: Window, WebContentsView: SiteView,
    Menu: { buildFromTemplate: (template) => ({ template, popup() {} }), setApplicationMenu() {} },
    dialog: {
      showMessageBox: async (_window, options) => { dialogs.push(options); return { response: responses.shift() ?? 1 }; },
      showErrorBox: (...args) => dialogs.push(args),
    },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    session: { fromPartition: () => profile },
    shell: { openExternal: async (url) => opened.push(url) },
    screen: { getPrimaryDisplay: () => ({ workAreaSize: { width: 1200, height: 800 } }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8'), {
    __dirname: path.join(__dirname, '../src'),
    URL,
    Buffer,
    process: { platform: 'win32' },
    require: (name) => name === 'electron' ? electron : name === './terminal-agent.cjs'
      ? { TerminalAgent: ObservedTerminalAgent } : name === './github-projects.cjs'
        ? { GitHubProjects: ObservedGitHubProjects } : name.startsWith('./') ? require(`../src/${name.slice(2)}`) : require(name),
  });
  await flush();
  const window = windows[0];
  const event = window ? { sender: window.webContents, senderFrame: window.webContents.mainFrame } : {};
  return {
    windows, views, window, view: views[0], opened, dialogs, responses, handlers, profile, paths, terminalAgent, githubProjects,
    quit: () => quit,
    state: () => handlers.get('arena:state')(event),
    action: (action) => handlers.get('arena:action')(event, action),
  };
}

test('main creates an isolated remote view and a separate local-only bridge', async (t) => {
  const app = await setup(t);
  assert.equal(app.window.shown, true);
  assert.equal(app.view.bounds.y, 76);
  assert.equal(app.view.options.webPreferences.partition, 'persist:arena-desktop');
  for (const target of [app.window, app.view]) {
    const prefs = target.options.webPreferences;
    assert.equal(prefs.nodeIntegration, false);
    assert.equal(prefs.contextIsolation, true);
    assert.equal(prefs.sandbox, true);
    assert.equal(prefs.webSecurity, true);
    assert.equal(prefs.webviewTag, false);
  }
  assert.match(app.window.options.webPreferences.preload, /preload\.cjs$/);
  assert.equal(app.view.options.webPreferences.preload, undefined);
  assert.equal(app.state().loading, true);
  assert.equal(app.view.webContents.getURL(), 'https://arena.ai/');
});

test('real IPC handlers reject remote contents, subframes and unknown actions', async (t) => {
  const app = await setup(t);
  const getState = app.handlers.get('arena:state');
  assert.throws(() => getState({ sender: app.view.webContents, senderFrame: app.view.webContents.mainFrame }), /Untrusted/);
  assert.throws(() => getState({ sender: app.window.webContents, senderFrame: {} }), /Untrusted/);
  assert.throws(() => app.action('exec'), /Untrusted/);
});

test('navigation guards prevent arbitrary protocols and require confirmation for external HTTPS', async (t) => {
  const app = await setup(t);
  for (const url of ['file:///tmp/private', 'javascript:alert(1)', 'data:text/html,hi']) {
    let prevented = false;
    app.view.webContents.emit('will-navigate', { preventDefault: () => { prevented = true; } }, url);
    assert.equal(prevented, true, url);
  }
  assert.equal(app.dialogs.length, 0);
  let internalPrevented = false;
  app.view.webContents.emit('will-redirect', { preventDefault: () => { internalPrevented = true; } }, 'https://arena.ai/chat');
  assert.equal(internalPrevented, false);
  app.view.webContents.emit('will-navigate', { preventDefault() {} }, 'https://example.com/');
  await flush();
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.dialogs[0].defaultId, 1);
  assert.deepEqual(app.opened, []);
  app.responses.push(0);
  app.view.webContents.emit('will-navigate', { preventDefault() {} }, 'https://example.com/confirmed');
  await flush();
  assert.deepEqual(app.opened, ['https://example.com/confirmed']);
});

test('OAuth popup options retain sandboxing and never inherit the shell preload', async (t) => {
  const app = await setup(t);
  const popup = app.view.webContents.popupHandler({ url: 'https://accounts.google.com/login' });
  assert.equal(popup.action, 'allow');
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false);
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.sandbox, true);
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.preload, undefined);
  assert.equal(app.view.webContents.popupHandler({ url: 'file:///tmp/test.html' }).action, 'deny');
  assert.equal(app.window.webContents.popupHandler({ url: 'https://arena.ai' }).action, 'deny');
});

test('error-page DOM events cannot hide a connection error; a retry can recover', async (t) => {
  const app = await setup(t);
  const contents = app.view.webContents;
  contents.emit('did-fail-load', {}, -202, 'ERR_CERT_AUTHORITY_INVALID', 'https://arena.ai/', true);
  contents.emit('dom-ready');
  contents.emit('did-finish-load');
  assert.equal(app.state().error.code, -202);
  assert.equal(app.view.visible, false);
  await app.action('reload');
  contents.emit('dom-ready');
  contents.emit('did-finish-load');
  assert.equal(app.state().error, null);
  assert.equal(app.state().ready, true);
  assert.equal(app.view.visible, true);
  contents.emit('render-process-gone');
  assert.equal(app.state().error.code, 'RENDERER');
});

test('downloads use a native Save As dialog with a basename, never automatic execution', async (t) => {
  const app = await setup(t);
  let options;
  app.profile.emit('will-download', {}, {
    getFilename: () => '../../outside.png',
    setSaveDialogOptions: (value) => { options = value; },
  });
  assert.equal(options.defaultPath, path.join(app.paths.downloads, 'outside.png'));
  assert.equal(app.profile.DevicePermission(), false);
  let media;
  app.profile.PermissionRequest(app.view.webContents, 'media', (allowed) => { media = allowed; }, { requestingUrl: 'https://arena.ai' });
  assert.equal(media, false);
  assert.deepEqual(app.opened, []);
});

test('open-in-browser does not export a transient OAuth URL', async (t) => {
  const app = await setup(t);
  app.view.webContents.url = 'https://accounts.google.com/login?code=private';
  await app.action('open-browser');
  assert.deepEqual(app.opened, ['https://arena.ai/']);
});

test('closing the window closes its remote contents and saves only window dimensions', async (t) => {
  const app = await setup(t);
  app.window.emit('close');
  const saved = JSON.parse(fs.readFileSync(path.join(app.paths.userData, 'window-state.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['height', 'maximized', 'width']);
  app.window.destroy();
  assert.equal(app.view.webContents.isDestroyed(), true);
});

test('a second instance exits without creating another browser profile or window', async (t) => {
  const app = await setup(t, { lock: false });
  assert.equal(app.quit(), true);
  assert.equal(app.windows.length, 0);
});


test('terminal IPC is unreachable from the remote site, subframes and wrong local URLs', async (t) => {
  const app = await setup(t);
  const read = app.handlers.get('arena:terminal-state');
  const action = app.handlers.get('arena:terminal');
  assert.throws(() => read({ sender: app.view.webContents, senderFrame: app.view.webContents.mainFrame }), /Untrusted/);
  assert.throws(() => read({ sender: app.window.webContents, senderFrame: { url: app.window.webContents.url } }), /Untrusted/);
  const event = { sender: app.window.webContents, senderFrame: app.window.webContents.mainFrame };
  assert.equal(read(event).status, 'off');
  assert.equal(read(event).autoExecute, false);
  assert.equal(read(event).autoShare, false);
  assert.equal(read(event).expiresAt, null);
  assert.throws(() => action(event, 'exec', { command: 'MUST NOT EXECUTE' }), /Untrusted/);
  assert.throws(() => action(event, 'start', 'not an object'), /Invalid terminal payload/);
  app.window.webContents.mainFrame.url = 'https://arena.ai';
  assert.throws(() => action(event, 'choose-folder'), /Untrusted/);
});


test('automatic steps do not repeatedly reopen the panel, but genuine manual-review exceptions do', async (t) => {
  const app = await setup(t);
  const agent = app.terminalAgent;
  // Publish real controller snapshots; do not start a shell process in this test.
  agent.session = { id: 'fixture', seq: 1, permissions: { autoExecute: true, autoShare: true } };
  agent.update({ status: 'review', pending: { command: 'Get-Date' }, reviewReasons: [] });
  assert.equal(app.state().terminalOpen, false);
  agent.update({ status: 'result', pending: null, reviewReasons: [] });
  assert.equal(app.state().terminalOpen, false);
  agent.update({ status: 'review', pending: { command: 'Remove-Item ./temp' }, reviewReasons: ['Deletion'] });
  assert.equal(app.state().terminalOpen, true);
  app.action('terminal');
  assert.equal(app.state().terminalOpen, false);
  agent.update({ status: 'result', pending: null, reviewReasons: ['Sensitive output'] });
  assert.equal(app.state().terminalOpen, true);
});

test('main-document reloads and connection failure revoke grants, but subframe loading does not', async (t) => {
  const app = await setup(t);
  const agent = app.terminalAgent;
  const contents = app.view.webContents;
  agent.session = { id: 'fixture', seq: 1, permissions: { autoExecute: true, autoShare: true } };
  contents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
  assert.equal(agent.snapshot().autoExecute, true);
  contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
  assert.equal(agent.snapshot().autoExecute, true);
  contents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  assert.equal(agent.snapshot().autoExecute, false);
  agent.session = { id: 'another', seq: 1, permissions: { autoExecute: true, autoShare: true } };
  contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://arena.ai/', true);
  assert.equal(agent.snapshot().session, null);
  assert.equal(agent.snapshot().autoShare, false);
});


test('GitHub IPC requires the exact local top frame and rejects remote access, paths/actions and oversized payloads', async (t) => {
  const app = await setup(t);
  const read = app.handlers.get('arena:github-state');
  const action = app.handlers.get('arena:github');
  assert.throws(() => read({ sender: app.view.webContents, senderFrame: app.view.webContents.mainFrame }), /Untrusted/);
  assert.throws(() => read({ sender: app.window.webContents, senderFrame: { url: app.window.webContents.url } }), /Untrusted/);
  const event = { sender: app.window.webContents, senderFrame: app.window.webContents.mainFrame };
  assert.equal(read(event).watching, false); assert.equal(read(event).account, null); assert.equal(read(event).busy, false);
  assert.throws(() => action(event, 'exec', {}), /Untrusted/);
  assert.throws(() => action(event, 'auth-token', {}), /Untrusted/);
  assert.throws(() => action(event, 'clone', { repository: 'x'.repeat(17000) }), /Invalid GitHub payload/);
  assert.throws(() => action(event, 'clone', []), /Invalid GitHub payload/);
  app.window.webContents.mainFrame.url = 'https://arena.ai';
  assert.throws(() => action(event, 'choose-project'), /Untrusted/);
});

test('GitHub and terminal panels are mutually exclusive, and native project selection attaches its folder internally', async (t) => {
  const app = await setup(t);
  app.action('github'); assert.equal(app.state().githubOpen, true); assert.equal(app.state().terminalOpen, false);
  app.action('terminal'); assert.equal(app.state().githubOpen, false); assert.equal(app.state().terminalOpen, true);
  assert.equal(app.view.bounds.width, 780);
  const folder = fs.realpathSync(app.paths.appData);
  app.githubProjects.onProject({ folder, repo: { url: 'https://github.com/owner/project' }, branch: 'main' });
  assert.equal(app.terminalAgent.snapshot().folder, folder);
  assert.equal(app.terminalAgent.snapshot().project.url, 'https://github.com/owner/project');
});

test('GitHub mutations cannot overlap terminal sessions; opening a local session revokes cloud download grants', async (t) => {
  const app = await setup(t);
  const event = { sender: app.window.webContents, senderFrame: app.window.webContents.mainFrame };
  const terminal = app.handlers.get('arena:terminal');
  app.githubProjects.operation = { epoch: 1, kind: 'fixture' };
  assert.throws(() => terminal(event, 'start', { task: 'Test' }), /GitHub/);
  app.githubProjects.operation = null;
  app.githubProjects.watch = { expiresAt: Date.now() + 60000 };
  await terminal(event, 'disable');
  // choose-folder cancels the watch before opening any native picker (mocked out here).
  app.terminalAgent.chooseFolder = async () => app.terminalAgent.snapshot();
  await terminal(event, 'choose-folder');
  assert.equal(app.githubProjects.snapshot().watching, false);
  app.terminalAgent.session = { id: 'local-session', seq: 1 };
  await assert.rejects(app.githubProjects.operationFor('fixture', async () => {}), /ترمینال/);
});
