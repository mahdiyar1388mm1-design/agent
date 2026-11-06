'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PowerShellRunner } = require('../src/powershell-runner.cjs');

function fixture(t, options = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-runner-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const calls = [];
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { setImmediate(() => child.emit('close', null)); return true; };
  const spawn = (exe, args, spawnOptions) => {
    calls.push({ exe, args, options: spawnOptions });
    if (/taskkill\.exe$/i.test(exe)) {
      const killer = new EventEmitter();
      killer.kill = () => {};
      setImmediate(() => { child.emit('close', 1); killer.emit('close', 0); });
      return killer;
    }
    return child;
  };
  const runner = new PowerShellRunner({ platform: 'win32', spawn,
    env: { SystemRoot: 'C:\\Windows', PATH: 'normal-path', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' }, ...options });
  return { runner, child, calls, cwd };
}

test('runner uses a fixed native PowerShell path with no shell wrapper, profiles or execution-policy bypass', async (t) => {
  const f = fixture(t);
  const result = f.runner.run('Write-Output "hello"', f.cwd);
  assert.match(f.calls[0].exe, /System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/);
  assert.equal(f.calls[0].options.shell, false);
  assert.equal(f.calls[0].options.windowsHide, true);
  assert.equal(f.calls[0].options.cwd, fs.realpathSync(f.cwd));
  assert.equal(f.calls[0].options.env.NODE_OPTIONS, undefined);
  assert.equal(f.calls[0].options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.deepEqual(f.calls[0].args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
  assert.equal(f.calls[0].args.some((value) => /ExecutionPolicy|Bypass/i.test(value)), false);
  const bytes = Buffer.from('سلام');
  f.child.stdout.emit('data', bytes.subarray(0, 3));
  f.child.stdout.emit('data', bytes.subarray(3));
  f.child.stderr.emit('data', Buffer.from('a warning'));
  f.child.emit('close', 0);
  const value = await result;
  assert.equal(value.stdout, 'سلام');
  assert.equal(value.stderr, 'a warning');
  assert.equal(value.status, 'completed');
  assert.equal(value.exitCode, 0);
  assert.equal(f.runner.running, false);
});

test('one active command at a time; invalid commands never spawn a process', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.runner.run('x\u0000y', f.cwd), /معتبر/);
  await assert.rejects(f.runner.run('echo x', 'relative-folder'), /پوشه/);
  assert.equal(f.calls.length, 0);
  const result = f.runner.run('Get-Location', f.cwd);
  await assert.rejects(f.runner.run('Get-Date', f.cwd), /دیگر/);
  f.child.emit('close', 0);
  await result;
});

test('output caps stop the captured process tree rather than retaining unbounded text', async (t) => {
  const f = fixture(t, { maxBytes: 8 });
  const result = f.runner.run('Write-Output data', f.cwd);
  f.child.stdout.emit('data', Buffer.from('0123456789abcdef'));
  const value = await result;
  assert.equal(value.stdout, '01234567');
  assert.equal(value.truncated, true);
  assert.equal(value.status, 'output_limit');
  assert.deepEqual(f.calls[1].args, ['/PID', '12345', '/T', '/F']);
});

test('timeouts and user cancellation both terminate only the runner-owned PID tree', async (t) => {
  const f = fixture(t, { timeoutMs: 15 });
  const value = await f.runner.run('Start-Sleep 60', f.cwd);
  assert.equal(value.status, 'timeout');
  assert.equal(f.calls.length, 2);
  const second = f.runner.run('Start-Sleep 60', f.cwd);
  await f.runner.stop();
  assert.equal((await second).status, 'cancelled');
});

test('spawn errors produce a bounded local result without leaving the runner busy', async (t) => {
  const f = fixture(t);
  const result = f.runner.run('Get-Date', f.cwd);
  f.child.emit('error', new Error('ENOENT'));
  assert.equal((await result).error, 'ENOENT');
  assert.equal(f.runner.running, false);
});

test('non-Windows hosts never silently execute model commands in a different shell', async () => {
  const runner = new PowerShellRunner({ platform: 'linux' });
  assert.equal(runner.supported, false);
  await assert.rejects(runner.run('echo x', process.cwd()), /Windows/);
});
