'use strict';
const { commandReviewReasons } = require('./shared.cjs')('session-permissions');
function cancellable(promise, signal) {
  signal?.throwIfAborted(); if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new Error('مجوز کار لغو شد.'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
class Permissions {
  constructor({ confirm, now = Date.now }) { this.confirm = confirm; this.now = now; this.epoch = 0; this.active = null; this.controller = null; }
  revoke() { this.epoch += 1; this.active = null; this.controller?.abort(new Error('مجوز کار لغو شد.')); this.controller = null; }
  async ask(title, detail, button, signal) {
    const combined = this.controller ? (signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal) : signal;
    combined?.throwIfAborted(); return cancellable(this.confirm(title, detail, button, combined), combined);
  }
  async begin({ project, plugins = [] }, signal) {
    signal?.throwIfAborted(); this.revoke(); this.controller = new AbortController(); const epoch = this.epoch;
    const accepted = await this.ask('مجوز همین کار برای عامل', `پروژه: ${project || 'انتخاب نشده؛ ابزار فایل/ترمینال غیرفعال'}\n\nعامل می‌تواند فایل‌های پروژه را بخواند/بنویسد، PowerShell واقعی اجرا کند و با مرورگر و GitHub کار کند. متن درخواست، فایل‌های خوانده‌شده و خروجی ابزارها برای پردازش به Dahl می‌روند؛ محتوای واگذارشده به Arena نیز به آن سایت ارسال می‌شود.\n\n${plugins.length ? 'افزونه‌های اجرایی مورداعتماد: ' + plugins.join('، ') + '\n' : ''}اجرای PowerShell/افزونه sandbox نیست و دسترسی واقعی همین کاربر Windows دارد. تشخیص خطر و اسرار کامل نیست. کارهای حساس اجازهٔ جداگانه می‌خواهند.\n\nحداکثر ۳۰ دقیقه و ۲۰ فراخوانی ابزار؛ توقف فوراً ادامهٔ مراحل را باطل می‌کند ولی rollback نیست.`, 'اجازهٔ این کار و ارسال دادهٔ لازم', signal);
    signal?.throwIfAborted(); if (epoch !== this.epoch || !accepted) throw new Error('اجازهٔ کار داده نشد یا لغو شد.');
    this.active = { epoch, expires: this.now() + 1800000, count: 0, origins: new Set(['https://arena.ai', 'https://www.arena.ai', 'https://lmarena.ai', 'https://www.lmarena.ai']) };
  }
  check(signal) {
    signal?.throwIfAborted();
    if (!this.active || this.active.epoch !== this.epoch || this.now() >= this.active.expires) throw new Error('مجوز کار پایان یافته یا متوقف شده است.');
    if (this.active.count > 20) throw new Error('سقف ۲۰ ابزار تمام شد.');
  }
  async tool(name, args, signal) {
    this.check(signal); const grant = this.active;
    if (++grant.count > 20) throw new Error('سقف ۲۰ ابزار این کار تمام شد.');
    const reasons = name === 'terminal_run' ? commandReviewReasons(args.command || '') : [];
    if (name !== 'github_publish' && /password|credential|auth_token|cookies|secret|delete|purchase|payment|checkout|send_email|publish|merge|release/i.test(name)) reasons.push('عملیات حساس یا انتشار');
    if (name === 'browser_click' && /send|submit|publish|delete|buy|pay|confirm|ارسال|خرید|پرداخت|حذف/i.test(args.target || '')) reasons.push('کلیک با اثر بیرونی یا حساس');
    if (reasons.length) {
      const accepted = await this.ask('بررسی اقدام حساس عامل', `${name}\n\n${JSON.stringify(args, null, 2).slice(0, 9000)}\n\n${reasons.join('\n')}\nتشخیص خطر کامل نیست؛ متن را بررسی کنید.`, 'انجام همین اقدام', signal);
      this.check(signal); if (grant !== this.active || !accepted) throw new Error('اقدام حساس تأیید نشد.');
    }
  }
  async origin(url, signal) {
    this.check(signal); const origin = new URL(url).origin; const grant = this.active;
    if (!grant.origins.has(origin)) {
      if (!await this.ask('دسترسی عامل به وب‌سایت', `${origin}\n\nمتن صفحه ممکن است به Dahl ارسال شود. ورود/کد یک‌بارمصرف را خودتان در مرورگر انجام دهید؛ عامل نباید آن‌ها را بخواند.`, 'اجازه به همین دامنه', signal)) throw new Error('دامنه تأیید نشد.');
      this.check(signal); if (grant !== this.active) throw new Error('کار متوقف شد.'); grant.origins.add(origin);
    }
  }
}
module.exports = { Permissions, cancellable };
