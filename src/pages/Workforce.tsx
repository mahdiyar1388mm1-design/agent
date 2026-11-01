import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, ChevronDown, ChevronRight, ClipboardList, Crown, FileCheck2, Network, Search, Send, ShieldAlert, ShieldCheck, Sparkles, UserRound, UserRoundPlus, Users, Workflow } from 'lucide-react';
import { api, post } from '../api';
import type { Agent, Approval, Bootstrap, Message, PageId, Project, Task } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, InlineNotice, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { compactDate, corporationClass, deriveAgentCompletion, shortCorporation, timeAgo } from '../utils';

interface SharedProps { data: Bootstrap; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void; onNavigate: (page: PageId) => void }

export function DirectoryPage({ data, page, onOpenAgent, onNavigate }: SharedProps & { page: PageId; onOpenAgent: (agentId: string) => void }) {
  const [query, setQuery] = useState('');
  const [corpFilter, setCorpFilter] = useState('All corporations');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const executiveOnly = page === 'executive-board';
  const managerOnly = page === 'department-managers';
  const title = executiveOnly ? 'Executive Board' : managerOnly ? 'Department Managers' : 'Agent Directory';
  const agents = useMemo(() => data.agents.filter((agent) => {
    if (executiveOnly && !agent.isExecutive) return false;
    if (managerOnly && !['Department Manager', 'Central Executive', 'Corporation CEO', 'Executive'].includes(agent.level)) return false;
    if (corpFilter !== 'All corporations' && agent.corporation !== corpFilter) return false;
    if (statusFilter !== 'All statuses' && agent.status !== statusFilter) return false;
    const search = query.trim().toLowerCase();
    return !search || `${agent.name} ${agent.title} ${agent.department} ${agent.corporation} ${agent.skills.join(' ')}`.toLowerCase().includes(search);
  }), [data.agents, executiveOnly, managerOnly, corpFilter, statusFilter, query]);
  const maxPage = Math.max(1, Math.ceil(agents.length / pageSize));
  const visible = agents.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const statusCounts = { Online: data.agents.filter((agent) => agent.status === 'Online').length, Working: data.agents.filter((agent) => agent.status === 'Working').length, Busy: data.agents.filter((agent) => agent.status === 'Busy').length };
  const recruitmentCount = data.approvals.filter((approval) => approval.category === 'Agent Recruitment' && approval.status === 'Pending').length;

  return <div className="directory-page">
    <SectionHeading eyebrow={executiveOnly ? 'HOLDING LEADERSHIP' : managerOnly ? 'WORKFORCE LEADERSHIP' : 'WORKFORCE MANAGEMENT'} title={title} description={executiveOnly ? 'Profiles and accountability for the holding and corporation executive teams.' : managerOnly ? 'Department leaders and their current reporting responsibilities.' : 'Search the sample workforce by role, company, skills, manager, and status.'} action={<button className="button button-primary" onClick={() => onNavigate('agent-recruitment')}><UserRoundPlus size={15} /> Request an agent</button>} />
    <DemoNotice>Directory entries and presence statuses are seeded sample records. No agent is actively running in this environment.</DemoNotice>
    <div className="directory-stats"><div><Users size={16} /><strong>{data.agents.length}</strong><span>Sample agents</span></div><div><span className="status-led status-led-online" /><strong>{statusCounts.Online}</strong><span>Online sample status</span></div><div><Workflow size={16} /><strong>{statusCounts.Working}</strong><span>Working sample status</span></div><div><BriefcaseBusiness size={16} /><strong>{recruitmentCount}</strong><span>Recruitment requests pending</span></div></div>
    <div className="directory-toolbar"><label className="directory-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder="Search name, role, skills, or department" /></label><select value={corpFilter} onChange={(event) => { setCorpFilter(event.target.value); setCurrentPage(1); }}><option>All corporations</option><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }}><option>All statuses</option>{['Online', 'Offline', 'Working', 'Busy', 'Waiting for Approval', 'Suspended', 'Under Evaluation'].map((status) => <option key={status}>{status}</option>)}</select><span className="directory-result-count">{agents.length} result{agents.length === 1 ? '' : 's'}</span></div>
    <div className="directory-table panel"><div className="directory-table-head"><span>Agent</span><span>Corporation / Department</span><span>Manager</span><span>Level</span><span>Status</span><span>Access</span></div>
      {visible.map((agent) => { const manager = data.agents.find((item) => item.id === agent.reportsTo); return <button className="directory-row" key={agent.id} onClick={() => onOpenAgent(agent.id)}>
        <span className="directory-agent"><Avatar name={agent.name} color={agent.avatarColor} size="sm" status={agent.status} /><span><strong>{agent.name}</strong><small>{agent.title}</small></span></span>
        <span className="directory-corp"><span className={`corp-logo corp-logo-${shortCorporation(agent.corporation).toLowerCase()}`}>{shortCorporation(agent.corporation)[0]}</span><span><strong>{shortCorporation(agent.corporation)}</strong><small>{agent.department}</small></span></span>
        <span className="directory-manager">{manager?.name || (agent.reportsTo === 'owner' ? 'Avery Morgan · Owner' : '—')}</span><span className="directory-level">{agent.level}</span><span><StatusPill status={agent.status} /></span><span className="directory-permission"><ShieldCheck size={12} />{agent.permissionLevel}</span>
      </button>; })}
      {!visible.length && <EmptyState icon={<Search size={21} />} title="No agents found" detail="Try another name, role, corporation, or status." />}
    </div>
    {agents.length > pageSize && <div className="pagination"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, agents.length)} of {agents.length}</span><div><button className="button button-quiet button-sm" disabled={currentPage === 1} onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}><ArrowLeft size={13} /> Previous</button><button className="button button-quiet button-sm" disabled={currentPage === maxPage} onClick={() => setCurrentPage((value) => Math.min(maxPage, value + 1))}>Next <ArrowRight size={13} /></button></div></div>}
  </div>;
}

