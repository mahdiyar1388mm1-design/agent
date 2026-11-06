'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isTerminalSiteUrl } = require('./policy.cjs');
const { PowerShellRunner } = require('./powershell-runner.cjs');
const { adapterScript } = require('./site-adapter.cjs');
const { MAX_STEPS, readRequest, initialMessage, previewOutput, resultMessage, outputReviewReasons } = require('./terminal-protocol.cjs');
const { SESSION_LIFETIME_MS, requestedPermissions, commandReviewReasons, permissionSummary } = require('./session-permissions.cjs');

const ISOLATED_WORLD = 1101;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TerminalAgent {
  constructor(options) {
    this.getWindow = options.getWindow;
    this.getContents = options.getContents;
    this.dialog = options.dialog;
    this.onUpdate = options.onUpdate || (() => {});
    this.runner = options.runner || new PowerShellRunner();
    this.siteOverride = options.site;
    this.sleep = options.sleep || delay;
    this.now = options.now || Date.now;
    this.autoPoll = options.autoPoll !== false;
    this.folder = '';
    this.projectContext = null;
    this.session = null;
    this.epoch = 0;
    this.revision = 0;
    this.timer = null;
    this.expiryTimer = null;
    this.polling = false;
    this.stable = '';
    this.state = { status: 'off', message: 'اتصال ترمینال غیرفعال است.', pending: null, result: null, shareText: '', reviewReasons: [] };
  }

  get busy() { return this.runner.running || ['starting', 'confirming'].includes(this.state.status); }

  snapshot() {
    return { ...this.state, reviewReasons: [...this.state.reviewReasons],
      pending: this.state.pending ? { ...this.state.pending } : null,
      result: this.state.result ? { ...this.state.result } : null,
      folder: this.folder, project: this.projectContext ? { ...this.projectContext } : null, session: this.session?.id || null, busy: this.busy,
      autoExecute: this.session?.permissions?.autoExecute === true,
      autoShare: this.session?.permissions?.autoShare === true,
      expiresAt: this.session?.expiresAt || null,
      seq: this.session?.seq || 0, revision: this.revision, supported: this.runner.supported };
  }

  update(patch) {
    this.state = { ...this.state, ...patch };
    this.revision += 1;
    this.onUpdate(this.snapshot());
  }

  currentUrl() {
    const contents = this.getContents();
    return contents && !contents.isDestroyed() ? contents.getURL() : '';
  }

  ensureUnexpired() {
    if (this.session?.expiresAt && this.now() >= this.session.expiresAt) {
      const message = 'مجوز ۳۰ دقیقه‌ای این جلسه پایان یافت؛ برای ادامه جلسهٔ تازه شروع کنید.';
      this.pause(message);
      throw new Error(message);
    }
  }

  async site(action, text) {
    this.ensureUnexpired();
    const contents = this.getContents();
    if (!contents || contents.isDestroyed() || !isTerminalSiteUrl(contents.getURL())) {
      throw new Error('ابتدا یک گفتگوی دارای کادر پیام یکتا در خود سایت Arena باز کنید.');
    }
    if (this.session?.pinnedUrl && contents.getURL() !== this.session.pinnedUrl) {
      throw new Error('گفتگو تغییر کرده است؛ اتصال را قطع و دوباره شروع کنید.');
    }
    if (this.siteOverride) return this.siteOverride(action, text);
    let timer;
    try {
      return await Promise.race([
        contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: adapterScript(action, text) }]),
        new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('صفحه پاسخ نداد؛ اتصال متوقف شد.')), 7000); }),
      ]);
    } finally { clearTimeout(timer); }
  }

  async chooseFolder() {
    if (this.session || this.busy) throw new Error('قبل از تغییر پوشه، اتصال فعلی را قطع کنید.');
    const result = await this.dialog.showOpenDialog(this.getWindow(), {
      title: 'انتخاب پوشهٔ پروژه برای PowerShell', properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length !== 1) return this.snapshot();
    const folder = fs.realpathSync(result.filePaths[0]);
    if (!fs.statSync(folder).isDirectory()) throw new Error('پوشهٔ انتخاب‌شده معتبر نیست.');
    this.folder = folder;
    this.projectContext = null;
    this.update({ status: 'ready', message: 'پوشه انتخاب شد. یک گفتگو با کادر پیام یکتا در Arena باز کنید.' });
    return this.snapshot();
  }

  attachProject(project) {
    if (this.session || this.busy) throw new Error('ابتدا جلسهٔ ترمینال AI را قطع کنید.');
    const folder = fs.realpathSync(project.folder);
    if (!fs.statSync(folder).isDirectory()) throw new Error('پوشهٔ پروژه معتبر نیست.');
    this.folder = folder;
    this.projectContext = project.repo ? { url: project.repo.url, branch: project.branch } : null;
    this.update({ status: 'ready', pending: null, result: null, shareText: '', reviewReasons: [], message: 'پروژهٔ GitHub/محلی انتخاب شد؛ می‌توانید با ترمینال AI ادامه دهید.' });
  }

  async sendProjectMessage(message, guard) {
    const url = this.currentUrl();
    const verify = () => {
      guard();
      if (this.session || this.busy || this.currentUrl() !== url || !isTerminalSiteUrl(url)) throw new Error('گفتگو تغییر کرده یا ترمینال فعال است؛ ارسال متوقف شد.');
    };
    verify();
    const snapshot = await this.site('snapshot');
    verify();
    if (snapshot.diagnostic !== 'ready' || snapshot.busy || snapshot.offline) throw new Error('کادر پیام یکتا، خالی و آمادهٔ Agent/چت لازم است.');
    const prepared = await this.site('prepare', message);
    verify();
    if (!prepared.ok) throw new Error(this.adapterError(prepared.reason));
    await this.sendPrepared(message, verify);
  }

  async sendPrepared(message, verify) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await this.sleep(200); verify();
      const sent = await this.site('send', message); verify();
      if (sent.ok) {
        if (sent.reason === 'clicked' && sent.accepted !== true) {
          for (let check = 0; check < 18; check += 1) {
            await this.sleep(200); verify();
            const accepted = await this.site('confirm-send', message); verify();
            if (accepted.ok) return;
            if (accepted.reason !== 'send-pending') throw new Error(this.adapterError(accepted.reason));
          }
          throw new Error('روی ارسال کلیک شد ولی سایت پیام را نپذیرفت؛ پیام در پیش‌نویس باقی است. برای جلوگیری از ارسال تکراری دوباره کلیک نکردیم. کادر/مدل انتخابی و اتصال سایت را بررسی کنید.');
        }
        return;
      }
      if (sent.reason !== 'send-disabled') throw new Error(this.adapterError(sent.reason));
    }
    throw new Error('دکمهٔ ارسال سایت فعال نشد؛ پیام ارسال نشده و پیش‌نویس حفظ شده است. مدل/حالت چت و اتصال سایت را بررسی کنید.');
  }

  async start(payload) {
    if (!this.runner.supported) throw new Error('این قابلیت برای PowerShell روی Windows ساخته شده است.');
    if (this.session || this.busy) throw new Error('ابتدا جلسهٔ قبلی را قطع کنید.');
    if (!this.folder) throw new Error('ابتدا پوشهٔ پروژه را انتخاب کنید.');
    // These are local UI requests, not grants. Only the native consent below can
    // authorize them. Model JSON and subsequent action payloads cannot set grants.
    const permissions = requestedPermissions(payload);
    const id = randomUUID();
    const context = this.projectContext ? `\n\nSelected GitHub project: ${this.projectContext.url}\nExact branch: ${JSON.stringify(this.projectContext.branch)}. Do not force-push, merge PRs or change branches without an explicit user request. GitHub authentication belongs to the installed gh CLI; never read/print tokens or credential files. A cloud Agent uses its own repository integration, not this local folder.\n` : '';
    const message = initialMessage(id, path.basename(this.folder), payload?.task, permissions) + context;
    const epoch = ++this.epoch;
    const startUrl = this.currentUrl();
    this.session = { id, seq: 1, pinnedUrl: null, startUrl, initialPosting: false,
      permissions: null, expiresAt: null, lastActivity: this.now() };
    this.update({ status: 'starting', message: 'در انتظار اجازهٔ شروع…', pending: null, result: null, shareText: '', reviewReasons: [], stopWarning: null });
    try {
      const diagnostic = await this.site('snapshot');
      if (epoch !== this.epoch) return this.snapshot();
      if (diagnostic.diagnostic !== 'ready' || diagnostic.busy) {
        throw new Error(`کادر پیام سازگار پیدا نشد یا مدل مشغول است (${diagnostic.diagnostic}). یک گفتگو با یک کادر ارسال خالی باز کنید؛ حالت دو مدل هم‌زمان پشتیبانی نمی‌شود.`);
      }
      const consent = await this.dialog.showMessageBox(this.getWindow(), {
        type: 'warning', title: 'مجوز همین جلسه برای AI و PowerShell محلی',
        message: 'فرمان‌های مدل/Agent با دسترسی واقعی کاربر Windows اجرا می‌شوند. فقط برای کار و داده‌های مورداعتماد اجازه دهید.',
        detail: `پوشهٔ شروع: ${this.folder}\n\n${permissionSummary(permissions)}\n\nمتن سایت، Agent و مدل قابل اعتماد نیست و می‌تواند فرمان مخرب تولید کند. ارسال خودکار خروجی، اجازه‌ای مستقل از اجرای خودکار است.\n\nاتصال از طریق پیام‌های چت است، نه API رسمی Arena. قابلیت‌های خود Agent و حساب را تغییر نمی‌دهد و سازگاری همیشگی تضمین نمی‌شود.`,
        buttons: ['این مجوزهای جلسه را می‌پذیرم؛ شروع', 'لغو'], defaultId: 1, cancelId: 1, noLink: true,
      });
      if (epoch !== this.epoch) return this.snapshot();
      if (consent.response !== 0) return this.disable();
      if (this.currentUrl() !== startUrl) throw new Error('گفتگو هنگام دریافت مجوز تغییر کرد؛ چیزی ارسال یا اجرا نشد.');
      this.session.permissions = permissions;
      this.session.expiresAt = this.now() + SESSION_LIFETIME_MS;
      this.expiryTimer = setTimeout(() => {
        if (epoch === this.epoch && this.session) this.pause('مجوز ۳۰ دقیقه‌ای این جلسه پایان یافت؛ برای ادامه جلسهٔ تازه شروع کنید.');
      }, SESSION_LIFETIME_MS);
      this.expiryTimer.unref?.();
      // A new chat may acquire its permanent URL as the initial message sends.
      // Once this bootstrap completes, even navigation before request #1 revokes.
      this.session.initialPosting = true;
      await this.post(message, epoch);
      if (epoch !== this.epoch) return this.snapshot();
      this.session.initialPosting = false;
      this.session.pinnedUrl = this.currentUrl();
      this.update({ status: 'waiting', message: 'درخواست فرستاده شد؛ منتظر فرمان ساختاریافتهٔ مدل/Agent هستیم.' });
      this.schedule();
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    }
    return this.snapshot();
  }

  async post(message, epoch) {
    if (epoch !== this.epoch || !this.session) throw new Error('جلسه قطع شده است.');
    const prepared = await this.site('prepare', message);
    if (!prepared.ok) throw new Error(this.adapterError(prepared.reason));
    await this.sendPrepared(message, () => {
      if (epoch !== this.epoch || !this.session) throw new Error('جلسه قطع شده است.');
    });
    this.session.lastActivity = this.now();
  }

  async diagnostics() {
    try { return await this.site('diagnostics'); }
    catch { return { diagnostic: 'page-unavailable', offline: false }; }
  }

  adapterError(reason) {
    if (reason === 'model-busy') return 'مدل هنوز در حال پاسخ است. ابتدا پایان پاسخ یا توقف آن را صبر کنید؛ پیام دیگری ارسال نشد.';
    if (reason === 'composer-count:0') return 'کادر پیام پیدا نشد. وارد Arena شوید، مدل و یک گفتگوی مستقیم/Agent را باز کنید؛ صفحهٔ ورود یا انتخاب پروژه کادر پیام نیست.';
    if (reason?.startsWith('composer-count:')) return 'چند کادر پیام هم‌زمان پیدا شد؛ برای جلوگیری از ارسال به محل اشتباه، فقط یک گفتگوی فعال باز نگه دارید.';
    if (reason?.startsWith('send-button-count:')) return 'دکمهٔ ارسال یکتای همان کادر پیدا نشد. از عیب‌یابی، وضعیت کادر را بررسی کنید؛ ممکن است این حالت رابط پشتیبانی نشود.';
    if (reason === 'draft-present' || reason === 'draft-changed') return 'پیش‌نویس فعلی گفتگو را تغییر نمی‌دهیم. آن را خودتان ارسال/پاک کنید و جلسه را دوباره شروع کنید.';
    return `ارتباط با کادر پیام برقرار نشد (${reason}). ساختار سایت ممکن است تغییر کرده باشد؛ اتصال متوقف شد.`;
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.autoPoll || this.state.status !== 'waiting') return;
    this.timer = setTimeout(() => void this.poll(), 1200);
    this.timer.unref?.();
  }

  async poll() {
    if (this.polling || this.state.status !== 'waiting' || !this.session) return;
    this.polling = true;
    const epoch = this.epoch;
    try {
      this.ensureUnexpired();
      if (this.now() - this.session.lastActivity > 600000) throw new Error('زمان انتظار ۱۰ دقیقه‌ای پایان یافت؛ برای ادامه جلسهٔ تازه شروع کنید.');
      const snapshot = await this.site('snapshot');
      if (epoch !== this.epoch) return;
      if (snapshot.offline || snapshot.diagnostic !== 'ready') throw new Error(`کادر گفتگو آفلاین یا ناسازگار شد (${snapshot.diagnostic})؛ مجوزهای جلسه باطل شدند.`);
      if (snapshot.busy) return;
      const requests = new Map();
      for (const text of Array.isArray(snapshot.blocks) ? snapshot.blocks.slice(-40) : []) {
        const request = readRequest(text, this.session.id, this.session.seq);
        if (request) requests.set(JSON.stringify(request), request);
      }
      if (requests.size > 1) throw new Error('چند درخواست متفاوت پیدا شد؛ اتصال متوقف شد. فقط یک درخواست‌کننده در هر گفتگو پشتیبانی می‌شود.');
      if (requests.size === 0) {
        this.stable = '';
        if (this.now() - this.session.lastActivity > 45000 && this.state.message !== 'هنوز فرمان سازگار از مدل نرسیده است؛ ممکن است مدل فقط ابزار ابری خودش را اجرا کرده یا قرارداد پیام را رعایت نکرده باشد. عیب‌یابی را بررسی کنید.') {
          this.update({ message: 'هنوز فرمان سازگار از مدل نرسیده است؛ ممکن است مدل فقط ابزار ابری خودش را اجرا کرده یا قرارداد پیام را رعایت نکرده باشد. عیب‌یابی را بررسی کنید.' });
        }
        return;
      }
      const [[fingerprint, request]] = requests;
      // Wait for the same complete JSON in two snapshots, not partial streaming text.
      if (this.stable !== fingerprint) { this.stable = fingerprint; return; }
      if (!isTerminalSiteUrl(snapshot.url) || snapshot.url !== this.currentUrl()) throw new Error('صفحه هنگام خواندن درخواست تغییر کرد.');
      const reviewReasons = commandReviewReasons(request.command);
      this.update({ status: 'review', pending: request, reviewReasons,
        message: reviewReasons.length
          ? 'این فرمان به‌دلیل الگوی پرخطر به بررسی دستی نیاز دارد؛ هنوز اجرا نشده است.'
          : 'درخواست فرمان در صفحه پیدا شد؛ متن کامل آن را بررسی کنید. هنوز اجرا نشده است.' });
      if (epoch !== this.epoch) return;
      if (this.session.permissions?.autoExecute && reviewReasons.length === 0) {
        await this.executePending({ session: this.session.id, seq: this.session.seq }, true);
      }
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  check(payload, status) {
    this.ensureUnexpired();
    if (!this.session || this.state.status !== status || !payload || payload.session !== this.session.id
      || payload.seq !== this.session.seq) throw new Error('درخواست قدیمی است یا این عمل اکنون مجاز نیست.');
    if (!isTerminalSiteUrl(this.currentUrl()) || (this.session.pinnedUrl && this.currentUrl() !== this.session.pinnedUrl)) {
      this.pause('گفتگو تغییر کرده است. برای امنیت جلسه متوقف شد.');
      throw new Error('گفتگوی فعال تغییر کرده است.');
    }
  }

  async approve(payload) { return this.executePending(payload, false); }

  // 'automatic' is private control flow, never read from an IPC/model payload.
  async executePending(payload, automatic) {
    this.check(payload, 'review');
    const pending = this.state.pending;
    const epoch = this.epoch;
    const cwd = this.folder;
    const reviewReasons = commandReviewReasons(pending.command);
    if (automatic) {
      if (!this.session.permissions?.autoExecute || reviewReasons.length) throw new Error('اجرای خودکار این فرمان مجاز نیست.');
    } else {
      this.update({ status: 'confirming', message: 'در انتظار تأیید نهایی دستور در پنجرهٔ سیستم…' });
      const { response } = await this.dialog.showMessageBox(this.getWindow(), {
        type: 'warning', title: 'اجرای فرمان محلی PowerShell',
        message: 'متن زیر با همهٔ دسترسی‌های کاربر فعلی اجرا می‌شود، نه داخل sandbox.',
        detail: `پوشه: ${cwd}\n\n${pending.command}\n\n${reviewReasons.length ? `دلیل بررسی دستی: ${reviewReasons.join('؛ ')}\n\n` : ''}به توضیح مدل به‌عنوان تضمین ایمنی اعتماد نکنید. این دستور ممکن است فایل‌ها را تغییر دهد یا اطلاعات را به شبکه بفرستد.`,
        buttons: ['همین دستور را اجرا کن', 'لغو'], defaultId: 1, cancelId: 1, noLink: true,
      });
      if (epoch !== this.epoch || this.state.pending !== pending) return this.snapshot();
      if (response !== 0) {
        this.update({ status: 'review', message: 'اجرا لغو شد؛ می‌توانید درخواست را رد یا اتصال را قطع کنید.' });
        return this.snapshot();
      }
    }
    this.check(payload, automatic ? 'review' : 'confirming');
    if (fs.realpathSync(cwd) !== cwd || !fs.statSync(cwd).isDirectory()) throw new Error('مسیر پوشه تغییر کرده است.');
    this.update({ status: 'running', pending: null, result: null, shareText: '', reviewReasons: [],
      message: automatic ? 'PowerShell با مجوز همین جلسه در حال اجراست؛ برای لغو «توقف» را بزنید.' : 'PowerShell در حال اجرای دستور تأییدشده است؛ سقف زمان ۱۲۰ ثانیه.' });
    // Recheck after publication too: a synchronous revocation must win.
    if (epoch !== this.epoch || !this.session) return this.snapshot();
    let result;
    try { result = await this.runner.run(pending.command, cwd); }
    catch (error) { result = { status: 'error', exitCode: null, stdout: '', stderr: '', error: error.message }; }
    if (epoch !== this.epoch) return this.snapshot();
    this.check(payload, 'running');
    const outputReasons = outputReviewReasons(result);
    // A manually reviewed risky command does NOT silently inherit auto-sharing.
    const shareReasons = [...(reviewReasons.length ? ['خروجی فرمانی که نیازمند بررسی دستی بود'] : []), ...outputReasons];
    this.update({ status: 'result', result, shareText: previewOutput(result), reviewReasons: shareReasons,
      message: this.session.permissions?.autoShare && shareReasons.length
        ? 'ارسال خودکار متوقف شد؛ این خروجی به بازبینی و ارسال دستی نیاز دارد.'
        : 'اجرا تمام شد. خروجی هنوز ارسال نشده است؛ متن قابل‌ارسال را بررسی کنید.' });
    if (epoch === this.epoch && this.session.permissions?.autoShare && shareReasons.length === 0) {
      await this.shareResult(payload, true);
    }
    return this.snapshot();
  }

  reject(payload) {
    this.check(payload, 'review');
    const result = { status: 'rejected', exitCode: null, stdout: '', stderr: '', error: 'The user rejected this command. Nothing was executed.' };
    this.update({ status: 'result', pending: null, result, shareText: previewOutput(result), reviewReasons: [],
      message: 'دستور اجرا نشد. می‌توانید نتیجهٔ ردکردن را برای مدل بفرستید؛ خودکار ارسال نمی‌شود.' });
    return this.snapshot();
  }

  async share(payload) { return this.shareResult(payload, false); }

  async shareResult(payload, automatic) {
    this.check(payload, 'result');
    if (automatic && (!this.session.permissions?.autoShare || this.state.reviewReasons.length
      || outputReviewReasons(this.state.result).length)) throw new Error('ارسال خودکار این خروجی مجاز نیست.');
    const epoch = this.epoch;
    const text = automatic ? this.state.shareText : payload.text;
    const message = resultMessage(this.session.id, this.session.seq, this.state.result, text);
    this.update({ status: 'sharing', message: automatic
      ? 'در حال ارسال خروجی با مجوز ارسال خودکار همین جلسه…'
      : 'در حال ارسال فقط متن بازبینی‌شدهٔ خروجی به گفتگو…' });
    try {
      await this.post(message, epoch);
      if (epoch !== this.epoch) return this.snapshot();
      this.session.seq += 1;
      this.stable = '';
      if (this.session.seq > MAX_STEPS) {
        this.update({ result: null, shareText: '' });
        return this.pause('سقف ۲۰ فرمان این جلسه تمام شد؛ مجوزهای خودکار باطل شدند.');
      }
      this.update({ status: 'waiting', pending: null, result: null, shareText: '', reviewReasons: [],
        message: automatic ? 'خروجی با مجوز همین جلسه فرستاده شد؛ مدل/Agent می‌تواند ادامه دهد.' : 'خروجی بازبینی‌شده فرستاده شد؛ منتظر پاسخ بعدی مدل هستیم.' });
      this.schedule();
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    }
    return this.snapshot();
  }

  pause(message) {
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    this.epoch += 1;
    this.session = null;
    this.stable = '';
    this.update({ status: 'paused', pending: null, reviewReasons: [], message });
    if (this.runner.running) {
      const epoch = this.epoch;
      const warn = (warning) => {
        if (epoch === this.epoch) this.update({ stopWarning: warning,
          message: warning ? `${message}\n${warning}` : message });
      };
      void this.runner.stop().then((result) => warn(result?.error || null))
        .catch(() => warn('توقف فرایند تأیید نشد؛ Task Manager را بررسی کنید.'));
    }
    return this.snapshot();
  }

  onDocumentChange(message = 'صفحه دوباره بارگذاری شد؛ اتصال و مجوزهای خودکار باطل شدند.') {
    if (this.session) return this.pause(message);
    return this.snapshot();
  }

  onNavigation(url) {
    if (this.session && (!isTerminalSiteUrl(url)
      || (this.session.pinnedUrl && this.session.pinnedUrl !== url)
      || (!this.session.pinnedUrl && !this.session.initialPosting && this.session.startUrl !== url))) {
      this.pause('صفحه یا گفتگو تغییر کرد؛ اتصال و مجوزهای خودکار باطل شدند.');
    }
  }

  async disable() {
    clearTimeout(this.timer);
    clearTimeout(this.expiryTimer);
    const epoch = ++this.epoch;
    this.session = null;
    this.stable = '';
    this.update({ status: this.runner.running ? 'stopping' : (this.folder ? 'ready' : 'off'),
      pending: null, result: null, shareText: '', reviewReasons: [], message: 'اتصال و مجوزها باطل شدند؛ درخواست جدیدی اجرا یا ارسال نمی‌شود.' });
    let stopWarning = null;
    try { stopWarning = (await this.runner.stop())?.error || null; }
    catch { stopWarning = 'توقف فرایند تأیید نشد؛ Task Manager را بررسی کنید.'; }
    if (epoch === this.epoch) this.update(stopWarning
      ? { status: 'paused', stopWarning, message: stopWarning }
      : { status: this.folder ? 'ready' : 'off', stopWarning: null });
    return this.snapshot();
  }

  async handle(action, payload) {
    switch (action) {
      case 'choose-folder': return this.chooseFolder();
      case 'start': return this.start(payload);
      case 'approve': return this.approve(payload);
      case 'reject': return this.reject(payload);
      case 'share': return this.share(payload);
      case 'disable': return this.disable();
      default: throw new Error('عمل ترمینال مجاز نیست.');
    }
  }
}

module.exports = { TerminalAgent };
