'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { GitHubTools, safeError } = require('./github-tools.cjs');
const { isTerminalSiteUrl } = require('./policy.cjs');
const { repository, branchName, folderName, safeRelative, excludedFile, sensitiveContent, projectMessage,
  EXCLUDES, WATCH_MS, POLL_MS, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } = require('./github-policy.cjs');

// Native realpath expands Windows 8.3 aliases; legacy realpath can disagree with Git.
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const oid = (value) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
const splitFiles = (text) => [...new Set(text.split('\0').filter(Boolean))];

class GitHubProjects {
  constructor(options) {
    this.dialog = options.dialog;
    this.getWindow = options.getWindow;
    this.getSiteUrl = options.getSiteUrl || (() => '');
    this.isTerminalActive = options.isTerminalActive || (() => false);
    this.onProject = options.onProject || (() => {});
    this.onHandoff = options.onHandoff;
    this.onUpdate = options.onUpdate || (() => {});
    this.tools = options.tools || new GitHubTools();
    this.now = options.now || Date.now;
    this.autoPoll = options.autoPoll !== false;
    this.epoch = 0;
    this.operation = null;
    this.plan = null;
    this.watch = null;
    this.timer = null;
    this.expiryTimer = null;
    this.revision = 0;
    this.state = { status: 'idle', message: 'ابتدا Git و GitHub CLI را بررسی و حساب خود را وصل کنید.',
      dependencies: { git: null, gh: null }, checked: false, account: null, repositories: [], branches: [], project: null,
      parent: '', deviceCode: null, preview: null, lastSync: null };
  }

  get busy() { return Boolean(this.operation) || this.tools.running; }

  snapshot() {
    return { ...this.state, dependencies: { ...this.state.dependencies },
      account: this.state.account ? { ...this.state.account } : null,
      repositories: this.state.repositories.map((item) => ({ ...item })), branches: [...this.state.branches],
      project: this.state.project ? { ...this.state.project, repo: this.state.project.repo ? { ...this.state.project.repo } : null } : null,
      preview: this.state.preview ? { ...this.state.preview, files: [...this.state.preview.files] } : null,
      busy: this.busy, watching: Boolean(this.watch), watchExpiresAt: this.watch?.expiresAt || null, revision: this.revision };
  }

  update(patch) { this.state = { ...this.state, ...patch }; this.revision += 1; this.onUpdate(this.snapshot()); }

  assert(op) {
    if (op.epoch !== this.epoch || this.operation !== op) throw new Error('عملیات قدیمی یا لغوشده است.');
    if (op.pinnedUrl && this.getSiteUrl() !== op.pinnedUrl) throw new Error('گفتگو هنگام ارسال درخواست تغییر کرد.');
    if (this.isTerminalActive()) throw new Error('ابتدا جلسهٔ ترمینال AI را قطع کنید؛ Git و اجرای محلی هم‌زمان روی پروژه کار نمی‌کنند.');
    if (op.watch && (this.watch !== op.watch || this.now() >= op.watch.expiresAt)) throw new Error('مجوز دریافت خودکار باطل شده است.');
  }

  async operationFor(kind, work) {
    if (this.busy) throw new Error('عملیات قبلی هنوز تمام نشده است؛ صبر کنید یا توقف را بزنید.');
    if (this.isTerminalActive()) throw new Error('ابتدا جلسهٔ ترمینال AI را قطع کنید.');
    const op = { epoch: ++this.epoch, kind, watch: kind === 'watch' ? this.watch : null };
    this.operation = op;
    this.update({ status: 'working', deviceCode: null, message: 'در حال انجام عملیات GitHub…' });
    try { await work(op); }
    catch (error) {
      if (op.epoch === this.epoch) {
        if (['watch', 'sync', 'branch', 'prepare', 'project'].includes(kind)) this.revokeWatch();
        this.update({ status: 'error', message: safeError(error.message), deviceCode: null });
      }
    } finally {
      if (this.operation === op) {
        this.operation = null;
        this.update(this.state.status === 'working'
          ? { status: this.state.preview ? 'preview' : this.watch ? 'watching' : 'ready', message: 'اجازه داده نشد؛ مرحلهٔ بعدی اجرا نشد.' } : {});
      }
      this.schedule();
    }
    return this.snapshot();
  }

  async git(op, args, folder, options = {}) {
    this.assert(op);
    const result = await this.tools.git(args, folder, options);
    this.assert(op);
    if (result.stopWarning) this.update({ stopWarning: result.stopWarning });
    if (result.error || (result.code !== 0 && !options.allowFailure)) throw new Error(result.error || safeError(result.stderr || result.stdout || 'فرمان Git انجام نشد.'));
    return result;
  }

  async gh(op, args, options = {}) {
    this.assert(op);
    const result = await this.tools.gh(args, options);
    this.assert(op);
    if (result.stopWarning) this.update({ stopWarning: result.stopWarning });
    if (result.error || (result.code !== 0 && !options.allowFailure)) throw new Error(result.error || safeError(result.stderr || result.stdout || 'درخواست GitHub انجام نشد.'));
    return result;
  }

