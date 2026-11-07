'use strict';
const path = require('node:path');
const fs = require('node:fs');
const names = new Set(['github-tools', 'github-policy', 'github-projects', 'session-permissions', 'terminal-protocol', 'site-adapter']);
module.exports = (name) => {
  if (!names.has(name)) throw new Error('Unknown shared module');
  const root = fs.existsSync(path.join(__dirname, 'shared')) ? path.join(__dirname, 'shared') : path.resolve(__dirname, '../../desktop/src');
  return require(path.join(root, name + '.cjs'));
};
