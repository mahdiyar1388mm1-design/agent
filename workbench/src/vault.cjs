'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { redactOutput } = require('./shared.cjs')('terminal-protocol');

function redact(value, keys = []) {
  let text = String(value);
  for (const key of keys) if (key) text = text.split(key).join('[API KEY REDACTED]');
  return redactOutput(text).replace(/\bdahl_[a-zA-Z0-9_-]{12,}\b/g, '[DAHL KEY REDACTED]')
    .replace(/\b(?:gh[pousr]_[a-zA-Z0-9_]{20,}|github_pat_[a-zA-Z0-9_]{20,}|sk-[a-zA-Z0-9_-]{20,})\b/g, '[TOKEN REDACTED]')
    .replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z ]+ )?PRIVATE KEY-----|$)/g, '[PRIVATE KEY REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+@/g, '$1[REDACTED]@');
}

class KeyVault {
  constructor({ directory, storage }) { this.file = path.join(directory, 'dahl-keys.encrypted'); this.storage = storage; this.keys = []; this.remembered = false; }
  load() {
    if (!this.storage.isEncryptionAvailable() || !fs.existsSync(this.file)) return;
    try {
      if (fs.statSync(this.file).size > 65536) return;
      const list = JSON.parse(this.storage.decryptString(fs.readFileSync(this.file)));
      this.replace(list, true); this.remembered = true;
    } catch { this.keys = []; this.remembered = false; }
  }
  replace(input, fromDisk = false) {
    const list = typeof input === 'string' ? input.trim().split(/\s+/).filter(Boolean) : input;
    if (!Array.isArray(list) || list.length > 24 || list.some((key) => typeof key !== 'string' || !/^dahl_[a-zA-Z0-9_-]{16,200}$/.test(key))) throw new Error('حداکثر ۲۴ کلید Dahl معتبر؛ هر کلید در یک خط.');
    this.keys = [...new Set(list)];
    if (!fromDisk) this.remembered = false;
  }
  save(input, remember) {
    if (typeof remember !== 'boolean') throw new Error('گزینهٔ نگهداری باید صریح باشد.');
    if (remember && !this.storage.isEncryptionAvailable()) throw new Error('رمزنگاری امن سیستم در دسترس نیست؛ فقط نگهداری در حافظه مجاز است.');
    this.replace(input);
    if (remember && this.keys.length) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const temp = this.file + '.tmp'; fs.writeFileSync(temp, this.storage.encryptString(JSON.stringify(this.keys)), { mode: 0o600 }); fs.renameSync(temp, this.file);
      this.remembered = true;
    } else fs.rmSync(this.file, { force: true });
    return this.status();
  }
  status() { return { count: this.keys.length, remembered: this.remembered, encryption: this.storage.isEncryptionAvailable() }; }
  clean(value) { return redact(value, this.keys); }
}
module.exports = { KeyVault, redact };
