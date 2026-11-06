'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { GitHubTools, toolEnvironment, shellQuote } = require('../src/github-tools.cjs');

function fixture(t, options = {}) {
  const calls = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.pid = 1234;
  child.stdin.end = (input) => { child.input = input; };
  child.kill = () => { child.emit('close', null); return true; };
  const tools = new GitHubTools({ platform: 'linux', paths: { git: '/trusted/git', gh: "/trusted/GitHub CLI/gh" },
    cwd: '/trusted', env: { HOME: '/home/fixture', GIT_DIR: '/attack', NODE_OPTIONS: '--inspect', GH_HOST: 'evil.invalid' },
    spawn: (...args) => { calls.push(args); return child; }, ...options });
  t.after(async () => { await tools.stop(); tools.dispose(); });
  return { tools, child, calls };
}

test('Git tool uses fixed argv, a quoted credential helper and disabled hooks, never shell:true or token argv', async (t) => {
  const f = fixture(t);
  const running = f.tools.git(['fetch', '--no-tags', '--', 'https://github.com/owner/project.git', 'refs/heads/main'], '/project');
  const [executable, args, options] = f.calls[0];
  assert.equal(executable, '/trusted/git'); assert.equal(options.shell, false);
  assert.equal(options.env.GIT_DIR, undefined); assert.equal(options.env.NODE_OPTIONS, undefined);
  assert.equal(options.env.GH_HOST, 'github.com'); assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
  assert.ok(args.some((value) => value.startsWith('core.hooksPath=')));
  assert.ok(args.includes('core.fsmonitor=false')); assert.ok(args.includes('protocol.file.allow=never'));
  assert.ok(args.includes("credential.https://github.com.helper=!'/trusted/GitHub CLI/gh' auth git-credential"));
  assert.equal(args.some((arg) => /auth token|with-token|password=/i.test(arg)), false);
  f.child.stdout.emit('data', Buffer.from('fetched')); f.child.emit('close', 0);
  assert.equal((await running).stdout, 'fetched');
  assert.equal(shellQuote("a'b"), "'a'\\''b'");
});

test('login progress exposes only a device-code match and keeps UTF-8 chunks intact', async (t) => {
  const f = fixture(t); const codes = [];
  const running = f.tools.gh(['auth', 'login', '--web'], { input: '\n', onDeviceCode: (code) => codes.push(code) });
  const bytes = Buffer.from('سلام / First copy code: ABCD-1234');
  f.child.stderr.emit('data', bytes.subarray(0, 3)); f.child.stderr.emit('data', bytes.subarray(3));
  f.child.emit('close', 0);
  const result = await running;
  assert.match(result.stderr, /سلام/); assert.deepEqual(codes, ['ABCD-1234']);
  assert.equal(f.child.input, '\n');
});

test('oversized output and cancellation stop the owned process and forbid overlapping jobs', async (t) => {
  const f = fixture(t);
  const running = f.tools.gh(['repo', 'list'], { maxBytes: 8 });
  assert.throws(() => f.tools.gh(['api', 'user']), /قبلی/);
  f.child.stdout.emit('data', Buffer.from('x'.repeat(100)));
  const result = await running;
  assert.ok(result.stdout.length <= 8); assert.match(result.error, /سقف/);
  assert.equal(f.tools.running, false);
});

test('a timeout terminates the process without changing credentials or passing a supplied PID', async (t) => {
  const f = fixture(t);
  const result = await f.tools.gh(['api', 'user'], { timeoutMs: 5 });
  assert.match(result.error, /مهلت/); assert.equal(f.tools.running, false);
  assert.equal(f.calls.length, 1);
});

test('inherited Git override variables cannot redirect worktrees, executables or config injection', () => {
  const env = toolEnvironment({ GIT_WORK_TREE: '/private', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.sshCommand',
    GIT_CONFIG_VALUE_0: 'bad', GIT_EXEC_PATH: '/bad', GH_REPO: 'other/repo', PATH: '/trusted', GH_TOKEN: 'fixture-token' });
  assert.equal(env.GIT_WORK_TREE, undefined); assert.equal(env.GIT_CONFIG_COUNT, undefined);
  assert.equal(env.GIT_CONFIG_KEY_0, undefined); assert.equal(env.GIT_EXEC_PATH, undefined);
  assert.equal(env.GH_REPO, undefined); assert.equal(env.PATH, '/trusted');
  // Credentials stay in gh's own mechanism; they are not returned to the renderer.
  assert.equal(env.GH_TOKEN, 'fixture-token');
});

test('installed Git can invoke the fixed gh credential helper with an offline FAKE environment token', { timeout: 45000 }, async (t) => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-credential-fixture-'));
  const token = 'ghp_' + 'f'.repeat(36);
  const tools = new GitHubTools({ cwd: directory, env: { ...process.env,
    GH_TOKEN: token, GITHUB_TOKEN: token, GH_CONFIG_DIR: directory,
    HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '' } });
  t.after(async () => { await tools.stop(); tools.dispose(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); });
  const dependencies = await tools.detect();
  if (!dependencies.git || !dependencies.gh) { t.skip('Installed Git/gh are required only for this native helper test'); return; }
  // No real token, user config, login, API call or credential persistence.
  const result = await tools.git(['credential', 'fill'], directory, { timeoutMs: 30000, input: 'protocol=https\nhost=github.com\n\n' });
  assert.equal(result.code, 0, JSON.stringify({ error: result.error, stderr: result.stderr, dependencies }));
  assert.ok(result.stdout.includes(`password=${token}`));
  assert.match(result.stdout, /username=/);
});

test('an unconfirmed stop stays busy and blocks reuse until the actual owned child closes', async (t) => {
  const f = fixture(t, { stopGraceMs: 5 });
  f.child.kill = () => false;
  const pending = f.tools.gh(['auth', 'login']);
  await f.tools.stop();
  const result = await pending;
  assert.match(result.stopWarning, /تأیید نشد/);
  assert.equal(f.tools.running, true);
  assert.throws(() => f.tools.gh(['api', 'user']), /تأیید نشد/);
  assert.equal(f.calls.length, 1);
  f.child.emit('close', null);
  assert.equal(f.tools.running, false);
  const next = f.tools.gh(['api', 'user']); f.child.emit('close', 0);
  assert.equal((await next).code, 0);
});
