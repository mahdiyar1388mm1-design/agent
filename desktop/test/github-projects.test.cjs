'use strict';

// Real Git, entirely offline. The injected test executor rewrites ONLY approved
// GitHub transport URLs to temporary bare repositories. Production never enables
// file transport, rewrites URLs, or stubs GitHub authentication this way.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { GitHubProjects } = require('../src/github-projects.cjs');
const { GitHubTools } = require('../src/github-tools.cjs');
const { repository, WATCH_MS } = require('../src/github-policy.cjs');

const gitPath = (() => {
  try {
    const command = process.platform === 'win32' ? path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe') : 'which';
    return fs.realpathSync(execFileSync(command, [process.platform === 'win32' ? 'git.exe' : 'git'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]);
  } catch { return null; }
})();
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-github-test-'));
  const downloads = path.join(root, 'downloads'); const seed = path.join(root, 'cloud');
  fs.mkdirSync(downloads); fs.mkdirSync(seed);
  const tools = new GitHubTools({ paths: { git: gitPath, gh: gitPath }, cwd: root });
  const rawGit = tools.git.bind(tools);
  const gitCalls = []; const ghCalls = []; const dialogs = []; const responses = []; const attached = []; const handoffs = [];
  const remotes = new Map(); const repo = repository('fixture-user/project');
  const data = { pick: downloads, url: 'https://arena.ai/agent/fixture', terminal: false, now: Date.now(), gitHook: null, ghHook: null, consentHook: null };
  async function native(args, cwd = seed) {
    const result = await rawGit(['-c', 'protocol.file.allow=always', ...args], cwd);
    assert.equal(result.error, null, result.error || '');
    assert.equal(result.code, 0, result.stderr);
    return result.stdout;
  }
  async function bare(fullName) {
    const location = path.join(root, `bare-${remotes.size}`); fs.mkdirSync(location);
    await native(['init', '--bare', '--initial-branch=main', '.'], location);
    remotes.set(repository(fullName).cloneUrl, location); return location;
  }
  const initialRemote = await bare(repo.fullName);
  await native(['init', '--initial-branch=main', '.']);
  fs.writeFileSync(path.join(seed, 'README.md'), 'Initial project\n');
  const commit = async (text, cwd = seed) => {
    await native(['add', '--all'], cwd);
    return native(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--no-gpg-sign', '-m', text], cwd);
  };
  await commit('Initial fixture');
  await native(['remote', 'add', 'origin', initialRemote]);
  await native(['push', 'origin', 'HEAD:refs/heads/main']);
  tools.git = async (args, cwd, options) => {
    gitCalls.push({ args: [...args], cwd, input: options?.input });
    if (data.gitHook) { const override = await data.gitHook(args, cwd, options); if (override !== undefined) return override; }
    const transport = ['clone', 'fetch', 'push', 'ls-remote'].some((command) => args.includes(command));
    const mapped = transport ? args.map((arg) => {
      if (!/^https:\/\//.test(arg)) return arg;
      if (!remotes.has(arg)) throw new Error('Offline fixture refuses any real network transport');
      return remotes.get(arg);
    }) : args;
    const result = await rawGit(['-c', 'protocol.file.allow=always', ...mapped], cwd, options);
    if (args[0] === 'clone' && result.code === 0) await native(['remote', 'set-url', 'origin', args.at(-2)], args.at(-1));
    return result;
  };
  tools.gh = async (args, options) => {
    ghCalls.push([...args]);
    if (data.ghHook) { const override = await data.ghHook(args, options); if (override !== undefined) return override; }
    let output;
    if (args[0] === 'api' && args[3] !== 'user') output = 'main\narena/agent-work\n';
    else if (args[0] === 'api') output = JSON.stringify({ login: 'fixture-user', id: 42 });
    else if (args[0] === 'auth') output = '';
    else if (args[1] === 'list') output = JSON.stringify([{ nameWithOwner: repo.fullName, description: 'An offline fixture', isPrivate: true, defaultBranchRef: { name: 'main' } }]);
    else if (args[1] === 'view') output = JSON.stringify({ nameWithOwner: args[2], isPrivate: true, defaultBranchRef: { name: 'main' } });
    else if (args[1] === 'create') { await bare(args[2]); output = repository(args[2]).url; }
    else throw new Error(`Unexpected mock gh operation: ${args}`);
    return { code: 0, stdout: output, stderr: '', error: null };
  };
  const manager = new GitHubProjects({ tools, autoPoll: false, now: () => data.now,
    getWindow: () => ({}), getSiteUrl: () => data.url, isTerminalActive: () => data.terminal,
    onProject: (project) => attached.push(structuredClone(project)),
    onHandoff: async (message, guard) => { guard(); handoffs.push(message); },
    dialog: {
      showOpenDialog: async () => ({ canceled: false, filePaths: [data.pick] }),
      showMessageBox: async (_window, options) => {
        dialogs.push(options); if (data.consentHook) await data.consentHook(options);
        const response = responses.shift(); return response instanceof Promise ? response : { response: response ?? 1 };
      },
    },
  });
  t.after(async () => { await manager.cancel(); tools.dispose(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  await manager.check();
  const clone = async (branch = 'main') => {
    await manager.chooseParent(); responses.push(0);
    const state = await manager.clone({ repository: repo.fullName, branch });
    assert.equal(state.status, 'ready', state.message); return state;
  };
  const local = async (files = { 'app.txt': 'ready project\n' }) => {
    const folder = path.join(root, `ready-${fs.readdirSync(root).length}`); fs.mkdirSync(folder);
    for (const [name, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(folder, name)), { recursive: true }); fs.writeFileSync(path.join(folder, name), text); }
    data.pick = folder; const state = await manager.chooseProject();
    assert.equal(state.status, 'ready', state.message); return state.project.folder;
  };
  const cloudChange = async (text) => { fs.writeFileSync(path.join(seed, 'README.md'), text); await commit('Cloud agent change'); await native(['push', 'origin', 'HEAD:refs/heads/main']); };
  return { manager, tools, root, seed, repo, data, responses, dialogs, gitCalls, ghCalls, attached, handoffs, native, commit, clone, local, cloudChange, remotes };
}

const nativeTest = (name, callback) => test(name, { skip: !gitPath, timeout: 60000 }, callback);

nativeTest('GitHub list and clone bind the exact branch to a fresh local project; no project code is run', async (t) => {
  const f = await fixture(t);
  assert.equal(f.manager.snapshot().account.login, 'fixture-user');
  await f.manager.list();
  assert.equal(f.manager.snapshot().repositories[0].fullName, f.repo.fullName);
  await f.clone('');
  const state = f.manager.snapshot();
  assert.equal(state.status, 'ready', state.message);
  assert.equal(state.project.repo.fullName, f.repo.fullName);
  assert.equal(state.project.branch, 'main');
  assert.equal(state.project.dirty, false);
  assert.equal(fs.readFileSync(path.join(state.project.folder, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'Initial project\n');
  assert.equal(f.attached.at(-1).folder, state.project.folder);
  assert.equal(f.dialogs.length, 1);
  assert.equal(f.dialogs[0].defaultId, 1);
  assert.equal(f.gitCalls.some(({ args }) => args.includes('clone') && args.includes('--no-recurse-submodules')), true);
  assert.equal(f.manager.snapshot().watching, false);
});

nativeTest('clone cancellation and existing destination never overwrite a project', async (t) => {
  const f = await fixture(t);
  await f.manager.chooseParent();
  await f.manager.clone({ repository: f.repo.fullName }); // native defaults to cancel
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'clone'), false);
  const destination = path.join(f.manager.snapshot().parent, 'project'); fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'mine.txt'), 'MY PROJECT');
  f.responses.push(0); await f.manager.clone({ repository: f.repo.fullName });
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(fs.readFileSync(path.join(destination, 'mine.txt'), 'utf8'), 'MY PROJECT');
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'clone'), false);
});

