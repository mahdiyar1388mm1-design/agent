'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../src/policy.cjs');

test('Arena and the legacy domain are embedded over standard HTTPS only', () => {
  for (const url of [
    'https://arena.ai/', 'https://www.arena.ai/chat?id=123',
    'https://auth.arena.ai/callback', 'https://lmarena.ai/',
    'https://www.lmarena.ai/', 'https://ARENA.AI:443/',
  ]) assert.equal(policy.isAppUrl(url), true, url);
});

test('deceptive domains, credentials, protocols and ports are never embedded', () => {
  for (const url of [
    'https://notarena.ai/', 'https://arena.ai.evil.test/', 'https://evil.test/arena.ai',
    'https://arena.ai@evil.test/', 'https://user:secret@arena.ai/',
    'https://evil-arena.ai/', 'https://arena.ai:8443/', 'http://arena.ai/',
    'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello',
    'arena.ai', '', null, undefined, {}, 'https://аrena.ai/',
  ]) assert.equal(policy.isAppUrl(url), false, String(url));
});

test('OAuth is limited to explicit providers and GitHub authentication paths', () => {
  for (const url of [
    'https://accounts.google.com/o/oauth2/v2/auth', 'https://appleid.apple.com/auth/authorize',
    'https://github.com/login', 'https://github.com/login/oauth/authorize',
    'https://github.com/session', 'https://github.com/sessions/two-factor',
  ]) assert.equal(policy.isAuthUrl(url), true, url);
  for (const url of [
    'https://github.com/some-repo', 'https://github.com/loginfoo',
    'https://accounts.google.com.evil.test/', 'https://accounts.google.com:8443/',
    'http://accounts.google.com/', 'https://evil.test/login',
  ]) assert.equal(policy.isAuthUrl(url), false, url);
});

test('external links require a safe protocol and are not embedded', () => {
  assert.equal(policy.navigationKind('https://example.com'), 'external');
  assert.equal(policy.navigationKind('mailto:help@example.com'), 'external');
  assert.equal(policy.navigationKind('https://arena.ai'), 'app');
  assert.equal(policy.navigationKind('https://accounts.google.com'), 'auth');
  for (const url of ['file:///C:/Windows/a.exe', 'cmd:calc.exe', 'powershell:calc',
    'javascript:alert(1)', 'data:text/html,hi', 'http://arena.ai',
    'https://user:password@example.com', 'ms-appinstaller:https://example.com']) {
    assert.equal(policy.navigationKind(url), 'blocked', url);
  }
});

test('popups need both a trusted opener and an allowed destination', () => {
  assert.equal(policy.isAllowedPopup('about:blank', 'https://arena.ai'), true);
  assert.equal(policy.isAllowedPopup('https://accounts.google.com', 'https://arena.ai'), true);
  assert.equal(policy.isAllowedPopup('https://arena.ai/callback', 'https://accounts.google.com'), true);
  assert.equal(policy.isAllowedPopup('https://evil.test', 'https://arena.ai'), false);
  assert.equal(policy.isAllowedPopup('file:///tmp/a.html', 'https://arena.ai'), false);
  assert.equal(policy.isAllowedPopup('https://arena.ai', 'https://evil.test'), false);
  assert.equal(policy.isAllowedPopup('about:blank', 'about:blank'), false);
});

test('toolbar origin never includes OAuth parameters or account secrets', () => {
  assert.equal(policy.originLabel('https://accounts.google.com/login?code=secret#token'), 'accounts.google.com');
  assert.equal(policy.originLabel('https://arena.ai/chat?private=hello'), 'arena.ai');
  assert.equal(policy.originLabel('not a URL'), 'arena.ai');
  assert.equal(policy.parseUrl(`https://arena.ai/${'a'.repeat(9000)}`), null);
});

test('the action bridge rejects arbitrary methods, URLs and objects', () => {
  for (const action of ['back', 'forward', 'reload', 'home', 'open-browser', 'menu']) {
    assert.equal(policy.isAllowedAction(action), true);
  }
  for (const action of ['exec', 'openExternal', 'https://evil.test', '__proto__', null, {}, ['home']]) {
    assert.equal(policy.isAllowedAction(action), false);
  }
});

test('IPC is accepted only from the live shell top-level frame', () => {
  const frame = {};
  const shell = { mainFrame: frame, isDestroyed: () => false };
  assert.equal(policy.isTrustedSender({ sender: shell, senderFrame: frame }, shell), true);
  assert.equal(policy.isTrustedSender({ sender: {}, senderFrame: frame }, shell), false);
  assert.equal(policy.isTrustedSender({ sender: shell, senderFrame: {} }, shell), false);
  assert.equal(policy.isTrustedSender({ sender: shell, senderFrame: frame }, null), false);
  shell.isDestroyed = () => true;
  assert.equal(policy.isTrustedSender({ sender: shell, senderFrame: frame }, shell), false);
});

test('sensitive device permissions are denied, including inside untrusted iframes', () => {
  for (const permission of ['media', 'geolocation', 'notifications', 'display-capture',
    'clipboard-read', 'midiSysex', 'usb', 'serial', 'hid', 'pointerLock']) {
    assert.equal(policy.canGrantPermission(permission, 'https://arena.ai/'), false, permission);
  }
  assert.equal(policy.canGrantPermission('clipboard-sanitized-write', 'https://arena.ai/'), true);
  assert.equal(policy.canGrantPermission('fullscreen', 'https://arena.ai/'), true);
  assert.equal(policy.canGrantPermission('clipboard-sanitized-write', 'https://evil.test/'), false);
  assert.equal(policy.canGrantPermission('clipboard-sanitized-write', 'https://arena.ai/', false), false);
  assert.equal(policy.canGrantPermission('fullscreen', 'https://accounts.google.com/'), false);
});
