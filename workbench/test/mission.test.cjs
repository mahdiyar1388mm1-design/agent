'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http');
const { createMission, updatePlan, startRun, finishRun, AGENTS } = require('../src/mission.cjs'); const { ProjectView } = require('../src/project-view.cjs'); const { Workspace } = require('../src/workspace.cjs'); const { redact } = require('../src/vault.cjs');
const { handler } = require('../scripts/preview.cjs');
test('mission plan is bounded model-reported data, never generated proof or an artifact', () => {
  const mission = createMission(); assert.equal(mission.agents.length, 3); assert.deepEqual(mission.agents.map((agent) => agent.calls), [0, 0, 0]);
  const result = updatePlan(mission, { steps: [{ title: 'Run tests', status: 'done' }] }); assert.match(result.evidence, /not verification/); assert.equal(mission.artifacts.length, 0); assert.equal(mission.runs.length, 0);
  for (const args of [{ steps: [] }, { steps: Array(9).fill({ title: 'x', status: 'pending' }) }, { steps: [{ title: 'x', status: 'verified' }] }, { steps: [{ title: 'x', status: 'active' }, { title: 'y', status: 'active' }] }, { steps: [{ title: 'x', status: 'done', grant: true }] }]) assert.throws(() => updatePlan(mission, args));
});
test('only confirmed file-write results create artifacts; errors/blocked output stay separate', () => {
  const mission = createMission(); const key = 'dahl_' + 'x'.repeat(30);
  const run = startRun(mission, 'files_write', { path: 'a.txt', text: key }, redact); assert.doesNotMatch(run.input, /dahl_/);
  finishRun(mission, run, { written: 'a.txt', bytes: 30 }, '{"written":"a.txt"}', '/fixture'); assert.equal(mission.artifacts[0].path, 'a.txt'); assert.equal(run.status, 'returned'); assert.equal(mission.currentTool, null);
  const error = startRun(mission, 'terminal_run', {}, redact); finishRun(mission, error, { exitCode: 1 }, 'failed', '/fixture'); assert.equal(error.status, 'error'); assert.equal(mission.artifacts.length, 1);
  const blocked = startRun(mission, 'browser_read', {}, redact); finishRun(mission, blocked, { actionRequired: 'Sign in manually' }, 'blocked', '/fixture'); assert.equal(blocked.status, 'blocked');
});
test('user-initiated project reads are real, relative, masked and independent of inference', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-project-view-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new Workspace(root); workspace.write('hello.txt', 'Hello\npassword=synthetic-only');
  const view = new ProjectView({ workspace: () => workspace, clean: redact }); assert.equal(view.handle('project-list', { path: '.' }).entries[0].name, 'hello.txt');
  assert.doesNotMatch(view.handle('project-read', { path: 'hello.txt' }).text, /synthetic-only/);
  for (const payload of [{ path: '../secret' }, { path: '.env' }, { path: '.git/config' }, { path: 'hello.txt', shell: true }, { path: 1 }]) assert.throws(() => view.handle('project-read', payload));
  assert.throws(() => view.handle('exec', { path: 'hello.txt' }));
});
test('UI preview serves only the UI and local assets, never source modules/projects/credentials', async (t) => {
  const server = http.createServer(handler); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  for (const resource of ['/', '/app.js', '/app.css', '/assets/fonts/vazirmatn-arabic-wght-normal.woff2']) assert.equal((await fetch(url + resource)).status, 200);
  for (const resource of ['/src/vault.cjs', '/package.json', '/.git/config', '/node_modules/playwright-core/package.json', '/assets/../src/main.cjs']) assert.equal((await fetch(url + resource)).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
});
