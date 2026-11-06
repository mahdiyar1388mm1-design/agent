'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { bundledToolPaths, prependToolPath } = require('./tool-paths.cjs');
const { redactOutput } = require('./terminal-protocol.cjs');

const shellQuote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
const safeError = (value) => redactOutput(String(value).replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[redacted]@')).slice(0, 1800);

function toolEnvironment(environment) {
  const result = { ...environment };
  for (const name of Object.keys(result)) {
    if (/^(?:GIT_|GH_REPO$|GH_HOST$|GH_PAGER$|GH_EDITOR$|GH_DEBUG$|GH_FORCE_TTY$|ELECTRON_|NODE_OPTIONS$|NODE_INSPECT_RESUME_ON_START$)/i.test(name)) delete result[name];
  }
  return { ...result, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1',
    GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never',
    DO_NOT_TRACK: '1', GH_TELEMETRY_DISABLED: '1', GIT_LITERAL_PATHSPECS: '1', GIT_LFS_SKIP_SMUDGE: '1', GIT_CONFIG_NOSYSTEM: '1', NO_COLOR: '1', GH_PAGER: '' };
}

class GitHubTools {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.spawn = options.spawn || spawn;
    this.paths = options.paths || {};
    this.resourcesPath = options.resourcesPath || process.resourcesPath || null;
    this.resolveProxy = options.resolveProxy;
    this.proxyMode = 'default';
    this.sources = {};
    this.cwd = options.cwd || os.homedir();
    this.hooks = null;
    this.job = null;
    this.stopGraceMs = options.stopGraceMs || 5000;
  }

  get running() { return Boolean(this.job); }
  get stopWarning() { return this.job?.stopWarning || null; }

  async detect() {
    for (const name of ['git', 'gh']) {
      if (!this.paths[name]) this.paths[name] = await this.locate(name);
    }
    return { git: this.paths.git || null, gh: this.paths.gh || null };
  }

  async locate(name) {
    const bundled = bundledToolPaths(this.resourcesPath, this.platform)[name];
    if (bundled) { this.sources[name] = 'bundled'; return bundled; }
    const candidates = this.platform === 'win32' ? [
      ...(name === 'git' ? [
        path.win32.join(this.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
        path.win32.join(this.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
      ] : [
        path.win32.join(this.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'),
        path.win32.join(this.env.LOCALAPPDATA || '', 'Programs', 'GitHub CLI', 'gh.exe'),
      ]),
    ] : [`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`];
    for (const candidate of candidates) {
      try { if (fs.statSync(candidate).isFile()) { this.sources[name] = 'installed'; return fs.realpathSync.native(candidate); } } catch {}
    }
    if (this.platform === 'win32') {
      const where = path.win32.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');
      try {
        const result = await this.raw(where, [`${name}.exe`], { cwd: this.cwd, timeoutMs: 5000 });
        if (result.code === 0) candidates.push(...result.stdout.split(/\r?\n/).filter(Boolean));
      } catch { /* Missing dependencies are reported to the user, never downloaded silently. */ }
    }
    for (const candidate of candidates) {
      try {
        if (fs.statSync(candidate).isFile()) { this.sources[name] = 'installed'; return fs.realpathSync.native(candidate); }
      } catch { /* Try the next installed location. */ }
    }
    return null;
  }

  async configureProxy(url) {
    this.proxyMode = 'default';
    const entries = Object.entries(this.env);
    const explicit = (name) => entries.find(([key, value]) => key === name.toLowerCase() && value)?.[1]
      || entries.find(([key, value]) => key.toUpperCase() === name && value)?.[1];
    const https = explicit('HTTPS_PROXY'); const http = explicit('HTTP_PROXY'); const all = explicit('ALL_PROXY');
    if (https || http || all) { this.proxyMode = 'environment'; return { HTTPS_PROXY: https || all || http, HTTP_PROXY: http || all || https }; }
    if (!this.resolveProxy) return {};
    const result = await this.resolveProxy(url);
    const first = String(result).split(';')[0].trim();
    const match = first.match(/^(PROXY|HTTPS|SOCKS5?|SOCKS) ([a-z0-9.[\]:-]+)$/i);
    if (!match) return {};
    const scheme = /^SOCKS/i.test(match[1]) ? 'socks5' : match[1].toUpperCase() === 'HTTPS' ? 'https' : 'http';
    this.proxyMode = 'system';
    return { HTTPS_PROXY: `${scheme}://${match[2]}`, HTTP_PROXY: `${scheme}://${match[2]}` };
  }

  git(args, cwd, options = {}) {
    if (!this.paths.git) throw new Error('Git نصب نیست؛ از پیوند رسمی در پنل نصب کنید و دوباره بررسی کنید.');
    if (!this.hooks) this.hooks = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-disabled-hooks-'));
    if (fs.readdirSync(this.hooks).length) throw new Error('پوشهٔ غیرفعال‌سازی hook معتبر نیست؛ برنامه را دوباره باز کنید.');
    const gh = this.paths.gh;
    const helper = gh ? `!${shellQuote(this.platform === 'win32' ? gh.replace(/\\/g, '/') : gh)} auth git-credential` : '';
    const flags = ['-c', `core.hooksPath=${this.hooks}`, '-c', 'core.fsmonitor=false', '-c', `init.templateDir=${this.hooks}`,
      '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'core.askPass=', '-c', 'push.recurseSubmodules=no', '-c', 'push.followTags=false',
      '-c', 'http.sslVerify=true', '-c', 'protocol.file.allow=never', '-c', 'protocol.ext.allow=never',
      '-c', 'submodule.recurse=false', '-c', 'filter.lfs.required=false', '-c', 'filter.lfs.process=',
      '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.clean=', '-c', 'credential.interactive=never',
      '-c', 'credential.helper=', '-c', 'credential.https://github.com.helper='];
    if (this.platform === 'win32') flags.push('-c', 'http.sslBackend=schannel');
    if (helper) flags.push('-c', `credential.https://github.com.helper=${helper}`);
    return this.raw(this.paths.git, [...flags, ...args], { ...options, cwd });
  }

  gh(args, options = {}) {
    if (!this.paths.gh) throw new Error('GitHub CLI نصب نیست؛ ابزار رسمی gh را نصب کنید.');
    return this.raw(this.paths.gh, args, { ...options, cwd: this.cwd });
  }

  raw(executable, args, options = {}) {
    if (this.job) throw new Error(this.job.stopWarning || 'عملیات قبلی Git/GitHub هنوز تمام نشده است.');
    const maxBytes = options.maxBytes || 2 * 1024 * 1024;
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const job = { promise, child: null, reason: null, finished: false, stdout: '', stderr: '', bytes: 0, hardTimer: null };
    this.job = job;
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    let timer;
    const finish = (code, error, confirmed = true) => {
      if (job.finished) {
        if (confirmed && this.job === job) this.job = null;
        return;
      }
      job.finished = true;
      clearTimeout(timer); clearTimeout(job.hardTimer);
      job.stdout += decoders.stdout.end(); job.stderr += decoders.stderr.end();
      if (confirmed && this.job === job) this.job = null;
      resolve({ code: Number.isInteger(code) ? code : null, stdout: job.stdout, stderr: job.stderr,
        error: job.stopWarning || job.reason || (error ? safeError(error) : null), stopWarning: job.stopWarning || null });
    };
    const receive = (stream, data) => {
      if (job.finished) return;
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const available = Math.max(0, maxBytes - job.bytes);
      const part = bytes.subarray(0, available);
      job.bytes += part.length;
      job[stream] += decoders[stream].write(part);
      if (options.onDeviceCode) {
        const match = (job.stdout + job.stderr).match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
        if (match) options.onDeviceCode(match[0]);
      }
      if (bytes.length > available) void this.stop('خروجی ابزار بیش از سقف مجاز بود؛ عملیات متوقف شد.');
    };
    const environment = toolEnvironment({ ...this.env, ...options.networkEnv });
    prependToolPath(environment, [this.paths.git, this.paths.gh].filter(Boolean), this.platform);
    job.forceFinish = () => { job.stopWarning = 'توقف ابزار تأیید نشد؛ Task Manager را بررسی کنید. تا خروج واقعی ابزار، عملیات جدید مسدود است.'; finish(null, job.stopWarning, false); };
    try {
      job.child = this.spawn(executable, args, { cwd: options.cwd || this.cwd,
        env: environment, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      job.child.stdout?.on('data', (data) => receive('stdout', data));
      job.child.stderr?.on('data', (data) => receive('stderr', data));
      job.child.once('error', (error) => {
        if (!Number.isSafeInteger(job.child?.pid)) finish(null, error.message);
        else void this.stop(safeError(error.message));
      });
      job.child.once('close', (code) => finish(code));
      job.child.stdin?.on('error', () => {});
      job.child.stdin?.end(options.input);
      timer = setTimeout(() => void this.stop('مهلت عملیات Git/GitHub تمام شد.'), options.timeoutMs || 180000);
    } catch (error) {
      if (Number.isSafeInteger(job.child?.pid)) void this.stop(safeError(error.message));
      else finish(null, error.message);
    }
    return promise;
  }

  async stop(reason = 'عملیات لغو شد؛ تغییرات انجام‌شده خودکار برنمی‌گردند.') {
    const job = this.job;
    if (!job) return null;
    if (!job.reason) {
      job.reason = reason;
      job.hardTimer = setTimeout(() => job.forceFinish?.(), this.stopGraceMs);
      const child = job.child;
      if (this.platform === 'win32' && Number.isSafeInteger(child?.pid) && child.pid > 0) {
        try {
          const killer = this.spawn(path.win32.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
            ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
          killer.once('error', () => { try { child.kill(); } catch {} });
          killer.once('close', () => { try { child.kill(); } catch {} });
          const killTimer = setTimeout(() => { try { killer.kill(); child.kill(); } catch {} }, 3000);
          killer.once('close', () => clearTimeout(killTimer));
        } catch { try { child?.kill(); } catch {} }
      } else { try { child?.kill(); } catch {} }
    }
    return job.promise;
  }

  dispose() {
    // Only our random, deliberately empty hook directory; never a project path.
    if (this.hooks) { try { fs.rmdirSync(this.hooks); } catch {} this.hooks = null; }
  }
}

module.exports = { GitHubTools, toolEnvironment, shellQuote, safeError };
