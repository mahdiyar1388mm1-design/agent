'use strict';

// Structural/package verification; this is not a substitute for running on Windows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const asar = require('@electron/asar');
const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const config = require('../electron-builder.config.cjs');
const pkg = require('../package.json');

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

function packedFile(archive, relative) {
  // ASAR 3 traverses nested directories using path.sep. A forward-slash path
  // must be normalized on Windows, even though fs APIs accept both forms.
  return asar.extractFile(archive, path.normalize(relative));
}

function filesBelow(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory() ? filesBelow(path.join(directory, entry.name), relative) : [relative];
  });
}

async function verify() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'dist');
  const executable = path.join(output, 'win-unpacked', 'Arena Desktop.exe');
  const archive = path.join(output, 'win-unpacked', 'resources', 'app.asar');
  const buffer = fs.readFileSync(executable);
  assert.equal(buffer.toString('ascii', 0, 2), 'MZ', 'Missing Windows executable header');
  const peOffset = buffer.readUInt32LE(0x3c);
  assert.equal(buffer.readUInt32LE(peOffset), 0x4550, 'Invalid PE signature');
  assert.equal(buffer.readUInt16LE(peOffset + 4), 0x8664, 'Expected an x64 executable');

  const ResEdit = await import('resedit');
  const pe = ResEdit.NtExecutable.from(buffer, { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(pe);
  const [version] = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  assert.ok(version, 'Missing application version resources');
  const translations = version.getAllLanguagesForStringValues();
  assert.ok(translations.some((language) => version.getStringValues(language).ProductName === 'Arena Desktop'));
  assert.ok(ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries).length > 0, 'Missing application icon');

  const packed = JSON.parse(packedFile(archive, 'package.json').toString('utf8'));
  assert.equal(packed.version, pkg.version);
  assert.equal(packed.main, 'src/main.cjs');
  for (const relative of [
    ...filesBelow(path.join(root, 'src'), 'src'),
    'assets/icon.svg', 'assets/icon.png', 'assets/icon.ico', 'README.md',
  ]) {
    assert.deepEqual(packedFile(archive, relative), fs.readFileSync(path.join(root, relative)), `Stale or missing packed file: ${relative}`);
  }
  const integrityResource = resources.entries.find((entry) => entry.type === 'INTEGRITY' && entry.id === 'ELECTRONASAR');
  assert.ok(integrityResource, 'Missing embedded ASAR integrity resource');
  const integrity = JSON.parse(Buffer.from(integrityResource.bin).toString('utf8'));
  const entry = integrity.find((item) => item.file.toLowerCase() === 'resources\\app.asar');
  assert.ok(entry, 'Missing integrity record for app.asar');
  assert.equal(entry.alg, 'SHA256');
  assert.equal(entry.value, createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex'));

  const wire = await getCurrentFuseWire(executable);
  for (const [key, option] of [
    ['runAsNode', FuseV1Options.RunAsNode],
    ['enableCookieEncryption', FuseV1Options.EnableCookieEncryption],
    ['enableNodeOptionsEnvironmentVariable', FuseV1Options.EnableNodeOptionsEnvironmentVariable],
    ['enableNodeCliInspectArguments', FuseV1Options.EnableNodeCliInspectArguments],
    ['enableEmbeddedAsarIntegrityValidation', FuseV1Options.EnableEmbeddedAsarIntegrityValidation],
    ['onlyLoadAppFromAsar', FuseV1Options.OnlyLoadAppFromAsar],
  ]) {
    // Fuse wire uses ASCII '0' / '1', not JavaScript booleans.
    assert.equal(String.fromCharCode(wire[option]), config.electronFuses[key] ? '1' : '0', `Unexpected fuse: ${key}`);
  }
  console.log('Verified x64 PE resources, current source/assets, ASAR integrity and six security fuses.');

  if (process.argv.includes('--installer')) {
    const name = `Arena-Desktop-Setup-${pkg.version}-x64.exe`;
    const filename = path.join(output, name);
    assert.ok(fs.statSync(filename).size > 1_000_000, 'Installer is unexpectedly small');
    const checksum = await sha256(filename);
    fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${checksum}  ${name}\n`);
    fs.copyFileSync(path.join(root, 'README.md'), path.join(output, 'README.fa.md'));
    console.log(`SHA256 ${checksum}  ${name}`);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.log(`::notice title=Installer SHA-256::${checksum}  ${name}`);
    }
  }
}

if (require.main === module) {
  verify().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { packedFile, filesBelow };
