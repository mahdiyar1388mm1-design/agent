import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, LogIn, ShieldCheck } from 'lucide-react';
import { api, post, setApiSessionToken } from './api';
import type { Bootstrap, PageId } from './types';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { LoadingBlock } from './components/Ui';
import { Avatar } from './components/Avatar';
import { OverviewPage } from './pages/Overview';
import { ChatPage } from './pages/Chat';
import { CommandCenterPage } from './pages/CommandCenter';
import { MeetingsPage } from './pages/Meetings';
import { DecisionsPage } from './pages/Decisions';
import { ApprovalsPage } from './pages/Approvals';
import { TasksPage } from './pages/Tasks';
import { ProjectsPage } from './pages/Projects';
import { DirectoryPage, AgentProfilePage, RecruitmentPage, OrganizationPage } from './pages/Workforce';
import { AnalyticsPage, FinancePage, SecurityPage, AuditPage, WorkflowPage, KnowledgePage, RolesPage, SettingsPage } from './pages/Operations';
import { NotificationsPage } from './pages/Notifications';
import './styles.css';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  description: string;
  page: PageId;
  targetId?: string;
}

type ToastState = { message: string; tone: 'success' | 'error' | 'info' } | null;

function LoginScreen({ onLogin, demo, error, busy }: { onLogin: (email?: string, password?: string) => void; demo: boolean; error: string; busy: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="login-page">
      <div className="login-art" style={{ backgroundImage: "linear-gradient(90deg, rgba(8,12,18,.26), rgba(8,12,18,.7)), url('/images/command-center.jpg')" }}>
        <div className="login-art-top"><div className="brand-icon"><span /><span /><span /></div><span>AI HOLDING</span></div>
        <div className="login-art-copy"><span className="eyebrow">EXECUTIVE COMMAND CENTER</span><h1>One command.<br />Three corporations.<br /><em>One intelligent organization.</em></h1><p>Central communication, oversight, and operational control — with human authorization at the center.</p></div>
        <div className="login-art-footer"><span><i /> PRIVATE WORKSPACE</span><span>SECURE BY DESIGN</span></div>
      </div>
      <div className="login-panel">
        <div className="login-panel-brand"><div className="brand-icon"><span /><span /><span /></div><div><strong>AI HOLDING</strong><small>EXECUTIVE COMMAND</small></div></div>
        <div className="login-form-wrap">
          <span className="eyebrow">OWNER ACCESS</span>
          <h2>Welcome back</h2>
          <p>Sign in to access the executive workspace.</p>
          {demo ? <div className="login-demo-note"><ShieldCheck size={16} /><span>This is an isolated demo workspace. No live corporate systems or AI provider are connected.</span></div> : null}
          {error && <div className="login-error"><AlertTriangle size={16} />{error}</div>}
          {demo ? <button className="button button-primary button-full button-lg" onClick={() => onLogin()} disabled={busy}>{busy ? <span className="button-spinner" /> : <LogIn size={17} />} Enter demo workspace <ArrowRight size={16} /></button> : <form onSubmit={(event) => { event.preventDefault(); onLogin(email, password); }}>
            <label className="field-label">Email address<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="owner@company.com" /></label>
            <label className="field-label">Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
            <button className="button button-primary button-full button-lg" type="submit" disabled={busy}>{busy ? <span className="button-spinner" /> : <LogIn size={17} />} Sign in <ArrowRight size={16} /></button>
          </form>}
          <div className="login-divider"><span />SECURE OWNER SESSION<span /></div>
          <div className="login-security-foot"><ShieldCheck size={15} /><span>Signed sessions · Role-scoped access · Audit history</span></div>
        </div>
        <div className="login-bottom"><span>AI HOLDING © {new Date().getFullYear()}</span><span>Version 0.1 · {demo ? 'Demo environment' : 'Private workspace'}</span></div>
      </div>
    </main>
  );
}

function Toast({ toast, onClose }: { toast: NonNullable<ToastState>; onClose: () => void }) {
  useEffect(() => { const timer = window.setTimeout(onClose, 4200); return () => window.clearTimeout(timer); }, [toast.message, onClose]);
  return <div className={`toast toast-${toast.tone}`} role="status"><span className="toast-indicator" /><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss notification">×</button></div>;
}

