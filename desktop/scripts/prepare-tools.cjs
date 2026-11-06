'use strict';

// Build-time only. Pinned public archives; never copy the build machine's tools,
// Git config, home directory or authentication into the application.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { finished } = require('node:stream/promises');
const pins = require('../assets/portable-tools.json');
const { filesBelow } = require('./check-package.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'build/portable-tools/tools');

async function digest(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function verifiedArchive(pin, directory) {
  const filename = path.join(directory, path.posix.basename(new URL(pin.url).pathname));
  if (fs.existsSync(filename) && fs.statSync(filename).size === pin.bytes && await digest(filename) === pin.sha256) return filename;
  const partial = filename + '.partial';
  const response = await fetch(pin.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Official tool download failed: HTTP ${response.status}`);
  const url = new URL(response.url);
  if (url.protocol !== 'https:' || !(url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com'))) throw new Error('Unexpected official download redirect');
  const stream = fs.createWriteStream(partial, { flags: 'w' });
  const hash = createHash('sha256');
  let bytes = 0;
  // Register the error handler before streaming, including during body failures.
  const completed = finished(stream); completed.catch(() => {});
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > pin.bytes) throw new Error('Official archive exceeded pinned size');
      hash.update(chunk);
      if (!stream.write(chunk)) await once(stream, 'drain');
    }
    stream.end(); await completed;
    if (bytes !== pin.bytes || hash.digest('hex') !== pin.sha256) throw new Error('Official tool archive checksum/size mismatch');
    await fsp.rename(partial, filename);
  } catch (error) {
    stream.destroy(); await completed.catch(() => {}); await fsp.rm(partial, { force: true }); throw error;
  }
  return filename;
}

async function prepare() {
  const { extract } = await import('@electron-internal/extract-zip');
  const downloads = path.join(root, 'build/tool-downloads');
  await fsp.mkdir(downloads, { recursive: true });
  await fsp.rm(output, { recursive: true, force: true });
  await fsp.mkdir(output, { recursive: true });
  const manifest = { schema: 1, tools: {} };
  for (const [name, pin] of Object.entries(pins)) {
    if (!/^https:\/\/github\.com\/[\w-]+\/[\w-]+\/releases\/download\//.test(pin.url)
      || !/^[a-f0-9]{64}$/.test(pin.sha256) || !Number.isSafeInteger(pin.bytes)) throw new Error('Invalid pinned tool definition');
    console.log(`Preparing official ${name} ${pin.version} (${pin.bytes} bytes; pinned SHA-256).`);
    const archive = await verifiedArchive(pin, downloads);
    const unpacked = path.join(downloads, `unpacked-${name}`);
    await fsp.rm(unpacked, { recursive: true, force: true });
    await fsp.mkdir(unpacked, { recursive: true });
    await extract(archive, { dir: unpacked });
    const candidates = filesBelow(unpacked).filter((file) => file === pin.executable || file.endsWith('/' + pin.executable));
    if (candidates.length !== 1) throw new Error(`Official ${name} archive has an unexpected executable layout`);
    const prefix = candidates[0].slice(0, -pin.executable.length);
    const base = path.join(unpacked, prefix);
    const destination = path.join(output, name);
    await fsp.rm(destination, { recursive: true, force: true });
    await fsp.cp(base, destination, { recursive: true });
    // Retain outer archive notices if an upstream ZIP has a wrapper directory.
    if (prefix) {
      for (const item of fs.readdirSync(unpacked, { withFileTypes: true })) {
        if (item.isFile()) await fsp.copyFile(path.join(unpacked, item.name), path.join(destination, item.name));
      }
    }
    const files = filesBelow(destination).sort();
    if (!files.some((file) => /(?:license|copying)/i.test(file))) throw new Error(`${name} license notices are missing`);
    const hashes = {};
    for (const file of files) hashes[file] = await digest(path.join(destination, file));
    manifest.tools[name] = { version: pin.version, archiveSha256: pin.sha256, executable: `${name}/${pin.executable}`, files: hashes };
    await fsp.rm(unpacked, { recursive: true, force: true });
  }
  await fsp.copyFile(path.join(root, 'THIRD-PARTY.md'), path.join(output, 'THIRD-PARTY.md'));
  await fsp.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Portable tools prepared. Only verified official archive contents and notices will be bundled.');
}

if (require.main === module) prepare().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { digest, verifiedArchive };
