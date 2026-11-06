'use strict';

// This function runs in an isolated renderer world. It has DOM access only:
// no require, Electron bridge, Node integration, cookies or private site APIs.
function siteAdapter(input) {
  if (input.expiresAt < Date.now()) return { ok: false, reason: 'expired' };
  const visible = (element) => Boolean(element && element.getClientRects().length
    && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden], [aria-hidden="true"]'));
  const root = document.querySelector('main') || document.body;
  const composers = [...root.querySelectorAll('textarea, [contenteditable="true"][role="textbox"]')]
    .filter((element) => visible(element) && !element.disabled && !element.readOnly);
  const composer = composers.length === 1 ? composers[0] : null;
  const text = () => composer ? (composer.tagName === 'TEXTAREA' ? composer.value : composer.textContent) : '';
  const container = composer?.closest('form, [data-testid="chat-composer"], [data-testid="composer"]')
    || composer?.parentElement?.parentElement;
  const buttons = container ? [...container.querySelectorAll('button')].filter((button) => {
    if (!visible(button)) return false;
    const label = (button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent || '').trim();
    return /^(?:send(?: (?:message|prompt))?|ارسال(?: پیام)?)$/i.test(label)
      || /^(?:send-button|send-message-button|chat-send)$/.test(button.getAttribute('data-testid') || '')
      || (composer.closest('form') && button.getAttribute('type') === 'submit');
  }) : [];
  const busy = Boolean(container && [...container.querySelectorAll('button')].some((button) => (
    visible(button) && /^(?:stop(?: generating| response)?|توقف)$/i.test((button.getAttribute('aria-label') || button.textContent || '').trim())
  )));
  const diagnostic = !composer ? `composer-count:${composers.length}` : buttons.length !== 1 ? `send-button-count:${buttons.length}` : 'ready';

  if (input.action === 'snapshot') {
    const blocks = [...root.querySelectorAll('pre')].filter((pre) => visible(pre)
      && !pre.closest('[contenteditable="true"], [data-message-author-role="user"], [data-role="user"], [data-message-role="user"], aside, nav, header'))
      .slice(-40).map((pre) => (pre.querySelector('code') || pre).textContent).filter((value) => value.length <= 52000);
    return { url: location.href, diagnostic, busy, blocks };
  }
  if (diagnostic !== 'ready') return { ok: false, reason: diagnostic };
  if (input.action === 'prepare') {
    if (text().trim()) return { ok: false, reason: 'draft-present' };
    if (busy) return { ok: false, reason: 'model-busy' };
    if (composer.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(composer, input.text);
    } else {
      // Plain-text insertion only. Never interpret output as HTML.
      composer.textContent = input.text;
    }
    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: input.text }));
    composer.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: text() === input.text, reason: 'prepared' };
  }
  if (input.action === 'send') {
    if (text() !== input.text) return { ok: false, reason: 'draft-changed' };
    const button = buttons[0];
    if (busy || button.disabled || button.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'send-disabled' };
    button.click();
    return { ok: true, reason: 'clicked' };
  }
  return { ok: false, reason: 'unknown-action' };
}

function adapterScript(action, text) {
  if (!['snapshot', 'prepare', 'send'].includes(action)) throw new Error('Unsupported adapter action');
  if (action !== 'snapshot' && (typeof text !== 'string' || text.length > 32000)) throw new Error('Invalid chat message');
  return `(${siteAdapter.toString()})(${JSON.stringify({ action, text, expiresAt: Date.now() + 5000 })})`;
}

module.exports = { adapterScript };