function pageTitle(page: PageId, activeConversation?: string) {
  if (['holding', 'trading', 'development', 'marketing'].includes(page)) return activeConversation || 'Corporate Chat';
  if (['conversations', 'direct-messages', 'group-chats', 'announcements', 'saved-messages'].includes(page)) return 'Conversations';
  return undefined;
}

export default function App() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [page, setPage] = useState<PageId>('overview');
  const [activeConversationId, setActiveConversationId] = useState('room-board');
  const [selectedAgentId, setSelectedAgentId] = useState('ceo-holding');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [appError, setAppError] = useState('');
  const [jumpMessageId, setJumpMessageId] = useState<string | undefined>();
  const allowAutoDemo = useRef(true);

  const notify = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'success') => setToast({ message, tone }), []);
  const refreshData = useCallback(async () => {
    const response = await api<Bootstrap>('/bootstrap');
    setData(response);
    setAppError('');
    return response;
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true);
    setAuthRequired(false);
    setAppError('');
    try {
      const health = await api<{ mode: 'demo' | 'production' }>('/health');
      setDemoMode(health.mode === 'demo');
      try {
        await api('/auth/me');
      } catch (error) {
        if (!(error instanceof Error) || !('status' in error) || (error as { status: number }).status !== 401) throw error;
        if (allowAutoDemo.current) {
          const session = await post<{ sessionToken?: string }>('/auth/demo-session', {});
          setApiSessionToken(session.sessionToken);
        } else {
          setAuthRequired(true);
          setLoading(false);
          return;
        }
      }
      await refreshData();
      setAuthRequired(false);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404 || status === 401) setAuthRequired(true);
      else setAppError(error instanceof Error ? error.message : 'The workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [refreshData]);

  useEffect(() => { void initialize(); }, [initialize]);

  useEffect(() => {
    if (!data) return;
    const stream = new EventSource('/api/events');
    const onRefresh = (event: MessageEvent) => {
      if (event.data) {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.message?.senderId && payload.message.senderId !== data.user.id) notify(`New message from ${payload.message.senderName}`, 'info');
        } catch { /* ignore malformed event payloads */ }
      }
      void refreshData().catch(() => undefined);
    };
    ['message.created', 'message.updated', 'conversation.created', 'conversation.updated', 'conversation.read', 'task.created', 'task.updated', 'project.created', 'project.updated', 'approval.created', 'approval.updated', 'decision.created', 'decision.updated', 'command.created', 'command.updated', 'meeting.created', 'meeting.updated', 'notifications.updated'].forEach((eventName) => stream.addEventListener(eventName, onRefresh as EventListener));
    return () => stream.close();
  }, [data?.user.id, notify, refreshData]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '/') {
        event.preventDefault();
        setPage('command-center');
      }
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const handleLogin = async (email?: string, password?: string) => {
    setAuthBusy(true);
    setAuthError('');
    try {
      if (demoMode || !email) {
        const session = await post<{ sessionToken?: string }>('/auth/demo-session', {});
        setApiSessionToken(session.sessionToken);
      } else {
        setApiSessionToken(null);
        await post('/auth/login', { email, password });
      }
      allowAutoDemo.current = true;
      await refreshData();
      setAuthRequired(false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try { await post('/auth/logout'); } catch { /* session may already be gone */ }
    setApiSessionToken(null);
    allowAutoDemo.current = false;
    setData(null);
    setAuthRequired(true);
    setAuthError('');
  };

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setPage('conversations');
  };

  const selectSearchResult = (result: SearchResult) => {
    if (result.type === 'Agent') {
      setSelectedAgentId(result.id);
      setPage('agent-profile');
    } else if (result.type === 'Conversation') {
      setActiveConversationId(result.id);
      setPage(result.page === 'direct-messages' ? 'direct-messages' : 'conversations');
    } else if (result.type === 'Message') {
      setActiveConversationId(result.targetId || 'room-board');
      setJumpMessageId(result.id);
      setPage('conversations');
    } else {
      setPage(result.page);
    }
  };

  if (loading) return <div className="loading-screen"><div className="loading-brand"><div className="brand-icon"><span /><span /><span /></div><strong>AI HOLDING</strong></div><LoadingBlock label="Opening the executive workspace…" /></div>;
  if (authRequired) return <LoginScreen onLogin={(email, password) => void handleLogin(email, password)} demo={demoMode} error={authError} busy={authBusy} />;
  if (appError || !data) return <div className="error-screen"><div className="brand-icon"><span /><span /><span /></div><AlertTriangle size={25} /><h1>Workspace unavailable</h1><p>{appError || 'Could not connect to the command center.'}</p><button className="button button-primary" onClick={() => void initialize()}>Retry connection</button></div>;

  const activeConversation = data.conversations.find((conversation) => conversation.id === activeConversationId);
  const corporationPageIds: PageId[] = ['holding', 'trading', 'development', 'marketing'];
  const chatPages: PageId[] = ['conversations', 'direct-messages', 'group-chats', 'announcements', 'saved-messages', ...corporationPageIds];
  const sharedProps = { data, onRefresh: refreshData, notify, onNavigate: setPage };

  let content;
  if (chatPages.includes(page)) {
    content = <ChatPage
      {...sharedProps}
      page={page}
      activeConversationId={activeConversationId}
      onOpenConversation={setActiveConversationId}
      onNavigateToAgent={(agentId) => { setSelectedAgentId(agentId); setPage('agent-profile'); }}
      jumpMessageId={jumpMessageId}
      onJumpHandled={() => setJumpMessageId(undefined)}
    />;
  } else if (page === 'overview') content = <OverviewPage {...sharedProps} onOpenConversation={openConversation} />;
  else if (page === 'command-center') content = <CommandCenterPage {...sharedProps} />;
  else if (page === 'meetings') content = <MeetingsPage {...sharedProps} />;
  else if (page === 'decisions') content = <DecisionsPage {...sharedProps} />;
  else if (page === 'approvals') content = <ApprovalsPage {...sharedProps} />;
  else if (page === 'tasks' || page === 'my-tasks') content = <TasksPage {...sharedProps} page={page} />;
  else if (page === 'projects') content = <ProjectsPage {...sharedProps} />;
  else if (page === 'executive-board' || page === 'department-managers' || page === 'agent-directory') content = <DirectoryPage {...sharedProps} page={page} onOpenAgent={(agentId) => { setSelectedAgentId(agentId); setPage('agent-profile'); }} />;
  else if (page === 'agent-profile') content = <AgentProfilePage {...sharedProps} agentId={selectedAgentId} onChat={(conversationId) => openConversation(conversationId)} />;
  else if (page === 'agent-recruitment') content = <RecruitmentPage {...sharedProps} />;
  else if (page === 'organization-chart') content = <OrganizationPage {...sharedProps} onOpenAgent={(agentId) => { setSelectedAgentId(agentId); setPage('agent-profile'); }} />;
  else if (page === 'analytics') content = <AnalyticsPage {...sharedProps} />;
  else if (page === 'finance') content = <FinancePage {...sharedProps} />;
  else if (page === 'security') content = <SecurityPage {...sharedProps} onNavigate={setPage} />;
  else if (page === 'audit-logs') content = <AuditPage {...sharedProps} />;
  else if (page === 'workflow') content = <WorkflowPage {...sharedProps} />;
  else if (page === 'notifications') content = <NotificationsPage {...sharedProps} />;
  else if (page === 'knowledge') content = <KnowledgePage {...sharedProps} />;
  else if (page === 'roles') content = <RolesPage {...sharedProps} />;
  else if (page === 'settings') content = <SettingsPage {...sharedProps} onSignOut={handleSignOut} />;
  else content = <OverviewPage {...sharedProps} onOpenConversation={openConversation} />;

  return (
    <div className="app-frame">
      <Sidebar data={data} page={page} activeConversationId={activeConversationId} mobileOpen={mobileSidebarOpen} onNavigate={setPage} onOpenConversation={openConversation} onSignOut={handleSignOut} onCloseMobile={() => setMobileSidebarOpen(false)} />
      <div className="app-main">
        <Topbar data={data} page={page} onNavigate={setPage} onOpenMenu={() => setMobileSidebarOpen(true)} onSelectResult={selectSearchResult} />
        <main className={`page-content page-${page}`} key={page}>
          {content}
        </main>
      </div>
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
      <span className="sr-only">{pageTitle(page, activeConversation?.title)}</span>
    </div>
  );
}
