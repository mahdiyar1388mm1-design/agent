'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { excludedFile, safeRelative } = require('./shared.cjs')('github-policy');

class Workspace {
  constructor(root) {
    this.root = root ? fs.realpathSync.native(root) : null;
    if (this.root && !fs.statSync(this.root).isDirectory()) throw new Error('پوشهٔ پروژه معتبر نیست.');
  }
  resolve(relative = '.', { writing = false } = {}) {
    if (!this.root) throw new Error('ابتدا پوشهٔ پروژه را انتخاب کنید.');
    if (relative !== '.' && (!safeRelative(relative) || excludedFile(relative))) throw new Error('مسیر نسبی پروژه لازم است؛ مسیرهای ورود/اسرار، .git و وابستگی‌های تولیدشده مجاز نیستند.');
    if (writing && relative === '.') throw new Error('نوشتن روی ریشهٔ پوشه مجاز نیست.');
    if (fs.realpathSync.native(this.root) !== this.root) throw new Error('مسیر پروژه تغییر کرده است.');
    const result = path.resolve(this.root, relative);
    if (result !== this.root && !result.startsWith(this.root + path.sep)) throw new Error('مسیر خارج از پروژه است.');
    let cursor = this.root;
    for (const segment of path.relative(this.root, result).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, segment);
      try { if (fs.lstatSync(cursor).isSymbolicLink() || fs.realpathSync.native(cursor).toLowerCase() !== cursor.toLowerCase()) throw new Error('پیوند یا مسیر جابه‌جاشده مجاز نیست.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return result;
  }
  list(relative = '.') {
    const directory = this.resolve(relative);
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => !entry.isSymbolicLink() && entry.name !== '.git' && !excludedFile(entry.name)).slice(0, 150).map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'folder' : 'file' }));
  }
  read(relative) {
    const file = this.resolve(relative); const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 262144) throw new Error('خواندن فقط فایل متنی تا ۲۵۶ KiB مجاز است.');
    const value = fs.readFileSync(file); if (value.includes(0)) throw new Error('فایل دودویی است.'); return value.toString('utf8');
  }
  write(relative, text) {
    if (typeof text !== 'string' || Buffer.byteLength(text) > 262144 || text.includes('\0')) throw new Error('محتوای متنی تا ۲۵۶ KiB لازم است.');
    const file = this.resolve(relative, { writing: true });
    fs.mkdirSync(path.dirname(file), { recursive: true }); this.resolve(relative, { writing: true });
    const temp = path.join(path.dirname(file), '.orbit-' + randomUUID() + '.tmp');
    try { fs.writeFileSync(temp, text, { flag: 'wx' }); this.resolve(relative, { writing: true }); fs.renameSync(temp, file); } finally { fs.rmSync(temp, { force: true }); }
    return { written: relative, bytes: Buffer.byteLength(text) };
  }
}
module.exports = { Workspace };