  async consent(op, message, detail, button = 'می‌پذیرم؛ ادامه') {
    this.assert(op);
    const result = await this.dialog.showMessageBox(this.getWindow(), { type: 'warning', title: 'Arena Desktop / GitHub',
      message, detail, buttons: [button, 'لغو'], defaultId: 1, cancelId: 1, noLink: true });
    this.assert(op);
    return result.response === 0;
  }

  async ensureTools(op) {
    const dependencies = await this.tools.detect();
    this.assert(op);
    this.update({ dependencies, checked: true });
    if (!dependencies.git || !dependencies.gh) throw new Error('Git و GitHub CLI باید روی همین سیستم نصب باشند. از پیوندهای رسمی پنل نصب کنید؛ سپس «بررسی اتصال» را بزنید.');
  }

  async account(op, optional = false) {
    const result = await this.gh(op, ['api', '--hostname', 'github.com', 'user', '--jq', '{login: .login, id: .id}'], { timeoutMs: 25000, allowFailure: optional });
    if (result.code !== 0) { this.update({ account: null }); return null; }
    const account = JSON.parse(result.stdout);
    repository(`${account.login}/check`);
    if (!Number.isSafeInteger(account.id) || account.id < 1) throw new Error('پاسخ حساب GitHub معتبر نیست.');
    if (this.state.account && (this.state.account.login !== account.login || this.state.account.id !== account.id)) {
      this.revokeWatch(); this.plan = null; this.update({ repositories: [], preview: null });
    }
    this.update({ account: { login: account.login, id: account.id } });
    return this.state.account;
  }

  check() {
    return this.operationFor('check', async (op) => {
      await this.ensureTools(op);
      const account = await this.account(op, true);
      this.update({ status: account ? 'ready' : 'disconnected', message: account
        ? `حساب ${account.login} متصل است. توکن فقط در ابزار رسمی gh استفاده می‌شود و به چت فرستاده نمی‌شود.`
        : 'ورود GitHub تأیید نشد. «ورود در مرورگر» را بزنید؛ اتصال اینترنت را نیز بررسی کنید.' });
    });
  }

