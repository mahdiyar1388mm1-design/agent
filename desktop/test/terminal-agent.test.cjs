'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TerminalAgent } = require('../src/terminal-agent.cjs');

async function fixture(t, options = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-agent-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const page = { url: 'https://arena.ai/c/fixture', isDestroyed: () => false, getURL() { return this.url; } };
  const responses = [];
  const dialogs = [];
  const messages = [];
  const data = { blocks: [], busy: false, diagnostic: 'ready', draft: '' };
  let finish;
  let siteHook = async () => undefined;
  const clock = { value: Date.now() };
  const calls = [];
  const runner = {
    supported: true, running: false, output: { status: 'completed', exitCode: 0, stdout: 'project files', stderr: '' },
    run: async (command, folder) => {
      runner.running = true;
      calls.push({ command, folder });
      if (options.autoComplete) { runner.running = false; return { ...runner.output }; }
      return new Promise((resolve) => { finish = (value) => { runner.running = false; resolve(value); }; });
    },
    stop: async () => { if (runner.running) finish({ status: 'cancelled', exitCode: null, stdout: '', stderr: '' }); },
  };
  const agent = new TerminalAgent({
    getWindow: () => ({}), getContents: () => page, runner, autoPoll: false, sleep: async () => {},
    now: () => clock.value, onUpdate: (state) => options.onUpdate?.(state, agent),
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [cwd] }),
      showMessageBox: async (_window, options) => {
        dialogs.push(options);
        const response = responses.shift();
        return response instanceof Promise ? response : { response: response ?? 1 };
      },
    },
    site: async (action, text) => {
      const override = await siteHook(action, text);
      if (override !== undefined) return override;
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
  const start = async (permissions = {}) => { responses.push(0); return agent.start({ task: 'Inspect this project.', ...permissions }); };
  const propose = async (command = 'Get-ChildItem') => {
    const state = agent.snapshot();
    data.blocks = [JSON.stringify({ type: 'terminal_request', session: state.session, seq: state.seq, command, reason: 'List project files' })];
    await agent.poll();
    await agent.poll();
  };
  const identity = () => ({ session: agent.snapshot().session, seq: agent.snapshot().seq });
  return { agent, page, runner, responses, dialogs, messages, data, calls, cwd,
    start, propose, identity, clock, setSiteHook: (hook) => { siteHook = hook; }, finish: (value) => finish(value) };
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

const { SESSION_LIFETIME_MS } = require('../src/session-permissions.cjs');
const autonomous = { autoExecute: true, autoShare: true };

test('one native session consent authorizes a multi-command automatic loop, with no repeated prompts', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  for (const command of ['Get-ChildItem', 'Get-Date', 'Write-Output "سلام"']) await f.propose(command);
  assert.equal(f.calls.length, 3);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.messages.length, 4);
  assert.equal(f.agent.snapshot().seq, 4);
  assert.equal(f.agent.snapshot().status, 'waiting');
  assert.equal(f.agent.snapshot().autoExecute, true);
  assert.equal(f.agent.snapshot().autoShare, true);
  assert.match(f.dialogs[0].detail, /اجرای خودکار روشن/);
  assert.match(f.dialogs[0].detail, /ارسال خودکار روشن/);
  assert.match(f.dialogs[0].detail, /تشخیص‌داده‌نشده/);
  assert.equal(f.dialogs[0].defaultId, 1);
  await f.agent.poll(); await f.agent.poll(); // old seq 3 cannot replay
  assert.equal(f.calls.length, 3);
});

test('execution permission alone never authorizes automatic output sharing', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start({ autoExecute: true });
  await f.propose();
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 1);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.agent.snapshot().status, 'result');
  assert.equal(f.agent.snapshot().autoShare, false);
  assert.match(f.dialogs[0].detail, /ارسال خودکار خاموش/);
  await f.agent.share({ ...f.identity(), text: 'Locally reviewed output' });
  assert.equal(f.messages.length, 2);
  await f.propose('Get-Date');
  assert.equal(f.calls.length, 2);
  assert.equal(f.messages.length, 2);
});

test('independent sharing consent does not authorize execution, but can share ordinary approved results', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start({ autoShare: true });
  await f.propose();
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().status, 'review');
  f.responses.push(0);
  await f.agent.approve(f.identity());
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 2);
  assert.equal(f.dialogs.length, 2);
  assert.equal(f.agent.snapshot().status, 'waiting');
});

test('cancelled initial consent does not grant either automatic permission', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  f.responses.push(1);
  await f.agent.start({ task: 'List files', ...autonomous });
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.agent.snapshot().autoShare, false);
  assert.equal(f.agent.snapshot().expiresAt, null);
  assert.equal(f.messages.length, 0);
  assert.equal(f.calls.length, 0);
});

