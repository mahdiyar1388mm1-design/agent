import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Clock3, Command, ExternalLink, FileClock, Play, Plus, Send, ShieldCheck, Sparkles, Workflow, XCircle } from 'lucide-react';
import { post } from '../api';
import type { Bootstrap, CommandRun, PageId } from '../types';
import { DemoNotice, EmptyState, InlineNotice, SectionHeading, StatusPill } from '../components/Ui';
import { compactDate, fullDate, timeAgo } from '../utils';

interface Props {
  data: Bootstrap;
  onRefresh: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (page: PageId) => void;
}

const suggestions = [
  'Ask the Trading CEO for a source-verified market report.',
  'Request a development roadmap for the next product.',
  'Ask Marketing to prepare a customer acquisition campaign brief.',
  'Ask all three CEOs to submit their weekly reports.',
];
const routeOptions = ['All executives', 'Holding Headquarters', 'Trading Corporation', 'Development Corporation', 'Marketing Corporation'];

const iconForStatus = (status: CommandRun['status']) => {
  if (status === 'Completed') return <CheckCircle2 size={16} />;
  if (status === 'Failed') return <XCircle size={16} />;
  if (status === 'Processing') return <Workflow size={16} />;
  if (status === 'Waiting for Approval') return <ShieldCheck size={16} />;
  return <Clock3 size={16} />;
};

