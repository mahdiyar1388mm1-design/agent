import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowDown, ArrowLeft, ArrowRight, AtSign, Bookmark, Check, ChevronDown, ChevronRight,
  CirclePlus, Clock3, File, FilePlus2, FileText, Filter, Flag, Forward, Hash, Image, Info, ListFilter,
  LockKeyhole, MessageCircle, MessageSquareMore, MoreHorizontal, Paperclip, Pin, Plus, Search, Send,
  ShieldCheck, Smile, Sparkles, Star, Trash2, Users, X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, patch, post } from '../api';
import type { Agent, Attachment, Bootstrap, Conversation, Message, PageId, Priority } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, InlineNotice, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { compactDate, corporationClass, fullDate, shortCorporation, timeAgo, truncate } from '../utils';

interface Props {
  data: Bootstrap;
  page: PageId;
  activeConversationId: string;
  onOpenConversation: (id: string) => void;
  onNavigateToAgent: (id: string) => void;
  onNavigate: (page: PageId) => void;
  onRefresh: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  jumpMessageId?: string;
  onJumpHandled: () => void;
}

const emojis = ['👍', '✅', '👀', '🙌', '🤔', '❤️'];
const fileTypes = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.docx,.xlsx';

function personFor(data: Bootstrap, id: string) {
  if (id === data.user.id) return data.user;
  return data.agents.find((agent) => agent.id === id);
}

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments?.length) return null;
  return <div className={`message-attachments ${attachments.some((attachment) => attachment.mimeType.startsWith('image/')) ? 'has-image' : ''}`}>
    {attachments.map((attachment) => attachment.mimeType.startsWith('image/') ? <a key={attachment.id} className="attachment-image" href={`/api/files/${attachment.id}`} target="_blank" rel="noreferrer" title={attachment.originalName}>
      <img src={`/api/files/${attachment.id}`} alt={attachment.originalName} loading="lazy" />
      <span><Image size={13} />{attachment.originalName}</span>
    </a> : <a className="attachment-file" key={attachment.id} href={`/api/files/${attachment.id}`}>
      <span className="attachment-file-icon"><FileText size={16} /></span><span><strong>{attachment.originalName}</strong><small>{(attachment.size / 1024).toFixed(0)} KB · Download</small></span><ArrowDown size={14} />
    </a>)}
  </div>;
}

interface MessageRowProps {
  message: Message;
  data: Bootstrap;
  threadCount: number;
  isSaved: boolean;
  onReply: (message: Message) => void;
  onOpenThread: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onPin: (messageId: string) => void;
  onBookmark: (messageId: string) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onCreateTask: (message: Message) => void;
  onForward: (message: Message) => void;
  onOpenAgent: (agentId: string) => void;
  isThread?: boolean;
}

