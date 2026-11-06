'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TerminalAgent } = require('../src/terminal-agent.cjs');

async function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-agent-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const page = { url: 'https://arena.ai/c/fixture', isDestroyed: () => false, getURL() { return this.url; } };
  const responses = [];
  const dialogs = [];
  const messages = [];
  const data = { blocks: [], busy: false, diagnostic: 'ready', draft: '' };
  let finish;
  const calls = [];
  const runner = {
    supported: true, running: false,
    run: async (command, folder) => {
      runner.running = true;
      calls.push({ command, folder });
      return new Promise((resolve) => { finish = (value) => { runner.running = false; resolve(value); }; });
    },
    stop: async () => { if (runner.running) finish({ status: 'cancelled', exitCode: null, stdout: '', stderr: '' }); },
  };
  const agent = new TerminalAgent({
    getWindow: () => ({}), getContents: () => page, runner, autoPoll: false, sleep: async () => {},
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [cwd] }),
      showMessageBox: async (_window, options) => {
        dialogs.push(options);
        const response = responses.shift();
        return response instanceof Promise ? response : { response: response ?? 1 };
      },
    },
    site: async (action, text) => {
      if (action === 'snapshot') return { ...data, url: page.url };
      if (action === 'prepare') {
        if (data.draft) return { ok: false, reason: 'draft-present' };
        data.draft = text;
        return { ok: true };
      }
      if (action === 'send') { messages.push(text); data.draft = ''; return { ok: true }; }
      throw new Error('Unknown mock action');
    },
  });
  t.after(() => agent.disable());
  await agent.chooseFolder();
  const start = async () => { responses.push(0); return agent.start({ task: 'Inspect this project.' }); };
  const propose = async (command = 'Get-ChildItem') => {
    const state = agent.snapshot();
    data.blocks = [JSON.stringify({ type: 'terminal_request', session: state.session, seq: state.seq, command, reason: 'List project files' })];
    await agent.poll();
    await agent.poll();
  };
  const identity = () => ({ session: agent.snapshot().session, seq: agent.snapshot().seq });
  return { agent, page, runner, responses, dialogs, messages, data, calls, cwd,
    start, propose, identity, finish: (value) => finish(value) };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('activation and detection alone never execute a model command', async (t) => {
  const f = await fixture(t);
  await f.start();
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0], /Inspect this project/);
  await f.propose();
  assert.equal(f.agent.snapshot().status, 'review');
  assert.equal(f.calls.length, 0);
  assert.equal(f.dialogs[0].defaultId, 1);
  await f.agent.approve(f.identity()); // default native response is cancel
  assert.equal(f.agent.snapshot().status, 'review');
  assert.equal(f.calls.length, 0);
});

test('approved immutable command runs once; output is not sent until separately reviewed', async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.propose('Get-Location');
  f.responses.push(0);
  const running = f.agent.approve({ ...f.identity(), command: 'MUST NOT EXECUTE' });
  await flush();
  assert.deepEqual(f.calls, [{ command: 'Get-Location', folder: fs.realpathSync(f.cwd) }]);
  await assert.rejects(f.agent.approve(f.identity()), /قدیمی/);
  f.finish({ status: 'completed', exitCode: 0, stdout: 'PRIVATE RAW OUTPUT', stderr: '' });
  await running;
  assert.equal(f.agent.snapshot().status, 'result');
  assert.equal(f.messages.length, 1);
  await f.agent.share({ ...f.identity(), text: 'Only this reviewed output' });
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[1].includes('PRIVATE RAW OUTPUT'), false);
  assert.match(f.messages[1], /Only this reviewed output/);
  assert.equal(f.agent.snapshot().seq, 2);
  await f.agent.poll(); await f.agent.poll();
  assert.equal(f.agent.snapshot().status, 'waiting'); // old seq 1 cannot replay
});

test('revocation during the native approval dialog prevents late execution', async (t) => {
  const f = await fixture(t);
  await f.start(); await f.propose();
  let answer;
  f.responses.push(new Promise((resolve) => { answer = resolve; }));
  const approval = f.agent.approve(f.identity());
  await flush();
  await f.agent.disable();
  answer({ response: 0 });
  await approval;
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().session, null);
});

test('two different simultaneous model requests fail closed instead of choosing a winner', async (t) => {
  const f = await fixture(t);
  await f.start();
  const identity = f.identity();
  f.data.blocks = ['Get-Location', 'Get-Date'].map((command) => JSON.stringify({ type: 'terminal_request', ...identity, command }));
  await f.agent.poll();
  assert.equal(f.agent.snapshot().status, 'paused');
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.calls.length, 0);
});

test('rejecting a request reports no execution, and does not automatically post even the rejection', async (t) => {
  const f = await fixture(t);
  await f.start(); await f.propose();
  f.agent.reject(f.identity());
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().result.status, 'rejected');
  assert.equal(f.messages.length, 1);
});

test('navigation and stale identities revoke the session without running commands', async (t) => {
  const f = await fixture(t);
  await f.start(); await f.propose();
  const old = f.identity();
  f.page.url = 'https://arena.ai/c/other-conversation';
  f.agent.onNavigation(f.page.url);
  assert.equal(f.agent.snapshot().session, null);
  await assert.rejects(f.agent.approve(old), /قدیمی/);
  assert.equal(f.calls.length, 0);
});

test('existing drafts are not overwritten, unsafe origins never receive terminal messages', async (t) => {
  const f = await fixture(t);
  f.data.draft = 'my own draft';
  await f.start();
  assert.equal(f.agent.snapshot().status, 'paused');
  assert.equal(f.messages.length, 0);
  assert.equal(f.data.draft, 'my own draft');
  f.page.url = 'https://accounts.google.com/login';
  await f.start();
  assert.equal(f.messages.length, 0);
  assert.equal(f.calls.length, 0);
});

test('concurrent starts are gated before asynchronous DOM/native checks', async (t) => {
  const f = await fixture(t);
  f.responses.push(0);
  const first = f.agent.start({ task: 'A task' });
  await assert.rejects(f.agent.start({ task: 'Second task' }), /قبلی/);
  await first;
  assert.equal(f.messages.length, 1);
});
