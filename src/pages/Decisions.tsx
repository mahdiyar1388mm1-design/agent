import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CheckCheck, Clock3, FilePlus2, Plus, ShieldCheck, X } from 'lucide-react';
import { patch, post } from '../api';
import type { Bootstrap, Decision } from '../types';
import { DemoNotice, EmptyState, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { corporationClass, fullDate, shortCorporation, timeAgo } from '../utils';

interface Props { data: Bootstrap; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }
const decisionStatuses: Decision['status'][] = ['Draft', 'Under Review', 'Awaiting Approval', 'Approved', 'Rejected', 'Executing', 'Completed'];

export function DecisionsPage({ data, onRefresh, notify }: Props) {
  const [filter, setFilter] = useState('All');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const decisions = useMemo(() => [...data.decisions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.decisions]);
  const visible = decisions.filter((decision) => filter === 'All' || decision.status === filter);
  const selected = visible.find((decision) => decision.id === selectedId) || visible[0];
  const awaiting = decisions.filter((decision) => decision.status === 'Awaiting Approval').length;

  const updateStatus = async (decision: Decision, status: Decision['status']) => {
    const needsConfirmation = status === 'Approved' || status === 'Rejected';
    if (needsConfirmation && !window.confirm(`${status} “${decision.title}”? This records an owner decision but does not execute an external action.`)) return;
    try { await patch(`/decisions/${decision.id}/status`, { status, humanConfirmed: needsConfirmation }); await onRefresh(); notify(`Decision moved to ${status}.`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Decision could not be updated.', 'error'); }
  };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try { const result = await post<{ decision: Decision }>('/decisions', payload); setShowCreate(false); setFilter('All'); setSelectedId(result.decision.id); await onRefresh(); notify('Decision record created in Draft.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Decision could not be created.', 'error'); }
  };

  return <div className="decisions-page">
    <SectionHeading eyebrow="GOVERNANCE · OWNER AUTHORIZATION" title="Decision Center" description="Centralize business context, impact, risk, recommendations, and the final owner decision." action={<button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Create decision</button>} />
    <DemoNotice />
    <div className="decision-summary-row"><div className="decision-summary-card"><span className="decision-summary-icon decision-blue"><FilePlus2 size={15} /></span><span><strong>{decisions.length}</strong><small>Decision records</small></span></div><div className="decision-summary-card"><span className="decision-summary-icon decision-amber"><Clock3 size={15} /></span><span><strong>{awaiting}</strong><small>Awaiting approval</small></span></div><div className="decision-summary-card"><span className="decision-summary-icon decision-green"><CheckCheck size={15} /></span><span><strong>{decisions.filter((decision) => ['Approved', 'Completed'].includes(decision.status)).length}</strong><small>Approved or completed</small></span></div><div className="decision-summary-note"><ShieldCheck size={14} /> High-impact outcomes require an explicit owner action.</div></div>
    <div className="decision-filter-row"><div className="filter-tabs">{['All', ...decisionStatuses].map((status) => <button key={status} className={filter === status ? 'selected' : ''} onClick={() => setFilter(status)}>{status}{status === 'All' && <small>{decisions.length}</small>}</button>)}</div><span className="decision-filter-help">Showing {visible.length} decision{visible.length === 1 ? '' : 's'}</span></div>
    <div className="decision-workspace">
      <div className="decision-list">{visible.map((decision) => <button key={decision.id} className={`decision-list-item ${selected?.id === decision.id ? 'selected' : ''}`} onClick={() => setSelectedId(decision.id)}><span className={`decision-corp-mark ${corporationClass(decision.corporation)}`}>{shortCorporation(decision.corporation)[0]}</span><span className="decision-list-copy"><strong>{decision.title}</strong><small>{decision.requesterName} <i /> {timeAgo(decision.createdAt)}</small></span><StatusPill status={decision.status} /></button>)}{!visible.length && <div className="decision-empty">No decisions match this status.</div>}</div>
      {selected ? <DecisionDetails decision={selected} onUpdate={updateStatus} /> : <div className="panel decision-detail-empty"><EmptyState icon={<CheckCheck size={22} />} title="No decision selected" detail="Choose a decision record or create a new one." /></div>}
    </div>
    {showCreate && <Modal title="Create a decision record" description="Capture the full impact and risk context before review." onClose={() => setShowCreate(false)} wide><form className="modal-form" onSubmit={(event) => void create(event)}>
      <label className="field-label">Decision title<input name="title" maxLength={180} required placeholder="What needs to be decided?" /></label>
      <label className="field-label">Description<textarea name="description" rows={3} required maxLength={3000} placeholder="Describe the context and available options…" /></label>
      <div className="form-grid-2"><label className="field-label">Responsible corporation<select name="corporation"><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="field-label">Risk assessment<input name="risk" placeholder="Not assessed" maxLength={60} /></label></div>
      <div className="form-grid-2"><label className="field-label">Business impact<textarea name="businessImpact" rows={2} maxLength={500} placeholder="Not yet assessed" /></label><label className="field-label">Financial impact<textarea name="financialImpact" rows={2} maxLength={500} placeholder="Not assessed — no connected finance source" /></label></div>
      <label className="checkbox-line"><input name="approvalRequired" type="checkbox" value="true" /> This decision requires a separate approval stage</label>
      <div className="form-note"><AlertTriangle size={14} /> Financial and operational impact fields are owner-entered; this demo does not connect to finance data.</div>
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary"><FilePlus2 size={14} /> Save as draft</button></div>
    </form></Modal>}
  </div>;
}

function DecisionDetails({ decision, onUpdate }: { decision: Decision; onUpdate: (decision: Decision, status: Decision['status']) => void }) {
  return <article className="panel decision-detail">
    <div className="decision-detail-top"><div><div className="decision-reference">DECISION · {decision.id.slice(-8).toUpperCase()}</div><h2>{decision.title}</h2></div><StatusPill status={decision.status} /></div>
    <p className="decision-description">{decision.description}</p>
    <div className="decision-identity"><span className={`corp-logo corp-logo-${shortCorporation(decision.corporation).toLowerCase()}`}>{shortCorporation(decision.corporation)[0]}</span><span><small>RESPONSIBLE CORPORATION</small><strong>{decision.corporation}</strong></span><span className="identity-divider" /><span><small>REQUESTED BY</small><strong>{decision.requesterName}</strong></span><span className="identity-date">{fullDate(decision.createdAt)}</span></div>
    <div className="decision-detail-grid"><div className="decision-impact-card"><span>BUSINESS IMPACT</span><p>{decision.businessImpact || 'Not assessed.'}</p></div><div className="decision-impact-card"><span>FINANCIAL IMPACT</span><p>{decision.financialImpact || 'Not assessed — no connected finance source.'}</p></div><div className="decision-impact-card decision-risk-card"><span>RISK ASSESSMENT</span><strong>{decision.risk}</strong></div></div>
    <div className="decision-recommendations"><div><span className="inspector-label">EXECUTIVE RECOMMENDATIONS</span><span className="recommendation-count">{decision.recommendations.length}</span></div>{decision.recommendations.length ? <ul>{decision.recommendations.map((recommendation, index) => <li key={`${recommendation}-${index}`}><Check size={13} />{recommendation}</li>)}</ul> : <p>No recommendations are attached yet.</p>}</div>
    <div className="approval-chain-strip"><div><ShieldCheck size={14} /><span>{decision.approvalRequired ? 'Multi-stage approval required' : 'Owner decision'}</span></div><span className="chain-steps"><i className="chain-step-active" />{decision.approvalRequired && <><i /><i /></>}</span></div>
    <div className="decision-actions"><div className="decision-action-help">Status changes are logged. Approval records an owner decision; it does not execute an external action.</div><div className="decision-action-buttons">{decision.status === 'Draft' && <button className="button button-quiet" onClick={() => onUpdate(decision, 'Under Review')}>Submit for review <ArrowRight size={14} /></button>}{decision.status === 'Under Review' && <button className="button button-quiet" onClick={() => onUpdate(decision, 'Awaiting Approval')}>Request approval <ArrowRight size={14} /></button>}{['Under Review', 'Awaiting Approval'].includes(decision.status) && <><button className="button button-danger-outline" onClick={() => onUpdate(decision, 'Rejected')}><X size={14} /> Reject</button><button className="button button-primary" onClick={() => onUpdate(decision, 'Approved')}><Check size={14} /> Approve decision</button></>}{decision.status === 'Approved' && <button className="button button-quiet" onClick={() => onUpdate(decision, 'Executing')}>Mark executing <ArrowRight size={14} /></button>}{decision.status === 'Executing' && <button className="button button-primary" onClick={() => onUpdate(decision, 'Completed')}><Check size={14} /> Mark completed</button>}</div></div>
  </article>;
}
