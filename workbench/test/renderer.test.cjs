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

test('command center tabs, templates and command palette are functional without fabricated work', async (t) => {
  const f = await ui(t, false); const document = f.dom.window.document;
  document.querySelector('.main-nav [data-view="agents"]').click(); assert.equal(document.querySelector('[data-page="agents"]').hidden, false); assert.equal(document.querySelectorAll('.agent-card').length, 3);
  f.byId('command-open').click(); f.byId('command-search').value = 'نصب Skill'; f.byId('command-search').dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
  assert.equal(f.byId('command-results').querySelectorAll('button').length, 1); f.byId('command-results').querySelector('button').click(); assert.equal(document.querySelector('[data-drawer="extensions"]').hidden, false);
  f.byId('close-drawer').click(); document.querySelector('.template-card').click(); assert.match(f.byId('task').value, /Arena/); assert.equal(document.querySelector('[data-page="mission"]').hidden, false);
  assert.equal(f.calls.length, 0); assert.equal(document.querySelectorAll('#messages .message').length, 0); assert.equal(f.byId('api-keys').disabled, true);
});
test('idle controls re-enable after native actions; pending snapshots never freeze recent tasks or agent selection', async (t) => {
  const f = await ui(t); f.byId('api-keys').value = 'dahl_' + 'k'.repeat(30); f.byId('save-keys').click(); await flush();
  assert.equal(f.dom.window.document.querySelector('.agent-card button').disabled, false); assert.equal(f.byId('save-keys').disabled, false);
});
test('model-reported plan and actual error trace cannot create fake successful file outputs', async (t) => {
  const f = await ui(t); const { createMission } = require('../src/mission.cjs'); const mission = createMission();
  mission.plan = [{ id: 'x', title: 'Reported complete, no proof', status: 'done' }]; mission.runs = [{ id: 'failure', name: 'terminal_run', input: '{}', output: '{"exitCode":9,"stdout":"FAILED_ACTUAL_TEST"}', status: 'error' }];
  f.update({ engine: { ...f.state.engine, revision: 1, status: 'completed', mission } });
  assert.match(f.byId('plan-list').textContent, /Reported complete/); assert.match(f.byId('tool-runs').textContent, /FAILED_ACTUAL_TEST/); assert.equal(f.byId('tool-runs').querySelectorAll('.tool-run.error').length, 1);
  assert.equal(f.byId('artifacts-list').querySelectorAll('button').length, 0); assert.match(f.dom.window.document.querySelector('[data-inspector-page="plan"]').textContent, /اثبات اجرا نیست/);
});
test('project pane uses only bounded native project actions and renders returned content as text', async (t) => {
  const f = await ui(t); f.dom.window.orbit.perform = async (action, payload) => { f.calls.push({ action, payload }); if (action === 'project-list') return { project: 'C:\\fixture', path: '.', entries: [{ kind: 'file', name: 'README.md' }] }; if (action === 'project-read') return { project: 'C:\\fixture', path: 'README.md', text: '<img onerror=bad()>Local content' }; return f.state; };
  f.update({ project: 'C:\\fixture', engine: { ...f.state.engine, revision: 1 } }); f.dom.window.document.querySelector('.main-nav [data-view="workspace"]').click(); await flush();
  f.byId('file-list').querySelector('button').click(); await flush(); assert.match(f.byId('file-content').textContent, /Local content/); assert.equal(f.byId('file-content').querySelector('img'), null);
  assert.deepEqual(f.calls.map((call) => call.action), ['project-list', 'project-read']);
});
