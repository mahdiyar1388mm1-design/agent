'use strict';

(() => {
  const bridge = window.arenaDesktop;
  if (!bridge?.terminal) return;
  const byId = (id) => document.getElementById(id);
  let state = null;
  let revision = -1;
  let resultKey = '';
  let inFlight = false;
  const readable = (value) => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));

  const labels = {
    off: 'غیرفعال', ready: 'آمادهٔ تنظیم', starting: 'شروع اتصال', waiting: 'منتظر مدل',
    review: 'نیازمند تأیید', confirming: 'تأیید نهایی', running: 'در حال اجرا',
    result: 'بازبینی خروجی', sharing: 'ارسال خروجی', paused: 'متوقف', stopping: 'در حال توقف',
  };

  function render(snapshot) {
    if (!snapshot || snapshot.revision < revision) return;
    revision = snapshot.revision;
    const previousSession = state?.session;
    state = snapshot;
    byId('terminal-status').textContent = labels[state.status] || state.status;
    byId('terminal-message').textContent = state.message;
    byId('terminal-toggle').dataset.status = state.status;
    byId('terminal-folder').textContent = state.folder || 'هنوز پوشه‌ای انتخاب نشده است';
    byId('terminal-support').hidden = state.supported;
    byId('terminal-step').textContent = state.session ? `مرحلهٔ ${state.seq} از ۲۰` : 'جلسه‌ای فعال نیست';
    const locked = inFlight || Boolean(state.session) || Boolean(state.busy) || ['running', 'stopping', 'confirming', 'starting'].includes(state.status);
    byId('terminal-choose').disabled = locked;
    byId('terminal-task').disabled = locked;
    for (const id of ['terminal-auto-execute', 'terminal-auto-share']) byId(id).disabled = locked;
    if (state.session && state.status !== 'starting') {
      byId('terminal-auto-execute').checked = state.autoExecute === true;
      byId('terminal-auto-share').checked = state.autoShare === true;
    } else if (previousSession && !state.session) {
      byId('terminal-auto-execute').checked = false;
      byId('terminal-auto-share').checked = false;
    }
    byId('terminal-mode').textContent = state.session
      ? state.status === 'starting' ? 'در انتظار تأیید مجوزهای همین جلسه…'
        : `اجرای خودکار: ${state.autoExecute ? 'روشن' : 'خاموش'} | ارسال خودکار: ${state.autoShare ? 'روشن' : 'خاموش'}${state.expiresAt ? ` | تا ${new Date(state.expiresAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : 'مجوز خودکاری فعال نیست.';
    const reasons = Array.isArray(state.reviewReasons) ? state.reviewReasons : [];
    byId('terminal-review-reasons').hidden = reasons.length === 0;
    byId('terminal-review-reasons').textContent = reasons.length ? `نیاز به بررسی دستی: ${reasons.join('؛ ')}` : '';
    byId('terminal-start').disabled = locked || !state.supported || !state.folder;
    byId('terminal-disable').disabled = !state.session && !state.busy && !['running', 'stopping', 'starting'].includes(state.status);
    byId('terminal-pending').hidden = !state.pending;
    byId('terminal-reason').textContent = state.pending?.reason || 'بدون توضیح؛ متن کامل فرمان را بررسی کنید.';
    byId('terminal-command').textContent = state.pending?.command || '';
    byId('terminal-approve').disabled = inFlight || state.status !== 'review';
    byId('terminal-reject').disabled = inFlight || state.status !== 'review';
    byId('terminal-result').hidden = !state.result;
    byId('terminal-output').textContent = state.result ? [
      `Status: ${state.result.status} | Exit: ${state.result.exitCode ?? 'none'}`,
      state.result.stdout || '', state.result.stderr || '', state.result.error || '',
    ].filter(Boolean).map(readable).join('\n\n') : '';
    const key = state.result ? `${state.session}:${state.seq}` : '';
    if (key !== resultKey) {
      byId('terminal-share-text').value = state.shareText || '';
      resultKey = key;
    }
    byId('terminal-share').disabled = inFlight || state.status !== 'result';
  }

  async function perform(action) {
    if (inFlight && action !== 'disable') return;
    byId('terminal-error').hidden = true;
    const payload = action === 'start' ? { task: byId('terminal-task').value,
      autoExecute: byId('terminal-auto-execute').checked, autoShare: byId('terminal-auto-share').checked }
      : ['approve', 'reject', 'share'].includes(action) ? {
        session: state?.session, seq: state?.seq,
        ...(action === 'share' ? { text: byId('terminal-share-text').value } : {}),
      } : undefined;
    // A running command must always remain stoppable while its IPC promise is pending.
    inFlight = true;
    if (state) render(state);
    try {
      render(await bridge.terminal(action, payload));
    } catch (error) {
      byId('terminal-error').textContent = error.message || 'عملیات انجام نشد.';
      byId('terminal-error').hidden = false;
    } finally {
      inFlight = false;
      if (state) render(state);
    }
  }

  for (const button of document.querySelectorAll('[data-terminal]')) {
    button.addEventListener('click', () => void perform(button.dataset.terminal));
  }
  byId('terminal-close').addEventListener('click', () => void bridge.perform('terminal'));
  const unsubscribe = bridge.onTerminalState(render);
  bridge.getTerminalState().then(render).catch(() => {
    byId('terminal-error').textContent = 'ارتباط با ترمینال محلی برقرار نشد؛ برنامه را دوباره باز کنید.';
    byId('terminal-error').hidden = false;
  });
  window.addEventListener('beforeunload', unsubscribe, { once: true });
})();
