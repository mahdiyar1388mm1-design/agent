'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { diagnosticReport, diagnosticSummary } = require('../src/diagnostics.cjs');
const { githubIssue } = require('../src/github-errors.cjs');
const { safeError } = require('../src/github-tools.cjs');

test('technical report drops URLs, account/repository names, paths, chats, commands, environment and secrets', () => {
  const secret = 'ghp_' + 'f'.repeat(36);
  const report = diagnosticReport({ version: '1.3.1', platform: 'win32', arch: 'x64', electron: '45.2.3',
    siteUrl: `https://arena.ai/c/PRIVATE_CONVERSATION?token=${secret}`, siteReady: true,
    adapter: { diagnostic: 'ready', composerCount: 1, sendButtonCount: 1, composerKind: 'textarea', blocks: ['PRIVATE_CHAT'], draft: secret },
    terminal: { status: 'waiting', supported: true, session: 'PRIVATE_SESSION', task: 'PRIVATE_TASK', folder: 'C:\\PRIVATE_FOLDER',
      pending: { command: 'PRIVATE_COMMAND' }, result: { stdout: secret }, shareText: secret },
    github: { status: 'ready', checked: true, dependencies: { git: 'C:\\PRIVATE_GIT', gh: 'C:\\PRIVATE_GH' }, toolSources: { git: 'bundled', gh: 'bundled' },
      account: { login: 'PRIVATE_ACCOUNT', id: 123456 }, project: { repo: { url: 'https://github.com/PRIVATE_REPO' }, folder: 'C:\\PRIVATE_PROJECT', branch: 'PRIVATE_BRANCH' },
      lastIssue: { code: 'network', hint: secret }, repositories: [secret], stderr: secret }, env: { GH_TOKEN: secret } });
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /PRIVATE_|ghp_|github\.com|C:\\\\|token=/);
  assert.equal(report.site.origin, 'https://arena.ai'); assert.equal(report.terminal.active, true);
  assert.equal(report.github.accountVerified, true); assert.equal(report.github.gitSource, 'bundled');
  assert.equal(report.github.issue, 'network'); assert.equal(report.github.branchSelected, true);
});

test('unexpected status strings and malformed diagnostic metadata cannot become an export channel', () => {
  const report = diagnosticReport({ version: '<secret>', platform: 'PRIVATE_PLATFORM', arch: 'PRIVATE_ARCH', electron: 'PRIVATE_ELECTRON',
    siteUrl: 'https://PRIVATE_HOST.invalid/private', siteError: 'PRIVATE_ERROR',
    adapter: { diagnostic: 'PRIVATE_DIAGNOSTIC', composerKind: 'PRIVATE_EDITOR', composerCount: -3, sendButtonCount: 99999 },
    terminal: { status: 'PRIVATE_STATUS' }, github: { status: 'PRIVATE_STATUS', toolSources: { git: 'PRIVATE_SOURCE' }, lastIssue: { code: 'PRIVATE_ISSUE' } } });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_|secret/);
  assert.equal(report.adapter.composerCount, null); assert.equal(report.adapter.sendButtonCount, 1000);
  assert.equal(report.site.origin, 'unavailable');
});

test('summary offers concrete missing-composer/draft/auth guidance without promising cloud integration', () => {
  const report = diagnosticReport({ siteReady: true, adapter: { diagnostic: 'composer-count:0', draftPresent: true },
    github: { checked: true, dependencies: { git: true, gh: true } } });
  const text = diagnosticSummary(report);
  assert.match(text, /کادر پیام پیدا نشد/); assert.match(text, /پیش‌نویس/); assert.match(text, /مخزن عمومی بدون ورود/);
  assert.match(text, /این دو یکی نیستند/);
});

for (const [message, code] of [
  ['To get started, gh auth login', 'authentication'], ['fatal: Authentication failed', 'authentication'],
  ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", 'authentication'],
  ['The value of the GH_TOKEN environment variable is being used for authentication', 'environment-auth'],
  ['schannel: certificate verify failed', 'certificate'], ['proxyconnect: HTTP 407', 'proxy'],
  ['dial tcp: no such host', 'network'], ['HTTP 403: Resource not accessible', 'access'],
  ['ENOENT gh.exe', 'missing-tool'], ['An unrelated operation failed', 'operation'],
]) {
  test(`GitHub errors have an actionable nonsecret category: ${code} / ${message.slice(0, 36)}`, () => {
    const issue = githubIssue(message); assert.equal(issue.code, code);
    assert.equal(typeof issue.hint, 'string');
  });
}

test('local CLI error previews redact URL credentials as well as recognizable tokens', () => {
  const result = safeError('https://USER:PASSWORD@proxy.invalid:8080 https://PRIVATE_USER@github.com/repo ghp_' + 'f'.repeat(36));
  assert.doesNotMatch(result, /USER|PASSWORD|ghp_|PRIVATE/); assert.match(result, /redacted/);
});
