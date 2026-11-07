'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { AgentEngine } = require('../src/engine.cjs'); const { Permissions } = require('../src/permissions.cjs'); const { MODELS } = require('../src/dahl.cjs');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const call = (name, args, id = 'tool1') => ({ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } });
function fixture(responses, overrides = {}) {
  const invoked = []; const models = []; let prompts = 0;
  const permissions = new Permissions({ confirm: async () => { prompts += 1; return true; } });
  const tools = { definitions: () => ['files_list', 'terminal_run', 'arena_ask'].map((name) => ({ type: 'function', function: { name, parameters: { type: 'object' } } })),
    call: async (name, args) => { invoked.push({ name, args }); return { actual: true }; }, stop: async () => {} };
  const client = { complete: async ({ model, ...request }) => { models.push(model); return typeof responses === 'function' ? responses(request) : responses.shift(); } };
  const extensions = { status: () => [], skills: () => [], tools: async () => [], close: async () => {} };
  const engine = new AgentEngine({ client, tools, permissions, extensions, ...overrides });
  return { engine, invoked, models, tools, permissions, prompts: () => prompts };
}
const task = { task: 'Inspect project using Arena and local tools', mode: 'work', model: MODELS[0] };
const workspace = { root: null };

test('orchestrator actually calls Arena/local tools sequentially after ONE normal job consent', async () => {
  const f = fixture([call('arena_ask', { prompt: 'Review this design' }), call('files_list', {}, 'tool2'), { message: { role: 'assistant', content: 'Verified result' } }]);
  await f.engine.run(task, workspace); await f.engine.promise;
  assert.deepEqual(f.invoked.map((x) => x.name), ['arena_ask', 'files_list']); assert.equal(f.prompts(), 1);
  assert.equal(f.engine.snapshot().status, 'completed'); assert.equal(f.permissions.active, null);
});
test('auto team uses real separate planner, worker and reviewer model calls', async () => {
  const f = fixture([call('files_list', {}), { message: { role: 'assistant', content: 'Done from evidence' } }, { message: { role: 'assistant', content: 'Review: tests remain' } }]);
  await f.engine.run({ ...task, model: 'team' }, workspace); await f.engine.promise;
  assert.deepEqual(f.models, MODELS); assert.match(f.engine.snapshot().messages.at(-1).content, /Review/);
});
test('unregistered tool and malformed JSON never become a shell action', async () => {
  const f = fixture([call('exec_everything', { command: 'bad' })]); await f.engine.run(task, workspace); await f.engine.promise;
  assert.equal(f.invoked.length, 0); assert.equal(f.engine.snapshot().status, 'error');
});
test('chat mode never grants tools, even if the model fabricates a tool call', async () => {
  const f = fixture([call('terminal_run', { command: 'Get-Date' })]); await f.engine.run({ ...task, mode: 'chat' }, workspace); await f.engine.promise;
  assert.equal(f.invoked.length, 0); assert.equal(f.prompts(), 0); assert.equal(f.engine.snapshot().status, 'error');
});
test('Stop aborts an in-flight inference and never restores a late session', async () => {
  const f = fixture(({ signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  await f.engine.run(task, workspace); await flush(); await f.engine.stop();
  assert.equal(f.engine.snapshot().status, 'stopped'); assert.equal(f.engine.snapshot().busy, false); assert.equal(f.invoked.length, 0); assert.equal(f.permissions.active, null);
});
test('a second job cannot overlap the first or clear its immutable request', async () => {
  let resolve; const f = fixture(() => new Promise((done) => { resolve = done; })); await f.engine.run(task, workspace); await flush();
  await assert.rejects(f.engine.run(task, workspace), /قبلی/); assert.throws(() => f.engine.clear(), /متوقف/);
  resolve({ message: { role: 'assistant', content: 'Finished' } }); await f.engine.promise;
});

test('tool-budget exhaustion terminates the job immediately; no 21st execution or further inference', async () => {
  let number = 0; const f = fixture(() => call('files_list', {}, 'tool_' + ++number));
  await f.engine.run(task, workspace); await f.engine.promise;
  assert.equal(f.invoked.length, 20); assert.equal(f.models.length, 21); assert.equal(f.engine.snapshot().status, 'error'); assert.match(f.engine.snapshot().messages.at(-1).content, /۲۰/);
});
test('follow-up conversation retains actual prior user/assistant/tool evidence, but grants each execution separately', async () => {
  const requests = []; let number = 0;
  const f = fixture((request) => { requests.push(JSON.parse(JSON.stringify(request.messages))); return ++number === 1 ? call('arena_ask', { prompt: 'First request' }) : { message: { role: 'assistant', content: number === 2 ? 'First answer' : 'Follow-up answer' } }; });
  await f.engine.run(task, workspace); await f.engine.promise; const id = f.engine.snapshot().id;
  await f.engine.run({ ...task, task: 'Continue from that answer' }, workspace); await f.engine.promise;
  assert.equal(f.engine.snapshot().id, id); assert.equal(f.prompts(), 2); assert.equal(f.engine.snapshot().history.length, 1); assert.equal(f.engine.snapshot().messages.filter((m) => m.role === 'user').length, 2);
  assert.ok(requests[2].some((m) => m.role === 'tool' && m.content.includes('actual'))); assert.ok(requests[2].some((m) => m.content === 'First answer'));
});
test('new-task and recent-task restoration preserve independent memory-only conversations', async () => {
  const f = fixture(() => ({ message: { role: 'assistant', content: 'An actual answer' } }));
  await f.engine.run(task, workspace); await f.engine.promise; const first = f.engine.snapshot().id; f.engine.clear(); assert.equal(f.engine.snapshot().messages.length, 0);
  await f.engine.run({ ...task, task: 'A separate job' }, workspace); await f.engine.promise;
  assert.notEqual(f.engine.snapshot().id, first); f.engine.open(first, null); assert.equal(f.engine.snapshot().messages[0].content, task.task); assert.equal(f.engine.snapshot().history.length, 2);
  assert.throws(() => f.engine.open(first, 'C:\\different'), /دیگری/);
});
test('context compaction never invents successful results or orphans interrupted tool calls', () => {
  const { compactContext } = require('../src/engine.cjs'); const partial = call('files_list', {}, 'pending').message;
  const repaired = compactContext([{ role: 'user', content: 'Inspect' }, partial]); assert.equal(repaired.at(-1).tool_call_id, 'pending'); assert.match(repaired.at(-1).content, /unconfirmed/);
  const huge = compactContext([{ role: 'user', content: 'Inspect' }, partial, { role: 'tool', tool_call_id: 'pending', content: 'x'.repeat(130000) }, { role: 'assistant', content: 'Old trace was large' }]); assert.ok(JSON.stringify(huge).length < 120000); assert.equal(huge.some((m) => m.role === 'tool'), false);
});

test('structured model plans and real tool traces remain distinct in the engine', async () => {
  const f = fixture([call('mission_plan', { steps: [{ title: 'Run tests', status: 'done' }] }), { message: { role: 'assistant', content: 'Claimed final result, not actual verification' } }]);
  await f.engine.run(task, workspace); await f.engine.promise; const snapshot = f.engine.snapshot();
  assert.equal(snapshot.mission.plan[0].status, 'done'); assert.equal(snapshot.mission.runs[0].name, 'mission_plan'); assert.equal(snapshot.mission.runs[0].status, 'returned'); assert.equal(snapshot.mission.artifacts.length, 0); assert.equal(f.invoked.length, 0);
  snapshot.mission.plan[0].title = 'tampered'; assert.equal(f.engine.snapshot().mission.plan[0].title, 'Run tests');
});
test('actual failed execution is visible even if the model later claims completion', async () => {
  const f = fixture([call('terminal_run', { command: 'Get-Date' }), { message: { role: 'assistant', content: 'Done' } }]);
  f.tools.call = async () => ({ exitCode: 7, stdout: 'actual failure', stderr: '' });
  await f.engine.run(task, workspace); await f.engine.promise;
  assert.equal(f.engine.snapshot().status, 'completed'); assert.equal(f.engine.snapshot().mission.runs[0].status, 'error'); assert.match(f.engine.snapshot().mission.runs[0].output, /actual failure/);
});
test('stop during a launched tool records uncertainty, never a fabricated successful result', async () => {
  const f = fixture([call('terminal_run', { command: 'Get-Date' })]);
  f.tools.call = async (_name, _args, _workspace, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  await f.engine.run(task, workspace); await flush(); await f.engine.stop();
  assert.equal(f.engine.snapshot().mission.runs[0].status, 'interrupted'); assert.equal(f.engine.snapshot().mission.artifacts.length, 0); assert.equal(f.engine.snapshot().mission.phase, 'stopped');
});
test('restoring a thread also restores its independent mission plan and trace, without running anything', async () => {
  const f = fixture([call('mission_plan', { steps: [{ title: 'First plan', status: 'active' }] }), { message: { role: 'assistant', content: 'First' } }, { message: { role: 'assistant', content: 'Second' } }]);
  await f.engine.run(task, workspace); await f.engine.promise; const first = f.engine.snapshot().id; f.engine.clear();
  await f.engine.run({ ...task, task: 'Second mission' }, workspace); await f.engine.promise; assert.equal(f.engine.snapshot().mission.plan.length, 0);
  const calls = f.models.length; f.engine.open(first, null); assert.equal(f.engine.snapshot().mission.plan[0].title, 'First plan'); assert.equal(f.models.length, calls);
});
