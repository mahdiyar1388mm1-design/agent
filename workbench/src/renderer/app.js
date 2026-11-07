'use strict';
(() => {
  const byId = (id) => document.getElementById(id);
  const bridge = window.orbit;
  const blank = { version: '0.1.0', keys: { count: 0, encryption: false }, pool: { count: 0, exhausted: 0, active: null }, project: null,
    engine: { status: 'idle', busy: false, messages: [], activities: [], history: [], revision: 0, tokens: 0 }, browser: { running: false, available: false }, extensions: [], github: null };
  let state = blank; let mode = 'work'; let pending = 0; let revision = -1; let toastTimer;
  function toast(text) { byId('toast').textContent = String(text); byId('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { byId('toast').hidden = true; }, 6500); }
  async function perform(action, payload) {
    if (!bridge) { toast('ابزارهای واقعی و کلید امن فقط داخل نسخهٔ Windows فعال‌اند.'); return; }
    const blocking = !['stop', 'github-device'].includes(action);
    if (blocking) pending += 1; render();
    try { const result = await bridge.perform(action, payload); update(result); return result; }
    catch (error) { toast(error.message || 'عمل انجام نشد.'); }
    finally { if (blocking) pending -= 1; render(); }
  }
  function open(panel) {
    if (panel === 'home') { byId('drawer').hidden = true; byId('drawer-backdrop').hidden = true; return; }
    if (panel === 'activity') { byId('activity-panel').hidden = !byId('activity-panel').hidden; return; }
    byId('drawer').hidden = false; byId('drawer-backdrop').hidden = false;
    for (const section of document.querySelectorAll('[data-drawer]')) section.hidden = section.dataset.drawer !== panel;
    byId('drawer-title').textContent = { settings: 'تنظیمات امن', browser: 'مرورگر عامل', github: 'اتصال GitHub', extensions: 'Skills & Plugins' }[panel] || 'تنظیمات';
  }
  function update(value) { if (!value) return; if ((value.engine?.revision ?? 0) < revision) return; state = value; revision = value.engine?.revision ?? 0; render(); }
  function item(tag, className, text) { const el = document.createElement(tag); el.className = className; if (text !== undefined) el.textContent = text; return el; }
  const statuses = { idle: 'آمادهٔ یک کار تازه', starting: 'در انتظار مجوز همین کار…', running: 'عامل در حال کار است', stopping: 'ادامهٔ کار لغو شد؛ در حال توقف ابزارها…', completed: 'کار پایان یافت؛ نتیجه و شواهد را بررسی کن', stopped: 'کار متوقف شد', error: 'کار با خطا متوقف شد؛ جزئیات در گفتگو' };
  function render() {
    const e = state.engine || blank.engine; const busy = e.busy || state.setupBusy || state.github?.busy;
    byId('project-name').textContent = state.project ? state.project.split(/[\\/]/).at(-1) : 'انتخاب پروژه';
    byId('project-subtitle').textContent = state.project ? 'پوشهٔ محلی انتخاب‌شده' : 'یک پوشه از کامپیوترت';
    byId('project-name').title = state.project || '';
    byId('breadcrumb').textContent = state.project ? state.project.split(/[\\/]/).at(-1) : 'Personal workspace';
    byId('crumb-task').textContent = e.history?.find((entry) => entry.id === e.id)?.title || 'New task';
    byId('version').textContent = 'Orbit Agent · ' + state.version;
    byId('job-status-text').textContent = statuses[e.status] || e.status;
    byId('job-status').classList.toggle('running', e.busy === true);
    byId('stop').hidden = !(e.busy || state.setupBusy || state.github?.busy);
    byId('stop').disabled = false;
    byId('send').disabled = Boolean(busy || pending || !byId('task').value.trim());
    for (const id of ['choose-project', 'attach-project', 'new-task', 'model', 'save-keys', 'reset-keys', 'browser-login', 'browser-close', 'github-check', 'github-login', 'install-extension']) byId(id).disabled = Boolean(busy || pending);
    byId('remember').disabled = !state.keys?.encryption; if (!state.keys?.encryption) byId('remember').checked = false;
    byId('keys-status').textContent = `${state.keys?.count || 0} کلید ثبت‌شده · ${state.keys?.remembered ? 'نگهداری رمز‌شده' : 'فقط حافظهٔ همین اجرا'}\nکلید فعال: ${state.pool?.active || '—'} · پایان سهمیه: ${state.pool?.exhausted || 0}`;
    byId('usage').textContent = e.tokens ? `${e.tokens.toLocaleString('fa-IR')} توکن گزارش‌شدهٔ سرویس` : 'هیچ کلیدی به مدل یا ابزارها داده نمی‌شود.';
    byId('chrome-dot').classList.toggle('ready', Boolean(state.browser?.running));
    byId('github-dot').classList.toggle('ready', Boolean(state.github?.account));
    byId('extension-count').textContent = String(state.extensions?.length || 0);
    byId('browser-status').textContent = (state.browser?.available ? 'Chrome پیدا شده است.' : 'Chrome باید روی Windows نصب باشد.') + '\n' + (state.browser?.running ? state.browser.manual ? 'ورود دستی: پنجرهٔ Chrome باز است.' : 'مرورگر عامل در پس‌زمینه فعال است.' : 'مرورگر عامل بسته است.') + (state.warning ? '\n' + state.warning : '');
    byId('github-status').textContent = state.github ? `${state.github.account ? 'حساب: ' + state.github.account : 'حساب تأیید نشده'}\n${state.github.message || ''}` : 'اتصال هنوز بررسی نشده است.';
    byId('device-box').hidden = !state.github?.deviceCode; byId('device-code').value = state.github?.deviceCode || '';
    byId('github-device').disabled = !state.github?.deviceCode;
    const preview = byId('publish-preview'); preview.replaceChildren();
    if (state.github?.preview) { const p = state.github.preview; preview.append(item('pre', 'help', `${p.repository} · ${p.branch}\n${p.isPrivate ? 'خصوصی' : 'عمومی'}\n${p.files.join('\n')}`)); }
    const messages = byId('messages'); messages.replaceChildren();
    for (const message of e.messages || []) { const box = item('article', 'message ' + message.role); if (message.role === 'assistant') box.append(item('span', 'message-label', message.model || 'Orbit')); box.append(document.createTextNode(message.content)); messages.append(box); }
    byId('hero').hidden = (e.messages?.length || 0) > 0;
    const activity = byId('activity-list'); activity.replaceChildren();
    if (!e.activities?.length) activity.append(item('p', 'muted', 'فراخوانی مدل‌ها، ابزارها و نتیجهٔ واقعی آن‌ها اینجا دیده می‌شود.'));
    for (const entry of [...(e.activities || [])].reverse()) { const box = item('div', 'activity-item'); box.append(item('small', '', `${entry.type.toUpperCase()} · ${new Date(entry.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}`)); box.append(document.createTextNode(entry.message)); activity.append(box); }
    const history = byId('history'); history.replaceChildren(); byId('task-count').textContent = String(e.history?.length || 0);
    if (!e.history?.length) history.append(item('p', 'muted', 'اولین کار را از همین‌جا شروع کن.'));
    for (const entry of e.history || []) { const row = item('button', 'history-item'); row.append(item('i', ''), item('span', '', entry.title)); row.title = `${entry.title} · ${entry.status}`; row.disabled = Boolean(busy || pending); row.addEventListener('click', () => void perform('open-task', { id: entry.id })); history.append(row); }
    const extensions = byId('extensions-list'); extensions.replaceChildren();
    if (!state.extensions?.length) extensions.append(item('p', 'muted', 'هنوز افزونه‌ای نصب نشده. Skill متنی، مجوز یا ابزار جدید نمی‌سازد.'));
    for (const ext of state.extensions || []) { const row = item('div', 'extension-item'); const name = item('span', '', ext.name); name.append(item('small', '', ext.kind === 'mcp' ? 'MCP · کد اجرایی مورداعتماد' : 'SKILL · راهنمای متنی')); const remove = item('button', '', 'حذف'); remove.disabled = Boolean(busy || pending); remove.addEventListener('click', () => void perform('extension-remove', { id: ext.id })); row.append(name, remove); extensions.append(row); }
  }
  document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => open(button.dataset.panel)));
  document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', () => { if (state.engine?.busy) return; mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === button)); byId('permission-label').textContent = mode === 'work' ? '♧ مجوز برای همین کار' : 'گفتگو · بدون ابزار'; }));
  document.querySelectorAll('[data-suggestion]').forEach((button) => button.addEventListener('click', () => { byId('task').value = button.dataset.suggestion; byId('task').focus(); render(); }));
  byId('task').addEventListener('input', render);
  byId('task-form').addEventListener('submit', async (event) => { event.preventDefault(); if (state.engine?.busy || pending || !byId('task').value.trim()) return; const text = byId('task').value; const result = await perform('run', { task: text, model: byId('model').value, mode }); if (result) { byId('task').value = ''; if (mode === 'work') byId('activity-panel').hidden = false; render(); } });
  byId('task').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); byId('task-form').requestSubmit(); } });
  byId('stop').addEventListener('click', () => void perform('stop'));
  byId('new-task').addEventListener('click', () => void perform('new'));
  for (const id of ['choose-project', 'attach-project']) byId(id).addEventListener('click', () => void perform('project-choose'));
  byId('activity-toggle').addEventListener('click', () => open('activity')); byId('close-activity').addEventListener('click', () => { byId('activity-panel').hidden = true; });
  for (const id of ['close-drawer', 'drawer-backdrop']) byId(id).addEventListener('click', () => open('home'));
  byId('save-keys').addEventListener('click', async () => { const value = byId('api-keys').value; byId('api-keys').value = ''; const result = await perform('keys-save', { keys: value, remember: byId('remember').checked }); if (result) toast('کلیدها ثبت شدند؛ مقدارشان در رابط بازگردانده نمی‌شود.'); });
  byId('reset-keys').addEventListener('click', () => void perform('keys-reset'));
  byId('browser-login').addEventListener('click', () => void perform('browser-login')); byId('browser-close').addEventListener('click', () => void perform('browser-close'));
  for (const action of ['github-check', 'github-login', 'github-device']) byId(action).addEventListener('click', () => void perform(action));
  byId('install-extension').addEventListener('click', () => void perform('extension-install'));
  document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); void perform('new'); } if (event.key === 'Escape') open('home'); });
  if (bridge) { bridge.onState(update); bridge.getState().then(update).catch((error) => toast(error.message)); }
  else { byId('demo-banner').hidden = false; byId('api-keys').disabled = true; byId('api-keys').placeholder = 'کلید را در پیش‌نمایش وارد نکن؛ فقط داخل EXE'; }
  render();
})();
