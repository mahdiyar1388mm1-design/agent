'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const asar = require('@electron/asar');
const { packedFile, filesBelow } = require('../scripts/check-package.cjs');

test('package verification reads nested renderer assets with native ASAR separators', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-archive-'));
  t.after(() => {
    asar.uncacheAll();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  });
  const source = path.join(directory, 'source');
  fs.mkdirSync(path.join(source, 'src/renderer'), { recursive: true });
  fs.writeFileSync(path.join(source, 'src/renderer/index.html'), '<h1>Arena Desktop</h1>');
  fs.writeFileSync(path.join(source, 'src/main.cjs'), 'module.exports = {};');
  const archive = path.join(directory, 'app.asar');
  await asar.createPackage(source, archive);
  // This three-level POSIX path triggered a Windows-only ASAR 3 lookup bug.
  assert.equal(packedFile(archive, 'src/renderer/index.html').toString(), '<h1>Arena Desktop</h1>');
  assert.equal(packedFile(archive, 'src/main.cjs').toString(), 'module.exports = {};');
  assert.throws(() => packedFile(archive, 'src/renderer/missing.html'), /not found/);
  assert.deepEqual(filesBelow(source).sort(), ['src/main.cjs', 'src/renderer/index.html']);
});
