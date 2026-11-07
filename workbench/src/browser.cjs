'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns/promises');
const net = require('node:net');
const { adapterScript } = require('./shared.cjs')('site-adapter');
const ARENA = new Set(['arena.ai', 'www.arena.ai', 'lmarena.ai', 'www.lmarena.ai']);

function publicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  if (net.isIP(ip) === 6) return !/^(?:::|fc|fd|fe[89ab])/i.test(ip) && !ip.includes('.');
  return false;
}
function website(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|test)$/.test(url.hostname)) throw new Error('فقط وب‌سایت عمومی HTTPS؛ نه فایل، localhost یا شبکهٔ خصوصی.');
  if (net.isIP(url.hostname) && !publicAddress(url.hostname)) throw new Error('شبکهٔ خصوصی مجاز نیست.');
  return url;
}
function chromePath(env = process.env) {
  for (const base of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean)) {
    const file = path.join(base, 'Google/Chrome/Application/chrome.exe'); if (fs.existsSync(file)) return fs.realpathSync.native(file);
  }
  return null;
}
const pause = (ms, signal) => new Promise((resolve, reject) => {
  signal?.throwIfAborted(); const stop = () => { clearTimeout(timer); reject(signal.reason || new Error('متوقف شد.')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms); signal?.addEventListener('abort', stop, { once: true });
});

class AgentBrowser {
  constructor({ profile, permissions, onUpdate = () => {}, launch, executable, lookup = dns.lookup }) {
    this.profile = profile; this.permissions = permissions; this.onUpdate = onUpdate; this.launch = launch; this.executable = executable; this.lookup = lookup;
    this.context = null; this.page = null; this.manual = false; this.opening = null; this.closedEpoch = 0; this.lastUrl = null;
  }
  status() { return { running: Boolean(this.context), manual: this.manual, origin: this.page ? (() => { try { return new URL(this.page.url()).origin; } catch { return ''; } })() : '', available: Boolean(this.executable || chromePath()) }; }
  async safeNetwork(value) {
    const url = website(value); const records = await this.lookup(url.hostname, { all: true });
    if (!records.length || records.some((r) => !publicAddress(r.address))) throw new Error('آدرس سایت به شبکهٔ عمومی معتبر resolve نشد.'); return url;
  }
  async ensure({ manual = false, signal } = {}) {
    signal?.throwIfAborted();
    if (this.context && this.manual === manual) return this.page;
    if (this.opening) throw new Error('مرورگر در حال بازشدن است؛ صبر کنید.');
    const closing = this.close(); const epoch = this.closedEpoch; await closing; signal?.throwIfAborted();
    if (epoch !== this.closedEpoch) throw new Error('بازکردن مرورگر لغو شد.');
    const executable = this.executable || chromePath(); if (!executable) throw new Error('Chrome نصب‌شده پیدا نشد؛ Chrome رسمی را نصب و دوباره تلاش کنید. مرورگر شخصی شما دستکاری نمی‌شود.');
    this.opening = (async () => {
      const launch = this.launch || require('playwright-core').chromium.launchPersistentContext.bind(require('playwright-core').chromium);
      const context = await launch(this.profile, { executablePath: executable, headless: !manual, chromiumSandbox: true,
        acceptDownloads: false, serviceWorkers: 'block', viewport: { width: 1360, height: 900 }, timeout: 30000 });
      if (epoch !== this.closedEpoch || signal?.aborted) { await context.close(); throw new Error('بازکردن مرورگر لغو شد.'); }
      this.context = context; this.manual = manual;
      // Network guard is independent of untrusted page markup and model text.
      await context.route('**/*', async (route) => { try { await this.safeNetwork(route.request().url()); await route.continue(); } catch { await route.abort('blockedbyclient'); } });
      if (context.routeWebSocket) await context.routeWebSocket('**/*', (socket) => socket.close());
      this.page = context.pages()[0] || await context.newPage();
      context.on('close', () => { if (this.context === context) { this.context = null; this.page = null; this.onUpdate(this.status()); } });
      this.page.on('framenavigated', (frame) => { if (frame === this.page?.mainFrame() && /^https:\/\//.test(frame.url())) this.lastUrl = frame.url(); });
      this.page.setDefaultTimeout(12000);
      if (this.lastUrl) { const resume = this.lastUrl; await this.safeNetwork(resume); await this.page.goto(resume, { waitUntil: 'domcontentloaded' }); } this.onUpdate(this.status()); return this.page;
    })();
    try { return await this.opening; } finally { this.opening = null; }
  }
  async login() { const page = await this.ensure({ manual: true }); if (!ARENA.has(new URL(page.url()).hostname)) await page.goto('https://arena.ai', { waitUntil: 'domcontentloaded' }); return this.status(); }
  async current(signal) {
    const page = await this.ensure({ signal }); const url = await this.safeNetwork(page.url());
    await this.permissions.origin(url.href, signal); this.permissions.check(signal); return page;
  }
  async navigate(value, signal) {
    const url = await this.safeNetwork(value); await this.permissions.origin(url.href, signal);
    const page = await this.ensure({ signal }); await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    return this.read(signal);
  }
  async read(signal) {
    const page = await this.current(signal);
    return page.evaluate(() => {
      const visible = (el) => Boolean(el.getClientRects().length && !el.closest('[hidden], [aria-hidden="true"]'));
      const auth = [...document.querySelectorAll('input[type="password"], input[autocomplete="one-time-code"], iframe[title*="captcha" i]')].some(visible);
      if (auth) return { actionRequired: 'ورود/تأیید را خودتان در مرورگر Agent انجام دهید؛ ابزار رمز یا کد ورود نمی‌خواند.', title: document.title };
      const target = (el) => el.id ? 'css:#' + CSS.escape(el.id) : el.getAttribute('aria-label') ? 'css:[aria-label=' + JSON.stringify(el.getAttribute('aria-label')) + ']' : (el.textContent || '').trim().slice(0, 120);
      return { title: document.title, text: document.body.innerText.slice(0, 18000),
        buttons: [...document.querySelectorAll('button, a[role="button"]')].filter(visible).slice(0, 70).map((el) => ({ target: target(el), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 120) })),
        inputs: [...document.querySelectorAll('textarea, input:not([type="hidden"]):not([type="password"]), [contenteditable="true"]')].filter(visible).slice(0, 20).map((el) => ({ target: target(el), placeholder: (el.getAttribute('placeholder') || '').slice(0, 100) })) };
    });
  }
  locator(page, target) {
    if (typeof target !== 'string' || target.length > 500 || !target.trim()) throw new Error('هدف یکتا و مشخص لازم است.');
    return target.startsWith('css:') ? page.locator(target.slice(4)) : page.getByRole('button', { name: target, exact: true });
  }
  async click(target, signal) { const page = await this.current(signal); const locator = this.locator(page, target); if (await locator.count() !== 1) throw new Error('هدف کلیک یکتا نیست؛ ابتدا صفحه را دوباره بخوانید.'); await locator.click(); this.permissions.check(signal); return this.read(signal); }
  async fill(target, value, signal) {
    if (typeof value !== 'string' || value.length > 32000) throw new Error('متن ورودی نامعتبر است.');
    const page = await this.current(signal); const locator = this.locator(page, target);
    if (await locator.count() !== 1) throw new Error('کادر ورودی یکتا نیست.');
    if (await locator.evaluate((el) => el.type === 'password' || /password|one-time-code|cc-number|cc-csc/.test(el.autocomplete || ''))) throw new Error('عامل حق نوشتن/خواندن رمز، کد ورود یا اطلاعات پرداخت ندارد.');
    await locator.fill(value); this.permissions.check(signal); return { filled: true };
  }
  async arena(prompt, signal) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 24000) throw new Error('درخواست Arena باید ۱ تا ۲۴۰۰۰ نویسه باشد.');
    let page = await this.ensure({ signal });
    if (!ARENA.has(new URL(page.url()).hostname)) { await this.navigate('https://arena.ai', signal); page = this.page; }
    await this.current(signal);
    const call = (action, text) => page.evaluate(adapterScript(action, text));
    const replies = () => page.evaluate(() => [...document.querySelectorAll('[data-message-author-role="assistant"], [data-role="assistant"], [data-message-role="assistant"], [data-testid="assistant-message"], .message-assistant')].filter((el) => el.getClientRects().length).map((el) => el.innerText).filter(Boolean).slice(-8));
    const before = await replies(); const snapshot = await call('diagnostics');
    if (snapshot.diagnostic !== 'ready' || snapshot.busy) throw new Error(`Arena آماده نیست (${snapshot.diagnostic}). در مرورگر Agent وارد شوید و یک گفتگوی تک‌مدلی/Agent با کادر خالی باز کنید.`);
    const prepared = await call('prepare', prompt); if (!prepared.ok) throw new Error(`پیش‌نویس Arena حفظ شد؛ آماده‌سازی رد شد (${prepared.reason}).`);
    let clicked = false;
    for (let n = 0; n < 12; n += 1) { await pause(200, signal); this.permissions.check(signal); const sent = await call('send', prompt); if (sent.ok) { clicked = true; break; } if (sent.reason !== 'send-disabled') throw new Error(`ارسال Arena رد شد: ${sent.reason}`); }
    if (!clicked) throw new Error('دکمهٔ ارسال Arena فعال نشد؛ پیش‌نویس باقی ماند.');
    let last = ''; let stable = 0;
    for (let n = 0; n < 100; n += 1) {
      await pause(1800, signal); this.permissions.check(signal);
      if (!ARENA.has(new URL(page.url()).hostname)) throw new Error('Arena به صفحهٔ ورود/دامنهٔ دیگر رفت؛ ادامه متوقف شد.');
      const state = await call('snapshot'); const after = await replies(); const text = after.at(-1) || '';
      const changed = text && (after.length > before.length || text !== before.at(-1));
      if (changed && !state.busy) { stable = text === last ? stable + 1 : 0; last = text; if (stable >= 2) return { reply: text.slice(0, 24000), source: 'visible Arena conversation', cloudToolsAreNotLocal: true }; }
    }
    throw new Error('پاسخ قابل‌شناسایی Arena در زمان مجاز نرسید؛ ممکن است ورود، ساختار صفحه یا قرارداد پاسخ تغییر کرده باشد. موفقیت حدس زده نشد و ارسال تکرار نشد.');
  }
  async screenshot() { try { return this.page ? 'data:image/png;base64,' + (await this.page.screenshot({ type: 'png', timeout: 3000 })).toString('base64') : null; } catch { return null; } }
  async close() { this.closedEpoch += 1; const context = this.context; this.context = null; this.page = null; this.manual = false; if (context) await context.close().catch(() => {}); this.onUpdate(this.status()); }
}
module.exports = { AgentBrowser, website, publicAddress, chromePath, pause };
