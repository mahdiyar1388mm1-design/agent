'use strict';

// Actionable categories, not credentials or a raw CLI transcript. The original
// bounded/redacted error is shown locally; diagnostic exports use only code.
function githubIssue(value) {
  const text = String(value || '');
  if (/environment variable.*(?:authentication|used)|value of the .*TOKEN.*being used/i.test(text)) return { code: 'environment-auth', hint: 'یک متغیر محیطیِ ورود، حساب gh را تعیین می‌کند؛ مقدارش را به چت نفرستید. تنظیمات محیطی همین Windows را بررسی کنید.' };
  if (/HTTP 401|bad credentials|not logged|gh auth login|authentication (?:required|failed)|could not read (?:Username|Password)|terminal prompts disabled|invalid username or token/i.test(text)) return { code: 'authentication', hint: 'از «ورود در مرورگر» حساب GitHub همین برنامه را تأیید کنید. رمز/توکن را به چت نفرستید.' };
  if (/certificate|SSL|TLS|x509|CERT_|schannel/i.test(text)) return { code: 'certificate', hint: 'ساعت Windows، گواهی شبکه و تنظیمات پراکسی را بررسی کنید. بررسی امنیت TLS غیرفعال نمی‌شود.' };
  if (/proxy|HTTP 407|tunnel|SOCKS/i.test(text)) return { code: 'proxy', hint: 'پراکسی سیستم/متغیرهای محیطی را بررسی کنید؛ ابزارها اکنون از پراکسی قابل‌تشخیص Windows استفاده می‌کنند. پراکسیِ نیازمند ورود ممکن است تنظیم جداگانه بخواهد.' };
  if (/could not resolve|no such host|lookup .*:|dial tcp|connection|network|timed? ?out|مهلت|EOF/i.test(text)) return { code: 'network', hint: 'ارتباط GitHub برقرار نشد؛ این به‌تنهایی نشانهٔ خروج از حساب نیست. اتصال شبکه و دسترسی github.com و api.github.com را بررسی کنید.' };
  if (/HTTP 403|HTTP 404|repository not found|permission|access denied/i.test(text)) return { code: 'access', hint: 'نام مخزن و مجوز همین حساب را بررسی کنید؛ برای مخزن خصوصی ابتدا وارد شوید. محدودیت دسترسی سازمان یا سرویس از این برنامه قابل دورزدن نیست.' };
  if (/نصب نیست|ابزارهای همراه|ENOENT|not found in.*PATH/i.test(text)) return { code: 'missing-tool', hint: 'نسخهٔ اصلاحی ابزارها را همراه دارد؛ بسته را کامل نصب کنید یا در اجرای سورس، ابزارها را آماده کنید.' };
  return { code: 'operation', hint: '' };
}
module.exports = { githubIssue };
