'use strict';
const path = require('node:path');
const fs = require('node:fs');
const shared = require('./shared.cjs');
const { GitHubTools } = shared('github-tools');
const { repository, branchName, folderName } = shared('github-policy');
const { validCommand, outputReviewReasons } = shared('terminal-protocol');

const rows = [
  ['files_list', 'List non-sensitive project files/folders, relative to the selected workspace.', { path: 'string' }, [], true],
  ['files_read', 'Read a UTF-8 project file (max 256 KiB). No credentials, .env, .git or symlinks.', { path: 'string' }, ['path'], true],
  ['files_write', 'Create/replace a UTF-8 project file. Read existing content first. No deletion tool.', { path: 'string', text: 'string' }, ['path', 'text'], true],
  ['terminal_run', 'Run one Windows PowerShell command in the selected workspace. Real user privileges, not a sandbox. npm.cmd avoids shim policy errors.', { command: 'string' }, ['command'], true],
  ['arena_ask', 'Delegate a request to the signed-in Arena website in managed Chrome, wait and read its visible assistant response. Cloud tools are NOT local. User must manually sign in/select Agent/repository when needed.', { prompt: 'string' }, ['prompt']],
  ['browser_navigate', 'Open a public HTTPS website in the separate agent Chrome profile. New origins need native approval. No localhost/private network.', { url: 'string' }, ['url']],
  ['browser_read', 'Read visible page text and available controls. Password/MFA pages require manual user interaction.', {}, []],
  ['browser_click', 'Click ONE visible control by its exact button label or css: selector from browser_read. Sensitive side effects need approval.', { target: 'string' }, ['target']],
  ['browser_fill', 'Fill one ordinary text field, using its css: target from browser_read. Never password, MFA or payment details.', { target: 'string', value: 'string' }, ['target', 'value']],
  ['github_repositories', 'List up to 100 repositories of the user-authenticated gh account. Connect the account in the app first.', {}, []],
  ['github_clone', 'Clone a public or authorized private GitHub repo into a NEW subfolder of workspace. No overwrite, submodules or automatic code execution. Exact branch optional (otherwise discover default).', { repository: 'string', branch: 'string' }, ['repository'], true],
  ['github_status', 'Inspect the Git project at the workspace root or relative directory.', { directory: 'string' }, [], true],
  ['github_sync', 'Fetch and fast-forward only a clean bound GitHub project; preserve local/untracked/ignored conflicts. No force/reset/stash.', { directory: 'string' }, [], true],
  ['github_publish', 'Prepare file/history preview then require native human consent to publish. New repo is PRIVATE, existing origin/branch retained. No force push/PR merge/release.', { directory: 'string', name: 'string', message: 'string' }, [], true],
];
class ToolRegistry {
  constructor({ browser, github, permissions, confirm, clean, resourcesPath, platform = process.platform, runner }) {
    this.browser = browser; this.github = github; this.permissions = permissions; this.confirm = confirm; this.clean = clean;
    this.platform = platform; this.runner = runner || new GitHubTools({ resourcesPath });
  }
  definitions(hasWorkspace) {
    return rows.filter((r) => !r[4] || hasWorkspace).map(([name, description, fields, required]) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties: Object.fromEntries(Object.entries(fields).map(([key, type]) => [key, { type }])), required, additionalProperties: false } } }));
  }
  validate(name, args) {
    const row = rows.find((r) => r[0] === name); if (!row) throw new Error('ابزار ثبت‌نشده است.');
    if (!args || typeof args !== 'object' || Array.isArray(args) || JSON.stringify(args).length > 40000) throw new Error('ورودی ابزار نامعتبر است.');
    for (const [key, value] of Object.entries(args)) if (!Object.hasOwn(row[2], key) || typeof value !== row[2][key]) throw new Error('فیلد یا نوع آرگومان ابزار مجاز نیست.');
    if (row[3].some((key) => !Object.hasOwn(args, key))) throw new Error('آرگومان ضروری ابزار وجود ندارد.');
  }
  async bind(workspace, directory, signal) {
    const folder = fs.realpathSync.native(workspace.resolve(directory || '.')); this.permissions.check(signal);
    const state = await this.github.operationFor('project', async (op) => { await this.github.ensureTools(op, false); this.permissions.check(signal); this.github.setProject(op, await this.github.inspect(op, folder)); this.github.update({ status: 'ready' }); });
    this.permissions.check(signal); if (state.status === 'error') throw new Error(state.message); return state.project;
  }
  projectSummary(project) { return { repository: project.repo?.url || null, branch: project.branch, commit: project.head, dirty: project.dirty, isGit: project.isGit }; }
  async call(name, args, workspace, signal) {
    this.validate(name, args); this.permissions.check(signal);
    switch (name) {
      case 'files_list': return workspace.list(args.path || '.');
      case 'files_read': return { path: args.path, text: this.clean(workspace.read(args.path)) };
      case 'files_write': return workspace.write(args.path, args.text);
      case 'terminal_run': {
        if (this.platform !== 'win32') throw new Error('اجرای محلی این نسخه فقط روی Windows است.');
        if (!validCommand(args.command)) throw new Error('فرمان PowerShell نامعتبر است.');
        const cwd = workspace.resolve('.'); await this.runner.detect(); this.permissions.check(signal);
        const powershell = path.win32.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
        const script = '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);\n' + args.command;
        const result = await this.runner.raw(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { cwd, timeoutMs: 120000, maxBytes: 131072 });
        this.permissions.check(signal);
        const sensitive = outputReviewReasons({ ...result, status: result.code === 0 ? 'completed' : 'failed' }).length > 0 || /dahl_[a-zA-Z0-9_-]{12,}/.test(result.stdout + result.stderr);
        if (sensitive && !await this.confirm('خروجی احتمالاً حساس', this.clean(result.stdout + '\n' + result.stderr).slice(0, 8000) + '\n\nفقط نسخهٔ ماسک‌شده به Dahl ارسال شود؟ تشخیص اسرار کامل نیست.', 'ارسال همین نسخهٔ ماسک‌شده')) return { withheld: true, message: 'کاربر اجازهٔ ارسال خروجی حساس را نداد.' };
        this.permissions.check(signal); return { exitCode: result.code, stdout: this.clean(result.stdout), stderr: this.clean(result.stderr), error: result.error ? this.clean(result.error) : null };
      }
      case 'arena_ask': return this.browser.arena(args.prompt, signal);
      case 'browser_navigate': return this.browser.navigate(args.url, signal);
      case 'browser_read': return this.browser.read(signal);
      case 'browser_click': return this.browser.click(args.target, signal);
      case 'browser_fill': return this.browser.fill(args.target, args.value, signal);
      case 'github_repositories': {
        const state = await this.github.list(); this.permissions.check(signal); if (state.status === 'error') throw new Error(state.message);
        return { repositories: state.repositories.map((r) => ({ repository: r.fullName, private: r.isPrivate, branch: r.branch })) };
      }
      case 'github_clone': {
        const repo = repository(args.repository); const branch = args.branch ? branchName(args.branch) : '';
        this.github.update({ parent: workspace.resolve('.') });
        const state = await this.github.clone({ repository: repo.fullName, branch }); this.permissions.check(signal);
        if (state.status !== 'ready' || !state.project || state.project.repo?.fullName !== repo.fullName || state.project.folder !== path.join(workspace.root, folderName(repo.fullName.split('/')[1]))) throw new Error(state.message || 'دانلود تأیید/انجام نشد.');
        return { directory: folderName(repo.fullName.split('/')[1]), ...this.projectSummary(state.project) };
      }
      case 'github_status': return this.projectSummary(await this.bind(workspace, args.directory, signal));
      case 'github_sync': {
        await this.bind(workspace, args.directory, signal); const state = await this.github.sync(); this.permissions.check(signal);
        if (state.status === 'error') throw new Error(state.message); return this.projectSummary(state.project);
      }
      case 'github_publish': {
        await this.bind(workspace, args.directory, signal); const preview = await this.github.preparePublish({ name: args.name, message: args.message || 'Update project with Orbit Agent' }); this.permissions.check(signal);
        if (preview.status !== 'preview') throw new Error(preview.message || 'پیش‌نمایش آماده نشد.');
        const state = await this.github.publish(); this.permissions.check(signal);
        if (state.status !== 'ready' || !state.project?.repo) throw new Error(state.message || 'انتشار انجام نشد.');
        return this.projectSummary(state.project);
      }
      default: throw new Error('ابزار اجرا نشد.');
    }
  }
  async stop() { await Promise.allSettled([this.runner.stop(), this.github.cancel(), this.browser.close()]); }
  dispose() { this.runner.dispose(); this.github.dispose(); }
}
module.exports = { ToolRegistry, rows };
