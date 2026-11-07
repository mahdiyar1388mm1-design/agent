'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['keys-save', 'keys-reset', 'project-choose', 'project-list', 'project-read', 'project-open', 'copy-text', 'run', 'stop', 'new', 'open-task', 'browser-login', 'browser-close', 'github-check', 'github-login', 'github-device', 'extension-install', 'extension-remove']);
contextBridge.exposeInMainWorld('orbit', Object.freeze({
  getState: () => ipcRenderer.invoke('orbit:state'),
  perform: (action, payload) => { if (!actions.has(action)) return Promise.reject(new Error('Unsupported action')); return ipcRenderer.invoke('orbit:action', action, payload); },
  onState: (callback) => { if (typeof callback !== 'function') throw new TypeError('callback'); const listener = (_event, state) => callback(state); ipcRenderer.on('orbit:update', listener); return () => ipcRenderer.removeListener('orbit:update', listener); },
}));