export function AgentProfilePage({ data, agentId, onChat, onNavigate, onRefresh, notify }: SharedProps & { agentId: string; onChat: (conversationId: string) => void }) {
  const [history, setHistory] = useState<Message[]>([]);
  const [openingChat, setOpeningChat] = useState(false);
  const agent = data.agents.find((item) => item.id === agentId);
  const manager = agent && data.agents.find((item) => item.id === agent.reportsTo);
  const assignedTasks = data.tasks.filter((task) => task.assigneeId === agentId);
  const activeTasks = assignedTasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status));
  const projects = data.projects.filter((project) => project.ownerId === agentId);
  const completion = agent ? deriveAgentCompletion(agent, data.tasks) : null;
  const decisions = data.decisions.filter((decision) => decision.requesterName === agent?.name || decision.corporation === agent?.corporation).slice(0, 3);
  const dm = data.conversations.find((conversation) => conversation.id === `dm-owner-${agentId}`);

  useEffect(() => {
    let live = true;
    if (!dm) { setHistory([]); return; }
    api<{ messages: Message[] }>(`/conversations/${dm.id}/messages?limit=8`).then((response) => { if (live) setHistory(response.messages.slice(-5).reverse()); }).catch(() => undefined);
    return () => { live = false; };
  }, [dm?.id]);

  if (!agent) return <div className="agent-profile-page"><EmptyState icon={<UserRound size={22} />} title="Agent not found" detail="This profile is not available in the current workspace." action={<button className="button button-quiet" onClick={() => onNavigate('agent-directory')}>Back to directory</button>} /></div>;

  const openChat = async () => {
    setOpeningChat(true);
    try { const response = await post<{ conversation: { id: string } }>('/conversations/dm', { agentId: agent.id }); await onRefresh(); onChat(response.conversation.id); }
    catch (error) { notify(error instanceof Error ? error.message : 'Direct message could not be opened.', 'error'); }
    finally { setOpeningChat(false); }
  };

  return <div className="agent-profile-page">
    <button className="back-link" onClick={() => onNavigate('agent-directory')}><ArrowLeft size={14} /> Agent Directory</button>
    <DemoNotice />
    <section className="agent-profile-hero panel"><div className="agent-cover-line" /><div className="agent-profile-main"><Avatar name={agent.name} color={agent.avatarColor} size="xl" status={agent.status} /><div className="agent-profile-identity"><div className="agent-name-line"><h1>{agent.name}</h1>{agent.isExecutive && <span className="executive-label"><Crown size={12} /> EXECUTIVE</span>}</div><p>{agent.title}</p><div className="agent-company-line"><span className={`corp-logo corp-logo-${shortCorporation(agent.corporation).toLowerCase()}`}>{shortCorporation(agent.corporation)[0]}</span><span>{agent.corporation}</span><span className="header-dot" />{agent.department}</div></div><div className="agent-profile-actions"><StatusPill status={agent.status} /><button className="button button-primary" onClick={() => void openChat()} disabled={openingChat}>{openingChat ? <span className="button-spinner" /> : <MessageCircleIcon />} Chat with executive</button></div></div>
      <div className="agent-profile-quickfacts"><div><small>REPORTS TO</small><strong>{manager?.name || (agent.reportsTo === 'owner' ? 'Avery Morgan · Owner' : 'Not assigned')}</strong></div><div><small>ORGANIZATIONAL LEVEL</small><strong>{agent.level}</strong></div><div><small>PERMISSION LEVEL</small><strong><ShieldCheck size={13} />{agent.permissionLevel}</strong></div><div><small>CURRENT RESPONSIBILITIES</small><strong>{activeTasks.length} assigned active tasks</strong></div></div>
    </section>

    <div className="profile-main-grid"><div className="profile-main-column">
      <section className="panel profile-content-card"><div className="panel-heading"><div><span className="panel-eyebrow">ROLE SUMMARY</span><h3>Current objective</h3></div></div><p className="objective-copy">{agent.currentObjective}</p><div className="responsibility-list"><span className="inspector-label">ACTIVE RESPONSIBILITIES</span>{agent.responsibilities.map((responsibility, index) => <div key={`${responsibility}-${index}`}><Check size={13} />{responsibility}</div>)}</div></section>
      <section className="panel profile-content-card"><div className="panel-heading"><div><span className="panel-eyebrow">ASSIGNED WORK</span><h3>Current tasks <span className="panel-count">{assignedTasks.length}</span></h3></div><button className="text-action" onClick={() => onNavigate('tasks')}>Task board <ArrowRight size={13} /></button></div>{assignedTasks.length ? <div className="profile-task-list">{assignedTasks.slice(0, 5).map((task) => <div key={task.id}><span className="profile-task-icon"><ClipboardList size={14} /></span><span><strong>{task.title}</strong><small>{task.department} · Due {compactDate(task.dueDate)}</small></span><StatusPill status={task.status} /></div>)}</div> : <p className="profile-empty">No task records are assigned to this agent.</p>}</section>
      <section className="panel profile-content-card"><div className="panel-heading"><div><span className="panel-eyebrow">COMMUNICATION HISTORY</span><h3>Recent direct messages</h3></div><button className="text-action" onClick={() => void openChat()}>Open chat <ArrowRight size={13} /></button></div>{history.length ? <div className="profile-message-list">{history.map((message) => <div key={message.id}><span><Avatar name={message.senderName} color={message.senderId === data.user.id ? data.user.avatarColor : agent.avatarColor} size="xs" /></span><div><strong>{message.senderName}</strong><p>{message.body}</p></div><time>{timeAgo(message.createdAt)}</time></div>)}</div> : <p className="profile-empty">No individual conversation history is available. New messages are stored but will not trigger an AI response.</p>}</section>
    </div><aside className="profile-side-column">
      <section className="panel performance-card"><div className="panel-heading"><div><span className="panel-eyebrow">WORKFORCE REPORTING</span><h3>Performance</h3></div><span className="data-derived-mark">DERIVED</span></div><div className="performance-metric"><span>Task completion</span>{completion === null ? <strong className="not-measured">Not measured</strong> : <strong>{completion}%</strong>}<small>{assignedTasks.length ? `${assignedTasks.filter((task) => task.status === 'Completed').length} of ${assignedTasks.length} assigned tasks completed` : 'No assigned task sample'}</small></div><div className="performance-line"><span>Decision quality</span><strong>Not scored</strong><small>No reviewed outcome data</small></div><div className="performance-line"><span>Response time</span><strong>Not measured</strong><small>No live response telemetry</small></div><div className="performance-line"><span>Project success</span><strong>{projects.length ? `${projects.filter((project) => project.status === 'Completed').length}/${projects.length}` : 'Not measured'}</strong><small>{projects.length ? 'Projects assigned as owner' : 'No owned project records'}</small></div><div className="performance-line"><span>Cost efficiency</span><strong>Not connected</strong><small>No model usage costs available</small></div><p className="performance-foot"><ShieldCheck size={12} /> No synthetic performance values</p></section>
      <section className="panel profile-content-card"><div className="panel-heading"><div><span className="panel-eyebrow">SKILL PROFILE</span><h3>Skills & tools</h3></div></div><div className="skill-chips">{agent.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><div className="profile-tool-list"><span className="inspector-label">AUTHORIZED TOOLS</span>{agent.tools.map((tool) => <span key={tool}><ShieldCheck size={12} />{tool}</span>)}</div></section>
      <section className="panel profile-content-card"><div className="panel-heading"><div><span className="panel-eyebrow">ORGANIZATIONAL CONTEXT</span><h3>Recent decisions</h3></div></div>{decisions.length ? decisions.map((decision) => <div className="profile-decision" key={decision.id}><strong>{decision.title}</strong><small>{decision.status} · {timeAgo(decision.createdAt)}</small></div>) : <p className="profile-empty">No related decision records.</p>}</section>
    </aside></div>
  </div>;
}

