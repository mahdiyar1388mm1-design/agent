import { useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, CircleDot, Clock3, FolderKanban, Plus, Search, ShieldCheck } from 'lucide-react';
import { patch, post } from '../api';
import type { Bootstrap, Project } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { compactDate, corporationClass, shortCorporation, timeAgo } from '../utils';

interface Props { data: Bootstrap; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }

export function ProjectsPage({ data, onRefresh, notify }: Props) {
  const [query, setQuery] = useState('');
  const [corporation, setCorporation] = useState('All corporations');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const projects = useMemo(() => data.projects.filter((project) => {
    if (corporation !== 'All corporations' && project.corporation !== corporation) return false;
    const search = query.trim().toLowerCase();
    return !search || `${project.name} ${project.description} ${project.department}`.toLowerCase().includes(search);
  }), [data.projects, corporation, query]);
  const selected = data.projects.find((project) => project.id === selectedProjectId);
  const active = data.projects.filter((project) => !['Completed', 'Cancelled'].includes(project.status)).length;
  const tasksOpen = data.tasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length;
  const projectsForCorporation = ['Trading Corporation', 'Development Corporation', 'Marketing Corporation'].map((name) => ({ name, count: data.projects.filter((project) => project.corporation === name).length }));

  const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try { const response = await post<{ project: Project }>('/projects', Object.fromEntries(form.entries())); setCreateOpen(false); setSelectedProjectId(response.project.id); await onRefresh(); notify('Project created.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Project could not be created.', 'error'); }
    finally { setSaving(false); }
  };
  const updateStatus = async (project: Project, status: string) => {
    try { await patch(`/projects/${project.id}`, { status }); await onRefresh(); notify(`Project moved to ${status}.`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Project could not be updated.', 'error'); }
  };

  return <div className="projects-page">
    <SectionHeading eyebrow="PORTFOLIO DELIVERY" title="Active Projects" description="Review project scope, ownership, timelines, and linked work across corporations." action={<button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create project</button>} />
    <DemoNotice>Project cards and task totals are derived from explicitly seeded demo records.</DemoNotice>
    <div className="project-overview-row"><div className="project-overview-card"><span className="project-summary-icon summary-blue"><FolderKanban size={16} /></span><span><strong>{active}</strong><small>Active projects</small></span></div><div className="project-overview-card"><span className="project-summary-icon summary-teal"><CheckCheck size={16} /></span><span><strong>{tasksOpen}</strong><small>Open linked tasks</small></span></div><div className="project-corp-overview">{projectsForCorporation.map((item) => <div key={item.name}><span className={`corp-logo corp-logo-${shortCorporation(item.name).toLowerCase()}`}>{shortCorporation(item.name)[0]}</span><span>{shortCorporation(item.name)}</span><b>{item.count}</b></div>)}</div></div>
    <div className="project-toolbar"><label className="task-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project" /></label><select className="project-corp-select" value={corporation} onChange={(event) => setCorporation(event.target.value)}><option>All corporations</option><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select><span className="project-count-label">{projects.length} project{projects.length === 1 ? '' : 's'}</span></div>
    {!projects.length ? <div className="panel project-empty"><EmptyState icon={<FolderKanban size={22} />} title="No projects found" detail="Create a project or change the current filters." action={<button className="button button-quiet" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create project</button>} /></div> : <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} data={data} selected={project.id === selectedProjectId} onOpen={() => setSelectedProjectId(project.id)} onStatus={(status) => void updateStatus(project, status)} />)}</div>}
    {selected && <ProjectDetails project={selected} data={data} onClose={() => setSelectedProjectId('')} onStatus={(status) => void updateStatus(selected, status)} />}
    {createOpen && <Modal title="Create a project" description="Set an accountable owner and initial project scope." onClose={() => setCreateOpen(false)}><form className="modal-form" onSubmit={(event) => void createProject(event)}><label className="field-label">Project name<input name="name" required maxLength={180} placeholder="Project name" /></label><label className="field-label">Corporation<select name="corporation"><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="field-label">Project lead<select name="ownerId">{data.agents.filter((agent) => agent.isExecutive || agent.level === 'Department Manager').map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.title}</option>)}</select></label><label className="field-label">Scope / description<textarea name="description" rows={3} maxLength={3000} placeholder="Document scope and intended outcomes…" /></label><label className="field-label">Target date<input type="date" name="targetDate" /></label><div className="form-note"><ShieldCheck size={14} /> Project creation does not start external workflows or create tasks automatically.</div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setCreateOpen(false)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? <span className="button-spinner" /> : <Plus size={14} />} Create project</button></div></form></Modal>}
  </div>;
}

