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

test('Agent sidebar outside main is supported without mistaking source/search editors for a chat composer', (t) => {
  const ui = fixture(t);
  const doc = ui.dom.window.document;
  const aside = doc.createElement('aside');
  aside.append(doc.querySelector('form')); doc.body.append(aside);
  aside.insertAdjacentHTML('afterbegin', '<section data-message-author-role="assistant"><pre><code>sidebar response</code></pre></section><section data-role="user"><pre>not a model response</pre></section>');
  doc.querySelector('main').insertAdjacentHTML('beforeend', '<div class="monaco-editor"><textarea>source</textarea></div><div role="search"><textarea>search text</textarea></div><dialog open><textarea>dialog text</textarea><pre>not chat</pre></dialog>');
  assert.equal(ui.call('diagnostics').composerCount, 1);
  assert.equal(ui.call('prepare', 'agent sidebar task').ok, true);
  assert.deepEqual([...ui.call('snapshot').blocks], ['sidebar response']);
});

test('roleless nested rich composer and a deeper Send control use the native editing pipeline as plain text', (t) => {
  const ui = fixture(t); const doc = ui.dom.window.document;
  const form = doc.querySelector('form');
  form.outerHTML = '<section><div contenteditable="true"><div id="rich" contenteditable="plaintext-only"></div></div><div><button aria-label="Send prompt (Enter)" disabled>Send</button></div></section>';
  const rich = doc.querySelector('#rich'); const button = doc.querySelector('button');
  let edits = 0;
  doc.execCommand = (command, _show, value) => { assert.equal(command, 'insertText'); edits += 1; rich.textContent = value; return true; };
  rich.addEventListener('input', () => { button.disabled = false; });
  const message = 'literal <img src=x onerror=bad()>\nسلام';
  assert.equal(ui.call('prepare', message).ok, true);
  assert.equal(edits, 1); assert.equal(rich.querySelector('img'), null);
  assert.equal(ui.call('diagnostics').composerCount, 1);
  assert.equal(ui.call('diagnostics').composerKind, 'contenteditable');
  assert.equal(ui.call('send', message).reason, 'clicked');
});

test('replacing Send with Stop remains observable as busy; no second message is prepared or sent', (t) => {
  const ui = fixture(t); const doc = ui.dom.window.document;
  const form = doc.querySelector('form'); const wrapper = doc.createElement('section');
  wrapper.append(...form.children); form.replaceWith(wrapper);
  ui.button.setAttribute('aria-label', 'Stop generating');
  assert.equal(ui.call('snapshot').diagnostic, 'ready');
  assert.equal(ui.call('snapshot').busy, true);
  assert.equal(ui.call('prepare', 'do not insert').reason, 'model-busy');
  assert.equal(ui.textarea.value, ''); assert.equal(ui.sent(), 0);
  assert.equal(ui.call('confirm-send', 'a prior message').ok, true);
});

test('diagnostics is read-only metadata, not a chat transcript or a write operation', (t) => {
  const ui = fixture(t, '<pre>SECRET_CHAT_TRANSCRIPT</pre>');
  ui.textarea.value = 'PRIVATE_DRAFT_TOKEN';
  const report = ui.call('diagnostics');
  assert.equal(report.draftPresent, true); assert.equal(report.diagnostic, 'ready');
  assert.doesNotMatch(JSON.stringify(report), /SECRET_CHAT|PRIVATE_DRAFT|arena\.ai|fixture/);
  assert.equal(ui.textarea.value, 'PRIVATE_DRAFT_TOKEN'); assert.equal(ui.sent(), 0);
});

test('a click is not delivery: only draft consumption/generating counts as UI acceptance', (t) => {
  const ui = fixture(t); const old = ui.button;
  const button = old.cloneNode(true); old.replaceWith(button);
  let clicks = 0; button.addEventListener('click', (event) => { event.preventDefault(); clicks += 1; });
  ui.textarea.addEventListener('input', () => { button.disabled = false; });
  assert.equal(ui.call('prepare', 'one message').ok, true);
  const sent = ui.call('send', 'one message');
  assert.equal(sent.reason, 'clicked'); assert.equal(sent.accepted, false);
  assert.equal(ui.call('confirm-send', 'one message').reason, 'send-pending');
  assert.equal(clicks, 1);
  ui.textarea.value = 'new user draft';
  assert.equal(ui.call('confirm-send', 'one message').reason, 'draft-changed');
  ui.textarea.value = '';
  assert.equal(ui.call('confirm-send', 'one message').ok, true);
  assert.equal(clicks, 1);
});

test('pending attachments and newly attached files block automatic writes/sends', (t) => {
  const ui = fixture(t); const doc = ui.dom.window.document;
  const file = doc.createElement('input'); file.type = 'file';
  Object.defineProperty(file, 'files', { configurable: true, value: [{ name: 'PRIVATE_FILE' }] });
  ui.button.parentElement.append(file);
  assert.equal(ui.call('diagnostics').draftPresent, true);
  assert.equal(ui.call('prepare', 'do not attach').reason, 'draft-present');
  file.remove(); assert.equal(ui.call('prepare', 'prepared safely').ok, true);
  ui.button.parentElement.append(file);
  assert.equal(ui.call('send', 'prepared safely').reason, 'draft-present');
  assert.equal(ui.sent(), 0);
});

test('a draft typed by a focus handler is preserved, and unrelated form-submit controls are not Send', (t) => {
  const ui = fixture(t);
  ui.textarea.addEventListener('focus', () => { ui.textarea.value = 'just typed'; });
  assert.equal(ui.call('prepare', 'do not replace').reason, 'draft-present');
  assert.equal(ui.textarea.value, 'just typed');
  ui.button.setAttribute('aria-label', 'Delete project');
  assert.equal(ui.call('diagnostics').sendButtonCount, 0);
  assert.equal(ui.call('send', 'just typed').reason, 'send-button-count:0');
  assert.equal(ui.sent(), 0);
});
