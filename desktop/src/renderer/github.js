'use strict';

(() => {
  const bridge = window.arenaDesktop;
  if (!bridge?.github) return;
  const byId = (id) => document.getElementById(id);
  const buttons = [...document.querySelectorAll('[data-github]')];
  const visible = (value) => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,
    (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
  let state = null;
  let revision = -1;
  let requests = 0;
  let repositoryKey = '';
  let branchKey = '';
  const concurrent = new Set(['cancel', 'stop-watch', 'open-device']);

  function render(snapshot) {
    if (!snapshot || snapshot.revision < revision) return;
    revision = snapshot.revision; state = snapshot;
    const locked = state.busy || requests > 0;
    const project = state.project;
    const bound = Boolean(project?.isGit && project.repo && project.branch && project.head);
    byId('github-toggle').dataset.status = state.watching ? 'watching' : state.status;
    byId('github-dependencies').textContent = !state.checked ? 'Git و GitHub CLI هنوز بررسی نشده‌اند.' : `Git: ${state.dependencies?.git ? state.toolSources?.git === 'bundled' ? 'همراه برنامه' : 'آماده' : 'پیدا نشده'} | GitHub CLI: ${state.dependencies?.gh ? state.toolSources?.gh === 'bundled' ? 'همراه برنامه' : 'آماده' : 'پیدا نشده'}`;
    byId('github-account').textContent = state.account ? `حساب متصل: ${visible(state.account.login)}` : 'ورود حساب تأیید نشده است.';
    byId('github-device').hidden = !state.deviceCode;
    if (byId('github-device-code').value !== (state.deviceCode || '')) byId('github-device-code').value = state.deviceCode || '';
    byId('github-parent').textContent = visible(state.parent || 'پوشهٔ والد دانلود انتخاب نشده است.');
    const repositories = Array.isArray(state.repositories) ? state.repositories : [];
    const key = JSON.stringify(repositories);
    if (key !== repositoryKey) {
      const select = byId('github-repositories');
      select.replaceChildren();
      const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'مخزن را انتخاب کن…'; select.append(empty);
      for (const repo of repositories) {
        const option = document.createElement('option'); option.value = repo.fullName;
        option.textContent = visible(`${repo.fullName} / ${repo.isPrivate ? 'خصوصی' : 'عمومی'}`);
        select.append(option);
      }
      repositoryKey = key;
    }
    const branches = Array.isArray(state.branches) ? state.branches : [];
    const nextBranchKey = JSON.stringify(branches);
    if (nextBranchKey !== branchKey) {
      const select = byId('github-branches'); select.replaceChildren();
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'شاخه را انتخاب کن…'; select.append(blank);
      for (const branch of branches) { const option = document.createElement('option'); option.value = branch; option.textContent = visible(branch); select.append(option); }
      branchKey = nextBranchKey;
    }
    for (const id of ['github-target-branch', 'github-branches', 'github-repositories', 'github-repository', 'github-branch', 'github-publish-name', 'github-commit-message', 'github-task']) byId(id).disabled = locked;
    byId('github-selected-section').hidden = !project;
    byId('github-publish-section').hidden = !project;
    byId('github-agent-section').hidden = !bound;
    byId('github-project').textContent = project ? visible([
      project.folder, project.repo?.url || 'Local project / not published',
      `Branch: ${project.branch || 'not selected'} | HEAD: ${project.head?.slice(0, 12) || 'none'}`,
      project.dirty ? 'Local changes detected' : 'Clean working tree',
    ].join('\n')) : '';
    byId('github-watch').textContent = state.watching
      ? `دریافت خودکار روشن است؛ هر ۳۰ ثانیه${state.watchExpiresAt ? `، تا ${new Date(state.watchExpiresAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : 'دریافت خودکار خاموش است.';
    byId('github-preview').hidden = !state.preview;
    byId('github-preview-summary').textContent = state.preview ? visible(`${state.preview.repository} / ${state.preview.branch} — ${state.preview.isPrivate ? 'خصوصی' : 'هشدار: عمومی'} — ${state.preview.files.length} فایل، ${Math.ceil(state.preview.bytes / 1024)} KiB تغییر${state.preview.hasHistory ? '؛ تاریخچهٔ قبلی نیز push می‌شود' : ''}`) : '';
    byId('github-preview-files').textContent = state.preview ? state.preview.files.map(visible).join('\n') || 'No file changes; existing commits only' : '';
    byId('github-message').textContent = visible(state.message || '');
    for (const button of buttons) {
      const action = button.dataset.github;
      let disabled = locked && !concurrent.has(action);
      if (['repositories', 'prepare-publish', 'publish'].includes(action)) disabled ||= !state.account;
      if (['branches', 'select-branch', 'sync', 'watch', 'handoff', 'open-repo'].includes(action)) disabled ||= !bound;
      if (action === 'prepare-publish') disabled ||= !project;
      if (action === 'publish') disabled ||= !state.preview;
      if (action === 'clone') disabled ||= !state.parent;
      if (action === 'watch') disabled ||= state.watching;
      if (action === 'stop-watch') disabled = !state.watching;
      if (action === 'cancel') disabled = !locked && !state.watching;
      button.disabled = disabled;
    }
  }

  async function perform(action) {
    if ((requests > 0 || state?.busy) && !concurrent.has(action)) return;
    const payload = action === 'clone' ? { repository: byId('github-repository').value, branch: byId('github-branch').value }
      : action === 'select-branch' ? { branch: byId('github-target-branch').value }
      : action === 'prepare-publish' ? { name: byId('github-publish-name').value, message: byId('github-commit-message').value }
        : action === 'handoff' ? { task: byId('github-task').value } : undefined;
    byId('github-error').hidden = true;
    requests += 1; if (state) render(state);
    try { render(await bridge.github(action, payload)); }
    catch (error) { byId('github-error').textContent = visible(error.message || 'عملیات انجام نشد.'); byId('github-error').hidden = false; }
    finally { requests -= 1; if (state) render(state); }
  }

  for (const button of buttons) button.addEventListener('click', () => void perform(button.dataset.github));
  byId('github-close').addEventListener('click', () => void bridge.perform('github'));
  byId('github-repositories').addEventListener('change', () => {
    const repo = state?.repositories.find((item) => item.fullName === byId('github-repositories').value);
    if (repo) { byId('github-repository').value = repo.fullName; byId('github-branch').value = repo.branch || ''; }
  });
  byId('github-branches').addEventListener('change', () => { byId('github-target-branch').value = byId('github-branches').value; });
  const unsubscribe = bridge.onGitHubState(render);
  bridge.getGitHubState().then(render).catch(() => {
    byId('github-error').textContent = 'ارتباط محلی GitHub برقرار نشد؛ برنامه را دوباره باز کنید.'; byId('github-error').hidden = false;
  });
  window.addEventListener('beforeunload', unsubscribe, { once: true });
})();