test('permissions are not granted while native session consent is pending; revocation wins a late answer', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  let answer;
  f.responses.push(new Promise((resolve) => { answer = resolve; }));
  const starting = f.agent.start({ task: 'List files', ...autonomous });
  await flush();
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.agent.snapshot().autoShare, false);
  await f.agent.disable();
  answer({ response: 0 });
  await starting;
  assert.equal(f.messages.length, 0);
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('automatic mode must be requested with strict booleans, never truthy input', async (t) => {
  const f = await fixture(t);
  for (const key of ['autoExecute', 'autoShare']) {
    for (const value of ['false', 'true', 1, null, {}, []]) {
      await assert.rejects(f.agent.start({ task: 'List files', [key]: value }), /روشن یا خاموش/);
      assert.equal(f.agent.snapshot().session, null);
    }
  }
  assert.equal(f.dialogs.length, 0);
});

test('model JSON and approve payload flags cannot escalate a manual session into automatic mode', async (t) => {
  const f = await fixture(t);
  await f.start();
  for (const extra of [{ autoExecute: true }, { autoShare: true }, { automatic: true }]) {
    f.data.blocks = [JSON.stringify({ type: 'terminal_request', ...f.identity(), command: 'Get-Date', ...extra })];
    await f.agent.poll(); await f.agent.poll();
    assert.equal(f.agent.snapshot().status, 'waiting');
  }
  await f.propose();
  await f.agent.handle('approve', { ...f.identity(), automatic: true, autoExecute: true });
  assert.equal(f.calls.length, 0); // native dialog defaults to cancel
  assert.equal(f.dialogs.length, 2);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('recognizable risky commands pause for native review, and their results need separate manual sharing', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  await f.propose('Remove-Item ./temporary.txt');
  assert.equal(f.agent.snapshot().status, 'review');
  assert.ok(f.agent.snapshot().reviewReasons.length);
  assert.equal(f.calls.length, 0);
  f.responses.push(0);
  await f.agent.approve(f.identity());
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 1);
  assert.equal(f.agent.snapshot().status, 'result');
  assert.match(f.agent.snapshot().reviewReasons.join(' '), /بررسی دستی/);
  await f.agent.share({ ...f.identity(), text: 'User reviewed this command result' });
  await f.propose('Get-Date');
  assert.equal(f.calls.length, 2);
  assert.equal(f.messages.length, 3);
  assert.equal(f.dialogs.length, 2); // initial + risky command, not another ordinary command
});

test('sensitive output is checked before preview shortening, and never automatically posted even after redaction', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  f.runner.output.stdout = 'x'.repeat(14000) + '\nAPI_KEY=PRIVATE_UNSHARED_SECRET';
  await f.start(autonomous);
  await f.propose();
  assert.equal(f.agent.snapshot().status, 'result');
  assert.equal(f.messages.length, 1);
  assert.ok(f.agent.snapshot().reviewReasons.length);
  assert.equal(f.agent.snapshot().shareText.includes('PRIVATE_UNSHARED_SECRET'), false);
  await f.agent.share({ ...f.identity(), text: 'Only the reviewed safe summary' });
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[1].includes('PRIVATE_UNSHARED_SECRET'), false);
});

test('stderr tokens, truncated output, cancellation and execution errors all hold automatic sharing', async (t) => {
  for (const patch of [
    { stderr: 'ghp_' + 's'.repeat(30) }, { truncated: true }, { status: 'timeout' },
    { status: 'cancelled' }, { status: 'error', error: 'Failed to start' },
  ]) {
    await t.test(JSON.stringify(patch), async (sub) => {
      const f = await fixture(sub, { autoComplete: true });
      Object.assign(f.runner.output, patch);
      await f.start(autonomous);
      await f.propose();
      assert.equal(f.agent.snapshot().status, 'result');
      assert.equal(f.messages.length, 1);
      assert.ok(f.agent.snapshot().reviewReasons.length);
    });
  }
});

test('an ordinary nonzero exit code can return to the model for diagnosis without another prompt', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  Object.assign(f.runner.output, { exitCode: 1, stderr: 'A test failed on line 7' });
  await f.start(autonomous); await f.propose('npm test');
  assert.equal(f.messages.length, 2);
  assert.match(f.messages[1], /A test failed/);
  assert.equal(f.dialogs.length, 1);
});

test('Stop during an automatically started process cancels it and prevents late automatic sharing', async (t) => {
  const f = await fixture(t);
  await f.start(autonomous);
  const running = f.propose();
  await flush();
  assert.equal(f.runner.running, true);
  await f.agent.disable();
  await running;
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 1);
  assert.equal(f.agent.snapshot().result, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.agent.snapshot().autoShare, false);
});