function MessageRow({ message, data, threadCount, isSaved, onReply, onOpenThread, onReact, onPin, onBookmark, onEdit, onDelete, onCreateTask, onForward, onOpenAgent, isThread = false }: MessageRowProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const author = personFor(data, message.senderId);
  const ownerMessage = message.senderId === data.user.id;
  const deleted = Boolean(message.deletedAt);

  return <article className={`message-row ${ownerMessage ? 'message-owner' : ''} ${message.isPriority ? 'message-priority' : ''} ${deleted ? 'message-deleted' : ''}`} id={`message-${message.id}`}>
    <button className="message-avatar-button" onClick={() => !ownerMessage && onOpenAgent(message.senderId)} aria-label={`Open ${message.senderName} profile`}><Avatar name={message.senderName} color={author && 'avatarColor' in author ? author.avatarColor : undefined} size="sm" status={!ownerMessage ? (author as Agent | undefined)?.status : undefined} /></button>
    <div className="message-main">
      <div className="message-meta"><button className="message-author" onClick={() => !ownerMessage && onOpenAgent(message.senderId)}>{message.senderName}</button><span className="message-role">{message.senderTitle}</span>{message.isPriority && <span className="message-priority-label"><Flag size={10} /> PRIORITY</span>}<time title={fullDate(message.createdAt)}>{timeAgo(message.createdAt)}</time>{message.editedAt && <small className="edited-label">edited</small>}</div>
      {message.replyTo && <button className="reply-reference" onClick={() => onOpenThread(message)}><MessageSquareMore size={12} /> In a thread</button>}
      {deleted ? <div className="deleted-message"><Trash2 size={13} /> {message.body}</div> : <div className="message-bubble">
        <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.body}</ReactMarkdown></div>
        <MessageAttachments attachments={message.attachments || []} />
      </div>}
      {message.reactions?.length > 0 && <div className="reaction-row">{message.reactions.map((reaction) => <button key={reaction.emoji} className={`reaction-chip ${reaction.userIds.includes(data.user.id) ? 'reaction-active' : ''}`} onClick={() => onReact(message.id, reaction.emoji)}>{reaction.emoji}<span>{reaction.userIds.length}</span></button>)}</div>}
      {threadCount > 0 && !isThread && <button className="thread-summary" onClick={() => onOpenThread(message)}><span className="thread-avatars"><Avatar name="Jun Park" size="xs" /><Avatar name="Avery Morgan" size="xs" /></span><span>{threadCount} {threadCount === 1 ? 'reply' : 'replies'}</span><span className="thread-last-reply">View thread <ChevronRight size={13} /></span></button>}
      {message.isPinned && <span className="pinned-message-mark"><Pin size={11} /> Pinned</span>}
    </div>
    {!deleted && <div className="message-actions">
      <button className="message-action-button" aria-label="React" title="React" onClick={() => setEmojiOpen(!emojiOpen)}><Smile size={14} /></button>
      <button className="message-action-button" aria-label="Reply in thread" title="Reply in thread" onClick={() => onReply(message)}><MessageSquareMore size={14} /></button>
      <button className={`message-action-button ${isSaved ? 'is-saved' : ''}`} aria-label={isSaved ? 'Remove bookmark' : 'Bookmark'} title={isSaved ? 'Remove bookmark' : 'Bookmark'} onClick={() => onBookmark(message.id)}><Bookmark size={14} /></button>
      <div className="message-more-wrap"><button className="message-action-button" aria-label="More message actions" title="More actions" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={15} /></button>
        {menuOpen && <><button className="popover-dismiss" aria-label="Close actions" onClick={() => setMenuOpen(false)} /><div className="message-context-menu">
          <button onClick={() => { onReply(message); setMenuOpen(false); }}><MessageSquareMore size={14} /> Reply in thread</button>
          <button onClick={() => { onCreateTask(message); setMenuOpen(false); }}><Check size={14} /> Convert to task</button>
          <button onClick={() => { onForward(message); setMenuOpen(false); }}><Forward size={14} /> Forward message</button>
          <button onClick={() => { onPin(message.id); setMenuOpen(false); }}><Pin size={14} /> {message.isPinned ? 'Unpin message' : 'Pin to conversation'}</button>
          {ownerMessage && <button onClick={() => { onEdit(message); setMenuOpen(false); }}><FileText size={14} /> Edit message</button>}
          <button className="danger-menu-item" onClick={() => { onDelete(message); setMenuOpen(false); }}><Trash2 size={14} /> Delete with audit history</button>
        </div></>}
      </div>
      {emojiOpen && <><button className="popover-dismiss" aria-label="Close reactions" onClick={() => setEmojiOpen(false)} /><div className="emoji-popover">{emojis.map((emoji) => <button key={emoji} onClick={() => { onReact(message.id, emoji); setEmojiOpen(false); }}>{emoji}</button>)}</div></>}
    </div>}
  </article>;
}

