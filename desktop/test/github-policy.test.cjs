'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { repository, branchName, folderName, safeRelative, excludedFile, sensitiveContent, projectMessage } = require('../src/github-policy.cjs');

test('GitHub URLs are exact repositories, never arbitrary hosts, credentials, paths or shell arguments', () => {
  assert.equal(repository('owner/repo').cloneUrl, 'https://github.com/owner/repo.git');
  assert.equal(repository('https://github.com/owner/repo.git').fullName, 'owner/repo');
  assert.equal(repository('git@github.com:owner/repo.git', true).fullName, 'owner/repo');
  assert.equal(repository('ssh://git@github.com/owner/repo.git', true).fullName, 'owner/repo');
  for (const input of [null, {}, '', '--help', 'owner/../repo', 'owner/repo/tree/main', 'http://github.com/o/r',
    'https://github.com.evil.invalid/o/r', 'https://github.com@evil.invalid/o/r', 'https://user:token@github.com/o/r',
    'https://github.com/o/r?token=x', 'https://github.com/o/r#x', 'https://github.com:8443/o/r',
    'https://github.com/o/%2e%2e/r', 'owner/repo\ncommand', 'owner/repo\u202e']) assert.throws(() => repository(input), String(input));
});

test('branches and project-relative filenames cannot become options, revisions or path traversal', () => {
  for (const value of ['main', 'arena/feature-1', 'feature/فارسی']) assert.equal(branchName(value), value);
  for (const value of ['', '-main', '../main', 'a..b', 'HEAD~1', 'main:elsewhere', 'a@{b', 'a\\b', '.hidden', 'a/.git', 'a.lock', 'a/', 'a//b', 'a b']) assert.throws(() => branchName(value), value);
  assert.equal(safeRelative('src/file with spaces.ts'), true);
  for (const value of ['../secret', '/absolute', 'C:/file', 'x/../../secret', 'x/.git/config', 'a\\b', 'a\0b']) assert.equal(safeRelative(value), false, value);
  assert.equal(folderName('CON'), 'project-CON');
  assert.equal(folderName('repo.'), 'repo');
});

test('publication excludes common secrets and artifacts; content warnings do not claim complete detection', () => {
  for (const name of ['.env', 'sub/.env.local', 'secret.pem', '.ssh/id_rsa', 'node_modules/a/index.js', 'dist/app.js', 'credentials.json']) assert.equal(excludedFile(name), true, name);
  assert.equal(excludedFile('src/app.ts'), false);
  assert.equal(sensitiveContent(Buffer.from('password=abc123')), true);
  assert.equal(sensitiveContent(Buffer.from('ghp_' + 'a'.repeat(30))), true);
  assert.equal(sensitiveContent(Buffer.from('-----BEGIN PRIVATE KEY-----\nabc')), true);
  assert.equal(sensitiveContent(Buffer.from('ordinary source file')), false);
});

test('Agent handoff includes only selected repository context, not paths, tokens or a claimed attachment', () => {
  const message = projectMessage({ repo: repository('owner/project'), branch: 'arena/work', head: 'a'.repeat(40), folder: 'C:\\PRIVATE_PATH', token: 'PRIVATE_TOKEN' }, 'Improve this project.');
  assert.match(message, /https:\/\/github.com\/owner\/project/);
  assert.match(message, /arena\/work/);
  assert.match(message, /does NOT attach a repository/);
  assert.match(message, /not my Windows computer/);
  assert.match(message, /Improve this project/);
  assert.equal(message.includes('PRIVATE_PATH'), false);
  assert.equal(message.includes('PRIVATE_TOKEN'), false);
  assert.throws(() => projectMessage({ repo: repository('o/r'), branch: 'main' }, ''), /۴۰۰۰/);
});