test('revocation published at the result boundary wins over automatic sharing', async (t) => {
  const f = await fixture(t, { autoComplete: true, onUpdate: (state, agent) => {
    if (state.status === 'result') void agent.disable();
  } });
  await f.start(autonomous); await f.propose();
  await flush();
  assert.equal(f.messages.length, 1);
  assert.equal(f.agent.snapshot().session, null);
});

test('revocation between preparing and clicking Send prevents a new chat message', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  f.agent.sleep = async () => { await f.agent.disable(); };
  await f.propose();
  assert.equal(f.messages.length, 1);
  assert.equal(f.agent.snapshot().session, null);
  // A draft already placed in the website cannot be recalled from that page.
  assert.match(f.data.draft, /terminal_result/);
});

test('session grants expire before a queued command executes', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  assert.equal(f.agent.snapshot().expiresAt, f.clock.value + SESSION_LIFETIME_MS);
  f.clock.value += SESSION_LIFETIME_MS;
  await f.propose();
  assert.equal(f.agent.snapshot().status, 'paused');
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoShare, false);
  assert.equal(f.calls.length, 0);
});

test('expiration while a process runs blocks its result from automatic transmission', async (t) => {
  const f = await fixture(t);
  await f.start(autonomous);
  const running = f.propose(); await flush();
  f.clock.value += SESSION_LIFETIME_MS;
  f.finish({ status: 'completed', exitCode: 0, stdout: 'late result', stderr: '' });
  await running;
  assert.equal(f.messages.length, 1);
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('automatic mode retains the 20-request cap and revokes grants at the limit', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  for (let index = 0; index < 20; index += 1) await f.propose('Get-Date');
  assert.equal(f.calls.length, 20);
  assert.equal(f.messages.length, 21);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.agent.snapshot().status, 'paused');
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.agent.snapshot().autoShare, false);
  await f.agent.poll();
  assert.equal(f.calls.length, 20);
});

test('navigation even before request #1 revokes session permissions; reactivation defaults to manual', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  f.page.url = 'https://arena.ai/c/another-chat';
  f.agent.onNavigation(f.page.url);
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
  await f.start(); await f.propose();
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().status, 'review');
  assert.equal(f.agent.snapshot().autoShare, false);
});

test('initial-message URL creation can complete, but later conversation changes still revoke', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  f.setSiteHook(async (action) => {
    if (action === 'send') {
      f.page.url = 'https://arena.ai/c/just-created';
      f.agent.onNavigation(f.page.url);
    }
  });
  await f.start(autonomous);
  assert.ok(f.agent.snapshot().session);
  f.setSiteHook(async () => undefined);
  await f.propose();
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 2);
  f.page.url = 'https://arena.ai/c/unrelated';
  f.agent.onNavigation(f.page.url);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('automatic sharing never overwrites a user draft and loses its grants on failure', async (t) => {
  const f = await fixture(t, { autoComplete: true, onUpdate: (state) => {
    if (state.status === 'result') f.data.draft = 'My new draft';
  } });
  await f.start(autonomous); await f.propose();
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.length, 1);
  assert.equal(f.data.draft, 'My new draft');
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoShare, false);
});

test('ambiguous model requests still revoke automatic permissions instead of choosing a command', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  f.data.blocks = ['Get-Date', 'Get-Location'].map((command) => JSON.stringify({ type: 'terminal_request', ...f.identity(), command }));
  await f.agent.poll();
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('losing the unique composer or going offline revokes grants before execution', async (t) => {
  for (const patch of [{ diagnostic: 'composer-count:2' }, { diagnostic: 'send-button-count:0' }, { offline: true }]) {
    await t.test(JSON.stringify(patch), async (sub) => {
      const f = await fixture(sub, { autoComplete: true });
      await f.start(autonomous);
      Object.assign(f.data, patch);
      await f.propose();
      assert.equal(f.calls.length, 0);
      assert.equal(f.agent.snapshot().session, null);
      assert.equal(f.agent.snapshot().autoShare, false);
    });
  }
});

test('same-URL document reload revokes a session, not just navigation to another chat', async (t) => {
  const f = await fixture(t, { autoComplete: true });
  await f.start(autonomous);
  f.agent.onDocumentChange();
  await f.propose();
  assert.equal(f.calls.length, 0);
  assert.equal(f.agent.snapshot().session, null);
  assert.equal(f.agent.snapshot().autoExecute, false);
});

test('background revocation surfaces an uncertain process stop without restoring grants', async (t) => {
  const f = await fixture(t);
  await f.start(autonomous);
  const running = f.propose(); await flush();
  f.runner.stop = async () => {
    f.finish({ status: 'cancelled', error: 'STOP NOT CONFIRMED', exitCode: null, stdout: '', stderr: '' });
    return { error: 'STOP NOT CONFIRMED' };
  };
  f.agent.onDocumentChange();
  await running; await flush();
  assert.equal(f.agent.snapshot().stopWarning, 'STOP NOT CONFIRMED');
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.messages.length, 1);
});

