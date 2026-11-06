'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createHash } = require('node:crypto');
const { GitHubTools } = require('../src/github-tools.cjs');
const { bundledToolPaths, prependToolPath } = require('../src/tool-paths.cjs');
const { verifiedArchive } = require('../scripts/prepare-tools.cjs');

function resources(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-portable-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }));
  for (const relative of ['git/cmd/git.exe', 'gh/bin/gh.exe']) {
    const file = path.join(root, 'tools', relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'FIXTURE_NOT_AN_EXECUTABLE');
  }
  return root;
}

test('bundled Windows Git/gh are found without PATH lookups, downloads, user config or installed executables', async (t) => {
  const root = resources(t); let spawned = 0;
  const tools = new GitHubTools({ platform: 'win32', resourcesPath: root, env: {}, spawn: () => { spawned += 1; throw new Error('Must not spawn a locator'); } });
  const found = await tools.detect();
  assert.equal(spawned, 0); assert.equal(found.git, fs.realpathSync.native(path.join(root, 'tools/git/cmd/git.exe')));
  assert.deepEqual(tools.sources, { git: 'bundled', gh: 'bundled' });
  assert.deepEqual(bundledToolPaths(root, 'linux'), {});
});

test('child PATH adds both tools once without writing global PATH, with Windows case-insensitive keys handled', () => {
  const inherited = { Path: 'system-tools', PATH: 'other-tools', KEEP: 'yes' };
  const child = prependToolPath({ ...inherited }, ['C:\\app\\git\\cmd\\git.exe', 'C:\\app\\gh\\bin\\gh.exe'], 'win32');
  assert.equal(child.PATH, 'C:\\app\\git\\cmd;C:\\app\\gh\\bin;system-tools;other-tools');
  assert.equal(child.Path, undefined); assert.equal(inherited.Path, 'system-tools'); assert.equal(child.KEEP, 'yes');
});

test('Windows Git requests keep TLS verification and Schannel while passing per-operation proxy/PATH to the child', async (t) => {
  const root = resources(t); const calls = []; const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter(); child.stdin.end = () => {};
  const tools = new GitHubTools({ platform: 'win32', resourcesPath: root, cwd: root, env: { Path: 'system' },
    spawn: (...args) => { calls.push(args); return child; } });
  t.after(() => tools.dispose()); await tools.detect();
  const done = tools.git(['ls-remote', '--', 'https://github.com/owner/repo.git', 'HEAD'], root, { networkEnv: { HTTPS_PROXY: 'http://proxy.invalid:8080' } });
  child.emit('close', 0); await done;
  const [, argv, options] = calls[0];
  assert.ok(argv.includes('http.sslVerify=true')); assert.ok(argv.includes('http.sslBackend=schannel'));
  assert.equal(options.env.HTTPS_PROXY, 'http://proxy.invalid:8080');
  assert.ok(options.env.PATH.includes(path.win32.dirname(tools.paths.git))); assert.ok(options.env.PATH.includes(path.win32.dirname(tools.paths.gh)));
  assert.equal(options.shell, false);
});

test('verified cached archives are reused without contacting the network', async (t) => {
  const root = resources(t); const data = Buffer.from('fixed public archive fixture');
  fs.writeFileSync(path.join(root, 'tool.zip'), data);
  const pin = { url: 'https://github.com/example/tool/releases/download/v1/tool.zip', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  assert.equal(await verifiedArchive(pin, root), path.join(root, 'tool.zip'));
});

test('bad official download hashes/sizes cannot become extracted resources or retained partial files', async (t) => {
  const root = resources(t); const original = global.fetch;
  t.after(() => { global.fetch = original; });
  const pin = { url: 'https://github.com/example/tool/releases/download/v1/tool.zip', bytes: 4, sha256: '0'.repeat(64) };
  global.fetch = async () => ({ ok: true, url: pin.url, body: (async function* () { yield Buffer.from('ABCD'); })() });
  await assert.rejects(verifiedArchive(pin, root), /checksum\/size mismatch/);
  assert.equal(fs.existsSync(path.join(root, 'tool.zip')), false);
  assert.equal(fs.existsSync(path.join(root, 'tool.zip.partial')), false);
  global.fetch = async () => ({ ok: true, url: pin.url, body: (async function* () { yield Buffer.from('TOO-LARGE'); })() });
  await assert.rejects(verifiedArchive(pin, root), /exceeded pinned size/);
  assert.equal(fs.existsSync(path.join(root, 'tool.zip.partial')), false);
});

for (const [pac, expected] of [['PROXY proxy.invalid:8080; DIRECT', 'http://proxy.invalid:8080'], ['https proxy.invalid:443', 'https://proxy.invalid:443'], ['SOCKS5 127.0.0.1:1080', 'socks5://127.0.0.1:1080'], ['DIRECT', null]]) {
  test(`system proxy resolution uses its first supported route: ${pac}`, async () => {
    const tools = new GitHubTools({ env: {}, resolveProxy: async () => pac });
    const result = await tools.configureProxy('https://github.com');
    assert.equal(result.HTTPS_PROXY || null, expected);
    assert.equal(tools.proxyMode, expected ? 'system' : 'default');
  });
}

test('explicit proxy settings take precedence; ALL_PROXY is mapped for Go-based gh as well as Git', async () => {
  const tools = new GitHubTools({ env: { all_proxy: 'socks5://explicit.invalid:1080', NO_PROXY: 'internal.invalid' },
    resolveProxy: async () => { throw new Error('Explicit environment takes precedence'); } });
  const result = await tools.configureProxy('https://api.github.com');
  assert.equal(result.HTTPS_PROXY, 'socks5://explicit.invalid:1080'); assert.equal(tools.proxyMode, 'environment');
  assert.equal(tools.env.NO_PROXY, 'internal.invalid');
});
