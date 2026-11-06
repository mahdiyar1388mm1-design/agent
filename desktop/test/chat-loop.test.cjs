'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { TerminalAgent } = require('../src/terminal-agent.cjs');
const { adapterScript } = require('../src/site-adapter.cjs');

test('synthetic chat loop: model-format request → explicit approval → local runner → separately reviewed reply', async (t) => {
  // Offline fixture only: proves wiring, NOT compatibility with the live website/model.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-loop-'));
  const dom = new JSDOM('<main><div id="messages"></div><form><textarea></textarea><button type="submit" aria-label="Send message">Send</button></form></main>', {
    url: 'https://arena.ai/c/fixture', runScripts: 'outside-only',
  });
  t.after(() => { dom.window.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  dom.window.HTMLElement.prototype.getClientRects = () => [{}];
  const textarea = dom.window.document.querySelector('textarea');
  const sent = [];
  dom.window.document.querySelector('button').addEventListener('click', (event) => {
    event.preventDefault(); sent.push(textarea.value); textarea.value = '';
  });
  const calls = [];
  const runner = { supported: true, running: false, stop: async () => {},
    run: async (command, cwd) => {
      calls.push({ command, cwd });
      return { status: 'completed', exitCode: 0, stdout: 'project output', stderr: '' };
    },
  };
  const page = { getURL: () => dom.window.location.href, isDestroyed: () => false };
  const agent = new TerminalAgent({
    getWindow: () => ({}), getContents: () => page, runner, autoPoll: false, sleep: async () => {},
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [directory] }),
      showMessageBox: async () => ({ response: 0 }) },
    site: async (action, text) => dom.window.eval(adapterScript(action, text)),
  });
  t.after(() => agent.disable());
  await agent.chooseFolder();
  await agent.start({ task: 'List this project.' });
  assert.equal(sent.length, 1);
  const identity = { session: agent.snapshot().session, seq: 1 };
  const pre = dom.window.document.createElement('pre');
  const code = dom.window.document.createElement('code');
  code.textContent = JSON.stringify({ type: 'terminal_request', ...identity, command: 'Get-ChildItem' });
  pre.append(code);
  dom.window.document.getElementById('messages').append(pre);
  await agent.poll(); await agent.poll();
  assert.equal(agent.snapshot().status, 'review');
  assert.equal(calls.length, 0);
  await agent.approve(identity);
  assert.equal(calls.length, 1);
  assert.equal(sent.length, 1);
  await agent.share({ ...identity, text: 'Reviewed project output' });
  assert.equal(sent.length, 2);
  assert.match(sent[1], /terminal_result/);
  assert.match(sent[1], /Reviewed project output/);
  assert.equal(agent.snapshot().seq, 2);
});

for (const contenteditable of [false, true]) {
  test(`synthetic Agent-style chat: three local commands/results after one consent (${contenteditable ? 'contenteditable' : 'textarea'})`, async (t) => {
    // Agent-style fixture only; this does not assert live Arena Agent compatibility.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-auto-loop-'));
    const composer = contenteditable ? '<div contenteditable="true" role="textbox"></div>' : '<textarea></textarea>';
    const dom = new JSDOM(`<main><section id="messages"></section><form>${composer}<button aria-label="Send message" type="submit">Send</button></form></main>`, {
      url: 'https://arena.ai/agent/fixture', runScripts: 'outside-only',
    });
    t.after(() => { dom.window.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    dom.window.HTMLElement.prototype.getClientRects = () => [{}];
    const input = dom.window.document.querySelector('textarea, [contenteditable]');
    const messages = dom.window.document.getElementById('messages');
    const sent = [];
    const calls = [];
    const nativeDialogs = [];
    let agent;
    dom.window.document.querySelector('button').addEventListener('click', (event) => {
      event.preventDefault();
      const text = contenteditable ? input.textContent : input.value;
      sent.push(text);
      if (contenteditable) input.textContent = ''; else input.value = '';
      const ownMessage = dom.window.document.createElement('section');
      ownMessage.dataset.messageAuthorRole = 'user';
      const ownPre = dom.window.document.createElement('pre');
      ownPre.textContent = text;
      ownMessage.append(ownPre); messages.append(ownMessage);
      if (sent.length <= 3) {
        // Simulated model response to the initial prompt or previous result.
        const response = dom.window.document.createElement('section');
        response.dataset.messageAuthorRole = 'assistant';
        const block = dom.window.document.createElement('pre');
        const code = dom.window.document.createElement('code');
        code.textContent = JSON.stringify({ type: 'terminal_request', session: agent.snapshot().session,
          seq: sent.length, command: ['Get-ChildItem', 'Get-Content ./README.md', 'Get-Date'][sent.length - 1] });
        block.append(code); response.append(block); messages.append(response);
      }
    });
    const runner = { supported: true, running: false, stop: async () => {}, run: async (command, cwd) => {
      calls.push({ command, cwd });
      return { status: 'completed', exitCode: 0, stdout: `Result ${calls.length}`, stderr: '' };
    } };
    agent = new TerminalAgent({
      getWindow: () => ({}), getContents: () => ({ isDestroyed: () => false, getURL: () => dom.window.location.href }),
      runner, autoPoll: false, sleep: async () => {},
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [directory] }),
        showMessageBox: async (_window, options) => { nativeDialogs.push(options); return { response: 0 }; } },
      site: async (action, text) => dom.window.eval(adapterScript(action, text)),
    });
    t.after(() => agent.disable());
    await agent.chooseFolder();
    await agent.start({ task: 'Inspect the project autonomously.', autoExecute: true, autoShare: true });
    for (let index = 0; index < 3; index += 1) { await agent.poll(); await agent.poll(); }
    assert.equal(calls.length, 3);
    assert.equal(nativeDialogs.length, 1);
    assert.equal(sent.length, 4);
    assert.match(sent[3], /Result 3/);
    assert.equal(agent.snapshot().seq, 4);
    assert.equal(agent.snapshot().status, 'waiting');
    assert.equal(contenteditable ? input.textContent : input.value, '');
  });
}