function MessageCircleIcon() { return <UserRound size={15} />; }

export function RecruitmentPage({ data, onRefresh, notify }: SharedProps) {
  const [roleTitle, setRoleTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [corporation, setCorporation] = useState('Development Corporation');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const requests = data.approvals.filter((approval) => approval.category === 'Agent Recruitment').sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try { await post('/recruitment', { title: roleTitle, department, corporation, justification }); setRoleTitle(''); setDepartment(''); setJustification(''); await onRefresh(); notify('Recruitment request submitted for controlled review. No agent was created.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Request could not be submitted.', 'error'); }
    finally { setSaving(false); }
  };

  return <div className="recruitment-page"><SectionHeading eyebrow="CONTROLLED WORKFORCE EXPANSION" title="Agent Recruitment" description="Request a role through testing, review, and permission assignment — never direct self-escalation." /><DemoNotice />
    <InlineNotice>Submitting a role request creates a pending approval only. An agent is not provisioned, assigned tools, or granted permissions automatically.</InlineNotice>
    <div className="recruitment-layout"><section className="panel recruitment-form-panel"><div className="recruitment-form-heading"><span className="recruitment-icon"><Sparkles size={17} /></span><div><h2>Propose a new role</h2><p>Define the need before selecting access.</p></div></div><form className="modal-form" onSubmit={(event) => void submit(event)}>
      <label className="field-label">Proposed role title<input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} required maxLength={150} placeholder="e.g. Data Quality Evaluator" /></label>
      <div className="form-grid-2"><label className="field-label">Corporation<select value={corporation} onChange={(event) => setCorporation(event.target.value)}><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="field-label">Department<input value={department} onChange={(event) => setDepartment(event.target.value)} maxLength={120} placeholder="e.g. QA & Testing" /></label></div>
      <label className="field-label">Justification<textarea value={justification} onChange={(event) => setJustification(event.target.value)} required rows={5} maxLength={3000} placeholder="What is the bounded responsibility? What evaluation evidence is needed? Which manager will own the role?" /></label>
      <div className="recruitment-checklist"><span className="inspector-label">CONTROLLED PROVISIONING CHECKLIST</span><div><Check size={13} /> Define role and reporting line</div><div><Check size={13} /> Test and evaluate in a restricted environment</div><div><Check size={13} /> Review security and tool permissions</div><div><ShieldCheck size={13} /> Owner approval before provisioning</div></div>
      <button className="button button-primary" disabled={saving || !roleTitle.trim() || !justification.trim()}>{saving ? <span className="button-spinner" /> : <Send size={14} />} Submit for approval</button>
    </form></section>
    <section className="panel recruitment-process-panel"><span className="panel-eyebrow">WORKFORCE LIFECYCLE</span><h2>Bounded, reviewed, accountable.</h2><div className="recruitment-steps">{[['01', 'Role definition', 'Scope, manager, and measurable responsibilities'], ['02', 'Sandbox evaluation', 'Test the role before granting operational access'], ['03', 'Security validation', 'Assign only the minimum approved tools'], ['04', 'Human authorization', 'Owner approval required before provisioning']].map(([number, title, detail]) => <div key={number}><span>{number}</span><strong>{title}</strong><small>{detail}</small></div>)}</div><div className="recruitment-warning"><ShieldAlert size={14} /> Agents cannot grant themselves elevated permissions.</div></section></div>
    <section className="panel recruitment-requests"><div className="panel-heading"><div><span className="panel-eyebrow">REQUEST HISTORY</span><h3>Recruitment requests <span className="panel-count">{requests.length}</span></h3></div><button className="text-action" onClick={() => undefined}>Approval Center <ArrowRight size={13} /></button></div>{requests.length ? requests.map((request) => <RecruitmentRequest key={request.id} request={request} />) : <p className="profile-empty">Submitted role requests will appear here.</p>}</section>
  </div>;
}

