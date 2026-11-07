'use strict';
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict'); const { createHash } = require('node:crypto');
const asar = require('@electron/asar'); const { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses');
const pkg = require('../package.json');
function files(directory, prefix = '') { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(path.join(directory, e.name), path.posix.join(prefix, e.name)) : [path.posix.join(prefix, e.name)]); }
async function hash(file) { const h = createHash('sha256'); for await (const chunk of fs.createReadStream(file)) h.update(chunk); return h.digest('hex'); }
async function verify() {
  const root = path.resolve(__dirname, '..'); const output = path.join(root, 'dist'); const unpacked = path.join(output, 'win-unpacked'); const archive = path.join(unpacked, 'resources/app.asar');
  const exe = path.join(unpacked, 'Orbit Agent.exe'); const pe = fs.readFileSync(exe); assert.equal(pe.toString('ascii', 0, 2), 'MZ'); assert.equal(pe.readUInt16LE(pe.readUInt32LE(0x3c) + 4), 0x8664);
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, pkg.version);
  for (const relative of files(path.join(root, 'src'), 'src')) assert.deepEqual(asar.extractFile(archive, path.normalize(relative)), fs.readFileSync(path.join(root, relative)), 'Stale packed file: ' + relative);
  for (const file of require('../electron-builder.config.cjs').files.find((e) => typeof e === 'object' && e.to === 'src/shared').filter) assert.deepEqual(asar.extractFile(archive, path.normalize('src/shared/' + file)), fs.readFileSync(path.join(root, '../desktop/src', file)));
  const prepared = path.join(root, '../desktop/build/portable-tools/tools'); const target = path.join(unpacked, 'resources/tools');
  assert.deepEqual(files(prepared).sort(), files(target).sort()); for (const file of files(prepared)) assert.equal(await hash(path.join(prepared, file)), await hash(path.join(target, file)), 'Bundled tool mismatch: ' + file);
  const wire = await getCurrentFuseWire(exe);
  for (const [option, value] of [[FuseV1Options.RunAsNode, '0'], [FuseV1Options.EnableCookieEncryption, '1'], [FuseV1Options.EnableNodeOptionsEnvironmentVariable, '0'], [FuseV1Options.EnableNodeCliInspectArguments, '0'], [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, '1'], [FuseV1Options.OnlyLoadAppFromAsar, '1']]) assert.equal(String.fromCharCode(wire[option]), value);
  await require('../../desktop/scripts/check-tools-network.cjs').checkPublicGit(path.join(unpacked, 'resources'));
  const name = `Orbit-Agent-Setup-${pkg.version}-x64.exe`; assert.ok(fs.statSync(path.join(output, name)).size > 1000000);
  const checksum = await hash(path.join(output, name)); fs.writeFileSync(path.join(output, 'SHA256SUMS.txt'), `${checksum}  ${name}\n`);
  fs.writeFileSync(path.join(output, 'README.fa.md'), fs.readFileSync(path.join(root, 'README.md'), 'utf8').replaceAll('../desktop/GITHUB.md', 'GITHUB.md')); fs.copyFileSync(path.join(root, 'THIRD-PARTY.md'), path.join(output, 'THIRD-PARTY.md')); fs.copyFileSync(path.join(root, '../desktop/GITHUB.md'), path.join(output, 'GITHUB.md'));
  console.log('Verified packaged source, bundled tools, PE and security fuses.'); console.log(`::notice title=Orbit installer SHA-256::${checksum}  ${name}`);
}
if (require.main === module) verify().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { verify };
