'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const actions = new Set(['back', 'forward', 'reload', 'home', 'open-browser', 'menu']);

contextBridge.exposeInMainWorld('arenaDesktop', Object.freeze({
  getState: () => ipcRenderer.invoke('arena:state'),
  perform: (action) => {
    if (!actions.has(action)) return Promise.reject(new Error('Unsupported action'));
    return ipcRenderer.invoke('arena:action', action);
  },
  onState: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('arena:state-changed', listener);
    return () => ipcRenderer.removeListener('arena:state-changed', listener);
  },
}));