test('native project attachment supplies exact repository context without granting terminal permissions', async (t) => {
  const f = await fixture(t);
  f.agent.attachProject({ folder: f.cwd, repo: { url: 'https://github.com/owner/ready-project' }, branch: 'arena/work' });
  assert.equal(f.agent.snapshot().folder, fs.realpathSync(f.cwd));
  assert.equal(f.agent.snapshot().project.branch, 'arena/work');
  assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.agent.snapshot().autoShare, false);
  await f.start();
  assert.match(f.messages[0], /https:\/\/github.com\/owner\/ready-project/);
  assert.match(f.messages[0], /Exact branch: "arena\/work"/);
  assert.match(f.messages[0], /never read\/print tokens/);
  assert.equal(f.calls.length, 0);
});

test('Agent project handoff is a single guarded message, not a terminal session or execution grant', async (t) => {
  const f = await fixture(t); let guards = 0;
  await f.agent.sendProjectMessage('Repository: https://github.com/owner/project\nTask: continue.', () => { guards += 1; });
  assert.equal(f.messages.length, 1); assert.ok(guards > 1);
  assert.equal(f.agent.session, null); assert.equal(f.agent.snapshot().autoExecute, false);
  assert.equal(f.calls.length, 0);
});

test('Agent handoff preserves a pre-existing user draft and never sends it', async (t) => {
  const f = await fixture(t); f.data.draft = 'My unsent personal message';
  await assert.rejects(f.agent.sendProjectMessage('Project context', () => {}));
  assert.equal(f.data.draft, 'My unsent personal message'); assert.equal(f.messages.length, 0);
});

test('revocation after project-message preparation prevents clicking Send', async (t) => {
  const f = await fixture(t); let revoked = false;
  f.setSiteHook(async (action) => { if (action === 'prepare') revoked = true; });
  await assert.rejects(f.agent.sendProjectMessage('Project context', () => { if (revoked) throw new Error('revoked'); }), /revoked/);
  assert.equal(f.messages.length, 0); assert.equal(f.calls.length, 0);
});

test('disabled Send retries activation, then waits for UI acceptance without reclicking', async (t) => {
  const f = await fixture(t); let sends = 0; let confirms = 0;
  f.setSiteHook(async (action) => {
    if (action === 'send') return ++sends < 3 ? { ok: false, reason: 'send-disabled' } : { ok: true, reason: 'clicked', accepted: false };
    if (action === 'confirm-send') return ++confirms < 3 ? { ok: false, reason: 'send-pending' } : { ok: true, reason: 'accepted' };
  });
  await f.start();
  assert.equal(f.agent.snapshot().status, 'waiting');
  assert.equal(sends, 3); assert.equal(confirms, 3); assert.equal(f.calls.length, 0);
});

test('an unacknowledged click pauses with preserved draft, never resends and revokes grants', async (t) => {
  const f = await fixture(t); let sends = 0;
  f.setSiteHook(async (action) => {
    if (action === 'send') { sends += 1; return { ok: true, reason: 'clicked', accepted: false }; }
    if (action === 'confirm-send') return { ok: false, reason: 'send-pending' };
  });
  await f.start({ autoExecute: true, autoShare: true });
  assert.equal(sends, 1); assert.equal(f.agent.snapshot().status, 'paused');
  assert.equal(f.agent.snapshot().autoExecute, false); assert.equal(f.agent.snapshot().autoShare, false);
  assert.match(f.agent.snapshot().message, /سایت پیام را نپذیرفت/);
  assert.match(f.data.draft, /Inspect this project/); assert.equal(f.calls.length, 0);
});

test('Stop while awaiting UI acceptance prevents a late completion from restoring the session', async (t) => {
  const f = await fixture(t); let sends = 0; let confirms = 0;
  f.setSiteHook(async (action) => {
    if (action === 'send') { sends += 1; return { ok: true, reason: 'clicked', accepted: false }; }
    if (action === 'confirm-send') { confirms += 1; await f.agent.disable(); return { ok: true, reason: 'accepted' }; }
  });
  await f.start({ autoExecute: true, autoShare: true });
  assert.equal(sends, 1); assert.equal(confirms, 1);
  assert.equal(f.agent.snapshot().session, null); assert.equal(f.agent.snapshot().status, 'ready');
  assert.equal(f.agent.snapshot().autoExecute, false); assert.equal(f.agent.snapshot().autoShare, false);
  assert.equal(f.calls.length, 0);
});

test('no compatible model request produces a useful warning without inventing/running a command', async (t) => {
  const f = await fixture(t); await f.start();
  f.clock.value += 46000; await f.agent.poll();
  assert.equal(f.agent.snapshot().status, 'waiting');
  assert.match(f.agent.snapshot().message, /ابزار ابری/); assert.equal(f.calls.length, 0);
});
