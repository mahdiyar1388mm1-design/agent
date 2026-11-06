'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { bundledToolPaths, prependToolPath } = require('./tool-paths.cjs');
const { validCommand } = require('./terminal-protocol.cjs');

class PowerShellRunner {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.spawn = options.spawn || spawn;
    this.env = options.env || process.env;
    this.resourcesPath = options.resourcesPath || process.resourcesPath;
    this.timeoutMs = options.timeoutMs ?? 120000;
    this.maxBytes = options.maxBytes ?? 131072;
    this.job = null;
  }

  get supported() { return this.platform === 'win32'; }
  get running() { return Boolean(this.job); }

  async run(command, cwd) {
    if (!this.supported) throw new Error('اجرای ترمینال این نسخه فقط روی Windows پشتیبانی می‌شود.');
    if (this.job) throw new Error('یک فرمان دیگر در حال اجراست.');
    if (!validCommand(command)) throw new Error('فرمان معتبر نیست.');
    if (!path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error('پوشهٔ اجرا معتبر نیست.');
    const canonical = fs.realpathSync(cwd);
    const systemRoot = this.env.SystemRoot || 'C:\\Windows';
    const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const environment = { ...this.env };
    for (const key of Object.keys(environment)) {
      if (/^(?:ELECTRON_|NODE_OPTIONS$|NODE_INSPECT_RESUME_ON_START$)/i.test(key)) delete environment[key];
    }
    prependToolPath(environment, Object.values(bundledToolPaths(this.resourcesPath, this.platform)), this.platform);
    const script = '$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false);\n' + command;
    let resolveResult;
    const done = new Promise((resolve) => { resolveResult = resolve; });
    const job = { done, child: null, stdout: '', stderr: '', bytes: 0, reason: null,
      truncated: false, finished: false, killing: null, hardTimer: null };
    this.job = job;
    const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };
    let timer;
    const finish = (exitCode, error = null) => {
      if (job.finished) return;
      job.finished = true;
      clearTimeout(timer);
      clearTimeout(job.hardTimer);
      job.stdout += decoders.stdout.end();
      job.stderr += decoders.stderr.end();
      if (this.job === job) this.job = null;
      resolveResult({ status: job.reason || (error ? 'error' : 'completed'),
        exitCode: Number.isInteger(exitCode) ? exitCode : null,
        stdout: job.stdout, stderr: job.stderr, truncated: job.truncated, error });
    };
    const receive = (stream, data) => {
      if (job.finished) return;
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const available = Math.max(0, this.maxBytes - job.bytes);
      const part = buffer.subarray(0, available);
      job.bytes += part.length;
      job[stream] += decoders[stream].write(part);
      if (buffer.length > available) {
        job.truncated = true;
        void this.stop('output_limit');
      }
    };
    try {
      const child = this.spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        cwd: canonical, env: environment, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.child = child;
      child.stdout?.on('data', (data) => receive('stdout', data));
      child.stderr?.on('data', (data) => receive('stderr', data));
      child.once('error', (error) => finish(null, error.message));
      child.once('close', (code) => finish(code));
      timer = setTimeout(() => void this.stop('timeout'), this.timeoutMs);
      job.forceFinish = () => finish(null, 'توقف فرایند تأیید نشد؛ فرایندهای جداشده را در Task Manager بررسی کنید.');
    } catch (error) {
      finish(null, error.message);
    }
    return done;
  }

  async stop(reason = 'cancelled') {
    const job = this.job;
    if (!job) return null;
    if (!job.reason) job.reason = reason;
    if (!job.killing) {
      job.killing = this.killTree(job.child);
      job.hardTimer = setTimeout(() => job.forceFinish?.(), 5000);
      // Keep the child identity captured here; never use a PID supplied over IPC.
      void job.killing.catch(() => {}).then(() => {
        if (!job.finished) {
          try { job.child?.kill(); } catch { /* close/error events handle completion */ }
        }
      });
    }
    return job.done;
  }

  killTree(child) {
    if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1) return Promise.resolve();
    const executable = path.win32.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe');
    return new Promise((resolve) => {
      let finished = false;
      const finish = () => { if (!finished) { finished = true; clearTimeout(timer); resolve(); } };
      let timer;
      try {
        const killer = this.spawn(executable, ['/PID', String(child.pid), '/T', '/F'], {
          shell: false, windowsHide: true, stdio: 'ignore',
        });
        killer.once('error', finish);
        killer.once('close', finish);
        timer = setTimeout(() => { try { killer.kill(); } catch {} finish(); }, 3000);
      } catch { finish(); }
    });
  }
}

module.exports = { PowerShellRunner };
