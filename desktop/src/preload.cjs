'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['back', 'forward', 'reload', 'home', 'open-browser', 'menu', 'terminal']);

const terminalActions = new Set(['choose-folder', 'start', 'approve', 'reject', 'share', 'disable']);

contextBridge.exposeInMainWorld('arenaDesktop', Object.freeze({
  getState: () => ipcRenderer.invoke('arena:state'),
  perform: (action) => {
    if (!actions.has(action)) return Promise.reject(new Error('Unsupported action'));
    return ipcRenderer.invoke('arena:action', action);
  },
  getTerminalState: () => ipcRenderer.invoke('arena:terminal-state'),
  terminal: (action, payload) => {
    if (!terminalActions.has(action)) return Promise.reject(new Error('Unsupported terminal action'));
    return ipcRenderer.invoke('arena:terminal', action, payload);
  },
  onTerminalState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('arena:terminal-state-changed', listener);
    return () => ipcRenderer.removeListener('arena:terminal-state-changed', listener);
  },
  onState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('arena:state-changed', listener);
    return () => ipcRenderer.removeListener('arena:state-changed', listener);
  },
}));
