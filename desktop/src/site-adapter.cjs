'use strict';

// DOM-only isolated world: never require, Node, credentials, private site APIs,
// or a claim that the cloud Agent's tools have become local Windows tools.
function siteAdapter(input) {
  if (input.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  if (navigator.onLine === false) return ['snapshot', 'diagnostics'].includes(input.action)
    ? { url: location.href, diagnostic: 'offline', offline: true, busy: false, blocks: [] }
    : { ok: false, reason: 'offline' };
  const visible = (element) => Boolean(element && element.getClientRects().length
    && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden], [aria-hidden="true"]'));
  const editor = '.monaco-editor, .CodeMirror, .cm-editor, [data-testid="code-editor"]';
  const candidates = [...document.body.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [contenteditable=""]')]
    .filter((element) => visible(element) && !element.disabled && !element.readOnly
      && !element.closest(editor + ', nav, header, pre, code, [role="search"], [role="dialog"], dialog'));
  // Some rich editors put a second editable inside their wrapper. Count the
  // actual deepest editor once; independent editors still fail closed.
  const composers = candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));
  const composer = composers.length === 1 ? composers[0] : null;
  const text = () => composer ? (composer.tagName === 'TEXTAREA' ? composer.value : typeof composer.innerText === 'string' ? composer.innerText : composer.textContent) : '';
  const normalized = (value) => {
    const result = value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
    return composer?.tagName === 'TEXTAREA' ? result : result.replace(/\n+$/, '');
  };
  const matches = () => normalized(text()) === normalized(input.text);
  const label = (button) => (button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '').trim().replace(/\s+/g, ' ');
  const isSend = (button, container) => visible(button) && (
    /^(?:send(?: (?:message|prompt))?|submit(?: (?:message|prompt))?|ارسال(?: پیام)?)(?:\s*\((?:(?:ctrl|cmd)\s*\+\s*)?enter\))?$/i.test(label(button))
    || /^(?:send|send-button|send-message-button|chat-send|prompt-send-button|submit-button)$/.test(button.getAttribute('data-testid') || '')
    || (container.tagName === 'FORM' && button.type === 'submit' && !label(button))
  );
  const isStop = (button) => visible(button) && (
    /^(?:stop(?: generating| response| generation| streaming)?|توقف(?: تولید| پاسخ)?)$/i.test(label(button))
    || /^(?:stop-button|stop-generation|stop-generating)$/.test(button.getAttribute('data-testid') || '')
  );
  let container = composer?.closest('form, [data-testid="chat-composer"], [data-testid="composer"]');
  if (!container && composer) {
    let parent = composer.parentElement;
    for (let depth = 0; parent && parent !== document.body && depth < 8; depth += 1, parent = parent.parentElement) {
      if ([...parent.querySelectorAll('button')].some((button) => isSend(button, parent) || isStop(button))) { container = parent; break; }
    }
  }
  const attachments = container ? [...container.querySelectorAll('input[type="file"]')].some((element) => element.files?.length)
    || Boolean(container.querySelector('[data-testid="attachment-preview"], [data-testid="file-preview"], [data-attachment-id]')) : false;
  const buttons = container ? [...container.querySelectorAll('button')].filter((button) => isSend(button, container)) : [];
  const stops = container ? [...container.querySelectorAll('button')].filter(isStop) : [];
  const busy = stops.length > 0;
  // A generating UI can replace Send with Stop. Keep observing it, but never
  // parse/execute a streaming request until that state has ended.
  const diagnostic = !composer ? `composer-count:${composers.length}` : buttons.length === 1 || (buttons.length === 0 && stops.length === 1)
    ? 'ready' : `send-button-count:${buttons.length}`;

  if (input.action === 'diagnostics') return { diagnostic, composerCount: composers.length, sendButtonCount: buttons.length,
    composerKind: composer ? composer.tagName === 'TEXTAREA' ? 'textarea' : 'contenteditable' : 'none',
    draftPresent: Boolean(text().trim() || attachments), busy, offline: false, frameCount: Math.min(100, document.querySelectorAll('iframe').length),
    sendDisabled: buttons.length === 1 ? Boolean(buttons[0].disabled || buttons[0].getAttribute('aria-disabled') === 'true') : null };
  if (input.action === 'snapshot') {
    const composerAside = composer?.closest('aside');
    const blocks = [...document.body.querySelectorAll('pre')].filter((pre) => {
      if (!visible(pre) || pre.closest('[contenteditable], nav, header, [role="dialog"], dialog, ' + editor)) return false;
      const user = pre.closest('[data-message-author-role="user"], [data-role="user"], [data-message-role="user"]');
      if (user) return false;
      const assistant = pre.closest('[data-message-author-role="assistant"], [data-role="assistant"], [data-message-role="assistant"]');
      const aside = pre.closest('aside');
      return !aside || Boolean(assistant) || aside === composerAside;
    }).slice(-40).map((pre) => (pre.querySelector('code') || pre).textContent).filter((value) => value.length <= 52000);
    return { url: location.href, diagnostic, busy, blocks };
  }
  // Clicking is not delivery. Check once after the click (never click twice)
  // until the UI has consumed the draft or entered its generating state.
  if (input.action === 'confirm-send') {
    if (composer && (!text().trim() || busy)) return { ok: true, reason: 'accepted' };
    if (composer && !matches()) return { ok: false, reason: 'draft-changed' };
    return { ok: false, reason: 'send-pending' };
  }
  if (diagnostic !== 'ready') return { ok: false, reason: diagnostic };
  if (input.action === 'prepare') {
    if (text().trim() || attachments) return { ok: false, reason: 'draft-present' };
    if (busy) return { ok: false, reason: 'model-busy' };
    composer.focus();
    if (!composer.isConnected || text().trim()) return { ok: false, reason: 'draft-present' };
    if (composer.tagName === 'TEXTAREA') {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(composer, input.text);
    } else {
      // Chromium's editing pipeline notifies Lexical/ProseMirror/Tiptap-style
      // editors; merely assigning textContent does not update their state.
      const selection = getSelection(); const range = document.createRange();
      range.selectNodeContents(composer); selection.removeAllRanges(); selection.addRange(range);
      if (typeof document.execCommand !== 'function' || !document.execCommand('insertText', false, input.text)) composer.textContent = input.text;
    }
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: input.text }));
    composer.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: matches(), reason: 'prepared' };
  }
  if (input.action === 'send') {
    if (attachments) return { ok: false, reason: 'draft-present' };
    if (!matches()) return { ok: false, reason: 'draft-changed' };
    const button = buttons[0];
    if (busy || button.disabled || button.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'send-disabled' };
    button.click();
    return { ok: true, reason: 'clicked', accepted: !text().trim() };
  }
  return { ok: false, reason: 'unknown-action' };
}

function adapterScript(action, text) {
  if (!['snapshot', 'diagnostics', 'prepare', 'send', 'confirm-send'].includes(action)) throw new Error('Unsupported adapter action');
  if (!['snapshot', 'diagnostics'].includes(action) && (typeof text !== 'string' || text.length > 32000)) throw new Error('Invalid chat message');
  return `(${siteAdapter.toString()})(${JSON.stringify({ action, text, expiresAt: Date.now() + 5000 })})`;
}

module.exports = { adapterScript };