export function ChatPage({ data, page, activeConversationId, onOpenConversation, onNavigateToAgent, onNavigate, onRefresh, notify, jumpMessageId, onJumpHandled }: Props) {
  const [conversationQuery, setConversationQuery] = useState('');
  const [messageQuery, setMessageQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageFilter, setMessageFilter] = useState<'all' | 'pinned' | 'priority'>('all');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [threadRoot, setThreadRoot] = useState<Message | null>(null);
  const [pendingFile, setPendingFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPriority, setIsPriority] = useState(false);
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [roomModal, setRoomModal] = useState(false);
  const [taskMessage, setTaskMessage] = useState<Message | null>(null);
  const [editMessage, setEditMessage] = useState<Message | null>(null);
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const corporationFilter = page === 'holding' ? 'Holding Headquarters' : page === 'trading' ? 'Trading Corporation' : page === 'development' ? 'Development Corporation' : page === 'marketing' ? 'Marketing Corporation' : undefined;
  const conversations = useMemo(() => data.conversations.filter((conversation) => {
    if (conversation.archived) return false;
    if (page === 'direct-messages' && conversation.type !== 'dm') return false;
    if (page === 'group-chats' && conversation.type !== 'group') return false;
    if (page === 'announcements' && !conversation.isAnnouncement) return false;
    if (corporationFilter && conversation.corporation !== corporationFilter) return false;
    const search = conversationQuery.trim().toLowerCase();
    return !search || `${conversation.title} ${conversation.corporation} ${conversation.department}`.toLowerCase().includes(search);
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.conversations, page, corporationFilter, conversationQuery]);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0];
  const threadCounts = useMemo(() => messages.reduce<Record<string, number>>((counts, message) => {
    if (message.threadRootId) counts[message.threadRootId] = (counts[message.threadRootId] || 0) + 1;
    return counts;
  }, {}), [messages]);
  const participants = useMemo(() => activeConversation?.participantIds.map((id) => personFor(data, id)).filter(Boolean) as (Agent | Bootstrap['user'])[] || [], [activeConversation, data]);
  const filteredMessages = useMemo(() => messages.filter((message) => {
    if (messageQuery.trim() && !`${message.body} ${message.senderName}`.toLowerCase().includes(messageQuery.toLowerCase())) return false;
    if (messageFilter === 'pinned' && !message.isPinned) return false;
    if (messageFilter === 'priority' && !message.isPriority) return false;
    return true;
  }), [messages, messageQuery, messageFilter]);
  const rootMessages = filteredMessages.filter((message) => !message.threadRootId);
  const mentionsAfterAt = draft.slice(Math.max(draft.lastIndexOf('@'), 0) + 1).match(/^([\w .-]{0,30})$/);
  const mentionQuery = draft.includes('@') && mentionsAfterAt ? mentionsAfterAt[1].toLowerCase() : null;
  const mentionMatches = mentionQuery !== null ? data.agents.filter((agent) => agent.name.toLowerCase().includes(mentionQuery)).slice(0, 5) : [];

  useEffect(() => {
    if (activeConversation && activeConversation.id !== activeConversationId) onOpenConversation(activeConversation.id);
  }, [activeConversation?.id, activeConversationId, onOpenConversation]);

  useEffect(() => {
    if (!activeConversation) { setMessages([]); return; }
    let live = true;
    setLoadingMessages(true);
    api<{ messages: Message[] }>(`/conversations/${activeConversation.id}/messages?limit=250`)
      .then((response) => { if (live) setMessages(response.messages); })
      .catch((error) => notify(error.message || 'Could not load the conversation.', 'error'))
      .finally(() => { if (live) setLoadingMessages(false); });
    void post(`/conversations/${activeConversation.id}/read`, {}).catch(() => undefined);
    return () => { live = false; };
  }, [activeConversation?.id, notify]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeConversation?.id, messages.length]);

  useEffect(() => {
    if (!jumpMessageId) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`message-${jumpMessageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      onJumpHandled();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [jumpMessageId, messages, onJumpHandled]);

  if (page === 'saved-messages') return <SavedMessagesPage data={data} onOpenConversation={onOpenConversation} onNavigate={onNavigate} notify={notify} />;

  const activeMessageList = messages.filter((message) => !message.deletedAt);
  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      await post(`/messages/${messageId}/reactions`, { emoji });
      const latest = await api<{ messages: Message[] }>(`/conversations/${activeConversation!.id}/messages?limit=250`);
      setMessages(latest.messages);
    } catch (error) { notify(error instanceof Error ? error.message : 'Reaction could not be saved.', 'error'); }
  };
  const togglePin = async (messageId: string) => {
    try { const result = await post<{ isPinned: boolean }>(`/messages/${messageId}/pin`, {}); setMessages((items) => items.map((item) => item.id === messageId ? { ...item, isPinned: result.isPinned } : item)); notify(result.isPinned ? 'Message pinned to this conversation.' : 'Message unpinned.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Pin action failed.', 'error'); }
  };
  const toggleBookmark = async (messageId: string) => {
    try { const result = await post<{ saved: boolean }>(`/messages/${messageId}/bookmark`, {}); await onRefresh(); notify(result.saved ? 'Message saved to your bookmarks.' : 'Message removed from saved messages.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Bookmark action failed.', 'error'); }
  };
  const deleteMessage = async (message: Message) => {
    if (!window.confirm('Delete this message? The change will be retained in the audit history.')) return;
    try { await api(`/messages/${message.id}`, { method: 'DELETE' }); setMessages((items) => items.map((item) => item.id === message.id ? { ...item, deletedAt: new Date().toISOString(), body: 'This message was deleted by the owner.' } : item)); notify('Message deleted. Audit history retained.', 'info'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Message could not be deleted.', 'error'); }
  };
  const saveEdit = async () => {
    if (!editMessage) return;
    const body = (document.getElementById('edit-message-text') as HTMLTextAreaElement | null)?.value || '';
    try { const result = await patch<{ message: Message }>(`/messages/${editMessage.id}`, { body }); setMessages((items) => items.map((item) => item.id === result.message.id ? result.message : item)); setEditMessage(null); notify('Message updated.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Message could not be edited.', 'error'); }
  };
  const openThread = (message: Message) => {
    const root = message.threadRootId ? messages.find((item) => item.id === message.threadRootId) : message;
    if (root) setThreadRoot(root);
  };
  const uploadFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) { notify('Files must be 8 MB or smaller in this demo.', 'error'); return; }
    const payload = new FormData();
    payload.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ attachment: Attachment }>('/uploads', { method: 'POST', body: payload });
      setPendingFile(response.attachment);
      notify('File uploaded to the demo workspace.');
    } catch (error) { notify(error instanceof Error ? error.message : 'File could not be uploaded.', 'error'); }
    finally { setUploading(false); }
  };
  const sendMessage = async (override?: { body: string; reply: Message | null; thread?: boolean }) => {
    if (!activeConversation || sending) return;
    const body = override?.body ?? draft.trim();
    const attachmentIds = pendingFile ? [pendingFile.id] : [];
    if (!body && !attachmentIds.length) return;
    setSending(true);
    try {
      const response = await post<{ message: Message }>(`/conversations/${activeConversation.id}/messages`, {
        body, attachmentIds, isPriority, replyTo: override?.reply?.id || replyTo?.id,
        mentions: data.agents.filter((agent) => body.includes(`@${agent.name}`)).map((agent) => agent.id),
      });
      setMessages((items) => [...items, response.message]);
      setDraft(''); setPendingFile(null); setReplyTo(null); setIsPriority(false); setMentionOpen(false);
      if (override?.thread) setThreadRoot(null);
      await onRefresh();
    } catch (error) { notify(error instanceof Error ? error.message : 'Message was not saved.', 'error'); }
    finally { setSending(false); }
  };
  const addMention = (agent: Agent) => {
    const atIndex = draft.lastIndexOf('@');
    setDraft(`${draft.slice(0, atIndex)}@${agent.name} `);
    setMentionOpen(false);
    composerRef.current?.focus();
  };
  const convertToTask = async (message: Message, title: string, assigneeId: string, priority: Priority) => {
    try {
      await post('/tasks/from-message', { messageId: message.id, title, assigneeId, priority });
      setTaskMessage(null); await onRefresh(); notify('Follow-up task created from the message.');
      onNavigate('tasks');
    } catch (error) { notify(error instanceof Error ? error.message : 'Task could not be created.', 'error'); }
  };
  const forwardTo = async (message: Message, conversationId: string) => {
    try { await post(`/messages/${message.id}/forward`, { conversationId }); setForwardMessage(null); notify('Message forwarded.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Message could not be forwarded.', 'error'); }
  };
  const archiveConversation = async () => {
    if (!activeConversation || !window.confirm(`Archive “${activeConversation.title}”? You can restore it from conversation settings.`)) return;
    try {
      await patch(`/conversations/${activeConversation.id}/archive`, { archived: true });
      await onRefresh(); notify('Conversation archived.');
      const next = conversations.find((item) => item.id !== activeConversation.id);
      if (next) onOpenConversation(next.id);
    } catch (error) { notify(error instanceof Error ? error.message : 'Conversation could not be archived.', 'error'); }
  };
  const createRoom = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '');
    const corporation = String(form.get('corporation') || 'Holding Headquarters');
    const department = String(form.get('department') || 'General');
    try {
      const response = await post<{ conversation: Conversation }>('/conversations', { title, corporation, department, participantIds: data.agents.filter((agent) => corporation === 'Holding Headquarters' || agent.corporation === corporation).map((agent) => agent.id) });
      setRoomModal(false); await onRefresh(); onOpenConversation(response.conversation.id); notify('Room created.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Room could not be created.', 'error'); }
  };

  const RenderMessage = (message: Message, isThread = false) => <MessageRow
    key={message.id} message={message} data={data} threadCount={threadCounts[message.id] || 0} isSaved={data.savedMessageIds.includes(message.id)} isThread={isThread}
    onReply={(target) => { setReplyTo(target); composerRef.current?.focus(); if (isThread) setThreadRoot(target.threadRootId ? messages.find((item) => item.id === target.threadRootId) || target : target); }}
    onOpenThread={openThread} onReact={(messageId, emoji) => void toggleReaction(messageId, emoji)} onPin={(messageId) => void togglePin(messageId)}
    onBookmark={(messageId) => void toggleBookmark(messageId)} onEdit={setEditMessage} onDelete={(target) => void deleteMessage(target)} onCreateTask={setTaskMessage}
    onForward={setForwardMessage} onOpenAgent={onNavigateToAgent}
  />;

  if (!activeConversation) return <div className="chat-empty-page"><EmptyState icon={<MessageCircle size={23} />} title="No conversations here" detail="Try another view, or create a private room for an authorized group." action={<button className="button button-primary" onClick={() => setRoomModal(true)}><Plus size={15} /> Create room</button>} /></div>;
  const messageParticipants = participants.filter((person) => person.id !== 'owner');
  const pinnedMessages = activeMessageList.filter((message) => message.isPinned);
  const isDemoHistory = activeMessageList.some((message) => message.isDemoSeed);

  return (
    <div className={`chat-workspace ${threadRoot ? 'has-thread-panel' : ''}`}>
      <aside className="conversation-rail">
        <div className="conversation-rail-head"><div><span className="eyebrow">MESSAGING</span><h2>{page === 'direct-messages' ? 'Direct messages' : page === 'announcements' ? 'Announcements' : page === 'group-chats' ? 'Group chats' : corporationFilter ? shortCorporation(corporationFilter) : 'Conversations'}</h2></div>{page !== 'direct-messages' && <button className="icon-button" title="Create a group room" aria-label="Create room" onClick={() => setRoomModal(true)}><CirclePlus size={17} /></button>}</div>
        <label className="conversation-search"><Search size={14} /><input placeholder="Find a conversation" value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} aria-label="Find a conversation" /></label>
        <div className="conversation-rail-meta"><span>{conversations.length} {page === 'direct-messages' ? 'people' : 'rooms'}</span><button className="text-action tiny" onClick={() => setConversationQuery('')}><ListFilter size={13} /> Clear</button></div>
        <div className="conversation-list">
          {conversations.map((conversation) => <ConversationItem key={conversation.id} conversation={conversation} active={conversation.id === activeConversation.id} data={data} onClick={() => onOpenConversation(conversation.id)} />)}
          {!conversations.length && <div className="conversation-list-empty">No matching conversations.</div>}
        </div>
        {page === 'group-chats' && <button className="new-room-link" onClick={() => setRoomModal(true)}><Plus size={14} /> Create authorized room</button>}
      </aside>

      <section className="conversation-main">
        <header className="conversation-header">
          <div className="conversation-title-wrap">
            {activeConversation.type === 'group' ? <span className={`conversation-channel-mark ${corporationClass(activeConversation.corporation)}`}><Hash size={17} /></span> : <Avatar name={activeConversation.title} color={data.agents.find((agent) => agent.name === activeConversation.title)?.avatarColor} size="sm" status={data.agents.find((agent) => agent.name === activeConversation.title)?.status} />}
            <div className="conversation-title-copy"><h2>{activeConversation.title}</h2><div><span>{activeConversation.type === 'group' ? `${activeConversation.department} · ${activeConversation.corporation}` : 'Private direct message'}</span><span className="header-dot" />{activeConversation.type === 'group' ? <span>{activeConversation.participantIds.length} participants</span> : <span>{data.agents.find((agent) => agent.name === activeConversation.title)?.status || 'Presence unknown'}</span>}</div></div>
          </div>
          <div className="conversation-header-actions">
            <div className="header-avatar-stack">{participants.slice(0, 4).map((person) => <Avatar key={person.id} name={person.name} color={'avatarColor' in person ? person.avatarColor : undefined} size="xs" />)}{participants.length > 4 && <span className="avatar-stack-more">+{participants.length - 4}</span>}</div>
            <button className={`icon-button ${searchOpen ? 'active' : ''}`} title="Search messages" aria-label="Search messages" onClick={() => { setSearchOpen(!searchOpen); setMessageQuery(''); }}><Search size={17} /></button>
            <button className="icon-button" title="Conversation details" aria-label="Conversation details" onClick={() => setInspectorOpen(!inspectorOpen)}><Info size={17} /></button>
            <button className="icon-button" title="More conversation options" aria-label="More conversation options" onClick={() => void archiveConversation()}><MoreHorizontal size={18} /></button>
          </div>
        </header>
        {isDemoHistory && <div className="chat-demo-banner"><span className="demo-banner-dot" /> <span>Seeded demo history</span><span> · New messages are stored; no AI reply is generated in this workspace.</span><span className="chat-demo-link"><LockKeyhole size={12} /> OWNER ONLY</span></div>}
        {searchOpen && <div className="message-search-bar"><Search size={15} /><input autoFocus value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} placeholder="Search this conversation…" /><button className="icon-button" onClick={() => { setMessageQuery(''); setSearchOpen(false); }} aria-label="Close search"><X size={15} /></button><span>{filteredMessages.length} results</span></div>}
        <div className="message-filter-bar"><div className="message-filter-tabs"><button className={messageFilter === 'all' ? 'selected' : ''} onClick={() => setMessageFilter('all')}>All messages</button><button className={messageFilter === 'pinned' ? 'selected' : ''} onClick={() => setMessageFilter('pinned')}><Pin size={12} /> Pinned</button><button className={messageFilter === 'priority' ? 'selected' : ''} onClick={() => setMessageFilter('priority')}><Flag size={12} /> Priority</button></div><span className="message-history-note"><ShieldCheck size={12} /> Retained conversation history</span></div>
        <div className="messages-scroll" aria-label="Conversation messages">
          {loadingMessages ? <div className="message-loading"><span className="button-spinner" /> Loading message history…</div> : rootMessages.length ? <>
            {rootMessages.map((message) => RenderMessage(message))}
            {rootMessages.some((message) => message.isDemoSeed) && <div className="seed-history-marker"><span /> SAMPLE HISTORY · FOR DEMONSTRATION ONLY <span /></div>}
            <div ref={messageEndRef} />
          </> : <div className="messages-empty"><div className="messages-empty-icon"><MessageCircle size={20} /></div><strong>Start the conversation</strong><span>Messages will be stored and audited. Agent replies remain disabled until a provider is configured.</span></div>}
        </div>
        <div className="conversation-composer-wrap">
          {replyTo && <div className="reply-composer-context"><span><MessageSquareMore size={13} /> Replying in thread to <strong>{replyTo.senderName}</strong></span><button className="icon-button" onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={14} /></button></div>}
          {pendingFile && <div className="pending-attachment"><File size={14} /><span>{pendingFile.originalName}</span><small>{(pendingFile.size / 1024).toFixed(0)} KB</small><button onClick={() => setPendingFile(null)} aria-label="Remove file"><X size={14} /></button></div>}
          <div className={`composer-box ${isPriority ? 'composer-priority' : ''}`}>
            <textarea ref={composerRef} rows={2} value={draft} onChange={(event) => { setDraft(event.target.value); setMentionOpen(event.target.value.includes('@')); }} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendMessage(); } if (event.key === 'Escape') setMentionOpen(false); }} placeholder={`Message ${activeConversation.type === 'group' ? `#${activeConversation.title}` : activeConversation.title}…`} aria-label="Write a message" />
            {mentionOpen && mentionMatches.length > 0 && <div className="mention-suggestions">{mentionMatches.map((agent) => <button key={agent.id} onClick={() => addMention(agent)}><Avatar name={agent.name} color={agent.avatarColor} size="xs" /><span><strong>{agent.name}</strong><small>{agent.title}</small></span></button>)}</div>}
            <div className="composer-toolbar"><div className="composer-tools">
              <button className="composer-tool" onClick={() => uploadRef.current?.click()} title="Attach a file" aria-label="Attach a file" disabled={uploading}><Paperclip size={15} /></button>
              <input ref={uploadRef} hidden type="file" accept={fileTypes} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.target.value = ''; }} />
              <button className={`composer-tool ${isPriority ? 'tool-active' : ''}`} onClick={() => setIsPriority(!isPriority)} title="Mark as priority" aria-label="Mark as priority"><Flag size={14} /></button>
              <button className="composer-tool" onClick={() => { setDraft((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@`); setMentionOpen(true); composerRef.current?.focus(); }} title="Mention an executive" aria-label="Mention an executive"><AtSign size={14} /></button>
              <span className="composer-separator" />
              <span className="composer-hint">Markdown supported · <kbd>⌘ ↵</kbd> to send</span>
            </div><button className="button button-primary send-button" disabled={sending || uploading || (!draft.trim() && !pendingFile)} onClick={() => void sendMessage()}>{sending ? <span className="button-spinner" /> : <Send size={14} />}<span>Send</span></button></div>
          </div>
          <div className="composer-disclaimer"><LockKeyhole size={11} /> Securely saved to this demo workspace <span>·</span> AI responses unavailable</div>
        </div>
      </section>

      {inspectorOpen && <aside className={`conversation-inspector ${threadRoot ? 'inspector-in-thread' : ''}`}>
        <div className="inspector-head"><div><span className="eyebrow">CONVERSATION DETAILS</span><h3>Context</h3></div><button className="icon-button inspector-close" onClick={() => setInspectorOpen(false)} aria-label="Close conversation details"><X size={15} /></button></div>
        <div className="inspector-group about-group"><span className="inspector-label">ABOUT</span><div className="about-card"><div className={`about-mark ${corporationClass(activeConversation.corporation)}`}>{activeConversation.type === 'group' ? <Hash size={18} /> : <MessageCircle size={17} />}</div><strong>{activeConversation.title}</strong><span>{activeConversation.department}</span><small>{activeConversation.corporation}</small><div className="about-divider" /><p>{activeConversation.type === 'group' ? 'A scoped room for authorized participants. History and attachments are retained in the local demo store.' : 'A private, owner-to-agent conversation. This demo persists messages but does not dispatch an AI reply.'}</p></div></div>
        <div className="inspector-group"><div className="inspector-group-head"><span className="inspector-label">PARTICIPANTS</span><span>{participants.length}</span></div><div className="participant-list">{participants.slice(0, 12).map((person) => <button className="participant-row" key={person.id} onClick={() => person.id !== 'owner' && onNavigateToAgent(person.id)}>
          <Avatar name={person.name} color={'avatarColor' in person ? person.avatarColor : undefined} size="xs" status={'status' in person ? person.status : 'Online'} />
          <span><strong>{person.name}</strong><small>{'title' in person ? person.title : 'Owner'}</small></span><i className="participant-online" />
        </button>)}{participants.length > 12 && <span className="more-participants">+{participants.length - 12} more participants</span>}</div></div>
        <div className="inspector-group"><div className="inspector-group-head"><span className="inspector-label">PINNED MESSAGES</span><span>{pinnedMessages.length}</span></div>{pinnedMessages.length ? pinnedMessages.slice(0, 3).map((message) => <button className="pinned-preview" key={message.id} onClick={() => document.getElementById(`message-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><Pin size={12} /><span>{truncate(message.body, 70)}</span></button>) : <p className="inspector-empty">No pinned messages in this conversation.</p>}</div>
        <div className="inspector-bottom"><span><LockKeyhole size={12} /> OWNER CONTROLLED</span><button onClick={() => void archiveConversation()}><Archive size={13} /> Archive conversation</button></div>
      </aside>}

      {threadRoot && <aside className="thread-panel">
        <div className="thread-panel-head"><button className="icon-button" onClick={() => { setThreadRoot(null); setReplyTo(null); }} aria-label="Close thread"><ArrowLeft size={16} /></button><div><span className="eyebrow">THREADED DISCUSSION</span><h3>Thread</h3></div><button className="icon-button" onClick={() => setThreadRoot(null)} aria-label="Close thread"><X size={16} /></button></div>
        <div className="thread-message-list">
          {RenderMessage(threadRoot, true)}
          {messages.filter((message) => message.threadRootId === threadRoot.id).map((message) => RenderMessage(message, true))}
          {!threadCounts[threadRoot.id] && <div className="thread-start-note">No replies yet. Start a focused discussion on this message.</div>}
        </div>
        <div className="thread-composer"><textarea rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void sendMessage({ body: draft.trim(), reply: threadRoot, thread: true }); } }} placeholder="Reply in thread…" /><div><span>⌘ ↵ to reply</span><button className="button button-primary button-sm" disabled={sending || !draft.trim()} onClick={() => void sendMessage({ body: draft.trim(), reply: threadRoot, thread: true })}><Send size={13} /> Reply</button></div></div>
      </aside>}

      {roomModal && <Modal title="Create a group room" description="Rooms are created with explicitly selected corporation participants." onClose={() => setRoomModal(false)}>
        <form className="modal-form" onSubmit={(event) => void createRoom(event)}>
          <label className="field-label">Room name<input name="title" required maxLength={100} placeholder="e.g. Product launch review" /></label>
          <label className="field-label">Corporation<select name="corporation" defaultValue="Holding Headquarters"><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label>
          <label className="field-label">Department<input name="department" maxLength={100} placeholder="e.g. Product Management" /></label>
          <div className="form-note"><ShieldCheck size={14} /> Owner authorization is required to create rooms. Participant policy can be configured for production.</div>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setRoomModal(false)}>Cancel</button><button className="button button-primary"><Plus size={15} /> Create room</button></div>
        </form>
      </Modal>}
      {taskMessage && <CreateTaskFromMessageModal message={taskMessage} data={data} onClose={() => setTaskMessage(null)} onCreate={convertToTask} />}
      {editMessage && <Modal title="Edit message" description="Edits are recorded in the audit history." onClose={() => setEditMessage(null)}>
        <div className="modal-form"><label className="field-label">Message<textarea id="edit-message-text" rows={6} defaultValue={editMessage.body} maxLength={10000} /></label><div className="modal-actions"><button className="button button-quiet" onClick={() => setEditMessage(null)}>Cancel</button><button className="button button-primary" onClick={() => void saveEdit()}><Check size={15} /> Save changes</button></div></div>
      </Modal>}
      {forwardMessage && <ForwardModal message={forwardMessage} conversations={data.conversations.filter((conversation) => !conversation.archived)} onClose={() => setForwardMessage(null)} onForward={forwardTo} />}
    </div>
  );
}

function ConversationItem({ conversation, active, data, onClick }: { conversation: Conversation; active: boolean; data: Bootstrap; onClick: () => void }) {
  const dmAgent = data.agents.find((agent) => agent.name === conversation.title);
  const preview = conversation.lastMessage?.body ? truncate(conversation.lastMessage.body.replace(/\n/g, ' '), 54) : 'No messages yet';
  return <button className={`conversation-item ${active ? 'selected' : ''}`} onClick={onClick}>
    {conversation.type === 'dm' ? <Avatar name={conversation.title} color={dmAgent?.avatarColor} size="sm" status={dmAgent?.status} /> : <span className={`conversation-item-mark ${corporationClass(conversation.corporation)}`}><Hash size={15} /></span>}
    <span className="conversation-item-copy"><span><strong>{conversation.title}</strong>{conversation.isAnnouncement && <span className="announcement-badge">NOTICE</span>}</span><small>{conversation.lastMessage ? `${conversation.lastMessage.senderName}: ${preview}` : `${conversation.department} · ${shortCorporation(conversation.corporation)}`}</small></span>
    <span className="conversation-item-meta">{conversation.unreadCount > 0 ? <b>{conversation.unreadCount}</b> : <time>{timeAgo(conversation.updatedAt)}</time>}</span>
  </button>;
}

function CreateTaskFromMessageModal({ message, data, onClose, onCreate }: { message: Message; data: Bootstrap; onClose: () => void; onCreate: (message: Message, title: string, assigneeId: string, priority: Priority) => void }) {
  const [title, setTitle] = useState(truncate(message.body.replace(/\n/g, ' '), 85));
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<Priority>('Normal');
  return <Modal title="Convert message to task" description="Create a persisted follow-up task linked to this source message." onClose={onClose}>
    <div className="modal-form"><div className="source-message-quote"><MessageCircle size={14} /><span>{truncate(message.body, 150)}</span></div>
      <label className="field-label">Task title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} /></label>
      <label className="field-label">Assign to<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Leave unassigned</option>{data.agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.title}</option>)}</select></label>
      <label className="field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}><option>Low</option><option>Normal</option><option>High</option><option>Critical</option></select></label>
      <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!title.trim()} onClick={() => onCreate(message, title, assigneeId, priority)}><Check size={15} /> Create task</button></div>
    </div>
  </Modal>;
}

function ForwardModal({ message, conversations, onClose, onForward }: { message: Message; conversations: Conversation[]; onClose: () => void; onForward: (message: Message, conversationId: string) => void }) {
  const [conversationId, setConversationId] = useState('room-board');
  return <Modal title="Forward message" description="Choose an authorized conversation as the destination." onClose={onClose}>
    <div className="modal-form"><div className="source-message-quote"><Forward size={14} /><span>{truncate(message.body, 150)}</span></div>
      <label className="field-label">Destination<select value={conversationId} onChange={(event) => setConversationId(event.target.value)}>{conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title} · {conversation.type === 'dm' ? 'Direct message' : shortCorporation(conversation.corporation)}</option>)}</select></label>
      <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" onClick={() => onForward(message, conversationId)}><Forward size={14} /> Forward</button></div>
    </div>
  </Modal>;
}

function SavedMessagesPage({ data, onOpenConversation, onNavigate, notify }: { data: Bootstrap; onOpenConversation: (id: string) => void; onNavigate: (page: PageId) => void; notify: Props['notify'] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  useEffect(() => { api<{ messages: Message[] }>('/saved-messages').then((response) => setMessages(response.messages)).catch(() => setMessages([])); }, [data.savedMessageIds]);
  const remove = async (message: Message) => {
    try { await post(`/messages/${message.id}/bookmark`, {}); setMessages((items) => items.filter((item) => item.id !== message.id)); notify('Removed from saved messages.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Could not update saved message.', 'error'); }
  };
  return <div className="saved-page"><div className="page-heading"><span className="eyebrow">PERSONAL WORKSPACE</span><h1>Saved Messages</h1><p>Bookmarked notes and decisions across your conversations.</p></div><DemoNotice />
    {!messages.length ? <EmptyState icon={<Bookmark size={22} />} title="Nothing saved yet" detail="Bookmark an important message to return to it here." action={<button className="button button-quiet" onClick={() => onNavigate('conversations')}>Browse conversations <ArrowRight size={14} /></button>} /> : <div className="saved-message-list">{messages.map((message) => {
      const conversation = data.conversations.find((item) => item.id === message.conversationId);
      const person = personFor(data, message.senderId);
      return <article key={message.id} className="saved-message-card"><div className="saved-message-top"><Avatar name={message.senderName} color={person && 'avatarColor' in person ? person.avatarColor : undefined} size="sm" /><div><strong>{message.senderName}</strong><small>{message.senderTitle} · {timeAgo(message.createdAt)}</small></div><button className="icon-button" onClick={() => void remove(message)} title="Remove saved message" aria-label="Remove saved message"><Bookmark size={15} /></button></div><div className="saved-message-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.body}</ReactMarkdown></div><div className="saved-message-footer"><span><Hash size={12} /> {conversation?.title || 'Conversation'}</span><button className="text-action" onClick={() => onOpenConversation(message.conversationId)}>Open conversation <ArrowRight size={13} /></button></div></article>;
    })}</div>}
  </div>;
}
