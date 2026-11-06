'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup({ bridge = true } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const timers = new Map();
  const calls = [];
  let receiveState;
  let unsubscribed = false;
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', hidden: false, disabled: false, dataset: {}, attributes: {}, handlers: {}, classes: new Set(),
      setAttribute(key, value) { this.attributes[key] = value; },
      addEventListener(name, callback) { this.handlers[name] = callback; },
      classList: { toggle(name, enable) { if (enable) elements.get(id).classes.add(name); else elements.get(id).classes.delete(name); } },
    });
    return elements.get(id);
  };
  const controls = ['back', 'forward', 'reload', 'home', 'open-browser', 'menu', 'diagnostics'].map((action) => {
    const button = element(action);
    button.dataset.action = action;
    return button;
  });
  const window = {
    navigator: { onLine: true },
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  if (bridge) window.arenaDesktop = {
    getState: async () => ({ ready: false, loading: true, origin: 'arena.ai', error: null }),
    perform: async (action) => { calls.push(action); },
    onState: (callback) => { receiveState = callback; return () => { unsubscribed = true; }; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/shell.js'), 'utf8'), {
    window,
    document: { getElementById: element, querySelectorAll: () => controls },
    setTimeout: (callback) => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  return {
    element, window, calls, timers, listeners, controls,
    update: (value) => receiveState(value),
    unsubscribed: () => unsubscribed,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('startup shows the waiting state without claiming an established connection', async () => {
  const ui = setup();
  await flush();
  assert.equal(ui.element('placeholder').hidden, false);
  assert.equal(ui.element('error-card').hidden, true);
  assert.equal(ui.element('connection-label').textContent, 'در حال اتصال');
  assert.equal(ui.element('back').disabled, true);
  assert.equal(ui.element('reload').classes.has('spinning'), true);
});

test('successful navigation hides the placeholder and updates history controls', async () => {
  const ui = setup();
  await flush();
  ui.update({ ready: true, loading: false, origin: 'arena.ai', canGoBack: true, canGoForward: false });
  assert.equal(ui.element('placeholder').hidden, true);
  assert.equal(ui.element('back').disabled, false);
  assert.equal(ui.element('forward').disabled, true);
  assert.equal(ui.element('connection-label').textContent, 'آماده');
  assert.equal(ui.timers.size, 0);
});

test('TLS and connection errors display useful, non-HTML messages', async () => {
  const ui = setup();
  await flush();
  ui.update({ ready: false, loading: false, origin: 'arena.ai', error: { code: -202, description: '<img src=x onerror=alert(1)>' } });
  assert.equal(ui.element('placeholder').hidden, false);
  assert.equal(ui.element('welcome').hidden, true);
  assert.equal(ui.element('error-card').hidden, false);
  assert.match(ui.element('error-message').textContent, /قابل اعتماد/);
  assert.equal(ui.element('error-code').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(ui.element('error-code').innerHTML, undefined);
  ui.update({ ready: false, loading: true, error: null });
  assert.equal(ui.element('error-card').hidden, true);
  assert.equal(ui.element('welcome').hidden, false);
});

test('slow loads reveal retry and browser actions instead of an endless spinner', async () => {
  const ui = setup();
  await flush();
  const callback = [...ui.timers.values()][0];
  assert.equal(typeof callback, 'function');
  callback();
  assert.equal(ui.element('slow-actions').hidden, false);
  assert.match(ui.element('loading-hint').textContent, /بیش از معمول/);
  ui.element('reload').handlers.click();
  ui.element('open-browser').handlers.click();
  await flush();
  assert.deepEqual(ui.calls, ['reload', 'open-browser']);
});

test('offline status is not misrepresented as a live connection', async () => {
  const ui = setup();
  await flush();
  ui.update({ ready: true, loading: false });
  ui.window.navigator.onLine = false;
  ui.listeners.get('offline')();
  assert.equal(ui.element('connection-label').textContent, 'آفلاین');
  ui.window.navigator.onLine = true;
  ui.listeners.get('online')();
  assert.equal(ui.element('connection-label').textContent, 'آماده');
});

test('renderer disposes timers and IPC subscription on unload', async () => {
  const ui = setup();
  await flush();
  ui.listeners.get('beforeunload')();
  assert.equal(ui.timers.size, 0);
  assert.equal(ui.unsubscribed(), true);
});

test('opening the shell outside Electron clearly identifies it as desktop-only', () => {
  const ui = setup({ bridge: false });
  assert.match(ui.element('error-message').textContent, /فایل نصب ویندوز/);
  assert.equal(ui.controls.every((control) => control.disabled), true);
  assert.equal(ui.timers.size, 0);
});

test('diagnostics toolbar button calls only the native allowlisted action', async () => {
  const ui = setup(); await flush(); ui.element('diagnostics').handlers.click(); await flush();
  assert.deepEqual(ui.calls, ['diagnostics']);
});
