import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronRight, Command, Menu, Search, ShieldAlert, X } from 'lucide-react';
import { api } from '../api';
import type { Bootstrap, PageId } from '../types';
import { Avatar } from './Avatar';
import { timeAgo } from '../utils';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  description: string;
  page: PageId;
  corporation?: string;
  targetId?: string;
}

const labels: Record<PageId, string> = {
  overview: 'Executive Command', conversations: 'All Conversations', 'direct-messages': 'Direct Messages', 'group-chats': 'Group Chats',
  announcements: 'Announcements', 'command-center': 'Command Center', meetings: 'Meeting Center', decisions: 'Decision Center', approvals: 'Approval Center',
  holding: 'Holding Headquarters', trading: 'Trading Corporation', development: 'Development Corporation', marketing: 'Marketing Corporation',
  'executive-board': 'Executive Board', 'department-managers': 'Department Managers', 'agent-directory': 'Agent Directory', 'agent-profile': 'Agent Profile',
  'agent-recruitment': 'Agent Recruitment', 'organization-chart': 'Organization Chart', tasks: 'Task Management', projects: 'Active Projects', workflow: 'Workflow Monitor',
  analytics: 'Reports & Analytics', finance: 'Finance Overview', security: 'Security Center', 'audit-logs': 'Audit Logs', 'my-tasks': 'My Tasks',
  'saved-messages': 'Saved Messages', notifications: 'Notifications', knowledge: 'Knowledge Center', roles: 'User & Role Management', settings: 'System Settings',
};

interface TopbarProps {
  data: Bootstrap;
  page: PageId;
  onNavigate: (page: PageId) => void;
  onOpenMenu: () => void;
  onSelectResult: (result: SearchResult) => void;
}

export function Topbar({ data, page, onNavigate, onOpenMenu, onSelectResult }: TopbarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const unreadNotifications = data.notifications.filter((notification) => !notification.readAt).length;
  const alertCount = data.notifications.filter((notification) => !notification.readAt && notification.priority === 'Critical').length;
  const title = labels[page] || 'Executive Command';
  const placeholder = useMemo(() => 'Search agents, conversations, tasks…', []);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (event.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const timeout = window.setTimeout(() => {
      api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((response) => setResults(response.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const choose = (result: SearchResult) => {
    onSelectResult(result);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="mobile-menu icon-button" onClick={onOpenMenu} aria-label="Open navigation"><Menu size={19} /></button>
        <div className="breadcrumb"><span className="breadcrumb-parent">Holding Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
      </div>
      <div className="topbar-search-wrap">
        <div className={`global-search ${isOpen ? 'search-focused' : ''}`}>
          <Search size={16} />
          <input
            ref={inputRef}
            type="search"
            placeholder={placeholder}
            aria-label="Search the workspace"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button className="search-clear icon-button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="Clear search"><X size={15} /></button> : <kbd>⌘ K</kbd>}
        </div>
        {isOpen && (query.trim().length > 1) && <>
          <button className="search-dismiss" aria-label="Dismiss search results" onClick={() => setIsOpen(false)} />
          <div className="search-popover">
            <div className="search-popover-head"><span>SEARCH RESULTS</span><small>{searching ? 'Searching…' : `${results.length} found`}</small></div>
            {results.length ? results.slice(0, 8).map((result) => <button key={`${result.type}-${result.id}`} className="search-result" onClick={() => choose(result)}>
              <span className={`search-result-icon search-icon-${result.type.toLowerCase().replace(/\s+/g, '-')}`}>{result.type === 'Agent' ? <Avatar name={result.title} size="xs" /> : <Search size={14} />}</span>
              <span className="search-result-copy"><strong>{result.title}</strong><small>{result.description}</small></span>
              <span className="search-result-type">{result.type}</span>
            </button>) : !searching && <div className="search-empty"><Search size={17} /><span>No matching records in this workspace.</span></div>}
            <div className="search-footer"><span>Search covers demo workspace records only</span><span><kbd>ESC</kbd> to close</span></div>
          </div>
        </>}
      </div>
      <div className="topbar-actions">
        <span className={`environment-chip ${data.aiProvider.configured ? 'env-connected' : ''}`}><span />{data.mode === 'demo' ? 'DEMO WORKSPACE' : 'WORKSPACE'}</span>
        <button className="topbar-command" onClick={() => onNavigate('command-center')}><Command size={15} /><span>New command</span><kbd>⌘ /</kbd></button>
        <button className={`topbar-icon ${alertCount ? 'has-alert' : ''}`} aria-label={`${unreadNotifications} unread notifications`} onClick={() => onNavigate('notifications')}>
          <Bell size={18} />{unreadNotifications > 0 && <span className="notification-dot" />}{alertCount > 0 && <span className="critical-alert-dot"><ShieldAlert size={10} /></span>}
        </button>
        <button className="topbar-avatar-button" onClick={() => onNavigate('settings')} title="Account settings"><Avatar name={data.user.name} color={data.user.avatarColor} size="sm" /></button>
      </div>
      <span className="sr-only">Last notification activity {timeAgo(data.notifications[0]?.createdAt)}</span>
    </header>
  );
}
