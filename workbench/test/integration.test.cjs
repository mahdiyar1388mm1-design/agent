'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { Extensions } = require('../src/extensions.cjs'); const { Permissions } = require('../src/permissions.cjs'); const { ToolRegistry, rows } = require('../src/tools.cjs'); const { AgentBrowser } = require('../src/browser.cjs'); const { redact } = require('../src/vault.cjs');
const flush = () => new Promise((resolve) => setImmediate(resolve));
test('real MCP SDK talks to a real offline stdio process and closes its owned process', { timeout: 30000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-mcp-')); const ext = new Extensions({ directory, confirm: async () => true });
  t.after(async () => { await ext.close(); fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 }); });
  const manifest = path.join(directory, 'manifest.json'); fs.writeFileSync(manifest, JSON.stringify({ kind: 'mcp', name: 'Offline test', command: process.execPath, args: [path.join(__dirname, 'fixtures/mcp-server.cjs')] }));
  const old = process.env.ORBIT_TEST_API_KEY; process.env.ORBIT_TEST_API_KEY = 'synthetic-only';
  t.after(() => { if (old === undefined) delete process.env.ORBIT_TEST_API_KEY; else process.env.ORBIT_TEST_API_KEY = old; });
  await ext.install(manifest); const signal = new AbortController().signal; const tools = await ext.tools(signal); assert.equal(tools.length, 1); assert.match(tools[0].function.name, /^plugin_/);
  const result = await ext.call(tools[0].function.name, { text: 'سلام MCP واقعی' }, signal);
  const output = JSON.parse(JSON.parse(result.content).content[0].text); assert.equal(output.echoed, 'سلام MCP واقعی'); assert.deepEqual(output.credentialEnvironment, []);
  await ext.close(); assert.equal(ext.connections.size, 0); assert.throws(() => process.kill(output.pid, 0));
});
test('terminal tool uses real shared exports, isolated process runner, masked output and evidence result', async () => {
  const permissions = new Permissions({ confirm: async () => true }); const signal = new AbortController().signal; await permissions.begin({ project: 'fixture' }, signal);
  const invocations = []; const runner = { detect: async () => {}, raw: async (...args) => { invocations.push(args); return { code: 0, stdout: 'password=synthetic-secret\nresult', stderr: '' }; } };
  const tools = new ToolRegistry({ platform: 'win32', runner, permissions, confirm: async () => true, clean: redact });
  const result = await tools.call('terminal_run', { command: 'Get-ChildItem' }, { resolve: () => 'C:\\fixture' }, signal);
  assert.equal(result.exitCode, 0); assert.doesNotMatch(result.stdout, /synthetic-secret/); assert.match(invocations[0][0], /powershell.exe$/); assert.ok(invocations[0][1].includes('-NoProfile')); assert.equal(invocations[0][2].cwd, 'C:\\fixture');
  permissions.revoke(); await assert.rejects(tools.call('terminal_run', { command: 'Get-Date' }, { resolve: () => 'C:\\fixture' }, signal), /مجوز/); assert.equal(invocations.length, 1);
});
test('registered native tools reject unknown fields, wrong types and missing required values', () => {
  const tools = new ToolRegistry({ runner: {} }); assert.equal(tools.definitions(true).length, rows.length); assert.ok(!tools.definitions(false).some((t) => t.function.name === 'terminal_run'));
  for (const [name, args] of [['terminal_run', {}], ['files_read', { path: 2 }], ['browser_click', { target: 'Send', bypass: true }], ['arbitrary_exec', {}]]) assert.throws(() => tools.validate(name, args));
});
test('Stop before a pending native consent response finishes immediately and never grants', async () => {
  let answer; const p = new Permissions({ confirm: () => new Promise((resolve) => { answer = resolve; }) }); const begun = p.begin({ project: null }, new AbortController().signal);
  p.revoke(); await assert.rejects(begun, /لغو/); answer(true); await flush(); assert.equal(p.active, null);
});
test('Stop while Chrome is launching closes a late context, never restores ownership', async () => {
  let finish; let closed = 0; const browser = new AgentBrowser({ profile: 'fixture', permissions: {}, executable: 'fixture', launch: () => new Promise((resolve) => { finish = resolve; }) });
  const opening = browser.ensure(); await flush(); assert.ok(finish); await browser.close(); finish({ close: async () => { closed += 1; } }); await assert.rejects(opening, /لغو/); assert.equal(closed, 1); assert.equal(browser.status().running, false);
});
test('packaged shared-module list has a complete local require closure', () => {
  const config = require('../electron-builder.config.cjs'); const names = config.files.find((f) => typeof f === 'object' && f.to === 'src/shared').filter;
  for (const name of names) {
    const source = fs.readFileSync(path.join(__dirname, '../../desktop/src', name), 'utf8');
    for (const match of source.matchAll(/require\(['"]\.\/([^'"]+)['"]\)/g)) assert.ok(names.includes(match[1]), name + ' needs ' + match[1]);
  }
});
