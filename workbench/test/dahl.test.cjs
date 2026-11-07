'use strict';
const test = require('node:test'); const assert = require('node:assert/strict'); const { DahlClient, MODELS, ENDPOINT } = require('../src/dahl.cjs');
const { redact } = require('../src/vault.cjs');
const keys = ['dahl_' + 'a'.repeat(30), 'dahl_' + 'b'.repeat(30)];
const ok = (content = 'Hello') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 12 } }), { status: 200 });
function fixture(responses) { const calls = []; const events = []; const vault = { keys: [...keys], clean: (text) => redact(text, keys) }; const client = new DahlClient({ vault, onEvent: (e) => events.push(e), fetch: async (url, options) => { calls.push({ url, ...options, payload: JSON.parse(options.body) }); return responses.shift(); } }); return { client, calls, events }; }
const request = { model: MODELS[0], messages: [{ role: 'user', content: 'Hello' }], signal: new AbortController().signal };

test('client uses user endpoint/model via JSON transport, never a curl/shell command', async () => {
  const f = fixture([ok()]); const result = await f.client.complete(request); assert.equal(result.message.content, 'Hello'); assert.equal(f.calls[0].url, ENDPOINT);
  assert.equal(f.calls[0].payload.model, MODELS[0]); assert.equal(f.calls[0].headers.Authorization, 'Bearer ' + keys[0]); assert.equal(f.calls[0].redirect, 'error');
});
test('explicit exhausted quota rotates to the next owned key and reports only its index', async () => {
  const f = fixture([new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 402 }), ok()]); await f.client.complete(request);
  assert.equal(f.calls.length, 2); assert.notEqual(f.calls[0].headers.Authorization, f.calls[1].headers.Authorization);
  assert.equal(f.client.status().exhausted, 1); assert.doesNotMatch(JSON.stringify(f.events), /dahl_/);
});
for (const status of [401, 403, 429, 500]) test('does not evade auth/plan/rate failures by rotating: HTTP ' + status, async () => {
  const f = fixture([new Response(JSON.stringify({ error: { code: status === 429 ? 'rate_limit_exceeded' : 'forbidden' } }), { status, headers: { 'retry-after': '30' } })]);
  await assert.rejects(f.client.complete(request)); assert.equal(f.calls.length, 1); assert.equal(f.client.status().exhausted, 0);
});
test('all exhausted keys stop after bounded attempts, without infinite retry', async () => {
  const f = fixture(keys.map(() => new Response(JSON.stringify({ error: { code: 'credits_exhausted' } }), { status: 402 })));
  await assert.rejects(f.client.complete(request), /همهٔ کلیدها/); assert.equal(f.calls.length, keys.length);
});
test('unsupported native tool calling falls back to a strict JSON protocol, not guessed commands', async () => {
  const f = fixture([new Response(JSON.stringify({ error: { param: 'tools', message: 'tools unsupported' } }), { status: 400 }), ok('{"tool":"files_list","arguments":{}}')]);
  const result = await f.client.complete({ ...request, tools: [{ type: 'function', function: { name: 'files_list', parameters: { type: 'object' } } }] });
  assert.equal(result.message.tool_calls[0].function.name, 'files_list'); assert.equal(f.calls[1].payload.tools, undefined);
  assert.equal(f.calls[0].headers.Authorization, f.calls[1].headers.Authorization);
});
test('unknown model and an aborted request make no network call', async () => {
  const f = fixture([]); await assert.rejects(f.client.complete({ ...request, model: 'unknown' })); const c = new AbortController(); c.abort(); await assert.rejects(f.client.complete({ ...request, signal: c.signal })); assert.equal(f.calls.length, 0);
});
test('recognized credentials in model text are redacted before UI/history', async () => {
  const f = fixture([ok('Never expose: ' + keys[0])]); assert.doesNotMatch((await f.client.complete(request)).message.content, /dahl_/);
});

test('JSON-tool fallback state never makes subsequent ordinary chat require JSON', async () => {
  const f = fixture([new Response(JSON.stringify({ error: { param: 'tools', message: 'unsupported tools' } }), { status: 400 }), ok('{"answer":"Done"}'), ok('A normal follow-up chat')]);
  await f.client.complete({ ...request, tools: [{ type: 'function', function: { name: 'files_list', parameters: { type: 'object' } } }] });
  assert.equal((await f.client.complete(request)).message.content, 'A normal follow-up chat');
});
test('truncated model output is not mistaken for a complete response/tool command', async () => {
  const f = fixture([new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { role: 'assistant', content: 'partial' } }] }), { status: 200 })]);
  await assert.rejects(f.client.complete(request), /سقف طول/);
});
