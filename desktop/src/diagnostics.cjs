'use strict';

// Strict allowlist. Never export chat, commands, tasks, account/repository names,
// filesystem paths, CLI stdout/stderr, environment variables, cookies or tokens.
function diagnosticReport(input) {
  const terminal = input.terminal || {}; const github = input.github || {}; const adapter = input.adapter || {};
  const member = (value, choices, fallback = 'unknown') => choices.includes(value) ? value : fallback;
  const version = (value) => typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}(?:-[a-z0-9.-]{1,30})?$/i.test(value) ? value : 'unknown';
  const diagnostic = /^(?:ready|offline|page-unavailable|composer-count:\d{1,4}|send-button-count:\d{1,4})$/.test(adapter.diagnostic || '') ? adapter.diagnostic : 'unknown';
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000) : null;
  let origin = 'unavailable';
  try { const url = new URL(input.siteUrl); if (url.protocol === 'https:' && ['arena.ai', 'www.arena.ai', 'lmarena.ai', 'www.lmarena.ai', 'accounts.google.com', 'github.com', 'appleid.apple.com'].includes(url.hostname)) origin = url.origin; } catch {}
  return {
    schema: 1, version: version(input.version), platform: member(input.platform, ['win32', 'darwin', 'linux']), arch: member(input.arch, ['x64', 'arm64', 'ia32', 'arm']), electron: version(input.electron),
    site: { origin, loaded: input.siteReady === true, loading: input.siteLoading === true,
      errorCode: Number.isSafeInteger(input.siteError) ? input.siteError : 'none' },
    adapter: { result: diagnostic, composerCount: count(adapter.composerCount), sendButtonCount: count(adapter.sendButtonCount),
      editor: member(adapter.composerKind, ['textarea', 'contenteditable', 'none']), offline: adapter.offline === true, busy: adapter.busy === true,
      draftPresent: adapter.draftPresent === true, sendDisabled: typeof adapter.sendDisabled === 'boolean' ? adapter.sendDisabled : null,
      frameCount: count(adapter.frameCount) },
    terminal: { status: member(terminal.status, ['off', 'ready', 'starting', 'waiting', 'review', 'confirming', 'running', 'result', 'sharing', 'paused', 'completed']), supported: terminal.supported === true, active: Boolean(terminal.session),
      autoExecute: terminal.autoExecute === true, autoShare: terminal.autoShare === true, busy: terminal.busy === true },
    github: { status: member(github.status, ['idle', 'working', 'ready', 'disconnected', 'preview', 'watching', 'error', 'cancelled']), checked: github.checked === true, git: Boolean(github.dependencies?.git), gh: Boolean(github.dependencies?.gh),
      gitSource: member(github.toolSources?.git, ['bundled', 'installed']), ghSource: member(github.toolSources?.gh, ['bundled', 'installed']), accountVerified: Boolean(github.account),
      busy: github.busy === true, watching: github.watching === true, issue: member(github.lastIssue?.code, ['environment-auth', 'authentication', 'certificate', 'proxy', 'network', 'access', 'missing-tool', 'operation'], 'none'),
      projectSelected: Boolean(github.project), branchSelected: Boolean(github.project?.branch) },
  };
}

function diagnosticSummary(report) {
  const lines = [];
  if (report.site.errorCode !== 'none' || !report.site.loaded) lines.push('صفحهٔ Arena هنوز آماده نیست؛ ورود یا خطای شبکهٔ سایت را بررسی کنید.');
  if (report.adapter.result === 'ready') lines.push('کادر و دکمهٔ ارسال پیدا شدند. این، رعایت قرارداد توسط مدل یا اتصال مخزن ابری Agent را ثابت نمی‌کند.');
  else if (report.adapter.result === 'composer-count:0') lines.push('کادر پیام پیدا نشد. وارد سایت شوید و خود گفتگوی مدل/Agent را باز کنید، نه صفحهٔ انتخاب پروژه/ورود.');
  else if (report.adapter.result.startsWith('composer-count:')) lines.push('چند کادر پیام پیدا شد؛ برای جلوگیری از ارسال اشتباه باید یک گفتگوی فعال داشته باشید.');
  else if (report.adapter.result.startsWith('send-button-count:')) lines.push('دکمهٔ ارسال یکتای همان کادر پیدا نشد؛ این حالت رابط ممکن است ناسازگار باشد.');
  else lines.push('بررسی کادر صفحه در دسترس نیست. صفحه باید روی خود Arena و آماده باشد.');
  if (report.adapter.draftPresent) lines.push('پیش‌نویس در کادر هست؛ برنامه آن را خودکار پاک یا بازنویسی نمی‌کند.');
  if (report.adapter.busy) lines.push('مدل هنوز در حال پاسخ است؛ تا پایان پاسخ صبر کنید.');
  if (!report.github.checked) lines.push('اتصال GitHub هنوز بررسی نشده است؛ پنل GitHub ← بررسی اتصال.');
  else if (!report.github.git || !report.github.gh) lines.push('ابزار همراه کامل نیست؛ نصب نسخهٔ اصلاحی را بررسی کنید.');
  else lines.push('Git و GitHub CLI پیدا شدند.');
  if (report.github.checked && !report.github.accountVerified) lines.push('حساب GitHub تأیید نشده؛ برای مخزن خصوصی ورود لازم است. مخزن عمومی بدون ورود هم دانلود می‌شود.');
  lines.push('کار روی فایل‌های همین Windows: ترمینال AI. کار ابری: Agent داخل Arena + مخزن و شاخهٔ انتخاب‌شده؛ این دو یکی نیستند.');
  return lines.join('\n\n');
}

module.exports = { diagnosticReport, diagnosticSummary };
