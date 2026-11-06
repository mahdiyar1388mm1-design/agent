'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8'), {
    runScripts: 'outside-only', url: 'file:///app/src/renderer/index.html',
  });
  t.after(() => dom.window.close());
  let receive; const calls = []; const pending = [];
  const initial = { revision: 0, status: 'idle', busy: false, dependencies: { git: '/git', gh: '/gh' }, account: { login: 'fixture' },
    repositories: [], parent: '', project: null, preview: null, watching: false, watchExpiresAt: null, deviceCode: null, message: 'Ready' };
  dom.window.arenaDesktop = { getGitHubState: async () => initial, onGitHubState: (callback) => { receive = callback; return () => {}; },
    github: (action, payload) => { calls.push({ action, payload }); return new Promise((resolve) => pending.push(resolve)); }, perform: async () => {} };
  dom.window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/github.js'), 'utf8')); await flush();
  return { dom, calls, byId: (id) => dom.window.document.getElementById(id),
    button: (action) => dom.window.document.querySelector(`[data-github="${action}"]`),
    update: (patch) => receive({ ...initial, ...patch }), finish: (value) => pending.shift()(value), initial };
}

const project = { folder: 'C:\\projects\\fixture', repo: { url: 'https://github.com/owner/project', fullName: 'owner/project' },
  branch: 'main', head: 'a'.repeat(40), isGit: true, dirty: false };

test('GitHub renderer renders repository names, file paths and errors as text only', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, project: { ...project, folder: '<img src=x onerror=bad()>' }, repositories: [{ fullName: '<svg onload=bad()>', isPrivate: true }],
    preview: { repository: '<img src=x>', branch: 'main', files: ['<script>bad()</script>'], bytes: 12, isPrivate: true }, message: '<img src=x>' });
  assert.equal(ui.byId('github-project').querySelector('img'), null);
  assert.equal(ui.byId('github-preview-files').querySelector('script'), null);
  assert.match(ui.byId('github-project').textContent, /<img/);
  assert.equal(ui.byId('github-repositories').querySelectorAll('svg').length, 0);
});

test('clone payload includes only repository/branch, never arbitrary local paths or credentials', async (t) => {
  const ui = await fixture(t); ui.update({ revision: 1, parent: 'C:\\projects' });
  ui.byId('github-repository').value = 'owner/project'; ui.byId('github-branch').value = 'arena/work';
  ui.button('clone').click();
  assert.equal(ui.calls[0].action, 'clone');
  assert.deepEqual(Object.keys(ui.calls[0].payload).sort(), ['branch', 'repository']);
  assert.equal(ui.calls[0].payload.repository, 'owner/project');
  assert.equal(ui.byId('github-repository').disabled, true);
  ui.finish({ ...ui.initial, revision: 2 }); await flush();
});

test('Stop and device verification remain available during a pending login operation', async (t) => {
  const ui = await fixture(t); ui.button('login').click();
  ui.update({ revision: 1, busy: true, deviceCode: 'ABCD-1234' });
  assert.equal(ui.button('cancel').disabled, false);
  assert.equal(ui.button('open-device').disabled, false);
  assert.equal(ui.byId('github-device-code').value, 'ABCD-1234');
  ui.button('cancel').click(); assert.equal(ui.calls[1].action, 'cancel');
  ui.finish({ ...ui.initial, revision: 2 }); ui.finish({ ...ui.initial, revision: 3 }); await flush();
  assert.equal(ui.byId('github-device').hidden, true);
});

test('project task edits survive status packets and revoked watch cannot be restored by a stale response', async (t) => {
  const ui = await fixture(t);
  const active = { revision: 2, project, watching: true, watchExpiresAt: Date.now() + 60000 };
  ui.update(active); ui.byId('github-task').value = 'My current task';
  ui.update({ ...active, revision: 3 }); assert.equal(ui.byId('github-task').value, 'My current task');
  ui.update({ revision: 4, project, watching: false }); ui.update(active);
  assert.match(ui.byId('github-watch').textContent, /خاموش/);
  assert.equal(ui.button('stop-watch').disabled, true);
  ui.button('handoff').click();
  assert.equal(ui.calls[0].payload.task, 'My current task');
  ui.finish({ ...ui.initial, revision: 5, project }); await flush();
});

test('anonymous public clone and branch listing stay available without enabling authenticated publication', async (t) => {
  const ui = await fixture(t);
  ui.update({ revision: 1, checked: true, account: null, parent: 'C:\\downloads', project, toolSources: { git: 'bundled', gh: 'bundled' } });
  assert.equal(ui.button('clone').disabled, false); assert.equal(ui.button('branches').disabled, false);
  assert.equal(ui.button('prepare-publish').disabled, true); assert.equal(ui.button('repositories').disabled, true);
  assert.match(ui.byId('github-dependencies').textContent, /همراه برنامه/);
});