  login() {
    return this.operationFor('login', async (op) => {
      this.revokeWatch(); this.plan = null; this.update({ preview: null });
      await this.ensureTools(op);
      if (!await this.consent(op, 'ورود رسمی GitHub CLI در مرورگر باز می‌شود.',
        'مجوزهای حساب را در github.com بررسی کنید. رمز/توکن را در Arena یا این پنل وارد نکنید. gh ممکن است اعتبارنامه را در credential store یا فایل تنظیمات خودش نگه دارد؛ برنامه کپی جداگانه‌ای ذخیره نمی‌کند. این ورود، اتصال GitHub داخل خود Arena نیست.')) {
        this.update({ status: 'disconnected', message: 'ورود لغو شد.' }); return;
      }
      this.update({ message: 'کد یک‌بارمصرف زیر را فقط در github.com/login/device وارد و ورود را در مرورگر تکمیل کنید.' });
      await this.gh(op, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], {
        timeoutMs: 10 * 60 * 1000, input: '\n', onDeviceCode: (deviceCode) => {
          if (op.epoch === this.epoch && this.state.deviceCode !== deviceCode) this.update({ deviceCode });
        },
      });
      const account = await this.account(op);
      this.update({ status: 'ready', deviceCode: null, message: `حساب ${account.login} متصل شد؛ اکنون مخزن را انتخاب کنید.` });
    });
  }

  list() {
    return this.operationFor('list', async (op) => {
      await this.ensureTools(op);
      const account = await this.account(op);
      const result = await this.gh(op, ['repo', 'list', account.login, '--limit', '100', '--json', 'nameWithOwner,url,description,isPrivate,defaultBranchRef']);
      const data = JSON.parse(result.stdout);
      if (!Array.isArray(data)) throw new Error('فهرست مخزن‌ها معتبر نیست.');
      const repositories = data.slice(0, 100).map((item) => ({ fullName: repository(item.nameWithOwner).fullName,
        description: String(item.description || '').slice(0, 500), isPrivate: item.isPrivate === true,
        branch: item.defaultBranchRef?.name ? branchName(item.defaultBranchRef.name) : '' }));
      this.update({ repositories, status: 'ready', message: 'تا ۱۰۰ مخزن حساب فهرست شد؛ برای مخزن مشترک یا مخزن دیگر آدرس مستقیم را وارد کنید.' });
    });
  }

  async pick(op, title) {
    const result = await this.dialog.showOpenDialog(this.getWindow(), { title, properties: ['openDirectory'] });
    this.assert(op);
    if (result.canceled || result.filePaths.length !== 1) return null;
    const folder = fs.realpathSync.native(result.filePaths[0]);
    if (!fs.statSync(folder).isDirectory() || /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(folder)) throw new Error('مسیر پوشه معتبر نیست.');
    return folder;
  }

  chooseParent() {
    return this.operationFor('folder', async (op) => {
      const parent = await this.pick(op, 'انتخاب پوشهٔ والد برای دانلود مخزن');
      if (parent) this.update({ parent, status: 'ready', message: 'مخزن در یک زیرپوشهٔ تازه دانلود می‌شود؛ پوشهٔ موجود جایگزین نمی‌شود.' });
    });
  }

  async inspect(op, folder) {
    if (!samePath(fs.realpathSync.native(folder), folder) || !fs.statSync(folder).isDirectory()) throw new Error('مسیر پروژه تغییر کرده است.');
    const root = await this.git(op, ['rev-parse', '--show-toplevel'], folder, { allowFailure: true });
    if (root.code !== 0) {
      if (fs.existsSync(path.join(folder, '.git'))) throw new Error('ساختار Git این پوشه معتبر نیست؛ چیزی بازنویسی نمی‌شود.');
      return { folder, repo: null, branch: '', head: null, dirty: true, isGit: false };
    }
    if (!samePath(fs.realpathSync.native(root.stdout.trim()), folder)) throw new Error('پوشه باید ریشهٔ دقیق پروژه باشد؛ پوشهٔ داخل یک مخزن دیگر پذیرفته نمی‌شود.');
    const remote = await this.git(op, ['remote', 'get-url', 'origin'], folder, { allowFailure: true });
    const branch = await this.git(op, ['symbolic-ref', '--quiet', '--short', 'HEAD'], folder, { allowFailure: true });
    const head = await this.git(op, ['rev-parse', '--verify', 'HEAD'], folder, { allowFailure: true });
    const status = await this.git(op, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], folder);
    return { folder, repo: remote.code === 0 ? repository(remote.stdout.trim(), true) : null,
      branch: branch.code === 0 ? branchName(branch.stdout.trim()) : '', head: head.code === 0 && oid(head.stdout.trim()) ? head.stdout.trim() : null,
      dirty: Boolean(status.stdout), isGit: true };
  }

  setProject(op, project) {
    this.assert(op);
    this.revokeWatch(); this.plan = null;
    this.onProject(project);
    this.update({ project, branches: [], preview: null, lastSync: null });
  }

  chooseProject() {
    return this.operationFor('project', async (op) => {
      await this.ensureTools(op);
      const folder = await this.pick(op, 'انتخاب ریشهٔ پروژهٔ آماده یا مخزن محلی');
      if (!folder) return;
      this.setProject(op, await this.inspect(op, folder));
      this.update({ status: 'ready', message: 'پروژه انتخاب و به پنل ترمینال AI متصل شد. برای پروژهٔ محلی می‌توانید انتشار خصوصی را آماده کنید.' });
    });
  }

  clone(payload) {
    return this.operationFor('clone', async (op) => {
      const repo = repository(payload?.repository);
      await this.ensureTools(op); await this.account(op);
      const parent = this.state.parent;
      if (!parent || !samePath(fs.realpathSync.native(parent), parent)) throw new Error('ابتدا پوشهٔ والد دانلود را انتخاب کنید.');
      let branch = payload?.branch || '';
      if (branch) branch = branchName(branch);
      else {
        const info = JSON.parse((await this.gh(op, ['repo', 'view', repo.fullName, '--json', 'defaultBranchRef'])).stdout);
        branch = branchName(info.defaultBranchRef?.name);
      }
      const target = path.join(parent, folderName(repo.fullName.split('/')[1]));
      if (fs.existsSync(target) || (() => { try { fs.lstatSync(target); return true; } catch { return false; } })()) throw new Error('پوشهٔ مقصد از قبل وجود دارد؛ والد دیگری انتخاب یا همان پروژه را با «پروژهٔ محلی» باز کنید.');
      if (!await this.consent(op, 'دانلود مخزن در یک پروژهٔ محلی تازه؟', `${repo.url}\nشاخه: ${branch}\nمقصد: ${target}\n\nکد فقط دانلود می‌شود؛ نصب وابستگی یا اجرای پروژه خودکار نیست. مخزن فرعی و Git LFS خودکار دریافت نمی‌شوند. به کد مخزن اعتماد کنید.`, 'دانلود همین مخزن')) return;
      if (!samePath(fs.realpathSync.native(parent), parent) || fs.existsSync(target)) throw new Error('مقصد هنگام دریافت اجازه تغییر کرد.');
      await this.git(op, ['clone', '--no-recurse-submodules', '--single-branch', '--branch', branch, '--', repo.cloneUrl, target], parent);
      this.setProject(op, await this.inspect(op, fs.realpathSync.native(target)));
      this.update({ status: 'ready', message: 'مخزن دانلود شد؛ می‌توانید کار را با Agent ادامه دهید یا دریافت خودکار را روشن کنید.' });
    });
  }

  async boundProject(op, expected = this.state.project, clean = false) {
    if (!expected?.isGit || !expected.repo || !expected.branch || !expected.head) throw new Error('ابتدا یک مخزن GitHub با commit و شاخهٔ محلی مشخص انتخاب یا منتشر کنید.');
    const current = await this.inspect(op, expected.folder);
    if (!current.repo || current.repo.fullName.toLowerCase() !== expected.repo.fullName.toLowerCase() || current.branch !== expected.branch) throw new Error('مخزن یا شاخهٔ پروژه تغییر کرده است؛ پروژه را دوباره انتخاب کنید.');
    this.update({ project: current });
    if (clean && current.dirty) throw new Error('دریافت متوقف شد: پروژه تغییر محلی یا فایل ثبت‌نشده دارد. ابتدا آن‌ها را بررسی و commit کنید؛ برنامه reset، stash یا بازنویسی اجباری نمی‌کند.');
    return current;
  }

  listBranches() {
    return this.operationFor('branches', async (op) => {
      const project = await this.boundProject(op);
      const response = await this.gh(op, ['api', '--hostname', 'github.com', `repos/${project.repo.fullName}/branches?per_page=100`, '--jq', '.[].name']);
      const branches = response.stdout.split(/\r?\n/).filter(Boolean).slice(0, 100).map(branchName);
      this.update({ branches, status: 'ready', message: 'تا ۱۰۰ شاخه فهرست شد؛ شاخهٔ کاری Agent را انتخاب کنید. شاخهٔ دیگری را نیز می‌توانید با نام دقیق وارد کنید.' });
    });
  }

  selectBranch(payload) {
    return this.operationFor('branch', async (op) => {
      const branch = branchName(payload?.branch);
      const before = await this.boundProject(op, this.state.project, true);
      if (branch === before.branch) { await this.synchronize(op); return; }
      if (!await this.consent(op, 'پروژهٔ تمیز به شاخهٔ انتخابی Agent تغییر کند؟',
        `${before.repo.url}\n${before.folder}\nاز: ${before.branch}\nبه: ${branch}\n\nشاخه دریافت می‌شود و فقط بدون تغییر محلی و بدون بازنویسی اجباری checkout/fast-forward انجام می‌شود. تغییر شاخه می‌تواند فایل‌های ثبت‌شده را عوض/حذف کند. هیچ کدی اجرا نمی‌شود. شاخهٔ دارای commit واگرا پذیرفته نمی‌شود. مجوز دریافت خودکار قبلی باطل می‌شود.`, 'انتخاب همین شاخه')) return;
      this.revokeWatch(); this.plan = null; this.update({ preview: null });
      await this.git(op, ['fetch', '--no-tags', '--no-recurse-submodules', '--', before.repo.cloneUrl, `refs/heads/${branch}`], before.folder);
      const target = (await this.git(op, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], before.folder)).stdout.trim();
      if (!oid(target)) throw new Error('commit شاخهٔ دریافت‌شده معتبر نیست.');
      const current = await this.boundProject(op, before, true);
      if (current.head !== before.head) throw new Error('HEAD هنگام انتخاب شاخه تغییر کرد؛ متوقف شد.');
      const local = await this.git(op, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], before.folder, { allowFailure: true });
      if (local.code === 0) {
        const head = local.stdout.split(/\s/)[0];
        if (!oid(head) || (await this.git(op, ['merge-base', '--is-ancestor', head, target], before.folder, { allowFailure: true })).code !== 0) throw new Error('این شاخه commit محلی واگرا دارد؛ reset یا force انجام نمی‌شود.');
      } else if (local.code === 1) await this.git(op, ['branch', '--', branch, target], before.folder);
      else throw new Error('بررسی شاخهٔ محلی انجام نشد.');
      await this.git(op, ['switch', '--no-guess', '--no-overwrite-ignore', '--', branch], before.folder);
      const switched = await this.inspect(op, before.folder);
      if (switched.branch !== branch || switched.repo?.fullName !== before.repo.fullName) throw new Error('شاخه/مخزن هنگام checkout تغییر کرد؛ وضعیت پروژه را بررسی کنید.');
      this.setProject(op, switched);
      await this.git(op, ['merge', '--ff-only', '--no-overwrite-ignore', target], before.folder);
      this.setProject(op, await this.inspect(op, before.folder));
      this.update({ status: 'ready', message: 'شاخهٔ Agent انتخاب و دریافت شد؛ برای دنبال‌کردن commitهای بعدی، دریافت خودکار را روشن کنید.' });
    });
  }

  async synchronize(op) {
    const expected = op.watch?.project || this.state.project;
    const before = await this.boundProject(op, expected, true);
    this.update({ message: 'در حال بررسی شاخهٔ انتخابی GitHub؛ فقط fast-forward مجاز است…' });
    await this.git(op, ['fetch', '--no-tags', '--no-recurse-submodules', '--', before.repo.cloneUrl, `refs/heads/${before.branch}`], before.folder);
    const target = (await this.git(op, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], before.folder)).stdout.trim();
    if (!oid(target)) throw new Error('شناسهٔ commit دریافت‌شده معتبر نیست.');
    const current = await this.boundProject(op, expected, true);
    if (current.head !== before.head) throw new Error('HEAD هنگام دریافت تغییر کرد؛ برای حفظ تغییرات، دریافت متوقف شد.');
    const ancestor = await this.git(op, ['merge-base', '--is-ancestor', current.head, target], current.folder, { allowFailure: true });
    if (ancestor.code !== 0) throw new Error('شاخه‌ها واگرا هستند یا commit محلیِ منتشرنشده دارید؛ هیچ reset یا merge خودکاری انجام نشد.');
    if (target !== current.head) await this.git(op, ['merge', '--ff-only', '--no-overwrite-ignore', target], current.folder);
    const project = await this.boundProject(op, expected, true);
    this.onProject(project);
    this.update({ project, lastSync: this.now(), status: this.watch ? 'watching' : 'ready',
      message: target === current.head ? 'نسخهٔ محلی با شاخهٔ GitHub یکسان است.' : `تغییرات GitHub دریافت شد: ${project.head.slice(0, 12)}. هیچ کدی اجرا نشد.` });
  }

  sync() { return this.operationFor('sync', (op) => this.synchronize(op)); }

  startWatch() {
    return this.operationFor('watch-start', async (op) => {
      const project = await this.boundProject(op, this.state.project, true);
      const pinnedUrl = this.getSiteUrl();
      if (!isTerminalSiteUrl(pinnedUrl)) throw new Error('ابتدا صفحهٔ گفتگو/Agent را در Arena باز کنید.');
      if (!await this.consent(op, 'دریافت خودکار commitهای همین مخزن و شاخه فعال شود؟',
        `${project.repo.url}\nشاخه: ${project.branch}\nپوشه: ${project.folder}\n\nهر ۳۰ ثانیه، حداکثر یک ساعت یا تا توقف/تغییر پروژه، گفتگو یا خروج. commitهای جدید می‌توانند فایل‌های ثبت‌شده را اضافه/تغییر/حذف کنند. فقط fast-forward روی پروژهٔ تمیز انجام می‌شود. تغییر محلی، واگرایی یا خطا دریافت را متوقف می‌کند. کد دانلودشده اجرا نمی‌شود. این مجوز، اجازهٔ انتشار یا اجرای ترمینال نیست.`, 'مجوز دریافت خودکار همین شاخه')) return;
      if (this.getSiteUrl() !== pinnedUrl) throw new Error('گفتگو هنگام دریافت مجوز تغییر کرد.');
      await this.boundProject(op, project, true);
      this.revokeWatch();
      this.watch = { project, pinnedUrl, expiresAt: this.now() + WATCH_MS };
      const grant = this.watch;
      this.expiryTimer = setTimeout(() => { if (this.watch === grant) void this.stopWatch('مهلت یک‌ساعتهٔ دریافت خودکار تمام شد.'); }, WATCH_MS);
      this.expiryTimer.unref?.();
      this.update({ status: 'watching', message: 'دریافت خودکار روشن شد. Agent باید commit را در همین شاخه push کند؛ تغییرِ ذخیره‌شده فقط در محیط ابری قابل دریافت نیست.' });
    });
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.autoPoll || !this.watch) return;
    this.timer = setTimeout(() => void this.tick(), POLL_MS); this.timer.unref?.();
  }

  async tick() {
    if (!this.watch) return this.snapshot();
    if (this.now() >= this.watch.expiresAt || this.getSiteUrl() !== this.watch.pinnedUrl) return this.stopWatch('مجوز دریافت خودکار منقضی شد یا گفتگو تغییر کرد.');
    if (this.busy || this.isTerminalActive()) { this.schedule(); return this.snapshot(); }
    return this.operationFor('watch', (op) => this.synchronize(op));
  }

  revokeWatch() { clearTimeout(this.timer); clearTimeout(this.expiryTimer); this.watch = null; }

  async stopWatch(message = 'دریافت خودکار متوقف شد؛ مجوز باطل است.') {
    this.revokeWatch();
    if (this.operation?.kind === 'watch') {
      const stopping = this.cancel(); const epoch = this.epoch; await stopping;
      if (epoch !== this.epoch) return this.snapshot();
    }
    this.update({ status: this.busy ? this.state.status : 'ready', message: this.state.stopWarning || message });
    return this.snapshot();
  }

  async addExcludes(op, folder) {
    const location = (await this.git(op, ['rev-parse', '--git-path', 'info/exclude'], folder)).stdout.trim();
    const file = path.resolve(folder, location);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw new Error('فایل info/exclude پیوند است؛ انتشار خودکار مجاز نیست.');
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!existing.includes('# Arena Desktop local publication excludes')) fs.appendFileSync(file, `\n# Arena Desktop local publication excludes\n${EXCLUDES.join('\n')}\n`);
  }

  async filesForPublish(op, folder) {
    const staged = await this.git(op, ['diff', '--cached', '--quiet'], folder, { allowFailure: true });
    if (staged.code !== 0) throw new Error('index پروژه از قبل تغییر stage‌شده دارد. ابتدا آن را خودتان commit یا بررسی کنید؛ برنامه stageهای شما را مخلوط نمی‌کند.');
    const tracked = splitFiles((await this.git(op, ['ls-files', '-z'], folder)).stdout);
    if (tracked.some(excludedFile)) throw new Error('فایل با نام حساس/خروجی تولیدشده از قبل در Git ثبت شده است؛ قبل از انتشار، فایل‌ها و تاریخچه را خودتان بررسی کنید. برنامه تاریخچه را پاک یا بازنویسی نمی‌کند.');
    const names = splitFiles((await this.git(op, ['ls-files', '--modified', '--deleted', '--others', '--exclude-standard', '-z'], folder)).stdout);
    const allPaths = [...new Set([...tracked, ...names])];
    if (allPaths.length > MAX_FILES) throw new Error('این انتشار بیش از ۲۰۰۰ فایل دارد؛ برای مخزن بزرگ از گردش‌کار Git خودتان استفاده کنید.');
    if (allPaths.length) {
      const attributes = await this.git(op, ['check-attr', '--all', '--stdin', '-z'], folder, { input: Buffer.from(allPaths.join('\0') + '\0') });
      if (attributes.stdout.includes('\0filter\0lfs\0')) throw new Error('انتشار Git LFS در این نسخه پشتیبانی نمی‌شود؛ فایل‌ها و LFS objectها را با ابزار Git/LFS خودتان منتشر کنید.');
    }
    if (names.length > MAX_FILES || names.some((name) => !safeRelative(name) || excludedFile(name))) throw new Error('فهرست انتشار بیش از حد بزرگ یا دارای مسیر حساس/نامعتبر است.');
    const objectFormat = (await this.git(op, ['rev-parse', '--show-object-format'], folder)).stdout.trim();
    if (!['sha1', 'sha256'].includes(objectFormat)) throw new Error('قالب object مخزن پشتیبانی نمی‌شود.');
    const blobHash = (data) => createHash(objectFormat).update(`blob ${data.length}\0`).update(data).digest('hex');
    const entries = [];
    let total = 0;
    for (const name of names) {
      this.assert(op);
      const file = path.resolve(folder, ...name.split('/'));
      let stat;
      try { stat = await fsp.lstat(file); } catch (error) { if (error.code === 'ENOENT') { entries.push({ name, hash: null, size: 0 }); continue; } throw error; }
      const real = await fsp.realpath(file);
      if (!stat.isFile() || stat.isSymbolicLink() || !samePath(real, file)) throw new Error(`پیوند/زیرمخزن یا مسیر غیرعادی برای انتشار خودکار مجاز نیست: ${name}`);
      if (stat.size > MAX_FILE_BYTES || total + stat.size > MAX_TOTAL_BYTES) throw new Error('انتشار این نسخه محدود به ۲۰ MiB برای هر فایل و ۱۰۰ MiB تغییرات است؛ برای فایل بزرگ از گردش‌کار Git/LFS خودتان استفاده کنید.');
      const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      let data;
      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.size > MAX_FILE_BYTES || total + opened.size > MAX_TOTAL_BYTES) throw new Error('اندازهٔ فایل هنگام بررسی تغییر کرد؛ انتشار متوقف شد.');
        const buffer = Buffer.alloc(opened.size + 1);
        let used = 0;
        while (used < buffer.length) {
          this.assert(op);
          const read = await handle.read(buffer, used, buffer.length - used, null);
          if (!read.bytesRead) break;
          used += read.bytesRead;
        }
        if (used !== opened.size) throw new Error('فایل هنگام بررسی تغییر کرد؛ دوباره پیش‌نمایش بگیرید.');
        data = buffer.subarray(0, used);
      } finally { await handle.close(); }
      if (data.length > MAX_FILE_BYTES || total + data.length > MAX_TOTAL_BYTES) throw new Error('اندازهٔ فایل هنگام بررسی تغییر کرد؛ انتشار متوقف شد.');
      this.assert(op);
      total += data.length;
      if (sensitiveContent(data)) throw new Error(`احتمال اطلاعات حساس در ${name}؛ قبل از انتشار بررسی کنید. مقدار حساس به چت ارسال نشد.`);
      const lfData = Buffer.from(data.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
      entries.push({ name, hash: createHash('sha256').update(data).digest('hex'), size: data.length, blob: blobHash(data), lfBlob: blobHash(lfData) });
    }
    return { entries, total };
  }

  preparePublish(payload) {
    return this.operationFor('prepare', async (op) => {
      this.plan = null; this.revokeWatch(); this.update({ preview: null });
      await this.ensureTools(op); const account = await this.account(op);
      const selected = this.state.project;
      if (!selected) throw new Error('ابتدا پروژهٔ محلی را انتخاب کنید.');
      let project = await this.inspect(op, selected.folder);
      if (!project.isGit) {
        if (!await this.consent(op, 'برای این پوشه Git محلی ساخته شود؟',
          `${project.folder}\n\nفقط پوشهٔ .git ساخته می‌شود. الگوهای متداول اسرار و فایل‌های تولیدشده به info/exclude محلی اضافه می‌شوند؛ فایل‌های پروژه و .gitignore بازنویسی نمی‌شوند. در مرحلهٔ بعد فهرست انتشار را می‌بینید؛ هنوز چیزی روی GitHub آپلود نمی‌شود.`, 'ایجاد Git و پیش‌نمایش')) return;
        await this.git(op, ['init', '--initial-branch=main', '--', '.'], project.folder);
        project = await this.inspect(op, project.folder);
      }
      if (!project.branch) throw new Error('HEAD جداشده است؛ ابتدا یک شاخهٔ محلی انتخاب کنید.');
      await this.addExcludes(op, project.folder);
      const files = await this.filesForPublish(op, project.folder);
      if (!project.head && files.entries.length === 0) throw new Error('فایل قابل انتشار در پروژه پیدا نشد.');
      const repo = project.repo || repository(`${account.login}/${payload?.name || folderName(path.basename(project.folder))}`);
      let isPrivate = true;
      if (project.repo) {
        const info = JSON.parse((await this.gh(op, ['repo', 'view', repo.fullName, '--json', 'nameWithOwner,isPrivate'])).stdout);
        if (repository(info.nameWithOwner).fullName.toLowerCase() !== repo.fullName.toLowerCase() || typeof info.isPrivate !== 'boolean') throw new Error('مخزن تغییر نام/مالک داده است؛ دوباره آن را انتخاب کنید.');
        isPrivate = info.isPrivate;
      }
      const message = typeof payload?.message === 'string' && payload.message.trim() ? payload.message.trim() : 'Continue project with Arena Desktop';
      if (message.length > 1000 || /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/.test(message)) throw new Error('پیام commit معتبر نیست.');
      this.plan = { project, repo, isPrivate, create: !project.repo, account, files: files.entries, message };
      this.onProject(project);
      this.update({ project, status: 'preview', preview: { repository: repo.fullName, branch: project.branch,
        isPrivate, create: !project.repo, files: files.entries.map((entry) => entry.name), bytes: files.total, hasHistory: Boolean(project.head) },
      message: 'پیش‌نمایش آماده است؛ فهرست فایل‌ها، مقصد و تاریخچه را بررسی کنید. هنوز چیزی آپلود نشده است. بررسی اسرار ناقص است و همهٔ اطلاعات حساس را تشخیص نمی‌دهد.' });
    });
  }

  publish() {
    return this.operationFor('publish', async (op) => {
      const plan = this.plan;
      if (!plan) throw new Error('ابتدا پیش‌نمایش انتشار را آماده کنید.');
      const detail = `${plan.repo.url}\nشاخه: ${plan.project.branch}\n${plan.isPrivate ? 'مخزن خصوصی' : 'هشدار: مخزن عمومی است'}\nپوشه: ${plan.project.folder}\n\n${plan.files.length} فایل جدید/تغییریافته/حذف‌شده:\n${plan.files.slice(0, 60).map((entry) => entry.name).join('\n')}${plan.files.length > 60 ? '\n… فهرست کامل در پنل است.' : ''}\n\nفایل‌ها stage و در صورت نیاز commit بدون امضا با هویت حساب متصل ساخته می‌شوند. تمام تاریخچهٔ موجود همراه push قابل ارسال است، نه فقط فایل‌های این فهرست. تشخیص اسرار ناقص است؛ به مخزن خصوصی هم اطلاعات ورود/کلید نفرستید. ساخت مخزن/commit و ارسال انجام‌شده rollback نمی‌شود. هیچ force-push یا بازنویسی origin انجام نمی‌شود.`;
      if (!await this.consent(op, 'انتشار همین پروژه و تاریخچه در GitHub؟', detail, 'انتشار در همین مخزن و شاخه')) return;
      const account = await this.account(op);
      if (account.login !== plan.account.login || account.id !== plan.account.id) throw new Error('حساب GitHub تغییر کرده است؛ پیش‌نمایش تازه بگیرید.');
      const project = await this.inspect(op, plan.project.folder);
      if (project.head !== plan.project.head || project.branch !== plan.project.branch
        || project.repo?.fullName !== plan.project.repo?.fullName) throw new Error('وضعیت مخزن تغییر کرده است؛ پیش‌نمایش تازه بگیرید.');
      const current = await this.filesForPublish(op, project.folder);
      if (JSON.stringify(current.entries) !== JSON.stringify(plan.files)) throw new Error('فایل‌ها پس از پیش‌نمایش تغییر کرده‌اند؛ چیزی stage/push نشد. پیش‌نمایش تازه بگیرید.');
      this.revokeWatch(); this.plan = null; this.update({ preview: null });
      if (plan.files.length) {
        const input = Buffer.from(plan.files.map((entry) => entry.name).join('\0') + '\0');
        await this.git(op, ['add', '--all', '--pathspec-from-file=-', '--pathspec-file-nul'], project.folder, { input });
        const staged = splitFiles((await this.git(op, ['diff', '--cached', '--name-only', '-z', '--no-renames'], project.folder)).stdout).sort();
        if (JSON.stringify(staged) !== JSON.stringify(plan.files.map((entry) => entry.name).sort())) throw new Error('index هنگام آماده‌سازی تغییر کرد؛ برای جلوگیری از commit ناخواسته متوقف شد. stageها باقی هستند؛ آن‌ها را بررسی کنید.');
        const index = (await this.git(op, ['ls-files', '--stage', '-z'], project.folder)).stdout.split('\0').filter(Boolean);
        const stagedEntries = new Map(index.map((line) => {
          const match = line.match(/^(\d{6}) ([a-f0-9]{40,64}) (\d)\t(.*)$/);
          if (!match || match[3] !== '0') throw new Error('index هنگام بررسی تغییر کرد؛ stageها را خودتان بررسی کنید.');
          return [match[4], { mode: match[1], oid: match[2] }];
        }));
        for (const file of plan.files) {
          const item = stagedEntries.get(file.name);
          if (file.hash === null ? Boolean(item) : !item || !['100644', '100755'].includes(item.mode) || ![file.blob, file.lfBlob].includes(item.oid))
            throw new Error('محتوای stage با پیش‌نمایش برابر نیست (تغییر هم‌زمان/فیلتر Git). هیچ commit/push انجام نشد؛ stageها را بررسی کنید.');
        }
        await this.git(op, ['-c', `user.name=${account.login}`, '-c', `user.email=${account.id}+${account.login}@users.noreply.github.com`,
          'commit', '--no-gpg-sign', '-m', plan.message], project.folder);
      }
      const beforePush = await this.inspect(op, project.folder);
      if (beforePush.branch !== project.branch || beforePush.repo?.fullName !== project.repo?.fullName || !beforePush.head) throw new Error('مخزن یا شاخه قبل از push تغییر کرد؛ commit محلی را بررسی کنید.');
      if (plan.create) {
        await this.gh(op, ['repo', 'create', plan.repo.fullName, '--private']);
        await this.git(op, ['remote', 'add', 'origin', plan.repo.cloneUrl], project.folder);
      }
      await this.git(op, ['push', '--porcelain', '--no-follow-tags', '--', plan.repo.cloneUrl, `HEAD:refs/heads/${project.branch}`], project.folder);
      this.setProject(op, await this.inspect(op, project.folder));
      this.update({ status: 'ready', message: 'پروژه در GitHub منتشر شد. برای ادامه، «ادامه با Agent» را بزنید؛ مخزن خصوصی را در اتصال رسمی Arena نیز انتخاب کنید.' });
    });
  }

  handoff(payload) {
    return this.operationFor('handoff', async (op) => {
      op.pinnedUrl = this.getSiteUrl();
      if (!isTerminalSiteUrl(op.pinnedUrl)) throw new Error('ابتدا گفتگوی Agent را در Arena باز کنید.');
      const project = await this.boundProject(op, this.state.project, true);
      const message = projectMessage(project, payload?.task);
      const remote = await this.git(op, ['ls-remote', '--exit-code', '--', project.repo.cloneUrl, `refs/heads/${project.branch}`], project.folder);
      if (remote.stdout.split(/\s/)[0] !== project.head) throw new Error('نسخهٔ محلی و شاخهٔ GitHub یکسان نیستند؛ ابتدا دریافت یا انتشار را انجام دهید.');
      if (!await this.consent(op, 'درخواست ادامهٔ این پروژه به گفتگوی فعلی Arena فرستاده شود؟',
        `${project.repo.url}\nشاخه: ${project.branch}\n\nدرخواست: ${payload.task}\n\nفقط آدرس، شاخه، commit و درخواست ارسال می‌شوند؛ نه فایل‌های محلی، مسیر کامل یا توکن. این پیام مخزن را به محیط Agent متصل نمی‌کند؛ برای مخزن خصوصی از رابط رسمی Arena اجازه/انتخاب مخزن لازم است.`, 'ارسال درخواست به Agent')) return;
      if (!this.onHandoff) throw new Error('ارسال به گفتگو در دسترس نیست.');
      await this.onHandoff(message, () => this.assert(op));
      this.assert(op);
      this.update({ status: 'ready', message: 'درخواست به همان گفتگو فرستاده شد. بعد از انتخاب مخزن در Agent، دریافت خودکار را روشن کنید تا commitهای pushشده به این پروژه برسند.' });
    });
  }

  onNavigation(url) {
    if (this.watch && this.watch.pinnedUrl !== url) void this.stopWatch('گفتگو تغییر کرد؛ مجوز دریافت خودکار باطل شد.');
    if (this.operation?.kind === 'handoff' && this.operation.pinnedUrl !== url) void this.cancel();
  }
  onDocumentChange() {
    if (this.watch) void this.stopWatch('صفحه دوباره بارگذاری/قطع شد؛ دریافت خودکار متوقف است.');
    if (this.operation?.kind === 'handoff') void this.cancel();
  }

  async cancel() {
    this.revokeWatch(); const epoch = ++this.epoch; this.operation = null; this.plan = null;
    this.update({ status: 'stopping', deviceCode: null, preview: null, message: 'عملیات و دریافت خودکار لغو شدند؛ فایل، commit یا مخزن ساخته‌شده خودکار حذف نمی‌شود.' });
    const result = await this.tools.stop();
    if (epoch === this.epoch) this.update({ status: this.busy ? 'stopping' : 'ready', stopWarning: result?.stopWarning || null, message: result?.stopWarning || this.state.message });
    return this.snapshot();
  }

  dispose() { this.tools.dispose?.(); }

  handle(action, payload) {
    switch (action) {
      case 'check': return this.check();
      case 'login': return this.login();
      case 'repositories': return this.list();
      case 'choose-parent': return this.chooseParent();
      case 'clone': return this.clone(payload);
      case 'choose-project': return this.chooseProject();
      case 'branches': return this.listBranches();
      case 'select-branch': return this.selectBranch(payload);
      case 'sync': return this.sync();
      case 'watch': return this.startWatch();
      case 'stop-watch': return this.stopWatch();
      case 'prepare-publish': return this.preparePublish(payload);
      case 'publish': return this.publish();
      case 'handoff': return this.handoff(payload);
      case 'cancel': return this.cancel();
      default: throw new Error('عمل GitHub مجاز نیست.');
    }
  }
}

module.exports = { GitHubProjects };
