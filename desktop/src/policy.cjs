'use strict';

const APP_URL = 'https://arena.ai/';
const APP_DOMAINS = ['arena.ai', 'lmarena.ai'];
const AUTH_HOSTS = new Set(['accounts.google.com', 'appleid.apple.com']);
const ACTIONS = new Set(['back', 'forward', 'reload', 'home', 'open-browser', 'menu']);
const MAX_URL_LENGTH = 8192;

function parseUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isSecureWebUrl(url) {
  return Boolean(url && url.protocol === 'https:' && url.port === '');
}

function isAppUrl(value) {
  const url = parseUrl(value);
  return isSecureWebUrl(url) && APP_DOMAINS.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
}

function isAuthUrl(value) {
  const url = parseUrl(value);
  if (!isSecureWebUrl(url)) return false;
  if (AUTH_HOSTS.has(url.hostname)) return true;
  return url.hostname === 'github.com' && ['/login', '/session', '/sessions'].some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
}

function isEmbeddedUrl(value) {
  return isAppUrl(value) || isAuthUrl(value);
}

function isSafeExternalUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && (url.protocol === 'https:' || url.protocol === 'mailto:'));
}

function isAllowedPopup(value, opener) {
  return isEmbeddedUrl(opener) && (value === 'about:blank' || isEmbeddedUrl(value));
}

function navigationKind(value) {
  if (isAppUrl(value)) return 'app';
  if (isAuthUrl(value)) return 'auth';
  if (isSafeExternalUrl(value)) return 'external';
  return 'blocked';
}

function originLabel(value) {
  const url = parseUrl(value);
  return url?.protocol === 'https:' ? url.hostname : 'arena.ai';
}

function isAllowedAction(value) {
  return typeof value === 'string' && ACTIONS.has(value);
}

// The bridge only accepts messages from the local shell's top-level frame.
function isTrustedSender(event, shellContents) {
  return Boolean(
    shellContents && !shellContents.isDestroyed()
    && event.sender === shellContents
    && event.senderFrame === shellContents.mainFrame,
  );
}

function canGrantPermission(permission, requestingUrl, isMainFrame = true) {
  return isMainFrame && isAppUrl(requestingUrl)
    && ['clipboard-sanitized-write', 'fullscreen'].includes(permission);
}

module.exports = {
  APP_URL,
  parseUrl,
  isAppUrl,
  isAuthUrl,
  isEmbeddedUrl,
  isSafeExternalUrl,
  isAllowedPopup,
  navigationKind,
  originLabel,
  isAllowedAction,
  isTrustedSender,
  canGrantPermission,
};
