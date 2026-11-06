'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { adapterScript } = require('../src/site-adapter.cjs');

function fixture(t, extra = '') {
  // Deliberately a synthetic contract fixture, not a copy of the live Arena UI.
  const dom = new JSDOM(`<main><section id="messages">${extra}</section><form><textarea></textarea><button type="submit" aria-label="Send message" disabled>Send</button></form></main>`, {
    url: 'https://arena.ai/c/fixture', runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  const textarea = dom.window.document.querySelector('textarea');
  const button = dom.window.document.querySelector('button');
  let sent = 0;
  textarea.addEventListener('input', () => { button.disabled = !textarea.value; });
  button.addEventListener('click', (event) => { event.preventDefault(); sent += 1; textarea.value = ''; });
  return { dom, textarea, button, sent: () => sent, call: (action, text) => dom.window.eval(adapterScript(action, text)) };
}

test('adapter reads only visible bounded chat code blocks and ignores explicitly marked user messages', (t) => {
  const ui = fixture(t, '<pre><code>assistant-json</code></pre><div data-message-author-role="user"><pre><code>user-json</code></pre></div><pre hidden>hidden</pre><aside><pre>not-chat</pre></aside>');
  const snapshot = ui.call('snapshot');
  assert.deepEqual([...snapshot.blocks], ['assistant-json']);
  assert.equal(snapshot.diagnostic, 'ready');
  assert.equal(snapshot.url, 'https://arena.ai/c/fixture');
  assert.equal(ui.dom.window.arenaDesktop, undefined);
});

test('prepare/send uses plain text and clicks only the associated unique send button', (t) => {
  const ui = fixture(t);
  const message = 'x"; window.compromised = true; // <img src=x onerror=bad()>\nسلام';
  assert.equal(ui.call('prepare', message).ok, true);
  assert.equal(ui.textarea.value, message);
  assert.equal(ui.dom.window.compromised, undefined);
  assert.equal(ui.call('send', message).ok, true);
  assert.equal(ui.sent(), 1);
});

test('existing or changed user drafts are never overwritten or silently sent', (t) => {
  const ui = fixture(t);
  ui.textarea.value = 'my unsent draft';
  assert.equal(ui.call('prepare', 'agent message').reason, 'draft-present');
  assert.equal(ui.textarea.value, 'my unsent draft');
  assert.equal(ui.call('send', 'agent message').reason, 'draft-changed');
  assert.equal(ui.sent(), 0);
});

test('ambiguous composers/send controls and model Stop states fail closed', (t) => {
  const ui = fixture(t);
  const second = ui.dom.window.document.createElement('textarea');
  ui.dom.window.document.querySelector('main').append(second);
  assert.equal(ui.call('prepare', 'x').reason, 'composer-count:2');
  second.remove();
  const extra = ui.button.cloneNode(true);
  ui.button.parentElement.append(extra);
  assert.equal(ui.call('prepare', 'x').reason, 'send-button-count:2');
  extra.remove();
  ui.button.setAttribute('aria-label', 'Stop generating');
  assert.equal(ui.call('prepare', 'x').reason, 'model-busy');
  assert.equal(ui.sent(), 0);
});

test('expired queued DOM writes do nothing, and unknown adapter actions cannot run arbitrary scripts', (t) => {
  const ui = fixture(t);
  const old = ui.dom.window.Date.now;
  ui.dom.window.Date.now = () => Date.now() + 10000;
  assert.equal(ui.call('prepare', 'too late').reason, 'expired');
  assert.equal(ui.textarea.value, '');
  ui.dom.window.Date.now = old;
  assert.throws(() => adapterScript('eval', 'process.exit()'), /Unsupported/);
});

test('offline page snapshots and writes cannot continue a local automation loop', (t) => {
  const ui = fixture(t, '<pre>stale request</pre>');
  Object.defineProperty(ui.dom.window.navigator, 'onLine', { value: false });
  assert.equal(ui.call('snapshot').diagnostic, 'offline');
  assert.equal(ui.call('snapshot').blocks.length, 0);
  assert.equal(ui.call('prepare', 'Do not insert').reason, 'offline');
  assert.equal(ui.textarea.value, '');
  assert.equal(ui.sent(), 0);
});
