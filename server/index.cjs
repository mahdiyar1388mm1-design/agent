'use strict';

const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { initial, owner, agents: seedAgents } = require('./data/seed.cjs');
const agentProvider = require('./agent-provider.cjs');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = path.join(__dirname, 'runtime');
const UPLOADS = path.join(RUNTIME, 'uploads');
const STATE_FILE = path.join(RUNTIME, 'state.json');
const IS_DEMO = process.env.AIHOLDING_DEMO !== 'false';
fs.mkdirSync(UPLOADS, { recursive: true });

let sessionSecret = process.env.AIHOLDING_SESSION_SECRET;
if (!sessionSecret && IS_DEMO) sessionSecret = crypto.randomBytes(32).toString('hex');
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('Set AIHOLDING_SESSION_SECRET to at least 32 characters before starting outside demo mode.');
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function readState() {
  if (!fs.existsSync(STATE_FILE)) {
    const first = clone(initial);
    fs.writeFileSync(STATE_FILE, JSON.stringify(first, null, 2), { mode: 0o600 });
    return first;
  }
  const loaded = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  loaded.notificationPreferences ||= clone(initial.notificationPreferences);
  loaded.documents ||= [];
  loaded.attachments ||= [];
  return loaded;
}
let state = readState();
function saveState() {
  const temp = `${STATE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, STATE_FILE);
}
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function text(value, max = 10_000) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function corporationExists(value) {
  return ['Holding Headquarters', 'Trading Corporation', 'Development Corporation', 'Marketing Corporation'].includes(value);
}
function agentById(agentId) { return state.agents.find((agent) => agent.id === agentId); }
function conversationById(conversationId) { return state.conversations.find((conversation) => conversation.id === conversationId); }
function messageById(messageId) { return state.messages.find((message) => message.id === messageId); }
function audit(actor, action, entity, entityId, details = {}) {
  state.auditLogs.unshift({ id: id('audit'), actor, action, entity, entityId, details, createdAt: now() });
  if (state.auditLogs.length > 5_000) state.auditLogs.length = 5_000;
}

const events = new Set();
function broadcast(type, data = {}) {
  const packet = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of events) {
    try { client.write(packet); } catch { events.delete(client); }
  }
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const part = raw.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}
function userFromToken(token) {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', sessionSecret).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now() || payload.sub !== state.owner.id || payload.role !== 'Owner') return null;
    return { ...state.owner, role: 'Owner' };
  } catch { return null; }
}
function currentUser(req) {
  const authorization = String(req.get('authorization') || '');
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  const sessionHeader = String(req.get('x-aiholding-session') || '');
  for (const token of [readCookie(req, 'aiholding_session'), bearer, sessionHeader]) {
    const user = userFromToken(token);
    if (user) return user;
  }
  return null;
}
function isSecureRequest(req) {
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const origin = String(req.get('origin') || '').toLowerCase();
  return process.env.NODE_ENV === 'production' || req.secure || forwardedProtocol === 'https' || origin.startsWith('https://');
}
function setSession(res, req) {
  const token = sign({ sub: state.owner.id, role: 'Owner', exp: Date.now() + 8 * 60 * 60 * 1000 });
  const secure = isSecureRequest(req);
  const cookiePolicy = secure ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax';
  res.setHeader('Set-Cookie', `aiholding_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=28800${cookiePolicy}`);
  return token;
}
function requireOwner(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  if (user.role !== 'Owner') return res.status(403).json({ error: 'Owner authorization is required.' });
  req.user = user;
  next();
}
function passwordMatches(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const expected = Buffer.from(parts[2], 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(parts[1], 'hex'), expected.length);
    return expected.length > 0 && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '1mb' }));

const rateState = new Map();
app.use('/api', (req, res, next) => {
  const key = `${req.ip}:${req.path.startsWith('/auth') ? 'auth' : 'api'}`;
  const limit = req.path.startsWith('/auth') ? 12 : 180;
  const current = Date.now();
  let bucket = rateState.get(key);
  if (!bucket || current - bucket.started > 60_000) bucket = { started: current, count: 0 };
  bucket.count += 1;
  rateState.set(key, bucket);
  if (bucket.count > limit) return res.status(429).json({ error: 'Rate limit exceeded. Please try again shortly.' });
  if (rateState.size > 2_000) {
    for (const [mapKey, item] of rateState) if (current - item.started > 120_000) rateState.delete(mapKey);
  }
  next();
});

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const attachUser = (req, res, next) => {
  req.user = currentUser(req);
  next();
};

app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: IS_DEMO ? 'demo' : 'production', aiProvider: agentProvider.status() }));
app.get('/api/auth/me', attachUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
  res.json({ user: req.user });
});
app.post('/api/auth/demo-session', (req, res) => {
  if (!IS_DEMO) return res.status(404).json({ error: 'Demo sign-in is disabled.' });
  const sessionToken = setSession(res, req);
  audit('owner', 'auth.demo_session_created', 'session', 'owner');
  saveState();
  res.json({ user: { ...state.owner, role: 'Owner' }, sessionToken });
});
app.post('/api/auth/login', (req, res) => {
  const email = text(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const configuredEmail = (process.env.AIHOLDING_OWNER_EMAIL || '').toLowerCase();
  const encodedPassword = process.env.AIHOLDING_OWNER_PASSWORD_HASH || '';
  if (IS_DEMO && email === state.owner.email && password === 'demo-owner') {
    const sessionToken = setSession(res, req);
    audit('owner', 'auth.login', 'session', 'owner', { mode: 'demo' });
    saveState();
    return res.json({ user: { ...state.owner, role: 'Owner' }, sessionToken });
  }
  if (!IS_DEMO && configuredEmail && email === configuredEmail && passwordMatches(password, encodedPassword)) {
    setSession(res, req);
    audit('owner', 'auth.login', 'session', 'owner', { mode: 'configured' });
    saveState();
    return res.json({ user: { ...state.owner, role: 'Owner' } });
  }
  res.status(401).json({ error: 'The supplied credentials could not be verified.' });
});
app.post('/api/auth/logout', requireOwner, (req, res) => {
  audit(req.user.id, 'auth.logout', 'session', 'owner');
  saveState();
  const secure = isSecureRequest(req);
  const cookiePolicy = secure ? '; SameSite=None; Secure; Partitioned' : '; SameSite=Lax';
  res.setHeader('Set-Cookie', `aiholding_session=; HttpOnly; Path=/; Max-Age=0${cookiePolicy}`);
  res.json({ ok: true });
});

app.use('/api', requireOwner);
app.get('/api/bootstrap', (_req, res) => {
  const conversations = state.conversations.map((conversation) => {
    const latest = state.messages.filter((message) => message.conversationId === conversation.id && !message.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { ...conversation, lastMessage: latest ? { body: latest.body, senderName: latest.senderName, createdAt: latest.createdAt } : undefined };
  });
  const provider = agentProvider.status();
  res.json({
    mode: IS_DEMO ? 'demo' : 'production',
    aiProvider: provider,
    security: {
      authentication: IS_DEMO ? 'Signed owner-only demo session' : 'Signed server session',
      mfaConfigured: process.env.AIHOLDING_MFA_CONFIGURED === 'true',
      encryptionAtRest: process.env.AIHOLDING_ENCRYPTION_AT_REST === 'true',
      fileScanning: process.env.AIHOLDING_FILE_SCANNING === 'true',
    },
    user: { ...state.owner, role: 'Owner' }, agents: state.agents, conversations,
    tasks: state.tasks, projects: state.projects, approvals: state.approvals, decisions: state.decisions,
    meetings: state.meetings, commands: state.commands, notifications: state.notifications,
    auditLogs: state.auditLogs.slice(0, 500), savedMessageIds: state.savedMessageIds,
    notificationPreferences: state.notificationPreferences,
  });
});

app.get('/api/saved-messages', (_req, res) => {
  const messages = state.savedMessageIds.map((messageId) => messageById(messageId)).filter(Boolean).reverse();
  res.json({ messages });
});
app.get('/api/conversations', (_req, res) => {
  const type = text(_req.query.type, 20);
  const search = text(_req.query.q, 150).toLowerCase();
  const list = state.conversations.filter((conversation) => {
    if (type && type !== 'all' && conversation.type !== type) return false;
    if (search && !`${conversation.title} ${conversation.department} ${conversation.corporation}`.toLowerCase().includes(search)) return false;
    return !conversation.archived;
  }).map((conversation) => {
    const latest = state.messages.filter((message) => message.conversationId === conversation.id && !message.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return { ...conversation, lastMessage: latest ? { body: latest.body, senderName: latest.senderName, createdAt: latest.createdAt } : undefined };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json({ conversations: list });
});
app.get('/api/conversations/:id/messages', (req, res) => {
  const conversation = conversationById(req.params.id);
  if (!conversation || !conversation.participantIds.includes('owner')) return res.status(404).json({ error: 'Conversation not found.' });
  const search = text(req.query.q, 200).toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
  let list = state.messages.filter((message) => message.conversationId === conversation.id);
  if (search) list = list.filter((message) => `${message.body} ${message.senderName}`.toLowerCase().includes(search));
  res.json({ messages: list.slice(-limit), total: list.length, conversation });
});
app.post('/api/conversations/:id/read', (req, res) => {
  const conversation = conversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  conversation.unreadCount = 0;
  conversation.updatedAt = now();
  saveState();
  broadcast('conversation.read', { conversationId: conversation.id });
  res.json({ ok: true });
});
app.post('/api/conversations/dm', (req, res) => {
  const agent = agentById(text(req.body?.agentId, 100));
  if (!agent) return res.status(404).json({ error: 'Agent not found.' });
  let conversation = state.conversations.find((item) => item.id === `dm-owner-${agent.id}`);
  if (!conversation) {
    conversation = {
      id: `dm-owner-${agent.id}`, title: agent.name, type: 'dm', corporation: agent.corporation,
      department: agent.department, category: 'Direct message', participantIds: ['owner', agent.id], unreadCount: 0,
      archived: false, updatedAt: now(), isDemoSeed: false,
    };
    state.conversations.push(conversation);
    audit(req.user.id, 'conversation.created', 'conversation', conversation.id, { agentId: agent.id, type: 'dm' });
    saveState();
  }
  res.json({ conversation });
});
app.post('/api/conversations/:id/messages', (req, res) => {
  const conversation = conversationById(req.params.id);
  if (!conversation || !conversation.participantIds.includes('owner')) return res.status(404).json({ error: 'Conversation not found.' });
  const body = text(req.body?.body, 10_000);
  const attachmentIds = Array.isArray(req.body?.attachmentIds) ? req.body.attachmentIds.slice(0, 8) : [];
  if (!body && !attachmentIds.length) return res.status(400).json({ error: 'Write a message or attach a file before sending.' });
  if (attachmentIds.some((attachmentId) => !state.attachments.some((attachment) => attachment.id === attachmentId))) return res.status(400).json({ error: 'One or more attachments are unavailable.' });
  const replyTo = text(req.body?.replyTo, 100) || undefined;
  const parent = replyTo ? messageById(replyTo) : null;
  if (replyTo && (!parent || parent.conversationId !== conversation.id)) return res.status(400).json({ error: 'The reply target is not in this conversation.' });
  const mentions = Array.isArray(req.body?.mentions) ? req.body.mentions.filter((value) => agentById(value)).slice(0, 20) : [];
  const message = {
    id: id('message'), conversationId: conversation.id, senderId: req.user.id, senderName: req.user.name,
    senderTitle: req.user.title, body, createdAt: now(), reactions: [], attachments: attachmentIds.map((attachmentId) => state.attachments.find((attachment) => attachment.id === attachmentId)),
    mentions, isPriority: Boolean(req.body?.isPriority), isDemoSeed: false,
    ...(replyTo ? { replyTo, threadRootId: parent.threadRootId || parent.id } : {}),
  };
  state.messages.push(message);
  conversation.updatedAt = message.createdAt;
  audit(req.user.id, 'message.created', 'message', message.id, { conversationId: conversation.id, characters: body.length, attachmentCount: attachmentIds.length });
  saveState();
  broadcast('message.created', { conversationId: conversation.id, message });
  res.status(201).json({ message });
});
app.post('/api/conversations', (req, res) => {
  const title = text(req.body?.title, 100);
  const corporation = text(req.body?.corporation, 60);
  const department = text(req.body?.department, 100) || 'General';
  if (!title || !corporationExists(corporation)) return res.status(400).json({ error: 'A room title and valid corporation are required.' });
  const participantIds = Array.isArray(req.body?.participantIds) ? req.body.participantIds.filter((participantId) => participantId === 'owner' || agentById(participantId)) : [];
  const conversation = { id: id('room'), title, type: 'group', corporation, department, category: 'Department Room', participantIds: [...new Set(['owner', ...participantIds])], unreadCount: 0, archived: false, updatedAt: now(), isDemoSeed: false };
  state.conversations.push(conversation);
  audit(req.user.id, 'conversation.created', 'conversation', conversation.id, { title, corporation, department });
  saveState();
  broadcast('conversation.created', { conversation });
  res.status(201).json({ conversation });
});
app.patch('/api/conversations/:id/archive', (req, res) => {
  const conversation = conversationById(req.params.id);
  if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
  conversation.archived = Boolean(req.body?.archived ?? true);
  audit(req.user.id, conversation.archived ? 'conversation.archived' : 'conversation.restored', 'conversation', conversation.id);
  saveState();
  broadcast('conversation.updated', { conversationId: conversation.id });
  res.json({ conversation });
});

app.patch('/api/messages/:id', (req, res) => {
  const message = messageById(req.params.id);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  if (message.senderId !== req.user.id) return res.status(403).json({ error: 'Only the message author can edit it.' });
  const body = text(req.body?.body, 10_000);
  if (!body) return res.status(400).json({ error: 'Message text cannot be empty.' });
  const previous = message.body;
  message.body = body;
  message.editedAt = now();
  audit(req.user.id, 'message.edited', 'message', message.id, { previousBody: previous, body });
  saveState();
  broadcast('message.updated', { conversationId: message.conversationId, messageId: message.id });
  res.json({ message });
});
app.delete('/api/messages/:id', (req, res) => {
  const message = messageById(req.params.id);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  const previous = { body: message.body, senderId: message.senderId };
  message.deletedAt = now();
  message.body = 'This message was deleted by the owner.';
  audit(req.user.id, 'message.deleted', 'message', message.id, previous);
  saveState();
  broadcast('message.updated', { conversationId: message.conversationId, messageId: message.id });
  res.json({ ok: true });
});
app.post('/api/messages/:id/reactions', (req, res) => {
  const message = messageById(req.params.id);
  const emoji = text(req.body?.emoji, 8);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  if (!emoji) return res.status(400).json({ error: 'Choose a reaction.' });
  let reaction = message.reactions.find((item) => item.emoji === emoji);
  if (!reaction) { reaction = { emoji, userIds: [] }; message.reactions.push(reaction); }
  if (reaction.userIds.includes(req.user.id)) reaction.userIds = reaction.userIds.filter((userId) => userId !== req.user.id);
  else reaction.userIds.push(req.user.id);
  message.reactions = message.reactions.filter((item) => item.userIds.length);
  audit(req.user.id, 'message.reaction_toggled', 'message', message.id, { emoji });
  saveState();
  broadcast('message.updated', { conversationId: message.conversationId, messageId: message.id });
  res.json({ reactions: message.reactions });
});
app.post('/api/messages/:id/pin', (req, res) => {
  const message = messageById(req.params.id);
  if (!message || message.deletedAt) return res.status(404).json({ error: 'Message not found.' });
  message.isPinned = !message.isPinned;
  audit(req.user.id, message.isPinned ? 'message.pinned' : 'message.unpinned', 'message', message.id);
  saveState();
  broadcast('message.updated', { conversationId: message.conversationId, messageId: message.id });
  res.json({ isPinned: message.isPinned });
});
app.post('/api/messages/:id/bookmark', (req, res) => {
  const message = messageById(req.params.id);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  const isSaved = state.savedMessageIds.includes(message.id);
  state.savedMessageIds = isSaved ? state.savedMessageIds.filter((messageId) => messageId !== message.id) : [...state.savedMessageIds, message.id];
  audit(req.user.id, isSaved ? 'message.unbookmarked' : 'message.bookmarked', 'message', message.id);
  saveState();
  res.json({ saved: !isSaved });
});
app.post('/api/messages/:id/forward', (req, res) => {
  const message = messageById(req.params.id);
  const target = conversationById(text(req.body?.conversationId, 120));
  if (!message || !target || !target.participantIds.includes('owner')) return res.status(404).json({ error: 'Message or destination not found.' });
  const forwarded = { ...clone(message), id: id('message'), conversationId: target.id, senderId: req.user.id, senderName: req.user.name, senderTitle: req.user.title, body: `Forwarded from ${conversationById(message.conversationId)?.title || 'conversation'}:\n\n${message.body}`, createdAt: now(), editedAt: undefined, deletedAt: undefined, isPinned: false, replyTo: undefined, threadRootId: undefined, isDemoSeed: false };
  state.messages.push(forwarded);
  target.updatedAt = forwarded.createdAt;
  audit(req.user.id, 'message.forwarded', 'message', forwarded.id, { sourceMessageId: message.id, targetConversationId: target.id });
  saveState();
  broadcast('message.created', { conversationId: target.id, message: forwarded });
  res.status(201).json({ message: forwarded });
});

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const upload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => cb(null, UPLOADS), filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 8)}`) }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, allowedMime.has(file.mimetype)),
});
app.post('/api/uploads', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a supported file (image, PDF, text, CSV, DOCX, or XLSX; 8 MB maximum).' });
  const attachment = { id: id('file'), originalName: path.basename(req.file.originalname).replace(/[\r\n]/g, '').slice(0, 200), mimeType: req.file.mimetype, size: req.file.size, createdAt: now(), createdBy: req.user.id, diskName: req.file.filename };
  state.attachments.push(attachment);
  audit(req.user.id, 'file.uploaded', 'attachment', attachment.id, { name: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size });
  saveState();
  const { diskName, ...publicAttachment } = attachment;
  res.status(201).json({ attachment: publicAttachment });
});
app.get('/api/files/:id', (req, res) => {
  const attachment = state.attachments.find((item) => item.id === req.params.id);
  if (!attachment || !allowedMime.has(attachment.mimeType)) return res.status(404).json({ error: 'File not found.' });
  const absolute = path.join(UPLOADS, path.basename(attachment.diskName));
  if (!fs.existsSync(absolute)) return res.status(404).json({ error: 'File is no longer available.' });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', attachment.mimeType);
  const disposition = attachment.mimeType.startsWith('image/') ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
  fs.createReadStream(absolute).pipe(res);
});

