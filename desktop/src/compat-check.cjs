'use strict';

// Explicit --arena-self-test only, with a fresh CI profile. This fixture is NOT
// the live Arena service. It never logs in, grants a session, or runs model code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GitHubTools } = require('./github-tools.cjs');
const { PowerShellRunner } = require('./powershell-runner.cjs');
const { adapterScript } = require('./site-adapter.cjs');

function fixtureHtml(kind) {
  const composer = kind === 'rich' ? '<div id="composer" contenteditable="true"></div>' : '<textarea id="composer"></textarea>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Offline compatibility fixture</title></head><body>
    <main><p>A main region that does not contain the composer.</p><div class="monaco-editor"><textarea aria-label="Editor"></textarea></div></main>
    <aside aria-label="Agent chat"><section><div id="messages"></div><div class="composer-wrapper">${composer}<div><button id="send" aria-label="Send prompt (Enter)" disabled>Send</button></div></div></section></aside>
    <script nonce="arena-self-test">
      const composer = document.getElementById('composer'); const send = document.getElementById('send');
      const read = () => composer.tagName === 'TEXTAREA' ? composer.value : composer.innerText;
      window.fixtureMessages = []; window.fixtureInputs = 0;
      composer.addEventListener('input', () => { window.fixtureInputs += 1; send.disabled = !read().trim(); });
      send.addEventListener('click', () => { const message = read(); send.disabled = true; setTimeout(() => {
        window.fixtureMessages.push(message);
        if (composer.tagName === 'TEXTAREA') composer.value = ''; else composer.replaceChildren();
        document.getElementById('messages').textContent = 'Message accepted by OFFLINE fixture';
      }, 60); });
    </script></body></html>`;
}

function installFixture(profile) {
  return profile.protocol.handle('https', (request) => {
    const url = new URL(request.url);
    const kind = url.pathname.split('/').at(-1);
    if (url.hostname !== 'arena.ai' || !url.pathname.startsWith('/__arena_desktop_self_test__/') || !['textarea', 'rich'].includes(kind)) {
      return new Response('', { status: 404 });
    }
    return new Response(fixtureHtml(kind), { headers: { 'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'nonce-arena-self-test'; style-src 'none'" } });
  });
}

async function checkComposer(contents) {
  for (const kind of ['textarea', 'rich']) {
    await contents.loadURL(`https://arena.ai/__arena_desktop_self_test__/${kind}`);
    const call = (action, text) => contents.executeJavaScriptInIsolatedWorld(1101, [{ code: adapterScript(action, text) }]);
    const diagnostic = await call('diagnostics');
    assert.equal(diagnostic.diagnostic, 'ready', JSON.stringify(diagnostic));
    assert.equal(diagnostic.composerCount, 1); // Ignore Monaco, find sidebar outside main.
    const message = 'سلام / offline test\nLiteral <img src=x onerror=bad()>\nSecond line';
    assert.equal((await call('prepare', message)).ok, true, `${kind} native editor preparation`);
    assert.equal(await contents.executeJavaScript('document.getElementById("composer").querySelector("img") === null'), true);
    const clicked = await call('send', message); assert.equal(clicked.ok, true);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if ((await call('confirm-send', message)).ok) break;
      if (attempt === 19) throw new Error(`${kind} did not consume the submitted message`);
    }
    const result = await contents.executeJavaScript('({ count: window.fixtureMessages.length, inputs: window.fixtureInputs })');
    assert.equal(result.count, 1); assert.ok(result.inputs > 0);
    console.log(`ARENA_DESKTOP_COMPOSER_SELF_TEST_OK ${kind}`);
  }
}

async function checkTools(resourcesPath) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-bundled-tools-'));
  const token = 'ghp_' + 'f'.repeat(36); // FAKE: never a real credential.
  const tools = new GitHubTools({ resourcesPath, cwd: root, env: { ...process.env,
    GH_CONFIG_DIR: path.join(root, 'config'), GH_TOKEN: token, GITHUB_TOKEN: token,
    HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1', ALL_PROXY: 'http://127.0.0.1:1', NO_PROXY: '' } });
  // Do not let CI's installed Git/gh/sh or global Git config mask a missing
  // bundled dependency. Only Windows system tools remain in the base PATH.
  for (const key of Object.keys(tools.env)) if (key.toLowerCase() === 'path') delete tools.env[key];
  tools.env.PATH = path.win32.join(tools.env.SystemRoot || 'C:\\Windows', 'System32');
  tools.env.HOME = root; tools.env.USERPROFILE = root; tools.env.XDG_CONFIG_HOME = path.join(root, 'xdg');
  try {
    const found = await tools.detect();
    assert.ok(found.git && found.gh); assert.equal(tools.sources.git, 'bundled'); assert.equal(tools.sources.gh, 'bundled');
    const git = await tools.git(['--version'], root); assert.equal(git.code, 0, git.error || git.stderr);
    const gh = await tools.gh(['--version']); assert.equal(gh.code, 0, gh.error || gh.stderr);
    const result = await tools.git(['credential', 'fill'], root, { timeoutMs: 30000, input: 'protocol=https\nhost=github.com\n\n' });
    assert.equal(result.code, 0, result.error || result.stderr); assert.ok(result.stdout.includes(`password=${token}`));
    const env = { ...tools.env };
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
    env.PATH = path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32');
    const runner = new PowerShellRunner({ resourcesPath, env, timeoutMs: 15000 });
    const command = await runner.run('git --version; gh --version; exit $LASTEXITCODE', root);
    assert.equal(command.exitCode, 0, command.error || command.stderr);
    assert.match(command.stdout, /^git version /m); assert.match(command.stdout, /^gh version /m);
    // Fixed benign commands only; no model, API call, real token, login or global credential setup.
    console.log('ARENA_DESKTOP_BUNDLED_TOOLS_SELF_TEST_OK');
  } finally {
    await tools.stop(); tools.dispose(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

module.exports = { installFixture, checkComposer, checkTools };
