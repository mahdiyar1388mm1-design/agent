'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function loadBridge() {
  const ipc = new EventEmitter();
  const calls = [];
  ipc.invoke = async (...args) => { calls.push(args); return { ready: true }; };
  let bridge;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8'), {
    require: (name) => {
      assert.equal(name, 'electron');
      return { ipcRenderer: ipc, contextBridge: {
        exposeInMainWorld: (key, value) => { assert.equal(key, 'arenaDesktop'); bridge = value; },
      } };
    },
  });
  return { bridge, calls, ipc };
}

test('preload exposes only a frozen, narrowly scoped API', () => {
  const { bridge } = loadBridge();
  assert.deepEqual(Object.keys(bridge).sort(), ['getState', 'onState', 'perform']);
  assert.equal(Object.isFrozen(bridge), true);
  assert.equal(bridge.send, undefined);
  assert.equal(bridge.invoke, undefined);
  assert.equal(bridge.require, undefined);
});

test('only explicit toolbar actions are forwarded to the main process', async () => {
  const { bridge, calls } = loadBridge();
  await bridge.getState();
  await bridge.perform('home');
  assert.deepEqual(calls, [['arena:state'], ['arena:action', 'home']]);
  for (const action of ['exec', '__proto__', 'https://example.com', null, {}]) {
    await assert.rejects(bridge.perform(action), /Unsupported action/);
  }
  assert.equal(calls.length, 2);
});

test('state subscriptions strip IPC events and support cleanup', () => {
  const { bridge, ipc } = loadBridge();
  const results = [];
  const unsubscribe = bridge.onState((...args) => results.push(args));
  const state = { origin: 'arena.ai', ready: true };
  ipc.emit('arena:state-changed', { sender: 'must-not-leak' }, state);
  assert.deepEqual(results, [[state]]);
  unsubscribe();
  ipc.emit('arena:state-changed', {}, {});
  assert.equal(results.length, 1);
  assert.equal(ipc.listenerCount('arena:state-changed'), 0);
  assert.throws(() => bridge.onState(null), /callback/);
});