function RecruitmentRequest({ request }: { request: Approval }) {
  return <article className="recruitment-request-row"><span className="recruitment-request-icon"><UserRoundPlus size={15} /></span><span className="recruitment-request-copy"><strong>{request.title}</strong><small>{request.corporation} <i /> {request.requesterName} <i /> {timeAgo(request.createdAt)}</small></span><StatusPill status={request.status} /></article>;
}

export function OrganizationPage({ data, onOpenAgent, onNavigate }: SharedProps & { onOpenAgent: (agentId: string) => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ owner: true, 'ceo-holding': true, 'ceo-trading': true, 'ceo-development': true, 'ceo-marketing': true });
  const [showAll, setShowAll] = useState(false);
  const filteredIds = new Set(data.agents.filter((agent) => `${agent.name} ${agent.title} ${agent.department} ${agent.corporation}`.toLowerCase().includes(query.toLowerCase())).map((agent) => agent.id));
  const hasMatchInBranch = (agentId: string): boolean => {
    if (filteredIds.has(agentId)) return true;
    return data.agents.filter((agent) => agent.reportsTo === agentId).some((agent) => hasMatchInBranch(agent.id));
  };
  const rootChildren = data.agents.filter((agent) => agent.reportsTo === 'owner' || agent.id === 'ceo-holding');
  const visibleRoot = rootChildren.filter((agent) => !query || hasMatchInBranch(agent.id));
  const toggle = (agentId: string) => setExpanded((previous) => ({ ...previous, [agentId]: !previous[agentId] }));

  const renderNode = (agent: Agent, depth = 0): JSX.Element | null => {
    const children = data.agents.filter((item) => item.reportsTo === agent.id);
    const matching = !query || hasMatchInBranch(agent.id);
    if (!matching) return null;
    const isExpanded = query ? true : expanded[agent.id] ?? depth < 1;
    const workload = data.tasks.filter((task) => task.assigneeId === agent.id && !['Completed', 'Cancelled'].includes(task.status)).length;
    return <div className={`org-node-wrap depth-${Math.min(depth, 5)}`} key={agent.id}>
      <article className={`org-node ${corporationClass(agent.corporation)} ${filteredIds.has(agent.id) && query ? 'org-node-match' : ''}`}>
        <button className="org-node-expand" onClick={() => toggle(agent.id)} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${agent.name}`} aria-expanded={isExpanded}>{children.length ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : <span className="org-node-leaf" />}</button>
        <button className="org-node-profile" onClick={() => onOpenAgent(agent.id)}><Avatar name={agent.name} color={agent.avatarColor} size="sm" status={agent.status} /><span><strong>{agent.name}</strong><small>{agent.title}</small><em>{agent.department}</em></span></button>
        <div className="org-node-meta"><span className={`corporation-tag ${corporationClass(agent.corporation)}`}>{shortCorporation(agent.corporation)}</span><span className="org-workload">{workload} open</span><StatusPill status={agent.status} /></div>
      </article>
      {children.length > 0 && isExpanded && <div className="org-children">{children.map((child) => renderNode(child, depth + 1))}</div>}
    </div>;
  };

  return <div className="organization-page"><SectionHeading eyebrow="GOVERNANCE · REPORTING LINES" title="Organization Chart" description="Explore a hierarchical view of the owner, central leadership, and three corporation teams." action={<button className="button button-quiet" onClick={() => onNavigate('agent-recruitment')}><UserRoundPlus size={14} /> Request a position</button>} /><DemoNotice />
    <div className="org-toolbar"><label className="directory-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the organization" /></label><button className="button button-quiet button-sm" onClick={() => setExpanded(Object.fromEntries(data.agents.map((agent) => [agent.id, !showAll])))}>{showAll ? 'Collapse branches' : 'Expand branches'} <ChevronDown size={13} /></button><span>{data.agents.length + 1} sample positions</span></div>
    <div className="org-chart-canvas"><div className="org-owner-root"><button onClick={() => undefined}><span className="owner-crown"><Crown size={14} /></span><Avatar name={data.user.name} color={data.user.avatarColor} size="md" /><span><strong>{data.user.name}</strong><small>OWNER · HOLDING-WIDE AUTHORITY</small></span><span className="org-root-badge">OWNER</span></button><span className="org-connector-down" /></div><div className="org-root-children">{visibleRoot.map((agent) => renderNode(agent, 0))}{!visibleRoot.length && <EmptyState icon={<Search size={20} />} title="No matching branch" detail="Try another name, title, or department." />}</div></div>
    <div className="org-legend"><span><i className="legend-blue" />Holding</span><span><i className="legend-teal" />Trading</span><span><i className="legend-violet" />Development</span><span><i className="legend-amber" />Marketing</span><span><i className="legend-dashed" />Reporting relationship</span></div>
  </div>;
}
