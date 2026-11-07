'use strict';
const fs = require('node:fs'); const path = require('node:path'); const { spawnSync } = require('node:child_process');
function scan(directory) { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, item.name); if (item.isDirectory()) scan(file); else if (/\.(js|cjs)$/.test(item.name)) { const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); } } }
scan(path.join(__dirname, '../src')); scan(__dirname); scan(path.join(__dirname, '../test'));
require('../electron-builder.config.cjs'); console.log('Orbit main/preload/renderer/build syntax checks passed.');