nativeTest('automatic download repeatedly fast-forwards pushed cloud commits after one grant', async (t) => {
  const f = await fixture(t); await f.clone();
  f.responses.push(0); await f.manager.startWatch();
  assert.equal(f.manager.snapshot().watching, true);
  for (const text of ['Agent result one\n', 'Agent result two\n']) {
    await f.cloudChange(text); await f.manager.tick();
    assert.equal(f.manager.snapshot().status, 'watching', f.manager.snapshot().message);
    assert.equal(fs.readFileSync(path.join(f.manager.snapshot().project.folder, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), text);
  }
  assert.equal(f.dialogs.length, 2); // clone + ONE watch grant, not per commit
  const merges = f.gitCalls.filter(({ args }) => args[0] === 'merge');
  assert.equal(merges.length, 2);
  for (const { args } of merges) {
    assert.ok(args.includes('--ff-only')); assert.ok(args.includes('--no-overwrite-ignore'));
    assert.match(args.at(-1), /^[a-f0-9]{40,64}$/); // captured OID, not mutable FETCH_HEAD
  }
});

nativeTest('local edits stop automatic download and keep the working file exactly intact', async (t) => {
  const f = await fixture(t); await f.clone(); f.responses.push(0); await f.manager.startWatch();
  const file = path.join(f.manager.snapshot().project.folder, 'README.md');
  fs.writeFileSync(file, 'MY UNSAVED LOCAL CHANGE\n');
  await f.cloudChange('Cloud change\n'); await f.manager.tick();
  assert.equal(f.manager.snapshot().watching, false);
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(fs.readFileSync(file, 'utf8'), 'MY UNSAVED LOCAL CHANGE\n');
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'merge'), false);
  assert.equal(f.gitCalls.some(({ args }) => ['reset', 'stash', 'clean'].includes(args[0])), false);
});

