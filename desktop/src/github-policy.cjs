'use strict';

const { outputReviewReasons } = require('./terminal-protocol.cjs');
const CONTROLS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const WATCH_MS = 60 * 60 * 1000;
const POLL_MS = 30000;
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const EXCLUDES = [
  'node_modules/', 'dist/', 'build/', 'out/', 'target/', 'coverage/', '.next/', '.nuxt/',
  '.venv/', 'venv/', '__pycache__/', '.cache/', '.env', '.env.*', '*.pem', '*.key',
  '*.p12', '*.pfx', '*.keystore', 'id_rsa', 'id_ed25519', '.ssh/', '.aws/', '.azure/',
  '.kube/', '!.env.example', '!.env.sample', '!.env.template', '*credentials*.json', '*service-account*.json',
];

function repository(value, allowSsh = false) {
  if (typeof value !== 'string' || value.length > 350 || CONTROLS.test(value)) throw new Error('آدرس معتبر owner/repository یا HTTPS مخزن GitHub لازم است.');
  let name = value.trim();
  if (allowSsh && /^git@github\.com:/i.test(name)) name = name.slice('git@github.com:'.length);
  else if (allowSsh && /^ssh:\/\/git@github\.com\//i.test(name)) name = name.slice('ssh://git@github.com/'.length);
  else if (/^https:\/\//i.test(name)) {
    const url = new URL(name);
    if (url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new Error('فقط آدرس مستقیم مخزن روی github.com پذیرفته می‌شود.');
    name = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  }
  name = name.replace(/\.git$/i, '');
  const parts = name.split('/');
  if (parts.length !== 2 || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(parts[0])
    || !/^[a-z\d_.-]{1,100}$/i.test(parts[1]) || ['.', '..'].includes(parts[1])) throw new Error('نام مخزن باید به‌شکل owner/repository باشد؛ URL فایل، PR و شاخه پذیرفته نمی‌شود.');
  return Object.freeze({ fullName: name, url: `https://github.com/${name}`, cloneUrl: `https://github.com/${name}.git` });
}

function branchName(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || CONTROLS.test(value)
    || /[\s~^:?*\[\\]/.test(value) || /\.\.|@\{|\/\//.test(value) || value === '@'
    || /^[-/]/.test(value) || /[/.]$/.test(value)
    || value.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))) throw new Error('نام شاخهٔ Git معتبر نیست.');
  return value;
}

function folderName(name) {
  const result = name.replace(/[. ]+$/g, '').replace(/^\.+$/, '') || 'project';
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) return `project-${result}`;
  return result;
}

function safeRelative(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 1000 && !CONTROLS.test(value)
    && !/[<>:"|?*\\]/.test(value) && !value.startsWith('/') && !/^[a-z]:/i.test(value)
    && !value.split('/').some((part) => !part || part === '.' || part === '..' || part.replace(/[. ]+$/g, '').toLowerCase() === '.git');
}

function excludedFile(name) {
  const leaf = name.split('/').at(-1);
  if (/^\.env(?:\..*)?$/i.test(leaf) && !/^\.env\.(?:example|sample|template)$/i.test(leaf)) return true;
  return name.split('/').some((part) => /^(?:node_modules|dist|build|out|target|coverage|\.next|\.nuxt|\.venv|venv|__pycache__|\.cache|\.ssh|\.aws|\.azure|\.kube)$/i.test(part))
    || /(?:^|\/)(?:id_rsa|id_ed25519|[^/]*(?:credentials|service-account)[^/]*\.json)$/i.test(name)
    || /\.(?:pem|key|p12|pfx|keystore)$/i.test(name);
}

function sensitiveContent(buffer) {
  return outputReviewReasons({ status: 'completed', stdout: buffer.toString('utf8'), stderr: '', exitCode: 0 }).length > 0;
}

function taskText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000 || CONTROLS.test(value.replace(/[\r\n\t]/g, ''))) throw new Error('درخواست باید ۱ تا ۴۰۰۰ نویسهٔ قابل‌نمایش باشد.');
  return value.trim();
}

function projectMessage(project, task) {
  const repo = repository(project.repo.fullName);
  const branch = branchName(project.branch);
  return `Continue this GitHub project using Arena Agent's OWN GitHub/repository integration, if available and authorized in my account. This message does NOT attach a repository or grant access to a private repository; ask me to select/connect it in Arena if necessary.\n\nRepository: ${repo.url}\nExact branch: ${JSON.stringify(branch)}\nLocal app last observed commit: ${project.head || 'none'}\n\nWork only on this selected repository. Use the selected branch when your workspace permits it. If Arena assigns a different fixed working branch, respect that restriction, work/commit/push only on that platform-authorized branch, report its exact branch/commit and explain that I must select it in Arena Desktop; do not claim the originally selected branch was updated. Inspect the existing project before making changes. Commit and push completed changes to the selected branch when permitted, or to the platform-required working branch described above, so Arena Desktop can fetch them after I explicitly select that branch. Do not force-push, reset history, merge/close PRs, create releases, change repository visibility, or push to any other non-platform-required branch without my explicit request. Never commit credentials, environment secrets or generated dependencies/build output. Do not ask for tokens in chat. Report the resulting commit hash. Your built-in/cloud terminal remains Arena's environment, not my Windows computer. Local downloads do not install dependencies or execute the downloaded project automatically. If you cannot access/push this repository, say so rather than claiming success.\n\nMy task:\n${taskText(task)}`;
}

module.exports = { repository, branchName, folderName, safeRelative, excludedFile, sensitiveContent,
  taskText, projectMessage, EXCLUDES, WATCH_MS, POLL_MS, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES };
