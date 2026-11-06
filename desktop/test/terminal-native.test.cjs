'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PowerShellRunner } = require('../src/powershell-runner.cjs');

// Fixed benign test commands only, using an isolated temporary directory.
// The Linux workspace skips this; the Windows CI executes real PowerShell.
test('native Windows PowerShell returns UTF-8 output and can stop a sleeping command', {
  skip: process.platform !== 'win32', timeout: 30000,
}, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-native-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 3 }));
  const runner = new PowerShellRunner({ timeoutMs: 10000 });
  t.after(() => runner.stop());
  const result = await runner.run("Write-Output 'ARENA_TERMINAL_SMOKE_سلام'", cwd);
  assert.equal(result.status, 'completed');
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /ARENA_TERMINAL_SMOKE_سلام/);
  const sleeping = runner.run('Start-Sleep -Seconds 60', cwd);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await runner.stop();
  const stopped = await sleeping;
  assert.equal(stopped.status, 'cancelled');
  assert.equal(stopped.error, null);
  assert.equal(runner.running, false);
});

const { TerminalAgent } = require('../src/terminal-agent.cjs');

test('native Windows automatic bridge runs two benign PowerShell requests after one session consent', {
  skip: process.platform !== 'win32', timeout: 30000,
}, async (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-native-auto-'));
  const runner = new PowerShellRunner({ timeoutMs: 10000 });
  const page = { getURL: () => 'https://arena.ai/agent/native-fixture', isDestroyed: () => false };
  const sent = [];
  const dialogs = [];
  let blocks = [];
  const agent = new TerminalAgent({
    getWindow: () => ({}), getContents: () => page, runner, autoPoll: false, sleep: async () => {},
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [cwd] }),
      // Test double for the user's ONE native consent. Production uses Electron.
      showMessageBox: async (_window, options) => { dialogs.push(options); return { response: 0 }; },
    },
    site: async (action, text) => {
      if (action === 'snapshot') return { url: page.getURL(), diagnostic: 'ready', busy: false, blocks };
      if (action === 'send') sent.push(text);
      return { ok: true };
    },
  });
  t.after(async () => { await agent.disable(); fs.rmSync(cwd, { recursive: true, force: true, maxRetries: 3 }); });
  await agent.chooseFolder();
  await agent.start({ task: 'Write two fixed test messages.', autoExecute: true, autoShare: true });
  for (let seq = 1; seq <= 2; seq += 1) {
    blocks = [JSON.stringify({ type: 'terminal_request', session: agent.snapshot().session,
      seq, command: `Write-Output 'ARENA_AUTO_سلام_${seq}'` })];
    await agent.poll(); await agent.poll();
  }
  assert.equal(dialogs.length, 1);
  assert.equal(sent.length, 3);
  assert.match(sent[1], /ARENA_AUTO_سلام_1/);
  assert.match(sent[2], /ARENA_AUTO_سلام_2/);
  assert.equal(agent.snapshot().seq, 3);
  assert.equal(agent.snapshot().status, 'waiting');
  assert.equal(runner.running, false);
});