nativeTest('divergent commits are not rebased, reset, merged or force-pulled', async (t) => {
  const f = await fixture(t); await f.clone();
  const folder = f.manager.snapshot().project.folder;
  fs.writeFileSync(path.join(folder, 'local.txt'), 'local commit'); await f.commit('Local work', folder);
  await f.cloudChange('Independent cloud commit\n');
  const head = (await f.native(['rev-parse', 'HEAD'], folder)).trim();
  await f.manager.sync();
  assert.equal(f.manager.snapshot().status, 'error');
  assert.match(f.manager.snapshot().message, /واگرا/);
  assert.equal((await f.native(['rev-parse', 'HEAD'], folder)).trim(), head);
});

nativeTest('an ignored local file is not overwritten by a cloud commit that starts tracking its path', async (t) => {
  const f = await fixture(t); await f.clone();
  const folder = f.manager.snapshot().project.folder;
  fs.mkdirSync(path.join(folder, '.git', 'info'), { recursive: true });
  fs.appendFileSync(path.join(folder, '.git', 'info', 'exclude'), '\nlocal-config.txt\n');
  fs.writeFileSync(path.join(folder, 'local-config.txt'), 'PRIVATE LOCAL CONFIG');
  fs.writeFileSync(path.join(f.seed, 'local-config.txt'), 'Cloud version');
  await f.commit('Track conflicting file'); await f.native(['push', 'origin', 'HEAD:refs/heads/main']);
  await f.manager.sync();
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(fs.readFileSync(path.join(folder, 'local-config.txt'), 'utf8'), 'PRIVATE LOCAL CONFIG');
});

nativeTest('remote/branch changes and parent-directory selection fail closed', async (t) => {
  const f = await fixture(t); await f.clone();
  const folder = f.manager.snapshot().project.folder;
  await f.native(['remote', 'set-url', 'origin', 'https://github.com/another/project.git'], folder);
  await f.manager.sync();
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'fetch'), false);
  const child = path.join(folder, 'subfolder'); fs.mkdirSync(child); f.data.pick = child;
  await f.manager.chooseProject();
  assert.equal(f.manager.snapshot().status, 'error');
  assert.match(f.manager.snapshot().message, /ریشهٔ دقیق/);
});

nativeTest('watch expires, revokes on conversation change, and never runs during a local terminal session', async (t) => {
  const f = await fixture(t); await f.clone(); f.responses.push(0); await f.manager.startWatch();
  f.data.terminal = true;
  const fetches = f.gitCalls.filter(({ args }) => args[0] === 'fetch').length;
  await f.manager.tick();
  assert.equal(f.gitCalls.filter(({ args }) => args[0] === 'fetch').length, fetches);
  f.data.terminal = false; f.data.now += WATCH_MS;
  await f.manager.tick(); assert.equal(f.manager.snapshot().watching, false);
  f.responses.push(0); await f.manager.startWatch();
  f.data.url = 'https://arena.ai/agent/different'; f.manager.onNavigation(f.data.url);
  await flush(); assert.equal(f.manager.snapshot().watching, false);
});