app.post('/api/projects', (req, res) => {
  const name = text(req.body?.name, 180);
  const corporation = text(req.body?.corporation, 80);
  const description = text(req.body?.description, 3000);
  const ownerAgent = agentById(text(req.body?.ownerId, 100));
  if (!name || !corporationExists(corporation)) return res.status(400).json({ error: 'Project name and corporation are required.' });
  const project = { id: id('project'), name, corporation, department: ownerAgent?.department || text(req.body?.department, 100) || 'General', status: 'Planning', description, ownerId: ownerAgent?.id || 'owner', startDate: now(), targetDate: text(req.body?.targetDate, 40) || undefined, isDemoSeed: false };
  state.projects.unshift(project);
  audit(req.user.id, 'project.created', 'project', project.id, { name, corporation, ownerId: project.ownerId });
  saveState();
  broadcast('project.created', { projectId: project.id });
  res.status(201).json({ project });
});
app.patch('/api/projects/:id', (req, res) => {
  const project = state.projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  if (typeof req.body?.name === 'string' && text(req.body.name, 180)) project.name = text(req.body.name, 180);
  if (typeof req.body?.description === 'string') project.description = text(req.body.description, 3000);
  if (['Planning', 'In progress', 'Review', 'On hold', 'Completed', 'Cancelled'].includes(req.body?.status)) project.status = req.body.status;
  if (typeof req.body?.targetDate === 'string') project.targetDate = req.body.targetDate || undefined;
  audit(req.user.id, 'project.updated', 'project', project.id, { status: project.status });
  saveState();
  broadcast('project.updated', { projectId: project.id });
  res.json({ project });
});
app.get('/api/tasks', (req, res) => {
  const corp = text(req.query.corporation, 80);
  const status = text(req.query.status, 40);
  const list = state.tasks.filter((task) => (!corp || task.corporation === corp) && (!status || task.status === status)).sort((a, b) => a.dueDate?.localeCompare(b.dueDate || '') || b.createdAt.localeCompare(a.createdAt));
  res.json({ tasks: list });
});
app.post('/api/tasks', (req, res) => {
  const title = text(req.body?.title, 180);
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const assignee = agentById(text(req.body?.assigneeId, 100));
  const corporation = corporationExists(req.body?.corporation) ? req.body.corporation : (assignee?.corporation || 'Holding Headquarters');
  const status = ['Backlog', 'Assigned', 'In Progress', 'Under Review', 'Blocked', 'Awaiting Approval', 'Completed', 'Cancelled'].includes(req.body?.status) ? req.body.status : (assignee ? 'Assigned' : 'Backlog');
  const priority = ['Low', 'Normal', 'High', 'Critical'].includes(req.body?.priority) ? req.body.priority : 'Normal';
  const project = state.projects.find((item) => item.id === req.body?.projectId);
  const task = { id: id('task'), title, description: text(req.body?.description, 3000), corporation, department: assignee?.department || text(req.body?.department, 100) || 'General', assigneeId: assignee?.id || null, assigneeName: assignee?.name || 'Unassigned', status, priority, dueDate: text(req.body?.dueDate, 40) || undefined, projectId: project?.id, createdAt: now(), updatedAt: now(), progress: 0, isDemoSeed: false };
  state.tasks.unshift(task);
  audit(req.user.id, 'task.created', 'task', task.id, { title, assigneeId: task.assigneeId, status });
  saveState();
  broadcast('task.created', { taskId: task.id });
  res.status(201).json({ task });
});
app.post('/api/tasks/from-message', (req, res) => {
  const message = messageById(text(req.body?.messageId, 100));
  const conversation = message && conversationById(message.conversationId);
  if (!message || !conversation || message.deletedAt) return res.status(404).json({ error: 'Source message not found.' });
  const title = text(req.body?.title, 180) || message.body.replace(/\s+/g, ' ').slice(0, 120) || 'Follow up on discussion';
  const assignee = agentById(text(req.body?.assigneeId, 100));
  const task = { id: id('task'), title, description: `Created from a conversation with ${message.senderName}. Source message: ${message.id}`, corporation: conversation.corporation, department: conversation.department, assigneeId: assignee?.id || null, assigneeName: assignee?.name || 'Unassigned', status: assignee ? 'Assigned' : 'Backlog', priority: ['Low', 'Normal', 'High', 'Critical'].includes(req.body?.priority) ? req.body.priority : 'Normal', dueDate: text(req.body?.dueDate, 40) || undefined, sourceMessageId: message.id, createdAt: now(), updatedAt: now(), progress: 0, isDemoSeed: false };
  state.tasks.unshift(task);
  audit(req.user.id, 'task.created_from_message', 'task', task.id, { messageId: message.id, conversationId: conversation.id });
  saveState();
  broadcast('task.created', { taskId: task.id });
  res.status(201).json({ task });
});
app.patch('/api/tasks/:id', (req, res) => {
  const task = state.tasks.find((item) => item.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const before = { status: task.status, assigneeId: task.assigneeId, priority: task.priority };
  if (typeof req.body?.title === 'string' && text(req.body.title, 180)) task.title = text(req.body.title, 180);
  if (typeof req.body?.description === 'string') task.description = text(req.body.description, 3000);
  if (['Backlog', 'Assigned', 'In Progress', 'Under Review', 'Blocked', 'Awaiting Approval', 'Completed', 'Cancelled'].includes(req.body?.status)) task.status = req.body.status;
  if (['Low', 'Normal', 'High', 'Critical'].includes(req.body?.priority)) task.priority = req.body.priority;
  if (typeof req.body?.assigneeId === 'string') {
    const assignee = req.body.assigneeId ? agentById(req.body.assigneeId) : null;
    if (req.body.assigneeId && !assignee) return res.status(400).json({ error: 'Unknown assignee.' });
    task.assigneeId = assignee?.id || null;
    task.assigneeName = assignee?.name || 'Unassigned';
    if (assignee) { task.corporation = assignee.corporation; task.department = assignee.department; }
  }
  if (typeof req.body?.dueDate === 'string') task.dueDate = req.body.dueDate || undefined;
  task.updatedAt = now();
  audit(req.user.id, 'task.updated', 'task', task.id, { before, after: { status: task.status, assigneeId: task.assigneeId, priority: task.priority } });
  saveState();
  broadcast('task.updated', { taskId: task.id });
  res.json({ task });
});

app.get('/api/approvals', (_req, res) => res.json({ approvals: state.approvals }));
app.post('/api/recruitment', (req, res) => {
  const title = text(req.body?.title, 180);
  const corporation = text(req.body?.corporation, 80);
  const justification = text(req.body?.justification, 3000);
  if (!title || !corporationExists(corporation) || !justification) return res.status(400).json({ error: 'Role title, corporation, and justification are required.' });
  const approval = { id: id('approval'), title: `Recruitment request: ${title}`, category: 'Agent Recruitment', requesterId: 'owner', requesterName: req.user.name, corporation, description: `Proposed role: ${title}. Department: ${text(req.body?.department, 120) || 'Not specified'}.`, justification, risk: 'Medium', status: 'Pending', evidence: ['Role request is awaiting review; no agent has been created.'], approvalChain: ['Chief AI Workforce Officer', 'Owner'], createdAt: now(), isDemoSeed: false };
  state.approvals.unshift(approval);
  audit(req.user.id, 'agent.recruitment_requested', 'approval', approval.id, { title, corporation });
  saveState();
  broadcast('approval.created', { approvalId: approval.id });
  res.status(201).json({ approval });
});
app.post('/api/approvals/:id/decision', (req, res) => {
  const approval = state.approvals.find((item) => item.id === req.params.id);
  if (!approval) return res.status(404).json({ error: 'Approval request not found.' });
  const action = text(req.body?.action, 30);
  const map = { approve: 'Approved', reject: 'Rejected', request_changes: 'Changes Requested', delegate: 'Delegated' };
  if (!map[action]) return res.status(400).json({ error: 'Choose an available review action.' });
  if (['High', 'Critical'].includes(approval.risk) && ['approve', 'reject'].includes(action) && req.body?.humanConfirmed !== true) return res.status(400).json({ error: 'Explicit owner confirmation is required for high-risk actions.' });
  const before = approval.status;
  approval.status = map[action];
  approval.reviewedAt = now();
  approval.reviewedBy = req.user.id;
  approval.reviewNote = text(req.body?.note, 1000);
  approval.delegateTo = action === 'delegate' ? text(req.body?.delegateTo, 100) : undefined;
  audit(req.user.id, `approval.${action}`, 'approval', approval.id, { before, after: approval.status, risk: approval.risk, note: approval.reviewNote });
  saveState();
  broadcast('approval.updated', { approvalId: approval.id });
  res.json({ approval });
});

app.get('/api/decisions', (_req, res) => res.json({ decisions: state.decisions }));
app.post('/api/decisions', (req, res) => {
  const title = text(req.body?.title, 180);
  const description = text(req.body?.description, 3000);
  const corporation = text(req.body?.corporation, 80);
  if (!title || !description || !corporationExists(corporation)) return res.status(400).json({ error: 'Decision title, description, and corporation are required.' });
  const decision = { id: id('decision'), title, description, requesterName: req.user.name, corporation, businessImpact: text(req.body?.businessImpact, 500) || 'Not yet assessed.', financialImpact: text(req.body?.financialImpact, 500) || 'Not assessed — no connected finance source.', risk: text(req.body?.risk, 60) || 'Not assessed', status: 'Draft', recommendations: [], approvalRequired: Boolean(req.body?.approvalRequired), createdAt: now(), isDemoSeed: false };
  state.decisions.unshift(decision);
  audit(req.user.id, 'decision.created', 'decision', decision.id, { title, corporation });
  saveState();
  broadcast('decision.created', { decisionId: decision.id });
  res.status(201).json({ decision });
});
app.patch('/api/decisions/:id/status', (req, res) => {
  const decision = state.decisions.find((item) => item.id === req.params.id);
  if (!decision) return res.status(404).json({ error: 'Decision not found.' });
  const allowed = ['Draft', 'Under Review', 'Awaiting Approval', 'Approved', 'Rejected', 'Executing', 'Completed'];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: 'Invalid decision status.' });
  if (['Approved', 'Rejected'].includes(req.body.status) && req.body?.humanConfirmed !== true) return res.status(400).json({ error: 'Explicit owner confirmation is required.' });
  const before = decision.status;
  decision.status = req.body.status;
  audit(req.user.id, 'decision.status_changed', 'decision', decision.id, { before, after: decision.status });
  saveState();
  broadcast('decision.updated', { decisionId: decision.id });
  res.json({ decision });
});

