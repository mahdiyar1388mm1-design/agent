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