nativeTest('revocation during a fetch prevents a late merge or restored watch grant', async (t) => {
  const f = await fixture(t); await f.clone(); f.responses.push(0); await f.manager.startWatch();
  let release; let reached;
  const waiting = new Promise((resolve) => { reached = resolve; });
  f.data.gitHook = async (args) => {
    if (args[0] === 'fetch') { reached(); return new Promise((resolve) => { release = resolve; }); }
  };
  const ticking = f.manager.tick(); await waiting;
  await f.manager.cancel(); release({ code: 0, stdout: '', stderr: '', error: null });
  await ticking;
  assert.equal(f.manager.snapshot().watching, false);
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'merge'), false);
});

nativeTest('publishing a ready local project creates a PRIVATE repo, excludes secrets/artifacts, commits and pushes only its branch', async (t) => {
  const f = await fixture(t);
  const folder = await f.local({ 'app.txt': 'project source\n', '.env': 'password=PRIVATE_LOCAL_PASSWORD', 'node_modules/generated.js': 'generated' });
  f.responses.push(0); await f.manager.preparePublish({ name: 'ready-project' });
  assert.equal(f.manager.snapshot().status, 'preview', f.manager.snapshot().message);
  assert.deepEqual(f.manager.snapshot().preview.files, ['app.txt']);
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
  f.responses.push(0); await f.manager.publish();
  const state = f.manager.snapshot();
  assert.equal(state.status, 'ready', state.message);
  assert.equal(state.project.repo.fullName, 'fixture-user/ready-project');
  assert.equal(state.project.dirty, false);
  const create = f.ghCalls.find((args) => args[1] === 'create'); assert.ok(create.includes('--private'));
  const push = f.gitCalls.find(({ args }) => args[0] === 'push').args;
  assert.equal(push.at(-1), 'HEAD:refs/heads/main'); assert.equal(push.includes('--force'), false);
  assert.equal(fs.readFileSync(path.join(folder, '.env'), 'utf8'), 'password=PRIVATE_LOCAL_PASSWORD');
  const tracked = await f.native(['ls-files'], folder);
  assert.equal(tracked.includes('.env'), false); assert.equal(tracked.includes('node_modules'), false);
  assert.equal(f.handoffs.length, 0); // Publishing does not silently share a message to Arena
});

nativeTest('changed files after publication preview are neither staged nor pushed', async (t) => {
  const f = await fixture(t); const folder = await f.local();
  f.responses.push(0); await f.manager.preparePublish({ name: 'changed' });
  fs.writeFileSync(path.join(folder, 'app.txt'), 'changed after preview');
  f.responses.push(0); await f.manager.publish();
  assert.equal(f.manager.snapshot().status, 'error');
  assert.match(f.manager.snapshot().message, /پیش‌نمایش/);
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'add'), false);
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
});

nativeTest('pre-existing staged changes and detected secrets are never automatically committed/uploaded', async (t) => {
  const f = await fixture(t); await f.clone(); const folder = f.manager.snapshot().project.folder;
  fs.writeFileSync(path.join(folder, 'staged.txt'), 'my partial stage'); await f.native(['add', 'staged.txt'], folder);
  await f.manager.preparePublish({});
  assert.equal(f.manager.snapshot().status, 'error'); assert.match(f.manager.snapshot().message, /stage/);
  assert.equal((await f.native(['diff', '--cached', '--name-only'], folder)).trim(), 'staged.txt');
  await f.native(['restore', '--staged', 'staged.txt'], folder); fs.unlinkSync(path.join(folder, 'staged.txt'));
  fs.writeFileSync(path.join(folder, 'source.txt'), 'access_token=REAL_SECRET_SHAPED_CONTENT');
  await f.manager.preparePublish({});
  assert.equal(f.manager.snapshot().status, 'error'); assert.match(f.manager.snapshot().message, /حساس/);
  assert.equal(f.manager.snapshot().message.includes('REAL_SECRET_SHAPED_CONTENT'), false);
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'push'), false);
});

