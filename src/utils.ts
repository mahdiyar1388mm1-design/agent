import type { Agent, Corporation, Task } from './types';

export const corporationNames: Corporation[] = [
  'Holding Headquarters',
  'Trading Corporation',
  'Development Corporation',
  'Marketing Corporation',
];

export const shortCorporation = (corporation?: string) => {
  if (!corporation) return 'Holding';
  if (corporation.includes('Trading')) return 'Trading';
  if (corporation.includes('Development')) return 'Development';
  if (corporation.includes('Marketing')) return 'Marketing';
  return 'Holding';
};

export const corporationClass = (corporation?: string) => `corp-${shortCorporation(corporation).toLowerCase()}`;

export const initials = (name = '') => name
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

export const timeAgo = (date?: string) => {
  if (!date) return '—';
  const delta = Math.max(0, Date.now() - new Date(date).getTime());
  if (!Number.isFinite(delta)) return '—';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date));
};

export const fullDate = (date?: string) => date
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date))
  : 'Not scheduled';

export const compactDate = (date?: string) => date
  ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date))
  : 'No date';

export const statusClass = (status?: string) => `status-${(status || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

export const readableStatus = (status?: string) => status || 'Unknown';

export const currency = (amount?: number) => typeof amount === 'number'
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  : 'Not provided';

export const truncate = (text: string, limit = 100) => text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;

export const deriveAgentCompletion = (agent: Agent, tasks: Task[]) => {
  const assigned = tasks.filter((task) => task.assigneeId === agent.id);
  if (!assigned.length) return null;
  const completed = assigned.filter((task) => task.status === 'Completed').length;
  return Math.round((completed / assigned.length) * 100);
};

export const todayLabel = () => new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
