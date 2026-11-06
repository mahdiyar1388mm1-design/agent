'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { normalizeWindowState, readWindowState, saveWindowState } = require('../src/window-state.cjs');
const display = { width: 1920, height: 1080 };

test('first launch has sensible bounds', () => {
  assert.deepEqual(normalizeWindowState(null, display), { width: 1280, height: 860, maximized: false });
});

test('restored bounds fit the screen, even after changing monitors', () => {
  assert.deepEqual(normalizeWindowState({ width: 4000, height: 4000, maximized: true }, display), {
    width: 1920, height: 1080, maximized: true,
  });
  assert.deepEqual(normalizeWindowState({}, { width: 640, height: 480 }), { width: 640, height: 480, maximized: false });
});

test('malformed dimensions and truthy strings cannot corrupt the window', () => {
  assert.deepEqual(normalizeWindowState({ width: NaN, height: Infinity, maximized: 'true' }, display), {
    width: 1280, height: 860, maximized: false,
  });
  assert.deepEqual(normalizeWindowState({ width: -4, height: 0 }, display), {
    width: 800, height: 540, maximized: false,
  });
});

test('missing or corrupt settings do not prevent startup', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'window-state.json');
  assert.equal(readWindowState(file, display).width, 1280);
  fs.writeFileSync(file, 'this is not json');
  assert.equal(readWindowState(file, display).width, 1280);
});

test('settings round trip without persisting unrelated information', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'profile/window-state.json');
  const value = { width: 1000, height: 700, maximized: true };
  assert.equal(saveWindowState(file, { ...value, token: 'must-not-be-stored', url: 'private' }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), value);
  assert.deepEqual(readWindowState(file, display), value);
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  assert.equal(saveWindowState(file, { width: 1100, height: 750 }), true);
  assert.equal(readWindowState(file, display).width, 1100);
});

test('a failed save is non-fatal', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-settings-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  assert.equal(saveWindowState(directory, { width: 1000, height: 700 }), false);
});
