'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isTerminalSiteUrl } = require('./policy.cjs');
const { PowerShellRunner } = require('./powershell-runner.cjs');
const { adapterScript } = require('./site-adapter.cjs');
const { MAX_STEPS, readRequest, initialMessage, previewOutput, resultMessage } = require('./terminal-protocol.cjs');

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
    this.autoPoll = options.autoPoll !== false;
    this.folder = '';
    this.session = null;
    this.epoch = 0;
    this.revision = 0;
    this.timer = null;
    this.polling = false;
    this.stable = '';
    this.state = { status: 'off', message: 'اتصال ترمینال غیرفعال است.', pending: null, result: null, shareText: '' };
  }

  get busy() { return this.runner.running || ['starting', 'confirming'].includes(this.state.status); }

  snapshot() {
    return { ...this.state, pending: this.state.pending ? { ...this.state.pending } : null,
      result: this.state.result ? { ...this.state.result } : null,
      folder: this.folder, session: this.session?.id || null,
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

  async site(action, text) {
    const contents = this.getContents();
    if (!contents || contents.isDestroyed() || !isTerminalSiteUrl(contents.getURL())) {
      throw new Error('ابتدا یک گفتگوی تک‌مدلی در خود سایت Arena باز کنید.');
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
    this.update({ status: 'ready', message: 'پوشه انتخاب شد. یک مدل در حالت چت تک‌مدلی Arena انتخاب کنید.' });
    return this.snapshot();
  }

  async start(payload) {
    if (!this.runner.supported) throw new Error('این قابلیت برای PowerShell روی Windows ساخته شده است.');
    if (this.session || this.busy) throw new Error('ابتدا جلسهٔ قبلی را قطع کنید.');
    if (!this.folder) throw new Error('ابتدا پوشهٔ پروژه را انتخاب کنید.');
    const id = randomUUID();
    const message = initialMessage(id, path.basename(this.folder), payload?.task);
    const epoch = ++this.epoch;
    this.session = { id, seq: 1, pinnedUrl: null, lastActivity: Date.now() };
    this.update({ status: 'starting', message: 'در انتظار اجازهٔ شروع…', pending: null, result: null, shareText: '' });
    try {
      const diagnostic = await this.site('snapshot');
      if (epoch !== this.epoch) return this.snapshot();
      if (diagnostic.diagnostic !== 'ready' || diagnostic.busy) {
        throw new Error(`کادر چت سازگار پیدا نشد یا مدل مشغول است (${diagnostic.diagnostic}). در حالت تک‌مدلی یک گفتگوی خالی باز کنید.`);
      }
      const consent = await this.dialog.showMessageBox(this.getWindow(), {
        type: 'warning', title: 'فعال‌کردن ترمینال محلی برای AI',
        message: 'این قابلیت آزمایشی می‌تواند فرمان‌های PowerShell را با دسترسی کاربر فعلی اجرا کند.',
        detail: `پوشهٔ شروع: ${this.folder}\n\nپوشهٔ انتخابی sandbox نیست؛ فرمان تأییدشده می‌تواند بیرون آن را هم تغییر دهد یا به شبکه دسترسی داشته باشد. هر دستور جداگانه تأیید می‌شود. خروجی فقط بعد از بازبینی و اجازهٔ جداگانهٔ شما به Arena ارسال می‌شود. رمز، کلید خصوصی و اطلاعات حساس را در خروجی ارسال نکنید.\n\nاتصال از طریق پیام‌های معمول چت است، نه API رسمی Arena. حساب/مدل خود سایت استفاده می‌شود و سازگاری همیشگی تضمین نمی‌شود.`,
        buttons: ['می‌پذیرم؛ ارسال درخواست و شروع', 'لغو'], defaultId: 1, cancelId: 1, noLink: true,
      });
      if (epoch !== this.epoch) return this.snapshot();
      if (consent.response !== 0) return this.disable();
      await this.post(message, epoch);
      if (epoch !== this.epoch) return this.snapshot();
      this.update({ status: 'waiting', message: 'درخواست به چت فرستاده شد؛ منتظر دستور ساختاریافتهٔ مدل هستیم.' });
      this.schedule();
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    }
    return this.snapshot();
  }

  async post(message, epoch) {
    const prepared = await this.site('prepare', message);
    if (!prepared.ok) throw new Error(this.adapterError(prepared.reason));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.sleep(200);
      if (epoch !== this.epoch) throw new Error('جلسه قطع شده است.');
      const sent = await this.site('send', message);
      if (sent.ok) {
        this.session.lastActivity = Date.now();
        return;
      }
      if (sent.reason !== 'send-disabled') throw new Error(this.adapterError(sent.reason));
    }
    throw new Error('ارسال پیام تأیید نشد. پیش‌نویس در سایت باقی مانده؛ اتصال متوقف شد تا پیام تکراری ارسال نشود.');
  }

  adapterError(reason) {
    if (reason === 'draft-present' || reason === 'draft-changed') return 'پیش‌نویس فعلی چت را تغییر نمی‌دهیم. آن را خودتان ارسال/پاک کنید و جلسه را دوباره شروع کنید.';
    return `ارتباط با کادر چت برقرار نشد (${reason}). ساختار سایت ممکن است تغییر کرده باشد؛ چیزی اجرا نشد.`;
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
      if (Date.now() - this.session.lastActivity > 600000) throw new Error('زمان انتظار ۱۰ دقیقه‌ای پایان یافت؛ برای ادامه جلسهٔ تازه شروع کنید.');
      const snapshot = await this.site('snapshot');
      if (epoch !== this.epoch) return;
      if (snapshot.busy) return;
      const requests = new Map();
      for (const text of Array.isArray(snapshot.blocks) ? snapshot.blocks.slice(-40) : []) {
        const request = readRequest(text, this.session.id, this.session.seq);
        if (request) requests.set(JSON.stringify(request), request);
      }
      if (requests.size > 1) throw new Error('چند درخواست متفاوت پیدا شد؛ اتصال متوقف شد. فقط حالت تک‌مدلی پشتیبانی می‌شود.');
      if (requests.size === 0) { this.stable = ''; return; }
      const [[fingerprint, request]] = requests;
      // Wait for the same complete JSON in two snapshots, not partial streaming text.
      if (this.stable !== fingerprint) { this.stable = fingerprint; return; }
      if (!isTerminalSiteUrl(snapshot.url) || snapshot.url !== this.currentUrl()) throw new Error('صفحه هنگام خواندن درخواست تغییر کرد.');
      this.session.pinnedUrl = snapshot.url;
      this.update({ status: 'review', pending: request, message: 'درخواست فرمان در صفحه پیدا شد؛ منشأ و متن کامل آن را بررسی کنید. هنوز اجرا نشده است.' });
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    } finally {
      this.polling = false;
      this.schedule();
    }
  }

  check(payload, status) {
    if (!this.session || this.state.status !== status || !payload || payload.session !== this.session.id
      || payload.seq !== this.session.seq) throw new Error('درخواست قدیمی است یا این عمل اکنون مجاز نیست.');
    if (!isTerminalSiteUrl(this.currentUrl()) || (this.session.pinnedUrl && this.currentUrl() !== this.session.pinnedUrl)) {
      this.pause('گفتگو تغییر کرده است. برای امنیت جلسه متوقف شد.');
      throw new Error('گفتگوی فعال تغییر کرده است.');
    }
  }

  async approve(payload) {
    this.check(payload, 'review');
    const pending = this.state.pending;
    const epoch = this.epoch;
    const cwd = this.folder;
    this.update({ status: 'confirming', message: 'در انتظار تأیید نهایی دستور در پنجرهٔ سیستم…' });
    const { response } = await this.dialog.showMessageBox(this.getWindow(), {
      type: 'warning', title: 'اجرای فرمان محلی PowerShell',
      message: 'متن زیر با همهٔ دسترسی‌های کاربر فعلی اجرا می‌شود، نه داخل sandbox.',
      detail: `پوشه: ${cwd}\n\n${pending.command}\n\nبه توضیح مدل به‌عنوان تضمین ایمنی اعتماد نکنید. این دستور ممکن است فایل‌ها را تغییر دهد یا اطلاعات را به شبکه بفرستد.`,
      buttons: ['همین دستور را اجرا کن', 'لغو'], defaultId: 1, cancelId: 1, noLink: true,
    });
    if (epoch !== this.epoch || this.state.pending !== pending) return this.snapshot();
    if (response !== 0) {
      this.update({ status: 'review', message: 'اجرا لغو شد؛ می‌توانید درخواست را رد یا اتصال را قطع کنید.' });
      return this.snapshot();
    }
    this.check(payload, 'confirming');
    if (fs.realpathSync(cwd) !== cwd || !fs.statSync(cwd).isDirectory()) throw new Error('مسیر پوشه تغییر کرده است.');
    this.update({ status: 'running', pending: null, result: null, shareText: '', message: 'PowerShell در حال اجرای دستور تأییدشده است؛ سقف زمان ۱۲۰ ثانیه.' });
    let result;
    try { result = await this.runner.run(pending.command, cwd); }
    catch (error) { result = { status: 'error', exitCode: null, stdout: '', stderr: '', error: error.message }; }
    if (epoch !== this.epoch) return this.snapshot();
    this.update({ status: 'result', result, shareText: previewOutput(result),
      message: 'اجرا تمام شد. هیچ خروجی به Arena ارسال نشده؛ متن قابل‌ارسال را بررسی کنید.' });
    return this.snapshot();
  }

  reject(payload) {
    this.check(payload, 'review');
    const result = { status: 'rejected', exitCode: null, stdout: '', stderr: '', error: 'The user rejected this command. Nothing was executed.' };
    this.update({ status: 'result', pending: null, result, shareText: previewOutput(result), message: 'دستور اجرا نشد. می‌توانید نتیجهٔ ردکردن را برای مدل بفرستید.' });
    return this.snapshot();
  }

  async share(payload) {
    this.check(payload, 'result');
    const epoch = this.epoch;
    const message = resultMessage(this.session.id, this.session.seq, this.state.result, payload.text);
    this.update({ status: 'sharing', message: 'در حال ارسال فقط متن بازبینی‌شدهٔ خروجی به گفتگو…' });
    try {
      await this.post(message, epoch);
      if (epoch !== this.epoch) return this.snapshot();
      this.session.seq += 1;
      this.stable = '';
      if (this.session.seq > MAX_STEPS) return this.pause('سقف ۲۰ فرمان این جلسه تمام شد؛ هیچ فرمان دیگری اجرا نمی‌شود.');
      this.update({ status: 'waiting', pending: null, result: null, shareText: '', message: 'خروجی بازبینی‌شده فرستاده شد؛ منتظر پاسخ بعدی مدل هستیم.' });
      this.schedule();
    } catch (error) {
      if (epoch === this.epoch) this.pause(error.message);
    }
    return this.snapshot();
  }

  pause(message) {
    clearTimeout(this.timer);
    this.epoch += 1;
    this.session = null;
    this.stable = '';
    this.update({ status: 'paused', pending: null, message });
    if (this.runner.running) void this.runner.stop().catch(() => {});
    return this.snapshot();
  }

  onNavigation(url) {
    if (this.session && (!isTerminalSiteUrl(url) || (this.session.pinnedUrl && this.session.pinnedUrl !== url))) {
      this.pause('صفحه یا گفتگو تغییر کرد؛ اتصال ترمینال متوقف شد.');
    }
  }

  async disable() {
    clearTimeout(this.timer);
    const epoch = ++this.epoch;
    this.session = null;
    this.stable = '';
    this.update({ status: this.runner.running ? 'stopping' : (this.folder ? 'ready' : 'off'),
      pending: null, result: null, shareText: '', message: 'اتصال قطع شد؛ هیچ درخواست جدیدی اجرا یا ارسال نمی‌شود.' });
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
