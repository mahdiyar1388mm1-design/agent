'use strict';

(() => {
  const bridge = window.arenaDesktop;
  const byId = (id) => document.getElementById(id);
  const controls = [...document.querySelectorAll('[data-action]')];
  let slowTimer = null;
  let lastState = null;

  const errors = new Map([
    [-105, 'نشانی سایت پیدا نشد. تنظیمات DNS و اتصال اینترنت را بررسی کنید.'],
    [-106, 'اتصال اینترنت قطع است. پس از اتصال دوباره تلاش کنید.'],
    [-102, 'ارتباط با سرور برقرار نشد. کمی بعد دوباره تلاش کنید.'],
    [-118, 'زمان انتظار برای پاسخ سرور تمام شد. دوباره تلاش کنید.'],
    [-200, 'گواهی امنیتی سایت معتبر نیست. برای امنیت شما، اتصال متوقف شد.'],
    [-201, 'گواهی امنیتی سایت منقضی شده است یا ساعت سیستم صحیح نیست.'],
    [-202, 'گواهی امنیتی سایت قابل اعتماد نیست. اتصال ناامن انجام نمی‌شود.'],
    ['RENDERER', 'صفحه به‌طور غیرمنتظره بسته شد. برای ادامه، دوباره بارگذاری کنید.'],
  ]);

  function render(state) {
    lastState = state;
    byId('origin').textContent = state.origin || 'arena.ai';
    byId('back').disabled = !state.canGoBack;
    byId('forward').disabled = !state.canGoForward;
    byId('reload').classList.toggle('spinning', state.loading);
    const connection = byId('connection');
    const offline = window.navigator.onLine === false;
    const status = state.error || offline ? 'error' : state.loading ? 'loading' : state.ready ? 'ready' : 'loading';
    connection.dataset.status = status;
    byId('connection-label').textContent = offline ? 'آفلاین' : status === 'error' ? 'خطای اتصال' : status === 'ready' ? 'آماده' : 'در حال اتصال';
    byId('placeholder').hidden = state.ready && !state.error;
    byId('placeholder').setAttribute('aria-busy', String(state.loading));
    byId('welcome').hidden = Boolean(state.error);
    byId('error-card').hidden = !state.error;
    if (state.error) {
      byId('error-message').textContent = errors.get(state.error.code) || 'اتصال اینترنت را بررسی کنید. ممکن است سایت موقتاً در دسترس نباشد یا اجازهٔ اتصال از این برنامه را ندهد.';
      byId('error-code').textContent = String(state.error.description || state.error.code);
    }
    if (state.ready || state.error) {
      clearTimeout(slowTimer);
      slowTimer = null;
      byId('slow-actions').hidden = true;
      byId('loading-hint').textContent = 'ارتباط امن با سایت در حال برقراری است.';
    } else if (!slowTimer) {
      slowTimer = setTimeout(() => {
        byId('loading-hint').textContent = 'بارگذاری بیش از معمول طول کشیده است. اتصال اینترنت را بررسی کنید یا در مرورگر ادامه دهید.';
        byId('slow-actions').hidden = false;
      }, 15000);
    }
  }

  if (!bridge) {
    render({ ready: false, loading: false, error: { code: 'DESKTOP_ONLY', description: 'ARENA DESKTOP / WINDOWS' } });
    byId('error-title').textContent = 'رابط برنامهٔ دسکتاپ';
    byId('error-message').textContent = 'این صفحه داخل برنامهٔ Arena Desktop اجرا می‌شود. فایل نصب ویندوز را اجرا کنید.';
    controls.forEach((button) => { button.disabled = true; });
    return;
  }

  controls.forEach((button) => {
    button.addEventListener('click', () => {
      bridge.perform(button.dataset.action).catch(() => {
        byId('connection-label').textContent = 'دوباره امتحان کنید';
      });
    });
  });
  const unsubscribe = bridge.onState(render);
  bridge.getState().then(render).catch(() => {
    render({ ready: false, loading: false, error: { code: 'BRIDGE', description: 'APP_CONNECTION_ERROR' } });
  });
  window.addEventListener('beforeunload', () => {
    clearTimeout(slowTimer);
    unsubscribe();
  }, { once: true });
  for (const event of ['online', 'offline']) {
    window.addEventListener(event, () => { if (lastState) render(lastState); });
  }
})();
