'use strict';
const fs = require('node:fs');
const path = require('node:path');

function bundledToolPaths(resourcesPath, platform = process.platform) {
  if (platform !== 'win32' || !resourcesPath) return {};
  const result = {};
  for (const [name, relative] of [['git', 'git/cmd/git.exe'], ['gh', 'gh/bin/gh.exe']]) {
    const file = path.join(resourcesPath, 'tools', relative);
    try { if (fs.statSync(file).isFile()) result[name] = fs.realpathSync.native(file); } catch {}
  }
  return result;
}

function prependToolPath(environment, executables, platform = process.platform) {
  if (platform !== 'win32' || !executables.length) return environment;
  const keys = Object.keys(environment).filter((key) => key.toLowerCase() === 'path');
  const previous = keys.map((key) => environment[key]).filter(Boolean).join(';');
  for (const key of keys) delete environment[key];
  environment.PATH = [...new Set(executables.map((file) => path.win32.dirname(file))), previous].filter(Boolean).join(';');
  return environment;
}
module.exports = { bundledToolPaths, prependToolPath };
