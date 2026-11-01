import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight, CircleDollarSign, Command, FileCheck2, FolderKanban, MessageCircle, ShieldAlert, ShieldCheck, Sparkles, Users, Workflow } from 'lucide-react';
import { api } from '../api';
import type { Agent, Bootstrap, Message, PageId } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, InlineNotice, SectionHeading, StatusPill } from '../components/Ui';
import { corporationClass, shortCorporation, timeAgo, truncate } from '../utils';

interface Props {
  data: Bootstrap;
  onRefresh: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
  onNavigate: (page: PageId) => void;
  onOpenConversation: (id: string) => void;
}

const agentById = (agents: Agent[], id: string) => agents.find((agent) => agent.id === id);

export function OverviewPage({ data, onNavigate, onOpenConversation }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const board = data.conversations.find((conversation) => conversation.id === 'room-board');
  const openTasks = data.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status));
  const activeProjects = data.projects.filter((project) => !['Completed', 'Cancelled'].includes(project.status));
  const pendingApprovals = data.approvals.filter((approval) => approval.status === 'Pending');
  const activeAgents = data.agents.filter((agent) => !['Offline', 'Suspended'].includes(agent.status));
  const activeCorps = new Set(data.agents.filter((agent) => agent.corporation !== 'Holding Headquarters').map((agent) => agent.corporation)).size;
  const completedTasks = data.tasks.filter((task) => task.status === 'Completed').length;
  const boardMessages = useMemo(() => messages.filter((message) => !message.threadRootId).slice(-4).reverse(), [messages]);

  useEffect(() => {
    let live = true;
    api<{ messages: Message[] }>('/conversations/room-board/messages?limit=24')
      .then((response) => { if (live) setMessages(response.messages); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [data.conversations]);

  const topExecutives = data.agents.filter((agent) => agent.isExecutive && agent.status !== 'Offline').slice(0, 6);
  const corpTasks = ['Trading Corporation', 'Development Corporation', 'Marketing Corporation'].map((corporation) => ({
    name: shortCorporation(corporation), corporation,
    open: openTasks.filter((task) => task.corporation === corporation).length,
    total: data.tasks.filter((task) => task.corporation === corporation).length,
  }));
  const health = data.aiProvider.configured ? 'Provider connected' : 'AI dispatch unavailable';

  return (
    <div className="overview-page">
      <SectionHeading eyebrow="HOLDING HEADQUARTERS · OWNER VIEW" title="Executive Command" description="A focused view across your organization, leadership, and decisions." action={<button className="button button-primary" onClick={() => onNavigate('command-center')}><Command size={15} /> Issue a command <span className="shortcut-mini">⌘ /</span></button>} />
      <DemoNotice>Numbers on this page are calculated from seeded demo records. No live operational systems are connected.</DemoNotice>

      <section className="overview-hero">
        <div className="overview-hero-image" />
        <div className="overview-hero-content">
          <div className="hero-label"><span className="hero-mark"><Sparkles size={13} /></span> AI HOLDING <span className="hero-divider" /> EXECUTIVE COMMAND CENTER</div>
          <h2>One command. Three corporations.<br /><span>One intelligent organization.</span></h2>
          <p>Govern communication, approvals, and work from a single owner-controlled workspace.</p>
          <div className="hero-quick-actions">
            <button onClick={() => onOpenConversation('room-board')}><MessageCircle size={15} /> Open board room <ArrowRight size={14} /></button>
            <button onClick={() => onNavigate('approvals')}><FileCheck2 size={15} /> Review requests <span className="hero-action-count">{pendingApprovals.length}</span></button>
          </div>
        </div>
        <div className="hero-coverage"><span className="status-led" /> LOCAL DEMO <small>OWNER ACCESS</small></div>
      </section>

      <InlineNotice tone="warning">{health}. New messages are saved, but they will not trigger agent responses until an AI provider is configured.</InlineNotice>

      <div className="kpi-grid">
        <article className="kpi-card"><div className="kpi-top"><span className="kpi-icon kpi-blue"><Building2Icon /></span><span className="kpi-trend"><Check size={12} /> Configured</span></div><div className="kpi-value">{activeCorps}</div><div className="kpi-label">Corporations</div><div className="kpi-foot">3 registered in this sample workspace</div></article>
        <article className="kpi-card"><div className="kpi-top"><span className="kpi-icon kpi-violet"><Users size={16} /></span><span className="kpi-trend kpi-static"><span className="status-led" /> Sample presence</span></div><div className="kpi-value">{activeAgents.length}<small> / {data.agents.length}</small></div><div className="kpi-label">Available agents</div><div className="kpi-foot">Seeded presence states · not live telemetry</div></article>
        <article className="kpi-card"><div className="kpi-top"><span className="kpi-icon kpi-teal"><FolderKanban size={16} /></span><span className="kpi-trend kpi-static">{completedTasks} completed</span></div><div className="kpi-value">{activeProjects.length}</div><div className="kpi-label">Active projects</div><div className="kpi-foot">{openTasks.length} open tasks across sample projects</div></article>
        <article className="kpi-card kpi-attention"><div className="kpi-top"><span className="kpi-icon kpi-amber"><FileCheck2 size={16} /></span><span className="kpi-trend kpi-attention-label">Owner review</span></div><div className="kpi-value">{pendingApprovals.length}</div><div className="kpi-label">Pending approvals</div><div className="kpi-foot">{data.approvals.filter((approval) => approval.risk === 'Critical' && approval.status === 'Pending').length} critical · explicit owner authorization</div></article>
      </div>

      <div className="overview-grid">
        <section className="panel board-activity-panel">
          <div className="panel-heading"><div><div className="panel-eyebrow"><span className="status-led" /> SHARED LEADERSHIP</div><h3>Executive Board Room</h3><p>{board?.participantIds.length || 0} participants <span className="muted-dot">·</span> Holding Headquarters</p></div><button className="button button-quiet button-sm" onClick={() => onOpenConversation('room-board')}>Open conversation <ArrowRight size={14} /></button></div>
          <div className="board-activity-list">
            {boardMessages.map((message) => {
              const person = message.senderId === 'owner' ? data.user : agentById(data.agents, message.senderId);
              return <article className="board-activity-row" key={message.id}>
                <Avatar name={person?.name || message.senderName} color={person && 'avatarColor' in person ? person.avatarColor : undefined} size="sm" status={message.senderId !== 'owner' ? (person as Agent | undefined)?.status : undefined} />
                <div className="board-activity-copy"><div className="board-activity-meta"><strong>{message.senderName}</strong><span>{message.senderTitle}</span><time>{timeAgo(message.createdAt)}</time></div><p>{truncate(message.body.replace(/\*\*/g, ''), 145)}</p></div>
                {message.isPriority && <span className="priority-flag" title="Priority message">PRIORITY</span>}
              </article>;
            })}
            {!boardMessages.length && <div className="panel-empty">No messages yet. Start a board discussion.</div>}
          </div>
          <button className="panel-link" onClick={() => onOpenConversation('room-board')}>View board history <ChevronRight size={14} /></button>
        </section>

        <section className="panel review-panel">
          <div className="panel-heading"><div><div className="panel-eyebrow">NEEDS YOUR ATTENTION</div><h3>Review queue</h3></div><button className="text-action" onClick={() => onNavigate('approvals')}>View all <ArrowRight size={13} /></button></div>
          <div className="review-list">
            {pendingApprovals.slice(0, 3).map((approval) => <button className="review-item" key={approval.id} onClick={() => onNavigate('approvals')}>
              <span className={`review-icon risk-${approval.risk.toLowerCase()}`}>{approval.risk === 'Critical' ? <ShieldAlert size={15} /> : <FileCheck2 size={15} />}</span>
              <span className="review-copy"><strong>{approval.title}</strong><small>{approval.requesterName} <span>·</span> {approval.category}</small></span>
              <span className={`risk-tag risk-tag-${approval.risk.toLowerCase()}`}>{approval.risk}</span>
            </button>)}
            {!pendingApprovals.length && <div className="panel-empty">Your approval queue is clear.</div>}
          </div>
          <div className="review-footer"><ShieldCheck size={14} /><span>High-risk actions require your explicit approval.</span></div>
        </section>

        <section className="panel corporation-snapshot">
          <div className="panel-heading"><div><div className="panel-eyebrow">PORTFOLIO OVERVIEW</div><h3>Corporation work queue</h3></div><button className="text-action" onClick={() => onNavigate('projects')}>Projects <ArrowRight size={13} /></button></div>
          <div className="corp-work-list">{corpTasks.map((corp) => <div className="corp-work-row" key={corp.name}>
            <span className={`corp-logo corp-logo-${corp.name.toLowerCase()}`}>{corp.name[0]}</span>
            <span className="corp-work-name"><strong>{corp.name}</strong><small>{corp.total} seeded tasks</small></span>
            <span className="corp-work-progress"><span className="corp-work-bar"><i style={{ width: `${corp.total ? (corp.open / corp.total) * 100 : 0}%` }} /></span><small>{corp.open} open</small></span>
          </div>)}</div>
          <div className="corp-work-foot"><span>Open work items</span><strong>{openTasks.length}</strong></div>
        </section>

        <section className="panel leadership-panel">
          <div className="panel-heading"><div><div className="panel-eyebrow">SAMPLE PRESENCE</div><h3>Leadership</h3></div><button className="text-action" onClick={() => onNavigate('executive-board')}>View board <ArrowRight size={13} /></button></div>
          <div className="leadership-list">{topExecutives.slice(0, 5).map((agent) => <button className="leadership-row" key={agent.id} onClick={() => onNavigate('executive-board')}>
            <Avatar name={agent.name} color={agent.avatarColor} size="xs" status={agent.status} />
            <span><strong>{agent.name}</strong><small>{agent.title}</small></span>
            <span className={`presence-label presence-label-${agent.status.toLowerCase().replace(/\s+/g, '-')}`}>{agent.status}</span>
          </button>)}</div>
          <div className="leadership-footer"><span className="online-pulse" /> Agent presence is sample data</div>
        </section>
      </div>

      <div className="overview-bottom-row">
        <button className="quick-card" onClick={() => onNavigate('command-center')}><span className="quick-card-icon quick-blue"><Command size={17} /></span><span><strong>Issue a command</strong><small>Save a routed request to the execution queue</small></span><ArrowRight size={16} /></button>
        <button className="quick-card" onClick={() => onNavigate('meetings')}><span className="quick-card-icon quick-violet"><Workflow size={17} /></span><span><strong>Schedule a session</strong><small>Set an objective, attendees, and agenda</small></span><ArrowRight size={16} /></button>
        <button className="quick-card" onClick={() => onNavigate('analytics')}><span className="quick-card-icon quick-teal"><BarChart3 size={17} /></span><span><strong>Explore reporting</strong><small>View derived demo data and source gaps</small></span><ArrowRight size={16} /></button>
      </div>
      <p className="page-footnote">{data.aiProvider.configured ? 'AI gateway is configured. Dispatch occurs only when explicitly initiated.' : 'No AI provider configured · commands remain pending and no live agent activity is simulated.'}</p>
    </div>
  );
}

function Building2Icon() { return <CircleDollarSign size={16} />; }
