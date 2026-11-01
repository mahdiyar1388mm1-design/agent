import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Banknote, Check, ChevronRight, ClipboardCheck, Clock3, FileText, Hand, ShieldAlert, ShieldCheck, UserRoundCheck, X } from 'lucide-react';
import { post } from '../api';
import type { Approval, Bootstrap } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { currency, fullDate, timeAgo } from '../utils';

interface Props { data: Bootstrap; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }
type Action = 'approve' | 'reject' | 'request_changes' | 'delegate';

const actionLabel: Record<Action, string> = { approve: 'Approve request', reject: 'Reject request', request_changes: 'Request changes', delegate: 'Delegate review' };

export function ApprovalsPage({ data, onRefresh, notify }: Props) {
  const [filter, setFilter] = useState('Pending');
  const [selectedId, setSelectedId] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const approvals = useMemo(() => [...data.approvals].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.approvals]);
  const visible = approvals.filter((approval) => filter === 'All' || approval.status === filter);
  const selected = visible.find((approval) => approval.id === selectedId) || visible[0];
  const pending = approvals.filter((approval) => approval.status === 'Pending').length;
  const critical = approvals.filter((approval) => approval.status === 'Pending' && approval.risk === 'Critical').length;

  const chooseAction = (next: Action) => { setAction(next); setNote(''); setDelegateTo(''); setConfirmed(false); };
  const submitAction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !action) return;
    setSubmitting(true);
    try {
      await post(`/approvals/${selected.id}/decision`, { action, note, delegateTo, humanConfirmed: confirmed });
      await onRefresh();
      setAction(null); setConfirmed(false);
      notify(`${actionLabel[action]} recorded. No external operation was executed.`);
    } catch (error) { notify(error instanceof Error ? error.message : 'Review could not be recorded.', 'error'); }
    finally { setSubmitting(false); }
  };

  return <div className="approvals-page">
    <SectionHeading eyebrow="HUMAN-IN-THE-LOOP GOVERNANCE" title="Approval Center" description="Review sensitive requests through a clear, auditable owner authorization chain." action={<span className="secure-owner-pill"><ShieldCheck size={14} /> Human authorization required</span>} />
    <DemoNotice>Approval records in this workspace are sample requests. Approving a record does not perform a transfer, change a risk limit, or create an external subscription.</DemoNotice>
    <div className="approval-summary"><div className="approval-summary-primary"><span className="approval-summary-icon"><ClipboardCheck size={18} /></span><span><strong>{pending}</strong><small>Requests awaiting review</small></span><div className="approval-summary-divider" /><span><strong>{critical}</strong><small>Critical risk</small></span></div><div className="approval-summary-warning"><ShieldAlert size={15} /><span>Financial and security actions require explicit owner authorization.</span></div></div>
    <div className="approval-workspace">
      <section className="approval-queue panel"><div className="approval-queue-head"><span className="panel-eyebrow">REVIEW QUEUE</span><div className="approval-filter-tabs">{['Pending', 'All', 'Approved', 'Rejected', 'Changes Requested', 'Delegated'].map((status) => <button key={status} className={filter === status ? 'selected' : ''} onClick={() => setFilter(status)}>{status}</button>)}</div></div>
        {visible.map((approval) => <button key={approval.id} className={`approval-queue-item ${selected?.id === approval.id ? 'selected' : ''}`} onClick={() => setSelectedId(approval.id)}>
          <span className={`approval-type-icon risk-icon-${approval.risk.toLowerCase()}`}>{approval.risk === 'Critical' ? <ShieldAlert size={16} /> : approval.amount ? <Banknote size={16} /> : <ClipboardCheck size={16} />}</span>
          <span className="approval-queue-copy"><strong>{approval.title}</strong><small>{approval.category} <i /> {approval.requesterName}</small><span className="approval-queue-meta"><time>{timeAgo(approval.createdAt)}</time><span className={`risk-tag risk-tag-${approval.risk.toLowerCase()}`}>{approval.risk} risk</span></span></span>
          <ChevronRight size={15} className="approval-chevron" />
        </button>)}
        {!visible.length && <EmptyState icon={<ClipboardCheck size={22} />} title="No requests in this view" detail="Approval requests will appear here when created." />}
      </section>
      {selected ? <ApprovalDetails approval={selected} data={data} onAction={chooseAction} /> : <div className="panel approval-detail-empty"><EmptyState icon={<FileText size={22} />} title="Select a request" detail="Review its justification, evidence, risk, and approval chain." /></div>}
    </div>
    {action && selected && <Modal title={actionLabel[action]} description={`${selected.title} · ${selected.risk} risk`} onClose={() => setAction(null)}>
      <form className="modal-form" onSubmit={(event) => void submitAction(event)}>
        <div className={`action-confirmation-copy ${['approve', 'reject'].includes(action) ? 'action-confirm-critical' : ''}`}>
          {['approve', 'reject'].includes(action) ? <ShieldAlert size={18} /> : <UserRoundCheck size={18} />}
          <p>{action === 'approve' ? 'This records your authorization only. It does not execute any transfer, purchase, trading limit change, or external operation.' : action === 'reject' ? 'This records a rejection. Any external operation remains untouched.' : action === 'delegate' ? 'Delegate the review for additional assessment. The request will not be approved by delegation.' : 'Return this request for more information. The request remains unapproved.'}</p>
        </div>
        {action === 'delegate' && <label className="field-label">Delegate to<input value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)} required placeholder="Executive or review group" maxLength={100} /></label>}
        <label className="field-label">Review note{action !== 'approve' && <span className="required-mark">Required</span>}<textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} required={action !== 'approve'} placeholder="Add the rationale or requested follow-up…" maxLength={1000} /></label>
        {['approve', 'reject'].includes(action) && <label className="checkbox-line high-risk-confirm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm this human review decision. I understand that this action only updates the approval record.</span></label>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setAction(null)}>Cancel</button><button className={`button ${action === 'reject' ? 'button-danger' : 'button-primary'}`} disabled={submitting || (['approve', 'reject'].includes(action) && !confirmed) || (action === 'delegate' && !delegateTo.trim()) || (action !== 'approve' && !note.trim())}>{submitting ? <span className="button-spinner" /> : action === 'approve' ? <Check size={14} /> : action === 'reject' ? <X size={14} /> : <ArrowRight size={14} />}{actionLabel[action]}</button></div>
      </form>
    </Modal>}
  </div>;
}

