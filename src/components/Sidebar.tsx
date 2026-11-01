import { useMemo, useState } from 'react';
import {
  Activity, Bell, BookOpen, BriefcaseBusiness, Building2, ChartNoAxesCombined, CheckCheck, ChevronDown,
  CircleDollarSign, ClipboardCheck, Command, FileClock, FolderKanban, GitBranch, Inbox, LayoutDashboard,
  LogOut, MessageCircle, MessageSquare, Network, NotebookTabs, PanelLeftClose, Search, Settings2, ShieldCheck,
  Sparkles, Users, Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Agent, Bootstrap, Conversation, PageId } from '../types';
import { Avatar } from './Avatar';

interface SidebarProps {
  data: Bootstrap;
  page: PageId;
  activeConversationId: string;
  mobileOpen: boolean;
  onNavigate: (page: PageId) => void;
  onOpenConversation: (id: string) => void;
  onSignOut: () => void;
  onCloseMobile: () => void;
}

type IconType = LucideIcon;
type NavItem = { label: string; page: PageId; icon: IconType; badge?: number };

const workspaceItems: NavItem[] = [
  { label: 'Executive Command', page: 'overview', icon: LayoutDashboard },
  { label: 'All Conversations', page: 'conversations', icon: MessageCircle },
  { label: 'Direct Messages', page: 'direct-messages', icon: MessageSquare },
  { label: 'Group Chats', page: 'group-chats', icon: Users },
  { label: 'Meetings', page: 'meetings', icon: NotebookTabs },
  { label: 'Announcements', page: 'announcements', icon: Bell },
  { label: 'Decision Center', page: 'decisions', icon: CheckCheck },
  { label: 'Approval Requests', page: 'approvals', icon: ClipboardCheck },
  { label: 'Command Center', page: 'command-center', icon: Command },
];
const managementItems: NavItem[] = [
  { label: 'Executive Board', page: 'executive-board', icon: Building2 },
  { label: 'Department Managers', page: 'department-managers', icon: Users },
  { label: 'Agent Directory', page: 'agent-directory', icon: Search },
  { label: 'Agent Recruitment', page: 'agent-recruitment', icon: Sparkles },
  { label: 'Organization Chart', page: 'organization-chart', icon: GitBranch },
  { label: 'Task Management', page: 'tasks', icon: CheckCheck },
];
const operationsItems: NavItem[] = [
  { label: 'Active Projects', page: 'projects', icon: FolderKanban },
  { label: 'Workflow Monitor', page: 'workflow', icon: Workflow },
  { label: 'Reports & Analytics', page: 'analytics', icon: ChartNoAxesCombined },
  { label: 'Finance Overview', page: 'finance', icon: CircleDollarSign },
  { label: 'Security Center', page: 'security', icon: ShieldCheck },
  { label: 'Audit Logs', page: 'audit-logs', icon: FileClock },
];
const personalItems: NavItem[] = [
  { label: 'My Tasks', page: 'my-tasks', icon: CheckCheck },
  { label: 'Saved Messages', page: 'saved-messages', icon: Inbox },
  { label: 'Notifications', page: 'notifications', icon: Bell },
  { label: 'Knowledge Center', page: 'knowledge', icon: BookOpen },
  { label: 'Settings', page: 'settings', icon: Settings2 },
];

const sections = [
  { label: 'Workspace', items: workspaceItems, startOpen: true },
  { label: 'Management', items: managementItems, startOpen: true },
  { label: 'Operations', items: operationsItems, startOpen: false },
  { label: 'Personal', items: personalItems, startOpen: false },
];
const corporationRooms: { title: string; page: PageId; id: string; color: string; short: string }[] = [
  { title: 'Holding Headquarters', page: 'holding', id: 'room-holding', color: 'blue', short: 'H' },
  { title: 'Trading Corporation', page: 'trading', id: 'room-trading-exec', color: 'teal', short: 'T' },
  { title: 'Development Corporation', page: 'development', id: 'room-dev-exec', color: 'violet', short: 'D' },
  { title: 'Marketing Corporation', page: 'marketing', id: 'room-marketing-exec', color: 'amber', short: 'M' },
];

