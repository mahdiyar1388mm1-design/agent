'use strict';
// Build/CI only. Read-only PUBLIC Git metadata with credential helpers disabled.
// This checks the packaged Windows TLS transport, not a user's OAuth/private repo.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { GitHubTools } = require('../src/github-tools.cjs');

async function checkPublicGit(resourcesPath) {
  if (process.platform !== 'win32') return;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-public-git-check-'));
  const tools = new GitHubTools({ resourcesPath, cwd: root, env: { ...process.env,
    GH_CONFIG_DIR: path.join(root, 'empty-config'), GH_TOKEN: '', GITHUB_TOKEN: '', GH_ENTERPRISE_TOKEN: '', GITHUB_ENTERPRISE_TOKEN: '' } });
  try {
    await tools.detect(); assert.equal(tools.sources.git, 'bundled');
    let result;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      result = await tools.git(['-c', 'credential.helper=', '-c', 'credential.https://github.com.helper=',
        '-c', 'http.extraHeader=', '-c', 'http.https://github.com.extraHeader=',
        'ls-remote', '--symref', '--', 'https://github.com/cli/cli.git', 'HEAD'], root, { timeoutMs: 45000, maxBytes: 65536 });
      if (result.code === 0 && !result.error) break;
    }
    assert.equal(result.code, 0, result.error || result.stderr);
    assert.match(result.stdout, /^[a-f0-9]{40,64}\tHEAD\r?$/m);
    console.log('Verified actual bundled Git HTTPS transport against PUBLIC GitHub metadata without credentials.');
  } finally { await tools.stop(); tools.dispose(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 }); }
}
module.exports = { checkPublicGit };
