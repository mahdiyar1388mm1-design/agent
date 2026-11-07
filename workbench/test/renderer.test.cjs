'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const vm = require('node:vm'); const { EventEmitter } = require('node:events'); const { JSDOM } = require('jsdom');
const flush = () => new Promise((resolve) => setImmediate(resolve));
async function ui(t, bridge = true) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8'), { runScripts: 'outside-only', url: 'file:///orbit/src/renderer/index.html' }); t.after(() => dom.window.close());
  let receive; const calls = []; const state = { version: '0.1.0', keys: { count: 2, encryption: true }, pool: { active: 1, exhausted: 0 }, extensions: [], browser: {}, engine: { status: 'idle', busy: false, messages: [], activities: [], history: [], revision: 0 } };
  if (bridge) dom.window.orbit = { getState: async () => state, onState: (cb) => { receive = cb; }, perform: async (action, payload) => { calls.push({ action, payload }); return state; } };
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8')); await flush();
  return { dom, calls, state, byId: (id) => dom.window.document.getElementById(id), update: (patch) => receive({ ...state, ...patch }) };
}
test('preview is explicitly nonfunctional and does not accept/store API keys in a website', async (t) => { const f = await ui(t, false); assert.equal(f.byId('demo-banner').hidden, false); assert.equal(f.byId('api-keys').disabled, true); });
test('chat/model/tool output is rendered as plain text, never remote HTML', async (t) => {
  const f = await ui(t); f.update({ engine: { ...f.state.engine, revision: 1, messages: [{ role: 'assistant', model: 'fixture', content: '<img src=x onerror=bad()>' }], activities: [] } });
  assert.equal(f.byId('messages').querySelector('img'), null); assert.match(f.byId('messages').textContent, /<img/);
});
test('key save clears the input and invokes only the native secret action; keys are not reflected in state', async (t) => {
  const f = await ui(t); f.byId('api-keys').value = 'dahl_' + 'f'.repeat(30); f.byId('save-keys').click(); await flush();
  assert.equal(f.byId('api-keys').value, ''); assert.equal(f.calls[0].action, 'keys-save'); assert.doesNotMatch(f.byId('keys-status').textContent, /dahl_/);
});
test('Stop stays enabled while a job/tool is pending and late older packets cannot undo busy state', async (t) => {
  const f = await ui(t); f.update({ engine: { ...f.state.engine, status: 'running', busy: true, revision: 3 } });
  assert.equal(f.byId('stop').hidden, false); assert.equal(f.byId('stop').disabled, false); assert.equal(f.byId('send').disabled, true);
  f.update({ engine: { ...f.state.engine, revision: 1 } }); assert.equal(f.byId('stop').hidden, false);
});
test('preload is a frozen, named-action-only API; it exposes neither exec nor raw key getters', async () => {
  const ipc = new EventEmitter(); const calls = []; ipc.invoke = async (...args) => { calls.push(args); }; let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8'), { require: () => ({ ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } } }) });
  assert.equal(Object.isFrozen(api), true); assert.equal(api.exec, undefined); assert.equal(api.getKeys, undefined);
  await assert.rejects(api.perform('exec', { command: 'bad' })); await api.perform('stop'); assert.equal(calls[0][1], 'stop');
});