app.get('/api/commands', (_req, res) => res.json({ commands: state.commands }));
app.post('/api/commands', (req, res) => {
  const command = text(req.body?.command, 3000);
  const routeTo = text(req.body?.route, 80) || 'All executives';
  if (!command) return res.status(400).json({ error: 'Enter a command before submitting.' });
  const run = { id: id('command'), command, route: routeTo, status: 'Pending', createdAt: now(), updatedAt: now(), requestedBy: req.user.name };
  state.commands.unshift(run);
  audit(req.user.id, 'command.queued', 'command', run.id, { route: routeTo, providerConfigured: agentProvider.status().configured });
  saveState();
  broadcast('command.created', { commandId: run.id });
  res.status(201).json({ command: run, providerConfigured: agentProvider.status().configured });
});
app.post('/api/commands/:id/dispatch', route(async (req, res) => {
  const run = state.commands.find((item) => item.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Command not found.' });
  if (run.status !== 'Pending' && run.status !== 'Failed') return res.status(409).json({ error: 'Only pending or failed commands can be dispatched.' });
  try {
    const dispatched = await agentProvider.dispatch({ id: run.id, command: run.command, route: run.route, requester: req.user.name });
    run.providerRunId = dispatched.runId;
    run.status = dispatched.status;
    run.result = dispatched.result;
    run.error = undefined;
    run.updatedAt = now();
    audit(req.user.id, 'command.dispatched', 'command', run.id, { providerRunId: run.providerRunId, status: run.status });
    saveState();
    broadcast('command.updated', { commandId: run.id });
    return res.json({ command: run });
  } catch (error) {
    if (error.code === 'PROVIDER_NOT_CONFIGURED') return res.status(503).json({ error: error.message, providerConfigured: false });
    run.status = 'Failed';
    run.error = error.message;
    run.updatedAt = now();
    audit(req.user.id, 'command.dispatch_failed', 'command', run.id, { error: error.message, code: error.code || 'UNKNOWN' });
    saveState();
    broadcast('command.updated', { commandId: run.id });
    return res.status(502).json({ error: error.message, command: run });
  }
}));

app.get('/api/meetings', (_req, res) => res.json({ meetings: state.meetings }));
app.post('/api/meetings', (req, res) => {
  const title = text(req.body?.title, 180);
  const objective = text(req.body?.objective, 1500);
  const corporation = text(req.body?.corporation, 80);
  if (!title || !objective || !corporationExists(corporation)) return res.status(400).json({ error: 'Meeting title, objective, and corporation are required.' });
  const participantIds = Array.isArray(req.body?.participantIds) ? [...new Set(req.body.participantIds.filter((agentId) => agentById(agentId)))].slice(0, 40) : [];
  const meeting = { id: id('meeting'), title, type: text(req.body?.type, 80) || 'Executive Board Meeting', objective, topics: Array.isArray(req.body?.topics) ? req.body.topics.map((item) => text(item, 180)).filter(Boolean).slice(0, 12) : [], participantIds, moderatorId: agentById(req.body?.moderatorId)?.id || 'ceo-holding', corporation, scheduledAt: text(req.body?.scheduledAt, 40) || now(), status: 'Scheduled', notes: [], isDemoSeed: false };
  state.meetings.unshift(meeting);
  audit(req.user.id, 'meeting.created', 'meeting', meeting.id, { title, participantCount: participantIds.length });
  saveState();
  broadcast('meeting.created', { meetingId: meeting.id });
  res.status(201).json({ meeting });
});
app.post('/api/meetings/:id/start', (req, res) => {
  const meeting = state.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });
  if (meeting.status !== 'Scheduled') return res.status(409).json({ error: 'Only scheduled meetings can be started.' });
  meeting.status = 'In Progress';
  audit(req.user.id, 'meeting.started', 'meeting', meeting.id, { aiFacilitationConfigured: agentProvider.status().configured });
  saveState();
  broadcast('meeting.updated', { meetingId: meeting.id });
  res.json({ meeting, aiFacilitationConfigured: agentProvider.status().configured });
});
app.post('/api/meetings/:id/notes', (req, res) => {
  const meeting = state.meetings.find((item) => item.id === req.params.id);
  const note = text(req.body?.note, 3000);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });
  if (!note) return res.status(400).json({ error: 'Write a note first.' });
  meeting.notes.push(`${now()} · ${req.user.name}: ${note}`);
  audit(req.user.id, 'meeting.note_added', 'meeting', meeting.id, { characters: note.length });
  saveState();
  broadcast('meeting.updated', { meetingId: meeting.id });
  res.json({ meeting });
});
app.patch('/api/meetings/:id/status', (req, res) => {
  const meeting = state.meetings.find((item) => item.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found.' });
  if (!['Completed', 'Cancelled'].includes(req.body?.status)) return res.status(400).json({ error: 'Invalid meeting status.' });
  const before = meeting.status;
  meeting.status = req.body.status;
  audit(req.user.id, 'meeting.status_changed', 'meeting', meeting.id, { before, after: meeting.status });
  saveState();
  broadcast('meeting.updated', { meetingId: meeting.id });
  res.json({ meeting });
});

app.get('/api/notifications', (_req, res) => res.json({ notifications: state.notifications }));
app.post('/api/notifications/read-all', (req, res) => {
  const timestamp = now();
  state.notifications.forEach((notification) => { if (!notification.readAt) notification.readAt = timestamp; });
  audit(req.user.id, 'notifications.read_all', 'notification', 'all');
  saveState();
  broadcast('notifications.updated', {});
  res.json({ ok: true });
});
app.post('/api/notifications/:id/read', (req, res) => {
  const notification = state.notifications.find((item) => item.id === req.params.id);
  if (!notification) return res.status(404).json({ error: 'Notification not found.' });
  notification.readAt = notification.readAt || now();
  audit(req.user.id, 'notification.read', 'notification', notification.id);
  saveState();
  broadcast('notifications.updated', {});
  res.json({ notification });
});
app.put('/api/settings/notifications', (req, res) => {
  const allowed = ['inApp', 'email', 'securityAlerts', 'mentions', 'taskUpdates'];
  for (const key of allowed) if (typeof req.body?.[key] === 'boolean') state.notificationPreferences[key] = req.body[key];
  audit(req.user.id, 'settings.notification_preferences_updated', 'settings', 'notifications');
  saveState();
  res.json({ preferences: state.notificationPreferences });
});

app.get('/api/knowledge', (req, res) => {
  const query = text(req.query.q, 200).toLowerCase();
  const documents = state.documents.filter((document) => !query || `${document.title} ${document.body} ${document.corporation} ${document.department}`.toLowerCase().includes(query));
  res.json({ documents });
});
app.post('/api/knowledge', (req, res) => {
  const title = text(req.body?.title, 180);
  const body = text(req.body?.body, 12_000);
  const corporation = text(req.body?.corporation, 80);
  if (!title || !body || !corporationExists(corporation)) return res.status(400).json({ error: 'Document title, content, and corporation are required.' });
  const document = { id: id('doc'), title, body, corporation, department: text(req.body?.department, 100) || 'General', visibility: corporation === 'Holding Headquarters' ? 'Holding only' : 'Corporation', createdBy: req.user.id, createdAt: now(), updatedAt: now(), isDemoSeed: false };
  state.documents.unshift(document);
  audit(req.user.id, 'knowledge.document_created', 'document', document.id, { title, corporation, visibility: document.visibility });
  saveState();
  res.status(201).json({ document });
});
app.patch('/api/knowledge/:id', (req, res) => {
  const document = state.documents.find((item) => item.id === req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  const before = { title: document.title, corporation: document.corporation, visibility: document.visibility };
  if (typeof req.body?.title === 'string' && text(req.body.title, 180)) document.title = text(req.body.title, 180);
  if (typeof req.body?.body === 'string') document.body = text(req.body.body, 12_000);
  if (typeof req.body?.corporation === 'string' && corporationExists(req.body.corporation)) {
    document.corporation = req.body.corporation;
    document.visibility = req.body.corporation === 'Holding Headquarters' ? 'Holding only' : 'Corporation';
  }
  document.updatedAt = now();
  audit(req.user.id, 'knowledge.document_updated', 'document', document.id, { before });
  saveState();
  res.json({ document });
});
app.delete('/api/knowledge/:id', (req, res) => {
  const index = state.documents.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Document not found.' });
  const [document] = state.documents.splice(index, 1);
  audit(req.user.id, 'knowledge.document_deleted', 'document', document.id, { title: document.title });
  saveState();
  res.json({ ok: true });
});

app.get('/api/search', (req, res) => {
  const query = text(req.query.q, 180).toLowerCase();
  if (query.length < 2) return res.json({ results: [] });
  const results = [];
  const add = (type, itemId, title, description, page, corporation, targetId) => results.push({ type, id: itemId, title, description: text(description, 240), page, corporation, targetId });
  for (const agent of state.agents) if (`${agent.name} ${agent.title} ${agent.department} ${agent.corporation} ${agent.skills.join(' ')}`.toLowerCase().includes(query)) add('Agent', agent.id, agent.name, `${agent.title} · ${agent.department}`, 'agent-profile', agent.corporation);
  for (const conversation of state.conversations) if (`${conversation.title} ${conversation.department} ${conversation.corporation}`.toLowerCase().includes(query)) add('Conversation', conversation.id, conversation.title, `${conversation.corporation} · ${conversation.department}`, conversation.type === 'dm' ? 'direct-messages' : 'conversations', conversation.corporation);
  for (const message of state.messages) if (!message.deletedAt && `${message.body} ${message.senderName}`.toLowerCase().includes(query)) add('Message', message.id, `${message.senderName} in ${conversationById(message.conversationId)?.title || 'Conversation'}`, message.body, 'conversations', conversationById(message.conversationId)?.corporation, message.conversationId);
  for (const task of state.tasks) if (`${task.title} ${task.description} ${task.assigneeName}`.toLowerCase().includes(query)) add('Task', task.id, task.title, `${task.status} · ${task.assigneeName}`, 'tasks', task.corporation);
  for (const project of state.projects) if (`${project.name} ${project.description}`.toLowerCase().includes(query)) add('Project', project.id, project.name, `${project.status} · ${project.corporation}`, 'projects', project.corporation);
  for (const decision of state.decisions) if (`${decision.title} ${decision.description}`.toLowerCase().includes(query)) add('Decision', decision.id, decision.title, `${decision.status} · ${decision.corporation}`, 'decisions', decision.corporation);
  for (const meeting of state.meetings) if (`${meeting.title} ${meeting.objective}`.toLowerCase().includes(query)) add('Meeting', meeting.id, meeting.title, `${meeting.status} · ${meeting.type}`, 'meetings', meeting.corporation);
  for (const document of state.documents) if (`${document.title} ${document.body}`.toLowerCase().includes(query)) add('Document', document.id, document.title, `${document.visibility} · ${document.corporation}`, 'knowledge', document.corporation);
  res.json({ results: results.slice(0, 60) });
});

app.get('/api/audit', (req, res) => {
  const search = text(req.query.q, 200).toLowerCase();
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1_000);
  const logs = state.auditLogs.filter((entry) => !search || `${entry.actor} ${entry.action} ${entry.entity} ${entry.entityId} ${JSON.stringify(entry.details)}`.toLowerCase().includes(search)).slice(0, limit);
  res.json({ auditLogs: logs, total: state.auditLogs.length });
});
app.post('/api/permission-requests', (req, res) => {
  const agent = agentById(text(req.body?.agentId, 100));
  const permission = text(req.body?.permission, 160);
  const justification = text(req.body?.justification, 3000);
  if (!agent || !permission || !justification) return res.status(400).json({ error: 'Agent, requested permission, and justification are required.' });
  const approval = { id: id('approval'), title: `Permission request: ${agent.name} · ${permission}`, category: 'Agent Permission Changes', requesterId: 'owner', requesterName: req.user.name, corporation: agent.corporation, description: `Requested scope change for ${agent.name} (${agent.title}). Current access: ${agent.permissionLevel}. Requested permission: ${permission}.`, justification, risk: 'High', status: 'Pending', evidence: ['Permission is not granted by submitting this request.'], approvalChain: ['Chief AI Workforce Officer', 'Owner'], createdAt: now(), isDemoSeed: false };
  state.approvals.unshift(approval);
  audit(req.user.id, 'permission.change_requested', 'approval', approval.id, { agentId: agent.id, permission });
  saveState();
  broadcast('approval.created', { approvalId: approval.id });
  res.status(201).json({ approval });
});
app.get('/api/roles', (_req, res) => res.json({ roles: [
  { name: 'Owner', scope: 'Holding-wide', permissions: ['Approve high-risk operations', 'Manage roles and policies', 'View all organization records'] },
  { name: 'Executive', scope: 'Assigned corporation and delegated holding areas', permissions: ['Review scoped reports', 'Assign tasks within scope', 'Request approvals'] },
  { name: 'Manager', scope: 'Assigned department', permissions: ['Coordinate department tasks', 'Review scoped deliverables', 'Request role changes'] },
  { name: 'Agent', scope: 'Explicit role grants only', permissions: ['Use authorized tools', 'Access assigned work', 'Escalate for human approval'] },
], demoNote: 'The running demo is owner-only. Production role assignment requires an identity provider and a reviewed policy store.' }));

app.get('/api/events', requireOwner, (req, res) => {
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ at: now() })}\n\n`);
  events.add(res);
  const heartbeat = setInterval(() => { try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); events.delete(res); } }, 25_000);
  req.on('close', () => { clearInterval(heartbeat); events.delete(res); });
});

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(dist, 'index.html')));
} else {
  (async () => {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true, host: '0.0.0.0', allowedHosts: true }, appType: 'spa' });
    app.use(vite.middlewares);
  })().catch((error) => { console.error(error); process.exit(1); });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 8 MB demo upload limit.' : 'Upload could not be accepted.';
    return res.status(400).json({ error: message });
  }
  console.error('[api error]', error);
  if (res.headersSent) return;
  res.status(error.status || 500).json({ error: error.status && error.status < 500 ? error.message : 'An unexpected server error occurred.' });
});

const server = http.createServer(app);
const port = Number(process.env.PORT) || 4173;
server.listen(port, '0.0.0.0', () => {
  console.log(`AI HOLDING ${IS_DEMO ? 'demo' : 'production'} server listening on 0.0.0.0:${port}`);
  console.log(`AI agent provider: ${agentProvider.status().configured ? 'configured' : 'not configured — commands will remain pending'}`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
