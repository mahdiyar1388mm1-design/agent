'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t) {
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'file:///app/src/renderer/index.html' });
  t.after(() => dom.window.close());
  let receive;
  let settle;
  const calls = [];
  const initial = { revision: 0, status: 'ready', supported: true, folder: 'C:\\project', session: null,
    seq: 0, pending: null, result: null, shareText: '', message: 'Ready' };
  dom.window.arenaDesktop = {
    getTerminalState: async () => initial,
    onTerminalState: (callback) => { receive = callback; return () => {}; },
    perform: async () => {},
    terminal: (action, payload) => {
      calls.push({ action, payload });
      return new Promise((resolve) => { settle = resolve; });
    },
  };
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/terminal.js'), 'utf8'));
  await flush();
  return { dom, calls, byId: (id) => dom.window.document.getElementById(id),
    update: (patch) => receive({ ...initial, ...patch }), finish: (value) => settle(value), initial };
}

test('command and output are rendered as text, not executable HTML', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, session: 'current', seq: 1, status: 'review', pending: { command: '<img src=x onerror=bad()>', reason: 'from page' } });
  assert.equal(ui.byId('terminal-command').textContent, '<img src=x onerror=bad()>');
  assert.equal(ui.byId('terminal-command').querySelector('img'), null);
  assert.equal(ui.byId('terminal-approve').disabled, false);
});

test('stop stays available while the approval/execution IPC promise is pending', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, session: 'current', seq: 1, status: 'review', pending: { command: 'Get-Date' } });
  ui.byId('terminal-approve').click();
  assert.equal(ui.calls[0].action, 'approve');
  assert.equal(ui.calls[0].payload.session, 'current');
  ui.update({ revision: 2, session: 'current', seq: 1, status: 'running' });
  assert.equal(ui.byId('terminal-disable').disabled, false);
  ui.byId('terminal-disable').click();
  assert.equal(ui.calls[1].action, 'disable');
  ui.finish({ ...ui.initial, revision: 3 });
  await flush();
});

test('reviewed output edits are preserved across status updates, and stale packets cannot revert state', async (t) => {
  const ui = await fixture(t);
  const packet = { revision: 2, session: 'current', seq: 1, status: 'result', shareText: 'original preview', result: { stdout: 'RAW', stderr: '', status: 'completed', exitCode: 0 } };
  ui.update(packet);
  ui.byId('terminal-share-text').value = 'only this edited output';
  ui.update({ ...packet, revision: 3 });
  assert.equal(ui.byId('terminal-share-text').value, 'only this edited output');
  ui.byId('terminal-share').click();
  assert.equal(ui.calls[0].payload.text, 'only this edited output');
  ui.finish({ ...ui.initial, revision: 4 });
  await flush();
  ui.update(packet);
  assert.equal(ui.byId('terminal-status').textContent, 'آمادهٔ تنظیم');
});

test('automatic options are initially unchecked and start sends independent explicit choices', async (t) => {
  const ui = await fixture(t);
  assert.equal(ui.byId('terminal-auto-execute').checked, false);
  assert.equal(ui.byId('terminal-auto-share').checked, false);
  ui.byId('terminal-task').value = 'Run the project tests';
  ui.byId('terminal-auto-execute').checked = true;
  ui.byId('terminal-start').click();
  assert.equal(ui.calls[0].action, 'start');
  assert.equal(ui.calls[0].payload.autoExecute, true);
  assert.equal(ui.calls[0].payload.autoShare, false);
  assert.equal(ui.calls[0].payload.task, 'Run the project tests');
  assert.equal(ui.byId('terminal-auto-share').disabled, true);
  ui.finish({ ...ui.initial, revision: 1 }); await flush();
});

test('session choices are locked while active, visible as granted, and reset on revocation', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, session: 'active', status: 'waiting', autoExecute: true, autoShare: true, expiresAt: Date.now() + 60000 });
  assert.equal(ui.byId('terminal-auto-execute').checked, true);
  assert.equal(ui.byId('terminal-auto-share').checked, true);
  assert.equal(ui.byId('terminal-auto-execute').disabled, true);
  assert.equal(ui.byId('terminal-task').disabled, true);
  assert.match(ui.byId('terminal-mode').textContent, /ارسال خودکار: روشن/);
  assert.equal(ui.byId('terminal-disable').disabled, false);
  ui.update({ revision: 2, status: 'paused', session: null });
  assert.equal(ui.byId('terminal-auto-execute').checked, false);
  assert.equal(ui.byId('terminal-auto-share').checked, false);
  assert.equal(ui.byId('terminal-auto-share').disabled, false);
  assert.match(ui.byId('terminal-mode').textContent, /فعال نیست/);
});

test('risky-command/output explanations are text only and pending process termination remains stoppable', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, status: 'result', session: 'active', reviewReasons: ['<img src=x>', 'Potential secret'],
    autoExecute: true, autoShare: true, result: { status: 'completed', stdout: 'local output' }, shareText: '[REDACTED]' });
  assert.equal(ui.byId('terminal-review-reasons').hidden, false);
  assert.match(ui.byId('terminal-review-reasons').textContent, /<img src=x>/);
  assert.equal(ui.byId('terminal-review-reasons').querySelector('img'), null);
  assert.equal(ui.byId('terminal-share').disabled, false);
  ui.update({ revision: 2, status: 'paused', session: null, busy: true });
  assert.equal(ui.byId('terminal-disable').disabled, false);
  assert.equal(ui.byId('terminal-start').disabled, true);
  assert.equal(ui.byId('terminal-review-reasons').hidden, true);
});
