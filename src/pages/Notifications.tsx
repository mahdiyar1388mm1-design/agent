import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Bell, Check, CheckCheck, CircleDollarSign, FileCheck2, MessageSquare,
  ShieldAlert, ShieldCheck, Sparkles, Users, Workflow, X,
} from 'lucide-react';
import { post } from '../api';
import type { Bootstrap, Notification, PageId } from '../types';
import { DemoNotice, EmptyState, SectionHeading } from '../components/Ui';
import { timeAgo } from '../utils';

interface Props { data: Bootstrap; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void; onNavigate: (page: PageId) => void }

const iconFor = (category: string) => {
  if (category.includes('Security')) return <ShieldAlert size={16} />;
  if (category.includes('Approval')) return <FileCheck2 size={16} />;
  if (category.includes('Financial')) return <CircleDollarSign size={16} />;
  if (category.includes('Task')) return <CheckCheck size={16} />;
  if (category.includes('Message') || category.includes('Mention')) return <MessageSquare size={16} />;
  if (category.includes('Meeting')) return <Users size={16} />;
  if (category.includes('Agent')) return <Sparkles size={16} />;
  if (category.includes('Project')) return <Workflow size={16} />;
  return <Bell size={16} />;
};

export function NotificationsPage({ data, onRefresh, notify, onNavigate }: Props) {
  const [filter, setFilter] = useState('All notifications');
  const [category, setCategory] = useState('All categories');
  const unread = data.notifications.filter((notification) => !notification.readAt).length;
  const categories = ['All categories', ...new Set(data.notifications.map((notification) => notification.category))];
  const notifications = useMemo(() => [...data.notifications].filter((notification) => {
    if (filter === 'Unread' && notification.readAt) return false;
    if (filter === 'Read' && !notification.readAt) return false;
    if (category !== 'All categories' && notification.category !== category) return false;
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.notifications, filter, category]);
  const markRead = async (notification: Notification) => {
    if (notification.readAt) return;
    try { await post(`/notifications/${notification.id}/read`, {}); await onRefresh(); }
    catch (error) { notify(error instanceof Error ? error.message : 'Notification could not be updated.', 'error'); }
  };
  const markAllRead = async () => {
    try { await post('/notifications/read-all', {}); await onRefresh(); notify('All notifications marked as read.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Notifications could not be updated.', 'error'); }
  };
  const openNotification = async (notification: Notification) => {
    await markRead(notification);
    const target: Record<string, PageId> = { approval: 'approvals', task: 'tasks', meeting: 'meetings', security: 'security', command: 'command-center', conversation: 'conversations', project: 'projects' };
    if (notification.linkType && target[notification.linkType]) onNavigate(target[notification.linkType]);
    else onNavigate('notifications');
  };

  return <div className="notifications-page"><SectionHeading eyebrow="PERSONAL ACTIVITY CENTER" title="Notifications" description="Prioritized in-app alerts for conversations, tasks, approvals, and security events." action={unread > 0 ? <button className="button button-quiet" onClick={() => void markAllRead()}><CheckCheck size={14} /> Mark all read</button> : <span className="all-read-label"><Check size={13} /> All caught up</span>} /><DemoNotice />
    <div className="notifications-summary"><div className="notification-count-card"><span className="notification-count-icon"><Bell size={17} /></span><span><strong>{unread}</strong><small>Unread alerts</small></span></div><div className="notification-priority-card"><ShieldAlert size={15} /><span><strong>{data.notifications.filter((item) => !item.readAt && item.priority === 'Critical').length} critical</strong><small>Security or high-risk authorization signals</small></span></div><button className="text-action" onClick={() => onNavigate('settings')}>Notification preferences <ArrowRight size={13} /></button></div>
    <div className="notifications-filter-row"><div className="filter-tabs">{['All notifications', 'Unread', 'Read'].map((item) => <button className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)} key={item}>{item}{item === 'Unread' && unread > 0 && <small>{unread}</small>}</button>)}</div><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
    <div className="notification-feed panel">{notifications.map((notification) => <button key={notification.id} className={`notification-row ${!notification.readAt ? 'notification-unread' : ''} notification-priority-${notification.priority.toLowerCase()}`} onClick={() => void openNotification(notification)}>
      <span className={`notification-icon-wrap category-${notification.category.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{iconFor(notification.category)}</span>
      <span className="notification-copy"><span className="notification-title-row"><strong>{notification.title}</strong>{notification.priority === 'Critical' && <span className="critical-badge"><AlertTriangle size={10} /> CRITICAL</span>}{!notification.readAt && <i className="notification-unread-dot" />}</span><p>{notification.body}</p><small>{notification.category} <i /> {timeAgo(notification.createdAt)}</small></span>
      <span className="notification-row-action">{!notification.readAt ? <span>Mark read <ArrowRight size={13} /></span> : <span className="read-state"><Check size={12} /> Read</span>}</span>
    </button>)}{!notifications.length && <EmptyState icon={<Bell size={22} />} title="No notifications in this view" detail="Change the filters or check back when workspace activity is recorded." />}</div>
    <p className="notification-footer"><ShieldCheck size={12} /> Security alerts retain priority over ordinary conversation notifications. Email delivery is not configured.</p>
  </div>;
}