export function Sidebar({ data, page, activeConversationId, mobileOpen, onNavigate, onOpenConversation, onSignOut, onCloseMobile }: SidebarProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Workspace: true, Corporations: true, Management: true, Operations: false, Personal: false });
  const unread = data.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const unreadNotifications = data.notifications.filter((notification) => !notification.readAt).length;
  const board = data.conversations.find((conversation) => conversation.id === 'room-board');
  const executives = data.agents.filter((agent) => agent.isExecutive);
  const roomById = useMemo(() => new Map(data.conversations.map((conversation) => [conversation.id, conversation])), [data.conversations]);

  const navigate = (nextPage: PageId) => { onNavigate(nextPage); onCloseMobile(); };
  const openConversation = (conversation?: Conversation) => { if (conversation) onOpenConversation(conversation.id); onCloseMobile(); };
  const toggle = (section: string) => setOpen((previous) => ({ ...previous, [section]: !previous[section] }));

  const renderNavGroup = (section: { label: string; items: NavItem[]; startOpen: boolean }) => (
    <div className="nav-section" key={section.label}>
      <button className="nav-section-label" onClick={() => toggle(section.label)} aria-expanded={open[section.label]}>
        <span>{section.label}</span><ChevronDown size={13} className={open[section.label] ? '' : 'rotate-closed'} />
      </button>
      {open[section.label] && <div className="nav-items">
        {section.items.map(({ label, page: target, icon: Icon }) => {
          const selected = page === target || (target === 'conversations' && page === 'executive-board');
          const showCount = target === 'conversations' ? unread : target === 'notifications' ? unreadNotifications : 0;
          return <button className={`nav-link ${selected ? 'active' : ''}`} key={label} onClick={() => navigate(target)} title={label}>
            <Icon size={16} strokeWidth={1.8} /><span>{label}</span>{showCount > 0 && <b>{showCount > 99 ? '99+' : showCount}</b>}
          </button>;
        })}
      </div>}
    </div>
  );

  return (
    <>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onCloseMobile} />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-icon"><span /><span /><span /></div>
          <div className="brand-copy"><strong>AI HOLDING</strong><span>EXECUTIVE COMMAND</span></div>
          <button className="sidebar-close icon-button" aria-label="Close navigation" onClick={onCloseMobile}><PanelLeftClose size={17} /></button>
        </div>

        <button className="workspace-switcher" onClick={() => navigate('overview')}>
          <span className="workspace-mark"><Activity size={15} /></span>
          <span className="workspace-copy"><strong>Holding Workspace</strong><small>Executive · Demo</small></span>
          <ChevronDown size={14} />
        </button>

        <button className="boardroom-link" onClick={() => openConversation(board)}>
          <span className="boardroom-icon"><MessageCircle size={16} /></span>
          <span className="boardroom-copy"><small>PINNED ROOM</small><strong>Executive Board Room</strong><em>{executives.filter((agent) => agent.status !== 'Offline').length} executives online</em></span>
          {board?.unreadCount ? <b className="unread-badge">{board.unreadCount}</b> : <span className="online-pulse" />}
        </button>

        <nav className="sidebar-scroll" aria-label="Corporate navigation">
          {renderNavGroup(sections[0])}
          <div className="nav-section">
            <button className="nav-section-label" onClick={() => toggle('Corporations')} aria-expanded={open.Corporations}>
              <span>Corporations</span><ChevronDown size={13} className={open.Corporations ? '' : 'rotate-closed'} />
            </button>
            {open.Corporations && <div className="corp-nav-list">
              {corporationRooms.map((corporation) => {
                const convo = roomById.get(corporation.id);
                const selected = page === corporation.page;
                return <button className={`corporation-nav ${selected ? 'active' : ''}`} key={corporation.id} onClick={() => { if (convo) openConversation(convo); else navigate(corporation.page); }}>
                  <span className={`corp-logo corp-logo-${corporation.color}`}>{corporation.short}</span>
                  <span>{corporation.title}</span>
                  {convo?.unreadCount ? <b>{convo.unreadCount}</b> : null}
                </button>;
              })}
            </div>}
          </div>
          {sections.slice(1).map(renderNavGroup)}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status-line"><span className="status-led" /><span>Workspace operational</span><span className="demo-mini">DEMO</span></div>
          <div className="sidebar-user">
            <Avatar name={data.user.name} color={data.user.avatarColor} size="sm" status="online" />
            <div className="sidebar-user-copy"><strong>{data.user.name}</strong><span>Owner</span></div>
            <button className="icon-button logout-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