function ProjectCard({ project, data, selected, onOpen, onStatus }: { project: Project; data: Bootstrap; selected: boolean; onOpen: () => void; onStatus: (status: string) => void }) {
  const linkedTasks = data.tasks.filter((task) => task.projectId === project.id);
  const complete = linkedTasks.filter((task) => task.status === 'Completed').length;
  const open = linkedTasks.filter((task) => !['Completed', 'Cancelled'].includes(task.status)).length;
  const lead = data.agents.find((agent) => agent.id === project.ownerId);
  const progress = linkedTasks.length ? Math.round((complete / linkedTasks.length) * 100) : null;
  return <article className={`project-card panel ${selected ? 'selected' : ''}`}>
    <div className="project-card-top"><span className={`corporation-tag ${corporationClass(project.corporation)}`}>{project.corporation}</span><StatusPill status={project.status} /></div>
    <button className="project-card-title" onClick={onOpen}><h3>{project.name}</h3><p>{project.description}</p></button>
    <div className="project-card-stats"><div><span>LINKED TASKS</span><strong>{linkedTasks.length}</strong></div><div><span>OPEN</span><strong>{open}</strong></div><div><span>TARGET</span><strong>{compactDate(project.targetDate)}</strong></div></div>
    <div className="project-progress-row"><div><span>{progress === null ? 'Task completion' : `${progress}% task completion`}</span><span>{progress === null ? 'No linked task data' : `${complete} of ${linkedTasks.length} complete`}</span></div><div className="project-progress"><span style={{ width: `${progress ?? 0}%` }} /></div></div>
    <div className="project-card-footer"><span><Avatar name={lead?.name || 'Owner'} color={lead?.avatarColor} size="xs" />{lead?.name || 'Owner'}</span><time title={project.startDate}>{timeAgo(project.startDate)}</time><button className="project-open-link" onClick={onOpen}>Details <ArrowRight size={13} /></button></div>
  </article>;
}

function ProjectDetails({ project, data, onClose, onStatus }: { project: Project; data: Bootstrap; onClose: () => void; onStatus: (status: string) => void }) {
  const tasks = data.tasks.filter((task) => task.projectId === project.id);
  const lead = data.agents.find((agent) => agent.id === project.ownerId);
  return <div className="project-detail-drawer"><div className="task-detail-head"><span className="eyebrow">PROJECT OVERVIEW</span><button className="icon-button" aria-label="Close project details" onClick={onClose}>×</button></div><span className={`corporation-tag ${corporationClass(project.corporation)}`}>{project.corporation}</span><h2>{project.name}</h2><p className="project-detail-description">{project.description || 'No project description provided.'}</p><div className="project-detail-status"><span>Project status</span><select value={project.status} onChange={(event) => onStatus(event.target.value)}>{['Planning', 'In progress', 'Review', 'On hold', 'Completed', 'Cancelled'].map((status) => <option key={status}>{status}</option>)}</select></div><div className="project-detail-field"><span>Project lead</span><strong>{lead?.name || 'Owner'}</strong></div><div className="project-detail-field"><span>Department</span><strong>{project.department}</strong></div><div className="project-detail-field"><span>Target date</span><strong>{compactDate(project.targetDate)}</strong></div><div className="linked-task-list"><span className="inspector-label">LINKED TASKS · {tasks.length}</span>{tasks.length ? tasks.map((task) => <div key={task.id}><span className="linked-task-status"><CircleDot size={12} /></span><span><strong>{task.title}</strong><small>{task.assigneeName} · {task.status}</small></span></div>) : <p>No tasks are linked to this project yet.</p>}</div><div className="project-detail-footer"><span>Created in local workspace</span><span>{project.startDate ? compactDate(project.startDate) : '—'}</span></div></div>;
}
