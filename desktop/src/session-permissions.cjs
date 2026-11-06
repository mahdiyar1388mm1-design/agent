'use strict';

const SESSION_LIFETIME_MS = 30 * 60 * 1000;

function requestedPermissions(payload) {
  for (const name of ['autoExecute', 'autoShare']) {
    if (payload?.[name] !== undefined && typeof payload[name] !== 'boolean') {
      throw new Error('گزینه‌های حالت خودکار باید صریحاً روشن یا خاموش باشند.');
    }
  }
  return Object.freeze({ autoExecute: payload?.autoExecute === true, autoShare: payload?.autoShare === true });
}

// Deliberately a conservative warning heuristic, NOT a sandbox or a complete
// PowerShell parser/security boundary. Unflagged commands can still be harmful.
// These patterns only restore manual review for recognizable high-risk cases.
const REVIEW_RULES = [
  [/\b(?:Remove-Item|Clear-Content|Remove-Partition|Format-Volume|diskpart|rm|rmdir|del|erase)\b|\bformat(?:\.com|\.exe)?\s+[a-z]:/i, 'حذف یا بازنویسی مخرب داده‌ها'],
  [/\bgit\s+(?:reset\b[^\r\n]*--hard|clean\b[^\r\n]*-[a-z]*f|rm\b)/i, 'حذف یا بازنشانی تغییرات Git'],
  [/(?:\.ssh\b|\.aws\b|\.azure\b|\.kube\b|\.env(?:\b|\.)|\bid_(?:rsa|ed25519)\b|\bLogin Data\b|\bCookies\b|\b(?:Get-Credential|Get-Secret|Export-Clixml|Get-StoredCredential|cmdkey|vaultcmd)\b|\bgh(?:\.exe)?\s+auth\s+(?:token|git-credential)\b|(?:^|[\\/])(?:hosts\.yml|\.git-credentials)\b|\b(?:Get-ChildItem|Get-Item|gci|dir)\s+Env:|\$env:[A-Z_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z_]*\b)/i, 'احتمال دسترسی به داده‌های ورود یا تنظیمات حساس'],
  [/(?:-Verb\s+['"]?RunAs\b|\b(?:Set-ExecutionPolicy|Set-MpPreference|Add-MpPreference|Disable-NetFirewallRule|Set-NetFirewallProfile|Stop-Service|Stop-Process|Stop-Computer|Restart-Computer)\b)/i, 'ارتقای دسترسی یا تغییر امنیت/فرایندهای سیستم'],
  [/\b(?:Invoke-Expression|iex|FromBase64String)\b|-(?:EncodedCommand|enc)\b|\[ScriptBlock\]::Create|\[char\]\s*\d|\.(?:ps1|bat|cmd)\b|\bcmd(?:\.exe)?\s+\/(?:c|k)\b|\b(?:wscript|cscript|mshta|rundll32|regsvr32|certutil|bitsadmin)\b|\b(?:node|python[\d.]*|bash|sh|cmd|powershell|pwsh)(?:\.exe)?\s+-(?:e|c|command)\b/i, 'اجرای پویا، کد مبهم یا اسکریپت واسط'],
  [/(?:\bgit(?:\.exe)?\s+(?:push|send-email)\b|\bgh(?:\.exe)?\s+(?:repo\s+(?:create|delete|edit)|pr\s+(?:merge|close)|release\s+(?:create|delete))\b|\bgh(?:\.exe)?\s+api\b[^\r\n]*(?:-X|--method)\s+(?:POST|PUT|PATCH|DELETE)\b|\b(?:Invoke-RestMethod|Invoke-WebRequest|irm|iwr)\b[^\r\n]*-Method\s+['"]?(?:Post|Put|Patch)\b|\bcurl(?:\.exe)?\b[^\r\n]*(?:--upload-file|--data(?:-binary)?\s+@|\s-T\s))/i, 'ارسال داده یا فایل به شبکه'],
];

function commandReviewReasons(command) {
  // Standard package-manager .cmd shims are ordinary project commands, just
  // like invoking npm itself. Their scripts can STILL execute arbitrary code.
  // This avoids repeated warnings, not a claim that these programs are safe.
  const inspected = command.replace(/\b(?:npm|npx|pnpm|yarn)\.cmd\b/gi, 'package-manager');
  return REVIEW_RULES.filter(([pattern]) => pattern.test(inspected)).map(([, reason]) => reason);
}

function permissionSummary(permissions) {
  const execution = permissions.autoExecute
    ? 'اجرای خودکار روشن: فرمان‌های فاقد الگوی پرخطر شناخته‌شده، بدون تأیید جداگانه اجرا می‌شوند. تشخیص الگوها ناقص است و ایمنی فرمان را تضمین نمی‌کند.'
    : 'اجرای خودکار خاموش: هر فرمان به تأیید جداگانه نیاز دارد.';
  const sharing = permissions.autoShare
    ? 'ارسال خودکار روشن: متن خروجی فرمان‌های عادی، بدون بازبینی مرحله‌ای به Arena و مدل انتخابی ارسال می‌شود و ممکن است اطلاعات حساسِ تشخیص‌داده‌نشده داشته باشد. موارد علامت‌خورده برای بازبینی متوقف می‌شوند.'
    : 'ارسال خودکار خاموش: خروجی فقط با بازبینی و کلیک جداگانهٔ شما ارسال می‌شود.';
  return `${execution}\n\n${sharing}\n\nمجوز فقط برای همین کار و گفتگو است: حداکثر ۳۰ دقیقه یا ۲۰ درخواست. تغییر گفتگو، قطع اتصال یا بستن برنامه آن را باطل می‌کند. پوشهٔ شروع sandbox نیست؛ فرمان‌ها دسترسی واقعی کاربر و شبکه را دارند.`;
}

module.exports = { SESSION_LIFETIME_MS, requestedPermissions, commandReviewReasons, permissionSummary };
