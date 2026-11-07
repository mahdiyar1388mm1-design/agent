'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { KeyVault, redact } = require('../src/vault.cjs'); const { Workspace } = require('../src/workspace.cjs'); const { Permissions } = require('../src/permissions.cjs'); const { website, publicAddress } = require('../src/browser.cjs'); const { Extensions } = require('../src/extensions.cjs');
function directory(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-test-')); t.after(() => fs.rmSync(p, { recursive: true, force: true, maxRetries: 4 })); return p; }
const fakeKey = (letter) => 'dahl_' + letter.repeat(30);
function storage() { const key = randomBytes(32); return { isEncryptionAvailable: () => true, encryptString: (text) => { const iv = randomBytes(16); const cipher = createCipheriv('aes-256-cbc', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final()]); }, decryptString: (bytes) => { const cipher = createDecipheriv('aes-256-cbc', key, bytes.subarray(0, 16)); return Buffer.concat([cipher.update(bytes.subarray(16)), cipher.final()]).toString(); } }; }

test('keys are encrypted on disk, deduplicated and never returned by state/report', (t) => {
  const root = directory(t); const crypto = storage(); const vault = new KeyVault({ directory: root, storage: crypto }); const key = fakeKey('a');
  vault.save(key + '\n' + key + '\n' + fakeKey('b'), true); assert.equal(vault.status().count, 2);
  assert.doesNotMatch(fs.readFileSync(vault.file).toString(), /dahl_/); assert.doesNotMatch(JSON.stringify(vault.status()), /dahl_/);
  const next = new KeyVault({ directory: root, storage: crypto }); next.load(); assert.equal(next.keys[0], key);
  assert.doesNotMatch(next.clean('secret=' + key), /dahl_/); next.save('', false); assert.equal(fs.existsSync(next.file), false);
});
test('no plaintext persistence fallback when OS encryption is unavailable', (t) => {
  const vault = new KeyVault({ directory: directory(t), storage: { isEncryptionAvailable: () => false } });
  assert.throws(() => vault.save(fakeKey('a'), true), /رمزنگاری/); vault.save(fakeKey('a'), false); assert.equal(vault.status().count, 1); assert.equal(fs.existsSync(vault.file), false);
  assert.throws(() => vault.save('not-a-key', false), /معتبر/);
});
test('redaction covers exact Dahl keys, recognized tokens/private keys and URL userinfo', () => {
  assert.doesNotMatch(redact(fakeKey('x') + ' https://USER:PASSWORD@example.com/ ghp_' + 'f'.repeat(30)), /dahl_|USER|PASSWORD|ghp_/);
});
test('workspace reads/writes real UTF-8 files and keeps writes relative, bounded and free of secret paths', (t) => {
  const root = directory(t); const w = new Workspace(root); w.write('src/hello.txt', 'سلام <script>not code</script>'); assert.equal(w.read('src/hello.txt'), 'سلام <script>not code</script>');
  assert.equal(w.list('src')[0].name, 'hello.txt');
  for (const name of ['../escape', '/absolute', 'C:/private', '.git/config', '.env', 'x/../a', 'node_modules/a', '.ssh/id_rsa']) assert.throws(() => w.resolve(name), /مسیر/);
  assert.throws(() => w.write('big.txt', 'a'.repeat(262145)), /۲۵۶/);
});
test('workspace refuses symlinks/junctions, never follows a selected-project escape', (t) => {
  const root = directory(t); const outside = directory(t); const w = new Workspace(root);
  fs.symlinkSync(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => w.write('escape/not-yours.txt', 'bad'), /پیوند/); assert.equal(fs.existsSync(path.join(outside, 'not-yours.txt')), false);
});
test('one job consent permits ordinary steps, but dangerous commands require native review', async () => {
  const prompts = []; const p = new Permissions({ confirm: async (...args) => { prompts.push(args); return true; } }); const signal = new AbortController().signal;
  await p.begin({ project: 'fixture' }, signal); await p.tool('files_read', { path: 'a' }, signal); await p.tool('terminal_run', { command: 'Get-ChildItem' }, signal);
  assert.equal(prompts.length, 1); await p.tool('terminal_run', { command: 'Remove-Item -Recurse .' }, signal); assert.equal(prompts.length, 2);
  p.revoke(); assert.throws(() => p.check(signal), /مجوز/);
});
test('late consent after Stop cannot grant permissions', async () => {
  let answer; const p = new Permissions({ confirm: () => new Promise((resolve) => { answer = resolve; }) }); const signal = new AbortController().signal;
  const starting = p.begin({ project: null }, signal); p.revoke(); answer(true); await assert.rejects(starting, /لغو/); assert.equal(p.active, null);
});
test('job expiry, 20-step cap and origin grants are checked locally', async () => {
  let now = 0; let asks = 0; const p = new Permissions({ now: () => now, confirm: async () => { asks += 1; return true; } }); const signal = new AbortController().signal;
  await p.begin({ project: 'fixture' }, signal); await p.origin('https://example.com/a', signal); await p.origin('https://example.com/b', signal); assert.equal(asks, 2);
  for (let i = 0; i < 20; i += 1) await p.tool('files_read', {}, signal); await assert.rejects(p.tool('files_read', {}, signal), /۲۰/);
  now = 1800001; assert.throws(() => p.check(signal), /پایان/);
});
for (const url of ['file:///C:/private', 'javascript:alert(1)', 'http://example.com', 'https://localhost', 'https://127.0.0.1:9222', 'https://192.168.1.1', 'https://u:p@example.com/', 'https://metadata.internal']) test('browser rejects unsafe origin ' + url, () => assert.throws(() => website(url)));
test('DNS guard rejects private/loopback/mapped addresses even behind a public hostname', () => {
  for (const ip of ['127.0.0.1', '10.0.0.3', '172.20.0.1', '192.168.1.2', '169.254.169.254', '::1', '::ffff:127.0.0.1', 'fd00::123']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('1.1.1.1'), true); assert.equal(website('https://arena.ai').origin, 'https://arena.ai');
});
test('skills install as text only; MCP manifest needs explicit consent and rejects unknown/env fields', async (t) => {
  const root = directory(t); const ext = new Extensions({ directory: path.join(root, 'installed'), confirm: async () => true });
  const file = path.join(root, 'skill.md'); fs.writeFileSync(file, 'Use tests first.'); await ext.install(file); assert.equal(ext.skills().length, 1); assert.equal(ext.connections.size, 0);
  assert.throws(() => ext.validate({ kind: 'mcp', name: 'Bad', command: 'node', args: [], env: { TOKEN: 'no' } }), /ناشناخته/);
  const id = ext.status()[0].id; await ext.remove(id); assert.equal(ext.status().length, 0);
});
module.exports = { directory, fakeKey };