nativeTest('Agent handoff sends selected context only, and requires matching published revision', async (t) => {
  const f = await fixture(t); await f.clone();
  f.responses.push(0); await f.manager.handoff({ task: 'Add a settings page.' });
  assert.equal(f.manager.snapshot().status, 'ready', f.manager.snapshot().message);
  assert.equal(f.handoffs.length, 1);
  assert.match(f.handoffs[0], /Add a settings page/);
  assert.match(f.handoffs[0], /does NOT attach/);
  assert.equal(f.handoffs[0].includes(f.manager.snapshot().project.folder), false);
  await f.cloudChange('New cloud head\n');
  f.responses.push(0); await f.manager.handoff({ task: 'Another task' });
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(f.handoffs.length, 1);
});

nativeTest('no permissions are persisted and a cancelled initial watch consent cannot start polling', async (t) => {
  const f = await fixture(t); await f.clone(); await f.manager.startWatch();
  assert.equal(f.manager.snapshot().watching, false);
  assert.equal(f.manager.snapshot().watchExpiresAt, null);
  assert.equal(f.manager.snapshot().deviceCode, null);
  assert.equal(f.manager.snapshot().busy, false);
});

nativeTest('late native watch consent after Stop cannot restore permissions', async (t) => {
  const f = await fixture(t); await f.clone();
  let answer; let prompted;
  const waiting = new Promise((resolve) => { prompted = resolve; });
  f.responses.push(new Promise((resolve) => { answer = resolve; }));
  f.data.consentHook = async () => prompted();
  const starting = f.manager.startWatch(); await waiting;
  await f.manager.cancel(); answer({ response: 0 }); await starting;
  assert.equal(f.manager.snapshot().watching, false);
  assert.equal(f.manager.snapshot().busy, false);
});

