import { AlertTriangle, Check, Info, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { statusClass } from '../utils';

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="section-actions">{action}</div>}
    </div>
  );
}

export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  return <span className={`status-pill ${statusClass(status)} ${className}`}><i />{status}</span>;
}

export function EmptyState({ icon, title, detail, action }: { icon?: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function DemoNotice({ children = 'Seeded sample data — not connected to live company systems.' }: { children?: ReactNode }) {
  return <div className="demo-notice"><Info size={14} /><span>{children}</span><span className="demo-notice-tag">DEMO ENVIRONMENT</span></div>;
}

export function InlineNotice({ children, tone = 'warning' }: { children: ReactNode; tone?: 'warning' | 'info' | 'success' }) {
  const Icon = tone === 'success' ? Check : tone === 'info' ? Info : AlertTriangle;
  return <div className={`inline-notice inline-${tone}`}><Icon size={16} /><span>{children}</span></div>;
}

export function LoadingBlock({ label = 'Loading workspace data…' }: { label?: string }) {
  return <div className="loading-block"><Loader2 size={18} className="spin" /><span>{label}</span></div>;
}

export function ButtonSpinner() {
  return <Loader2 size={14} className="spin" />;
}