function ApprovalDetails({ approval, data, onAction }: { approval: Approval; data: Bootstrap; onAction: (action: Action) => void }) {
  const requester = data.agents.find((agent) => agent.id === approval.requesterId);
  return <article className="panel approval-detail">
    <div className="approval-detail-head"><div className="approval-detail-type"><span className={`approval-type-icon risk-icon-${approval.risk.toLowerCase()}`}>{approval.risk === 'Critical' ? <ShieldAlert size={16} /> : <ClipboardCheck size={16} />}</span><span>{approval.category}</span></div><StatusPill status={approval.status} /></div>
    <h2>{approval.title}</h2>
    <div className="approval-requester"><Avatar name={requester?.name || approval.requesterName} color={requester?.avatarColor} size="sm" status={requester?.status} /><span><strong>{approval.requesterName}</strong><small>Requesting agent · {approval.corporation}</small></span><time>{fullDate(approval.createdAt)}</time></div>
    <div className="approval-description"><span className="inspector-label">REQUEST DESCRIPTION</span><p>{approval.description}</p></div>
    <div className="approval-detail-grid"><div><span className="inspector-label">JUSTIFICATION</span><p>{approval.justification}</p></div><div className={`approval-risk-card risk-card-${approval.risk.toLowerCase()}`}><span className="inspector-label">RISK LEVEL</span><strong><ShieldAlert size={14} /> {approval.risk}</strong><small>{approval.risk === 'Critical' || approval.risk === 'High' ? 'Explicit human confirmation required' : 'Owner review required'}</small></div></div>
    {typeof approval.amount === 'number' && <div className="approval-amount-row"><span><Banknote size={15} /> Requested amount <small>(seeded demo value)</small></span><strong>{currency(approval.amount)}</strong></div>}
    <div className="approval-evidence"><div className="evidence-heading"><span className="inspector-label">SUPPORTING EVIDENCE</span><span>{approval.evidence.length} item{approval.evidence.length === 1 ? '' : 's'}</span></div>{approval.evidence.map((item, index) => <div className="evidence-row" key={`${item}-${index}`}><FileText size={14} /><span>{item}</span><span className="evidence-sample">DEMO</span></div>)}</div>
    <div className="approval-chain"><div className="approval-chain-header"><span className="inspector-label">APPROVAL CHAIN</span><span>{approval.approvalChain.length} stages</span></div><div className="approval-chain-flow">{approval.approvalChain.map((stage, index) => <div className="approval-chain-step" key={`${stage}-${index}`}><span className={`chain-stage-number ${index === approval.approvalChain.length - 1 ? 'chain-stage-owner' : ''}`}>{index === approval.approvalChain.length - 1 ? <ShieldCheck size={12} /> : `0${index + 1}`}</span><span>{stage}</span>{index < approval.approvalChain.length - 1 && <i />}</div>)}</div></div>
    {approval.status === 'Pending' ? <div className="approval-action-row"><button className="button button-quiet" onClick={() => onAction('delegate')}><Hand size={14} /> Delegate review</button><button className="button button-quiet" onClick={() => onAction('request_changes')}><FileText size={14} /> Request changes</button><button className="button button-danger-outline" onClick={() => onAction('reject')}><X size={14} /> Reject</button><button className="button button-primary" onClick={() => onAction('approve')}><Check size={14} /> Approve</button></div> : <div className="approval-reviewed-banner"><Check size={14} /> Review status: {approval.status}{approval.reviewedAt ? ` · ${fullDate(approval.reviewedAt)}` : ''}</div>}
    <div className="approval-detail-footer"><ShieldCheck size={13} /> Owner actions are authenticated and retained in the audit log.</div>
  </article>;
}
