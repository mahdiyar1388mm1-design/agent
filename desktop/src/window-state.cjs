'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeWindowState(value, workArea) {
  const data = value && typeof value === 'object' ? value : {};
  const maxWidth = Math.max(1, Math.floor(workArea.width));
  const maxHeight = Math.max(1, Math.floor(workArea.height));
  const dimension = (input, fallback, minimum, maximum) => {
    const size = typeof input === 'number' && Number.isFinite(input) ? Math.round(input) : fallback;
    return Math.min(maximum, Math.max(Math.min(minimum, maximum), size));
  };
  return {
    width: dimension(data.width, 1280, 800, maxWidth),
    height: dimension(data.height, 860, 540, maxHeight),
    maximized: data.maximized === true,
  };
}

function readWindowState(filename, workArea) {
  try {
    return normalizeWindowState(JSON.parse(fs.readFileSync(filename, 'utf8')), workArea);
  } catch {
    return normalizeWindowState(null, workArea);
  }
}

function saveWindowState(filename, state) {
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.tmp`;
    // No URLs, account identifiers, cookies or passwords belong in this file.
    fs.writeFileSync(temporary, JSON.stringify({
      width: state.width,
      height: state.height,
      maximized: state.maximized === true,
    }), { mode: 0o600 });
    fs.renameSync(temporary, filename);
    return true;
  } catch {
    // A read-only profile should not prevent the application from closing.
    return false;
  }
}

module.exports = { normalizeWindowState, readWindowState, saveWindowState };
