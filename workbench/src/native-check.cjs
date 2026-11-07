'use strict';
// Explicit CI flag only. No real key, account, Dahl request or live Arena access.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const assert = require('node:assert/strict');
const { AgentEngine } = require('./engine.cjs'); const { Permissions } = require('./permissions.cjs'); const { Workspace } = require('./workspace.cjs'); const { AgentBrowser, chromePath } = require('./browser.cjs'); const { ToolRegistry } = require('./tools.cjs'); const { MODELS } = require('./dahl.cjs');
const { KeyVault } = require('./vault.cjs');
const { safeStorage, clipboard } = require('electron');
const { ProjectView } = require('./project-view.cjs');
const { GitHubTools } = require('./shared.cjs')('github-tools');
async function run({ window, resourcesPath, getState }) {
  const exposed = await window.webContents.executeJavaScript('Promise.all([window.orbit.getState(), Promise.resolve(Object.keys(window.orbit).sort())])');
  assert.deepEqual(exposed[1], ['getState', 'onState', 'perform']); assert.equal(exposed[0].keys.count, 0); assert.equal(exposed[0].engine.busy, false); assert.equal(exposed[0].browser.running, false);
  assert.equal(getState().github.account, null);
  const navigation = await window.webContents.executeJavaScript(`(async () => { await document.fonts.ready; document.querySelector('.main-nav [data-view=agents]').click(); const agents = document.querySelector('[data-page=agents]').hidden === false && document.querySelectorAll('.agent-card').length === 3; document.getElementById('command-open').click(); const palette = !document.getElementById('command-palette').hidden; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.main-nav [data-view=home]').click(); return { agents, palette, font: document.fonts.check('12px Vazirmatn') }; })()`);
  assert.deepEqual(navigation, { agents: true, palette: true, font: true });
  await window.webContents.executeJavaScript(`window.orbit.perform('copy-text', { text: 'ORBIT_NATIVE_CLIPBOARD_FIXTURE' })`); assert.equal(await clipboard.readText(), 'ORBIT_NATIVE_CLIPBOARD_FIXTURE'); clipboard.clear();
  require('@modelcontextprotocol/sdk/client/index.js'); require('playwright-core');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-native-')); const token = 'ghp_' + 'f'.repeat(36);
  const env = { ...process.env, GH_TOKEN: token, GITHUB_TOKEN: token, GH_CONFIG_DIR: path.join(root, 'gh-config'), HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: path.join(root, 'xdg'), HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1' };
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]; env.PATH = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
  const native = new GitHubTools({ resourcesPath, cwd: root, env });
  const permissions = new Permissions({ confirm: async () => true });
  const browser = new AgentBrowser({ profile: path.join(root, 'chrome'), permissions, executable: chromePath(), lookup: async () => [{ address: '1.1.1.1', family: 4 }] });
  const registry = new ToolRegistry({ browser, github: { cancel: async () => {}, dispose: () => {} }, permissions, confirm: async () => true, clean: (text) => text, resourcesPath, runner: native });
  try {
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    const vault = new KeyVault({ directory: path.join(root, 'vault'), storage: safeStorage }); const key = 'dahl_' + 'z'.repeat(30); vault.save(key, true); assert.doesNotMatch(fs.readFileSync(vault.file).toString(), /dahl_/); const loaded = new KeyVault({ directory: path.join(root, 'vault'), storage: safeStorage }); loaded.load(); assert.equal(loaded.keys[0], key); vault.save('', false);
    await native.detect(); assert.deepEqual(native.sources, { git: 'bundled', gh: 'bundled' });
    const credential = await native.git(['credential', 'fill'], root, { input: 'protocol=https\nhost=github.com\n\n', timeoutMs: 30000 }); assert.equal(credential.code, 0, credential.error || credential.stderr); assert.ok(credential.stdout.includes('password=' + token));
    const page = await browser.ensure({ signal: new AbortController().signal });
    await page.route('https://arena.ai/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html><body><main><h1>OFFLINE ARENA FIXTURE</h1></main><aside><div id="responses"></div><form><textarea id="prompt"></textarea><button type="button" aria-label="Send message" disabled>Send</button></form></aside><script>
      const text=document.getElementById('prompt'), button=document.querySelector('button');
      text.addEventListener('input',()=>button.disabled=!text.value); button.addEventListener('click',()=>{text.value='';button.disabled=true;const reply=document.createElement('article');reply.dataset.messageAuthorRole='assistant';reply.textContent='ORBIT_ARENA_FIXTURE_REPLY';document.getElementById('responses').append(reply);});
      </script></body></html>` }));
    let index = 0;
    const calls = [
      { name: 'mission_plan', args: { steps: [{ title: 'Check native tools with offline fixtures', status: 'active' }] } },
      { name: 'files_write', args: { path: 'native.txt', text: 'سلام ORBIT_FILE_OK' } },
      { name: 'terminal_run', args: { command: "git --version; gh --version; Write-Output 'ORBIT_POWERSHELL_OK_سلام'" } },
      { name: 'arena_ask', args: { prompt: 'Offline test request, not sent to live Arena.' } },
    ];
    const results = [];
    const client = { complete: async ({ messages }) => {
      const result = messages.at(-1); if (result.role === 'tool') results.push(JSON.parse(result.content));
      if (index === calls.length) return { message: { role: 'assistant', content: 'Native tool test complete.' } };
      const call = calls[index++]; return { message: { role: 'assistant', content: null, tool_calls: [{ id: 'native_' + index, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } }] } };
    } };
    const extensions = { status: () => [], skills: () => [], tools: async () => [], close: async () => {} };
    const engine = new AgentEngine({ client, tools: registry, permissions, extensions });
    await engine.run({ task: 'Fixed offline native tool checks', mode: 'work', model: MODELS[0] }, new Workspace(root)); await engine.promise;
    assert.equal(engine.snapshot().status, 'completed', JSON.stringify(engine.snapshot().messages));
    assert.equal(fs.readFileSync(path.join(root, 'native.txt'), 'utf8'), 'سلام ORBIT_FILE_OK');
    assert.equal(results[2].exitCode, 0, JSON.stringify(results[2])); assert.match(results[2].stdout, /ORBIT_POWERSHELL_OK_سلام/); assert.match(results[2].stdout, /git version/); assert.match(results[2].stdout, /gh version/);
    assert.equal(results[3].reply, 'ORBIT_ARENA_FIXTURE_REPLY');
    assert.equal(engine.snapshot().mission.runs.length, 4); assert.equal(engine.snapshot().mission.artifacts[0].path, 'native.txt'); assert.equal(engine.snapshot().mission.plan[0].status, 'active');
    const view = new ProjectView({ workspace: () => new Workspace(root) }); assert.match(view.handle('project-read', { path: 'native.txt' }).text, /ORBIT_FILE_OK/);
    console.log('ORBIT_NATIVE_TOOLS_OK files PowerShell bundled-Git-gh Chrome Arena-fixture MCP-import mission-trace DPAPI UI-navigation clipboard project-view');
  } finally { permissions.revoke(); await registry.stop(); registry.dispose(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
}
module.exports = { run };
