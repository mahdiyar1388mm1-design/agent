'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['back', 'forward', 'reload', 'home', 'open-browser', 'menu', 'terminal', 'github', 'diagnostics']);

const terminalActions = new Set(['choose-folder', 'start', 'approve', 'reject', 'share', 'disable']);

const githubActions = new Set(['check', 'login', 'repositories', 'choose-parent', 'clone', 'choose-project', 'branches', 'select-branch', 'sync', 'watch', 'stop-watch', 'prepare-publish', 'publish', 'handoff', 'cancel', 'install-git', 'install-gh', 'open-device', 'open-repo']);

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
  getGitHubState: () => ipcRenderer.invoke('arena:github-state'),
  github: (action, payload) => {
    if (!githubActions.has(action)) return Promise.reject(new Error('Unsupported GitHub action'));
    return ipcRenderer.invoke('arena:github', action, payload);
  },
  onGitHubState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('arena:github-state-changed', listener);
    return () => ipcRenderer.removeListener('arena:github-state-changed', listener);
  },
  onState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('arena:state-changed', listener);
    return () => ipcRenderer.removeListener('arena:state-changed', listener);
  },
}));