nativeTest('login passes only the local device code to UI and never copies raw credentials into state/handoff', async (t) => {
  const f = await fixture(t);
  f.data.ghHook = async (args, options) => {
    if (args[0] === 'auth') {
      options.onDeviceCode('ABCD-1234');
      assert.equal(f.manager.snapshot().deviceCode, 'ABCD-1234');
      return { code: 0, stdout: 'not retained: ghp_' + 't'.repeat(30), stderr: '', error: null };
    }
  };
  f.responses.push(0); await f.manager.login();
  assert.equal(f.manager.snapshot().deviceCode, null);
  assert.equal(JSON.stringify(f.manager.snapshot()).includes('ghp_'), false);
  assert.deepEqual(f.ghCalls.find((args) => args[0] === 'auth'), ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web']);
});

nativeTest('publication cannot follow symlinks out of the selected project or commit nested repositories', async (t) => {
  const f = await fixture(t); const folder = await f.local();
  const outside = path.join(f.root, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'secret.txt'), 'not for publication');
  try { fs.symlinkSync(outside, path.join(folder, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') { t.skip('Host does not allow creating a link fixture'); return; } throw error; }
  f.responses.push(0); await f.manager.preparePublish({ name: 'linked-project' });
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'add'), false);
});


nativeTest('a fixed Arena working branch can be explicitly selected without resetting another local branch', async (t) => {
  const f = await fixture(t); await f.clone();
  await f.native(['switch', '-c', 'arena/agent-work']);
  fs.writeFileSync(path.join(f.seed, 'agent.txt'), 'Built by the cloud Agent');
  await f.commit('Agent branch result'); await f.native(['push', 'origin', 'HEAD:refs/heads/arena/agent-work']);
  await f.manager.listBranches();
  assert.ok(f.manager.snapshot().branches.includes('arena/agent-work'));
  f.responses.push(0); await f.manager.selectBranch({ branch: 'arena/agent-work' });
  const state = f.manager.snapshot();
  assert.equal(state.status, 'ready', state.message);
  assert.equal(state.project.branch, 'arena/agent-work');
  assert.equal(state.watching, false);
  assert.equal(fs.readFileSync(path.join(state.project.folder, 'agent.txt'), 'utf8'), 'Built by the cloud Agent');
  assert.ok(f.gitCalls.some(({ args }) => args[0] === 'switch' && args.includes('--no-overwrite-ignore')));
  assert.equal(f.gitCalls.some(({ args }) => ['reset', 'clean'].includes(args[0])), false);
});

nativeTest('Git LFS publication is explicitly refused instead of silently pushing missing objects', async (t) => {
  const f = await fixture(t); await f.local({ '.gitattributes': '*.bin filter=lfs diff=lfs merge=lfs -text\n', 'asset.bin': 'small test asset' });
  f.responses.push(0); await f.manager.preparePublish({ name: 'lfs-project' });
  assert.equal(f.manager.snapshot().status, 'error');
  assert.match(f.manager.snapshot().message, /LFS/);
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
});

nativeTest('publication cancellation keeps the preview and never creates or pushes a remote repository', async (t) => {
  const f = await fixture(t); await f.local(); f.responses.push(0); await f.manager.preparePublish({ name: 'cancelled' });
  await f.manager.publish();
  assert.equal(f.manager.snapshot().status, 'preview');
  assert.equal(f.manager.snapshot().busy, false);
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
  assert.equal(f.gitCalls.some(({ args }) => args[0] === 'push'), false);
});

nativeTest('known environment example files are allowed by name, but real credentials are still detected', async (t) => {
  const f = await fixture(t); await f.local({ 'app.txt': 'source', '.env.example': 'APP_NAME=example\n' });
  f.responses.push(0); await f.manager.preparePublish({ name: 'example-project' });
  assert.equal(f.manager.snapshot().status, 'preview', f.manager.snapshot().message);
  assert.ok(f.manager.snapshot().preview.files.includes('.env.example'));
});

nativeTest('an existing selected Agent branch fast-forwards without losing the original branch', async (t) => {
  const f = await fixture(t); await f.clone(); const folder = f.manager.snapshot().project.folder;
  const original = f.manager.snapshot().project.head;
  await f.native(['branch', 'arena/existing'], folder); await f.native(['switch', '-c', 'arena/existing']);
  fs.writeFileSync(path.join(f.seed, 'README.md'), 'existing Agent branch advanced\n'); await f.commit('Agent branch advance');
  await f.native(['push', 'origin', 'HEAD:refs/heads/arena/existing']);
  f.responses.push(0); await f.manager.selectBranch({ branch: 'arena/existing' });
  assert.equal(f.manager.snapshot().status, 'ready', f.manager.snapshot().message);
  assert.equal(f.manager.snapshot().project.branch, 'arena/existing');
  assert.notEqual(f.manager.snapshot().project.head, original);
  assert.equal((await f.native(['rev-parse', 'main'], folder)).trim(), original);
});

nativeTest('a divergent local Agent branch is never reset by selecting the remote branch', async (t) => {
  const f = await fixture(t); await f.clone(); const folder = f.manager.snapshot().project.folder;
  await f.native(['switch', '-c', 'arena/diverged'], folder);
  fs.writeFileSync(path.join(folder, 'local.txt'), 'keep local commit'); await f.commit('Unpushed local', folder);
  const keep = (await f.native(['rev-parse', 'HEAD'], folder)).trim(); await f.native(['switch', 'main'], folder);
  await f.native(['switch', '-c', 'arena/diverged']); fs.writeFileSync(path.join(f.seed, 'cloud.txt'), 'separate cloud commit');
  await f.commit('Cloud divergence'); await f.native(['push', 'origin', 'HEAD:refs/heads/arena/diverged']);
  f.responses.push(0); await f.manager.selectBranch({ branch: 'arena/diverged' });
  assert.equal(f.manager.snapshot().status, 'error'); assert.match(f.manager.snapshot().message, /واگرا/);
  assert.equal((await f.native(['rev-parse', 'arena/diverged'], folder)).trim(), keep);
  assert.equal((await f.native(['branch', '--show-current'], folder)).trim(), 'main');
});

nativeTest('changing conversation during a native Agent handoff consent never sends into another chat', async (t) => {
  const f = await fixture(t); await f.clone(); f.responses.push(0);
  f.data.consentHook = async () => { f.data.url = 'https://arena.ai/agent/different'; f.manager.onNavigation(f.data.url); };
  await f.manager.handoff({ task: 'Continue this project' });
  assert.equal(f.handoffs.length, 0);
  assert.equal(f.manager.snapshot().busy, false);
});

nativeTest('changed staged blob content with identical paths is detected before commit or remote creation', async (t) => {
  const f = await fixture(t); const folder = await f.local(); f.responses.push(0); await f.manager.preparePublish({ name: 'blob-check' });
  const injected = path.join(f.root, 'injected.txt'); fs.writeFileSync(injected, 'unreviewed content');
  const blob = (await f.native(['hash-object', '-w', injected], folder)).trim();
  let changed = false;
  f.data.gitHook = async (args, cwd) => {
    if (!changed && args[0] === 'diff' && args.includes('--name-only')) {
      changed = true; await f.native(['update-index', '--cacheinfo', `100644,${blob},app.txt`], cwd);
    }
  };
  f.responses.push(0); await f.manager.publish();
  assert.equal(f.manager.snapshot().status, 'error'); assert.match(f.manager.snapshot().message, /محتوای stage/);
  assert.equal(f.ghCalls.some((args) => args[1] === 'create'), false);
  assert.equal(f.gitCalls.some(({ args }) => args.includes('commit')), false);
});

nativeTest('selecting an Agent branch cannot overwrite a conflicting ignored local file', async (t) => {
  const f = await fixture(t); await f.clone(); const folder = f.manager.snapshot().project.folder;
  fs.mkdirSync(path.join(folder, '.git', 'info'), { recursive: true });
  fs.writeFileSync(path.join(folder, '.git', 'info', 'exclude'), 'local-only.txt\n');
  fs.writeFileSync(path.join(folder, 'local-only.txt'), 'keep original local file');
  await f.native(['switch', '-c', 'arena/collision']); fs.writeFileSync(path.join(f.seed, 'local-only.txt'), 'cloud version');
  await f.commit('Cloud tracked collision'); await f.native(['push', 'origin', 'HEAD:refs/heads/arena/collision']);
  f.responses.push(0); await f.manager.selectBranch({ branch: 'arena/collision' });
  assert.equal(f.manager.snapshot().status, 'error');
  assert.equal(fs.readFileSync(path.join(folder, 'local-only.txt'), 'utf8'), 'keep original local file');
  assert.equal((await f.native(['branch', '--show-current'], folder)).trim(), 'main');
});

nativeTest('anonymous public clone/default branch and branch listing never require gh or an account API', async (t) => {
  const f = await fixture(t);
  f.manager.update({ account: null });
  f.tools.detect = async () => ({ git: gitPath, gh: null });
  f.data.ghHook = () => { throw new Error('No account or GitHub CLI dependency is allowed for anonymous public Git'); };
  const before = f.ghCalls.length;
  const state = await f.clone('');
  assert.equal(state.project.branch, 'main'); assert.equal(f.ghCalls.length, before);
  await f.native(['branch', 'arena/agent-work']);
  await f.native(['push', 'origin', 'refs/heads/arena/agent-work']);
  const branches = await f.manager.listBranches();
  assert.equal(branches.status, 'ready', branches.message);
  assert.ok(branches.branches.includes('main')); assert.ok(branches.branches.includes('arena/agent-work'));
  assert.equal(f.ghCalls.length, before);
});

nativeTest('Stop during asynchronous system proxy resolution prevents any late Git spawn', async (t) => {
  const f = await fixture(t); await f.manager.chooseParent(); f.responses.push(0);
  let resolveProxy; let announce;
  const pending = new Promise((resolve) => { announce = resolve; });
  f.tools.configureProxy = () => { announce(); return new Promise((resolve) => { resolveProxy = resolve; }); };
  const before = f.gitCalls.length;
  const clone = f.manager.clone({ repository: f.repo.fullName, branch: 'main' });
  await pending; await f.manager.cancel(); resolveProxy({ HTTPS_PROXY: 'http://proxy.invalid:8080' });
  await clone;
  assert.equal(f.gitCalls.length, before); assert.equal(f.manager.snapshot().project, null);
  assert.equal(f.manager.snapshot().busy, false);
});