export function CommandCenterPage({ data, onRefresh, notify, onNavigate }: Props) {
  const [command, setCommand] = useState('');
  const [route, setRoute] = useState('All executives');
  const [submitting, setSubmitting] = useState(false);
  const [dispatchingId, setDispatchingId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const pending = data.commands.filter((run) => run.status === 'Pending').length;
  const completed = data.commands.filter((run) => run.status === 'Completed').length;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!command.trim()) return;
    setSubmitting(true);
    try {
      await post('/commands', { command: command.trim(), route });
      setCommand('');
      await onRefresh();
      notify('Command saved to the execution history. It has not been dispatched.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Command could not be saved.', 'error'); }
    finally { setSubmitting(false); }
  };

  const dispatch = async (run: CommandRun) => {
    setDispatchingId(run.id);
    try {
      await post(`/commands/${run.id}/dispatch`, {});
      await onRefresh();
      notify('Command dispatched to the configured agent gateway.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Command could not be dispatched.';
      notify(message, 'error');
      await onRefresh().catch(() => undefined);
    } finally { setDispatchingId(''); }
  };

  return <div className="command-page">
    <SectionHeading eyebrow="OWNER CONTROL · EXECUTION HISTORY" title="Command Center" description="Create an explicit, auditable request and route it to the right leadership group." action={<span className="secure-owner-pill"><ShieldCheck size={14} /> Owner authorized</span>} />
    <DemoNotice>Command text is persisted, not interpreted or executed by this demo. A configured provider is required for dispatch.</DemoNotice>
    {!data.aiProvider.configured && <InlineNotice>AI provider not configured. Commands will stay <strong>Pending</strong>; no agent responses or successful execution are simulated.</InlineNotice>}
    {data.aiProvider.configured && <InlineNotice tone="success">Agent gateway configured. Dispatch is always an explicit owner action and gateway responses are recorded as returned.</InlineNotice>}

    <div className="command-layout">
      <section className="command-compose-panel panel">
        <div className="command-panel-top"><div className="command-panel-icon"><Command size={18} /></div><div><span className="eyebrow">NEW COMMAND</span><h2>What should the organization do?</h2><p>Write a natural-language request, then choose who should receive it.</p></div></div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="sr-only" htmlFor="command-input">Command text</label>
          <textarea id="command-input" rows={5} value={command} maxLength={3000} onChange={(event) => setCommand(event.target.value)} placeholder="Describe the outcome you need…&#10;&#10;Example: Ask the Development CEO to prepare a roadmap with dependencies, risks, and owner decisions." />
          <div className="command-form-bottom"><span>{command.length}/3000 characters · stored as a pending workflow</span><div className="command-form-actions"><label className="route-select"><span>Route to</span><select value={route} onChange={(event) => setRoute(event.target.value)}>{routeOptions.map((option) => <option key={option}>{option}</option>)}</select></label><button className="button button-primary" disabled={!command.trim() || submitting}>{submitting ? <span className="button-spinner" /> : <Send size={15} />} Save command <ArrowRight size={14} /></button></div></div>
        </form>
        <div className="command-suggestions"><span className="command-suggestions-label"><Sparkles size={13} /> SUGGESTED PROMPTS</span>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => setCommand(suggestion)}>{suggestion}<ArrowRight size={12} /></button>)}</div>
        <div className="command-compliance"><ShieldCheck size={15} /><span>Sensitive financial and security operations still require explicit human approval. Saving a command does not grant permissions or execute an external action.</span></div>
      </section>

      <aside className="command-status-column">
        <div className="panel command-status-card"><span className="eyebrow">EXECUTION POSTURE</span><div className="command-posture"><span className={`posture-indicator ${data.aiProvider.configured ? 'posture-on' : ''}`}><Workflow size={18} /></span><div><strong>{data.aiProvider.configured ? 'Gateway available' : 'Dispatch paused'}</strong><small>{data.aiProvider.configured ? data.aiProvider.provider : 'AI provider not configured'}</small></div></div><div className="posture-divider"/><div className="posture-row"><span>Pending commands</span><b>{pending}</b></div><div className="posture-row"><span>Completed in this workspace</span><b>{completed}</b></div><div className="posture-row"><span>Provider adapter</span><b>{data.aiProvider.configured ? 'Connected' : 'Offline'}</b></div><button className="text-action" onClick={() => onNavigate('settings')}>Provider settings <ArrowRight size={13} /></button></div>
        <div className="panel command-route-card"><span className="eyebrow">ROUTING MODEL</span><div className="route-step"><span>01</span><div><strong>Choose a route</strong><small>Explicitly select the responsible corporation or all executives.</small></div></div><div className="route-step"><span>02</span><div><strong>Review the request</strong><small>Owner confirms scope before any provider dispatch.</small></div></div><div className="route-step"><span>03</span><div><strong>Track the real result</strong><small>Status changes only when the connected gateway reports them.</small></div></div></div>
      </aside>
    </div>

    <section className="panel execution-history">
      <div className="panel-heading"><div><div className="panel-eyebrow">AUDITABLE WORKFLOW RECORDS</div><h3>Execution history <span className="panel-count">{data.commands.length}</span></h3><p>Every saved request, dispatch attempt, and provider result.</p></div><span className="history-retention"><FileClock size={14} /> Persisted to local demo store</span></div>
      {!data.commands.length ? <EmptyState icon={<Workflow size={22} />} title="No commands yet" detail="Your submitted commands will appear here as pending workflow records." action={<button className="button button-quiet" onClick={() => document.getElementById('command-input')?.focus()}><Plus size={14} /> Start with a command</button>} /> : <div className="command-history-list">{data.commands.map((run) => <article key={run.id} className={`command-run ${expandedId === run.id ? 'run-expanded' : ''}`}>
        <button className="command-run-main" onClick={() => setExpandedId(expandedId === run.id ? '' : run.id)}>
          <span className={`run-status-icon ${run.status.toLowerCase().replace(/\s+/g, '-')}`}>{iconForStatus(run.status)}</span>
          <span className="command-run-copy"><span><strong>{run.command}</strong><small>Route: {run.route} <i /> Requested by {run.requestedBy} <i /> {timeAgo(run.createdAt)}</small></span><span className="run-status-right"><StatusPill status={run.status} /><ChevronDown size={15} className={expandedId === run.id ? 'rotate-open' : ''} /></span></span>
        </button>
        {expandedId === run.id && <div className="command-run-details">
          <div><span>Created</span><strong title={fullDate(run.createdAt)}>{compactDate(run.createdAt)} · {new Date(run.createdAt).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })}</strong></div>
          <div><span>Last updated</span><strong>{timeAgo(run.updatedAt)} ago</strong></div>
          <div><span>Request route</span><strong>{run.route}</strong></div>
          {run.providerRunId && <div><span>Gateway run ID</span><code>{run.providerRunId}</code></div>}
          {run.status === 'Pending' && !data.aiProvider.configured && <div className="run-blocked-note"><AlertTriangle size={14} /><span>Awaiting provider configuration. This request has not been sent to an agent.</span></div>}
          {run.result && <div className="run-result"><span>Provider result</span><p>{run.result}</p></div>}
          {run.error && <div className="run-error"><AlertTriangle size={14} /><span>{run.error}</span></div>}
          {run.status === 'Pending' && data.aiProvider.configured && <button className="button button-primary button-sm" disabled={dispatchingId === run.id} onClick={() => void dispatch(run)}>{dispatchingId === run.id ? <span className="button-spinner" /> : <Play size={13} />} Dispatch to gateway</button>}
          {run.status === 'Failed' && data.aiProvider.configured && <button className="button button-quiet button-sm" disabled={dispatchingId === run.id} onClick={() => void dispatch(run)}><Play size={13} /> Retry dispatch</button>}
          {run.status === 'Completed' && <div className="run-complete-note"><CheckCircle2 size={14} /><span>Completed status received from the configured gateway.</span></div>}
        </div>}
      </article>)}</div>}
    </section>
  </div>;
}
