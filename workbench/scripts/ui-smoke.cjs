'use strict';
// Browser UI wiring tests. Fixture bridge is TEST ONLY: no key or live account.
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const { chromium } = require('playwright-core'); const { handler } = require('./preview.cjs'); const { chromePath } = require('../src/browser.cjs'); const { createMission } = require('../src/mission.cjs');
async function run() {
  const executablePath = process.env.ORBIT_UI_CHROME || chromePath(); if (!executablePath) throw new Error('Installed Chrome or ORBIT_UI_CHROME is required for UI checks.');
  const server = http.createServer(handler); await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve)); const port = server.address().port; const origin = `http://127.0.0.1:${port}`;
  let browser; const errors = []; const screenshots = path.resolve(__dirname, '../build/ui-check'); fs.mkdirSync(screenshots, { recursive: true });
  try {
    browser = await chromium.launch({ executablePath, headless: true, chromiumSandbox: process.env.ORBIT_UI_TEST_CONTAINER !== '1' });
    const context = await browser.newContext({ viewport: { width: 1540, height: 1040 }, reducedMotion: 'reduce' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message)); await page.goto(origin); await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('#demo-banner').isVisible(), true); assert.equal(await page.locator('#api-keys').isDisabled(), true);
    assert.equal(await page.locator('.metric strong').allTextContents().then((values) => values.every((value) => value === '۰')), true, 'Preview must not invent work/statistics');
    await page.screenshot({ path: path.join(screenshots, 'command-center.png'), animations: 'disabled' });
    await page.locator('.main-nav [data-view="agents"]').click(); assert.equal(await page.locator('[data-page="agents"]').isVisible(), true); assert.equal(await page.locator('.agent-card').count(), 3);
    await page.screenshot({ path: path.join(screenshots, 'agent-team.png'), animations: 'disabled' });
    await page.keyboard.press('Control+k'); assert.equal(await page.locator('#command-palette').isVisible(), true); await page.locator('#command-search').fill('نصب Skill'); await page.keyboard.press('Enter'); assert.equal(await page.locator('#drawer').isVisible(), true); assert.equal(await page.locator('[data-drawer="extensions"]').isVisible(), true); await page.keyboard.press('Escape');
    await page.locator('.main-nav [data-view="home"]').click(); await page.locator('.template-card').first().click(); assert.match(await page.locator('#task').inputValue(), /Arena/); assert.equal(await page.locator('[data-page="mission"]').isVisible(), true);
    await page.locator('#send').click(); assert.equal(await page.locator('#messages .message').count(), 0, 'Website preview must never fabricate execution');
    await page.locator('#toast').waitFor({ state: 'hidden' }); await page.locator('#task').fill('');
    for (const size of [{ width: 980, height: 740 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size); await page.locator('.main-nav [data-view="home"]').click(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Horizontal overflow at ${size.width}`);
      if (size.width === 390) await page.screenshot({ path: path.join(screenshots, 'command-center-mobile.png'), animations: 'disabled' });
    }
    await context.close();
    const native = await browser.newContext({ viewport: { width: 1540, height: 1040 }, reducedMotion: 'reduce' });
    await native.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const fixture = { version: '0.2.0', platform: 'win32', keys: { count: 1, encryption: true }, pool: { active: 1, exhausted: 0 }, project: 'C:\\orbit-ui-fixture', extensions: [], browser: { available: true, running: false }, github: null,
      engine: { status: 'idle', busy: false, id: null, model: 'team', tokens: 0, messages: [], activities: [], history: [], revision: 0, mission: createMission() } };
    await native.addInitScript((initial) => {
      let state = initial; let listener; window.__fixtureActions = [];
      window.__fixturePush = (value) => { state = value; listener?.(state); };
      window.orbit = { getState: async () => state, onState: (callback) => { listener = callback; }, perform: async (action, payload) => {
        window.__fixtureActions.push({ action, payload });
        if (action === 'project-list') return { project: state.project, path: payload.path, entries: [{ kind: 'file', name: 'README.md' }] };
        if (action === 'project-read') return { project: state.project, path: payload.path, text: 'ORBIT_UI_FILE_FIXTURE\n<img src=x onerror="window.__xss=true">' };
        if (action === 'copy-text') return { copied: true };
        if (action === 'stop') { state.engine.busy = false; state.engine.status = 'stopped'; state.engine.mission.phase = 'stopped'; state.engine.revision += 1; }
        return state;
      } };
    }, fixture);
    const p = await native.newPage(); p.on('pageerror', (error) => errors.push(error.message)); await p.goto(origin); await p.evaluate(() => document.fonts.ready);
    assert.equal(await p.locator('#demo-banner').isVisible(), false); assert.equal(await p.locator('#api-keys').isDisabled(), false);
    await p.locator('.main-nav [data-view="workspace"]').click(); await p.locator('.file-item').first().click(); assert.match(await p.locator('#file-content').textContent(), /ORBIT_UI_FILE_FIXTURE/); assert.equal(await p.locator('#file-content img').count(), 0);
    await p.locator('#copy-file').click(); assert.ok((await p.evaluate(() => window.__fixtureActions)).some((call) => call.action === 'copy-text'));
    await p.locator('.main-nav [data-view="agents"]').click(); await p.locator('.agent-card').nth(1).locator('button').click(); assert.equal(await p.locator('#model').inputValue(), 'deepseek-ai/DeepSeek-V4-Flash-0731');
    const snapshot = structuredClone(fixture); snapshot.engine.status = 'running'; snapshot.engine.busy = true; snapshot.engine.revision = 5; snapshot.engine.id = 'ui-fixture'; snapshot.engine.history = [{ id: 'ui-fixture', title: 'UI fixture — not live agent work', status: 'running', project: snapshot.project }];
    snapshot.engine.messages = [{ role: 'assistant', content: '<img src=x onerror="window.__xss=true">', model: 'zai-org/GLM-5.3-Flash' }];
    snapshot.engine.mission.startedAt = Date.now(); snapshot.engine.mission.phase = 'executing'; snapshot.engine.mission.agents[1].status = 'running'; snapshot.engine.mission.agents[1].calls = 1;
    snapshot.engine.mission.plan = [{ id: 'step-0', title: 'Model-reported step, not verification', status: 'done' }];
    snapshot.engine.mission.runs = [{ id: 'fixture-run', name: 'terminal_run', status: 'error', input: '{"command":"fixed fixture"}', output: '{"exitCode":7,"stdout":"UI_FIXTURE_FAILED_TEST"}', startedAt: Date.now(), finishedAt: Date.now() }];
    snapshot.engine.mission.artifacts = [{ path: 'README.md', bytes: 100, at: Date.now(), project: snapshot.project }];
    await p.evaluate((value) => window.__fixturePush(value), snapshot);
    assert.equal(await p.locator('#stop').isEnabled(), true); assert.equal(await p.locator('#send').isDisabled(), true); assert.equal(await p.locator('#messages img').count(), 0); assert.equal(await p.evaluate(() => window.__xss), undefined);
    await p.locator('#activity-toggle').click(); assert.match(await p.locator('#plan-list').textContent(), /Model-reported/); await p.locator('[data-inspector="trace"]').click(); await p.locator('.tool-run summary').click(); assert.match(await p.locator('#tool-runs').textContent(), /UI_FIXTURE_FAILED_TEST/); assert.equal(await p.locator('.tool-run.error').count(), 1);
    await p.locator('#stop').click(); assert.equal(await p.locator('#stop').isVisible(), false); assert.equal(await p.locator('.history-item').first().isEnabled(), true);
    await p.locator('#close-activity').click(); await p.locator('.main-nav [data-view="agents"]').click(); assert.equal(await p.locator('.agent-card button').first().isEnabled(), true, 'Late pending state must not permanently disable agent selection');
    assert.deepEqual(errors, []); console.log('ORBIT_UI_SMOKE_OK desktop/mobile navigation palette templates preview-isolation actual-state-rendering file-read XSS Stop');
    await native.close();
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
}
if (require.main === module) run().catch((error) => { console.error(error.stack); process.exitCode = 1; });
module.exports = { run };
