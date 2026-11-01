import { useMemo, useState } from 'react';
import { ArrowDownUp, ArrowRight, CalendarDays, Check, CheckCheck, ChevronDown, CirclePlus, Clock3, Filter, List, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { patch, post } from '../api';
import type { Agent, Bootstrap, PageId, Priority, Task, TaskStatus } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { compactDate, corporationClass, shortCorporation, timeAgo } from '../utils';

interface Props { data: Bootstrap; page: PageId; onRefresh: () => Promise<unknown>; notify: (message: string, tone?: 'success' | 'error' | 'info') => void }
type View = 'Board' | 'List' | 'Timeline';
const allStatuses: TaskStatus[] = ['Backlog', 'Assigned', 'In Progress', 'Under Review', 'Blocked', 'Awaiting Approval', 'Completed', 'Cancelled'];
const columns: { title: string; statuses: TaskStatus[]; color: string }[] = [
  { title: 'Backlog & Assigned', statuses: ['Backlog', 'Assigned'], color: 'slate' },
  { title: 'In Progress', statuses: ['In Progress'], color: 'blue' },
  { title: 'Review & Approval', statuses: ['Under Review', 'Awaiting Approval'], color: 'violet' },
  { title: 'Blocked', statuses: ['Blocked'], color: 'red' },
  { title: 'Completed', statuses: ['Completed', 'Cancelled'], color: 'green' },
];

export function TasksPage({ data, page, onRefresh, notify }: Props) {
  const [view, setView] = useState<View>('Board');
  const [query, setQuery] = useState('');
  const [corporation, setCorporation] = useState('All corporations');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [saving, setSaving] = useState(false);
  const isMyTasks = page === 'my-tasks';

  const tasks = useMemo(() => data.tasks.filter((task) => {
    if (isMyTasks && task.assigneeId !== 'owner' && task.status !== 'Awaiting Approval') return false;
    if (corporation !== 'All corporations' && task.corporation !== corporation) return false;
    if (statusFilter !== 'All statuses' && task.status !== statusFilter) return false;
    const search = query.trim().toLowerCase();
    return !search || `${task.title} ${task.description} ${task.assigneeName} ${task.department}`.toLowerCase().includes(search);
  }).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')), [data.tasks, isMyTasks, corporation, statusFilter, query]);
  const completedCount = tasks.filter((task) => task.status === 'Completed').length;
  const blockedCount = tasks.filter((task) => task.status === 'Blocked').length;
  const reviewCount = tasks.filter((task) => ['Under Review', 'Awaiting Approval'].includes(task.status)).length;
  const selectedTask = data.tasks.find((task) => task.id === selectedTaskId);

  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    try { await patch(`/tasks/${task.id}`, { status }); await onRefresh(); notify(`Task moved to ${status}.`); }
    catch (error) { notify(error instanceof Error ? error.message : 'Task status could not be updated.', 'error'); }
  };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setSaving(true);
    try { const result = await post<{ task: Task }>('/tasks', payload); setCreateOpen(false); setSelectedTaskId(result.task.id); await onRefresh(); notify('Task created and persisted.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Task could not be created.', 'error'); }
    finally { setSaving(false); }
  };

  return <div className="tasks-page">
    <SectionHeading eyebrow={isMyTasks ? 'PERSONAL WORKSPACE' : 'DELIVERY OPERATIONS'} title={isMyTasks ? 'My Tasks' : 'Task Management'} description={isMyTasks ? 'Work requiring owner review or your direct assignment.' : 'Assign, track, and review work across the three corporations.'} action={<button className="button button-primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create task</button>} />
    <DemoNotice />
    <div className="task-metrics"><div><span className="task-metric-icon metric-blue"><List size={15} /></span><span><strong>{tasks.length}</strong><small>{isMyTasks ? 'In my view' : 'Tasks shown'}</small></span></div><div><span className="task-metric-icon metric-violet"><Clock3 size={15} /></span><span><strong>{reviewCount}</strong><small>Under review</small></span></div><div><span className="task-metric-icon metric-red"><Filter size={15} /></span><span><strong>{blockedCount}</strong><small>Blocked</small></span></div><div><span className="task-metric-icon metric-green"><CheckCheck size={15} /></span><span><strong>{completedCount}</strong><small>Completed</small></span></div><div className="task-metrics-note">Derived from task records only · seeded sample data</div></div>

    <div className="task-toolbar"><div className="task-view-toggle">{(['Board', 'List', 'Timeline'] as View[]).map((item) => <button key={item} className={view === item ? 'selected' : ''} onClick={() => setView(item)}>{item === 'Board' ? <SlidersHorizontal size={14} /> : item === 'List' ? <List size={14} /> : <CalendarDays size={14} />}{item}</button>)}</div><div className="task-filters"><label className="task-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label><label className="select-filter"><span>Company</span><select value={corporation} onChange={(event) => setCorporation(event.target.value)}><option>All corporations</option><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="select-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{allStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div></div>

    {!tasks.length ? <div className="task-empty panel"><EmptyState icon={<CheckCheck size={22} />} title="No tasks match this view" detail={isMyTasks ? 'Tasks assigned to the owner or awaiting an owner decision will appear here.' : 'Create a task or adjust the filters to explore the sample workflow.'} action={!isMyTasks ? <button className="button button-quiet" onClick={() => setCreateOpen(true)}><Plus size={14} /> Create a task</button> : undefined} /></div> : view === 'Board' ? <div className="kanban-board">{columns.map((column) => {
      const columnTasks = tasks.filter((task) => column.statuses.includes(task.status));
      return <section key={column.title} className={`kanban-column kanban-${column.color}`}><div className="kanban-column-head"><span className="kanban-color-dot" /><h3>{column.title}</h3><b>{columnTasks.length}</b><button className="icon-button" onClick={() => setCreateOpen(true)} aria-label={`Add task to ${column.title}`}><Plus size={14} /></button></div><div className="kanban-cards">{columnTasks.map((task) => <TaskCard key={task.id} task={task} data={data} onSelect={() => setSelectedTaskId(task.id)} onStatus={(status) => void changeStatus(task, status)} />)}{!columnTasks.length && <div className="kanban-empty">No tasks in this lane</div>}</div></section>;
    })}</div> : view === 'List' ? <TaskList tasks={tasks} data={data} onSelect={setSelectedTaskId} onStatus={changeStatus} /> : <TimelineView tasks={tasks} data={data} onSelect={setSelectedTaskId} />}

    {selectedTask && <TaskDetails task={selectedTask} data={data} onClose={() => setSelectedTaskId('')} onStatus={(status) => void changeStatus(selectedTask, status)} />}
    {createOpen && <CreateTaskModal data={data} saving={saving} onClose={() => setCreateOpen(false)} onSubmit={(event) => void create(event)} />}
  </div>;
}

function TaskCard({ task, data, onSelect, onStatus }: { task: Task; data: Bootstrap; onSelect: () => void; onStatus: (status: TaskStatus) => void }) {
  const assignee = data.agents.find((agent) => agent.id === task.assigneeId);
  const next = task.status === 'Backlog' ? 'Assigned' : task.status === 'Assigned' ? 'In Progress' : task.status === 'In Progress' ? 'Under Review' : task.status === 'Under Review' ? 'Completed' : null;
  return <article className="kanban-card"><button className="kanban-card-main" onClick={onSelect}><div className="kanban-card-labels"><span className={`corporation-tag ${corporationClass(task.corporation)}`}>{shortCorporation(task.corporation)}</span><span className={`priority-tag priority-${task.priority.toLowerCase()}`}>{task.priority}</span></div><strong>{task.title}</strong><p>{task.description}</p><div className="kanban-card-meta"><span><CalendarDays size={12} /> {compactDate(task.dueDate)}</span>{task.projectId && <span className="task-project-tag">{data.projects.find((project) => project.id === task.projectId)?.name}</span>}</div></button><div className="kanban-card-footer"><span className="task-assignee"><Avatar name={assignee?.name || task.assigneeName} color={assignee?.avatarColor} size="xs" />{task.assigneeName}</span><div className="task-quick-status">{next ? <button title={`Move to ${next}`} onClick={() => onStatus(next)}><ArrowRight size={13} /> {next}</button> : <StatusPill status={task.status} />}</div></div></article>;
}

function TaskList({ tasks, data, onSelect, onStatus }: { tasks: Task[]; data: Bootstrap; onSelect: (id: string) => void; onStatus: (task: Task, status: TaskStatus) => void }) {
  return <div className="panel task-list-panel"><div className="task-list-head"><span>Task</span><span>Company</span><span>Assignee</span><span>Priority</span><span>Due</span><span>Status</span></div>{tasks.map((task) => <div className="task-list-row" key={task.id}><button className="task-list-title" onClick={() => onSelect(task.id)}><strong>{task.title}</strong><small>{task.department}</small></button><span><span className={`corporation-tag ${corporationClass(task.corporation)}`}>{shortCorporation(task.corporation)}</span></span><span className="task-list-assignee"><Avatar name={data.agents.find((agent) => agent.id === task.assigneeId)?.name || task.assigneeName} size="xs" color={data.agents.find((agent) => agent.id === task.assigneeId)?.avatarColor} />{task.assigneeName}</span><span className={`priority-tag priority-${task.priority.toLowerCase()}`}>{task.priority}</span><span className="task-list-due">{compactDate(task.dueDate)}</span><select className="task-status-select" value={task.status} onChange={(event) => void onStatus(task, event.target.value as TaskStatus)}>{allStatuses.map((status) => <option key={status}>{status}</option>)}</select></div>)}</div>;
}

function TimelineView({ tasks, data, onSelect }: { tasks: Task[]; data: Bootstrap; onSelect: (id: string) => void }) {
  const today = new Date();
  const range = Array.from({ length: 14 }, (_, index) => { const date = new Date(today); date.setDate(today.getDate() + index); return date; });
  return <div className="panel timeline-panel"><div className="timeline-head"><span>Task / owner</span><div className="timeline-days">{range.map((date) => <div key={date.toISOString()} className={date.toDateString() === today.toDateString() ? 'timeline-today' : ''}><small>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date)}</small><b>{date.getDate()}</b></div>)}</div></div>{tasks.map((task) => { const due = task.dueDate ? new Date(task.dueDate) : null; const diff = due ? Math.round((due.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000) : -1; const left = diff >= 0 && diff < 14 ? (diff / 14) * 100 : 0; return <button className="timeline-row" key={task.id} onClick={() => onSelect(task.id)}><span className="timeline-task-name"><strong>{task.title}</strong><small>{task.assigneeName}</small></span><span className="timeline-track"><span className="timeline-gridlines">{range.map((date) => <i key={date.toISOString()} />)}</span>{diff >= 0 && diff < 14 ? <span className={`timeline-bar ${corporationClass(task.corporation)}`} style={{ left: `${left}%`, width: `${Math.max(3, 100 / 14)}%` }} title={`Due ${compactDate(task.dueDate)}`} /> : <span className="timeline-no-date">{task.dueDate ? compactDate(task.dueDate) : 'No due date'}</span>}</span><span className="timeline-status"><StatusPill status={task.status} /></span></button>; })}</div>;
}

function TaskDetails({ task, data, onClose, onStatus }: { task: Task; data: Bootstrap; onClose: () => void; onStatus: (status: TaskStatus) => void }) {
  const assignee = data.agents.find((agent) => agent.id === task.assigneeId);
  const project = data.projects.find((item) => item.id === task.projectId);
  return <div className="task-detail-drawer"><div className="task-detail-head"><span className="eyebrow">TASK DETAILS</span><button className="icon-button" onClick={onClose} aria-label="Close task details">×</button></div><div className="task-detail-tags"><span className={`corporation-tag ${corporationClass(task.corporation)}`}>{task.corporation}</span><span className={`priority-tag priority-${task.priority.toLowerCase()}`}>{task.priority} priority</span></div><h2>{task.title}</h2><div className="task-detail-status"><span>Status</span><select value={task.status} onChange={(event) => onStatus(event.target.value as TaskStatus)}>{allStatuses.map((status) => <option key={status}>{status}</option>)}</select></div><div className="task-detail-description"><span className="inspector-label">DESCRIPTION</span><p>{task.description || 'No description provided.'}</p></div><div className="task-detail-field"><span>Assignee</span><div><Avatar name={assignee?.name || task.assigneeName} color={assignee?.avatarColor} size="xs" />{task.assigneeName}</div></div><div className="task-detail-field"><span>Department</span><strong>{task.department}</strong></div><div className="task-detail-field"><span>Due date</span><strong>{compactDate(task.dueDate)}</strong></div><div className="task-detail-field"><span>Project</span><strong>{project?.name || 'No linked project'}</strong></div>{task.sourceMessageId && <div className="task-source-note"><Check size={13} /> Created from a conversation message</div>}<div className="task-detail-footer"><span>Updated {timeAgo(task.updatedAt)} ago</span><span>Created {compactDate(task.createdAt)}</span></div></div>;
}

function CreateTaskModal({ data, saving, onClose, onSubmit }: { data: Bootstrap; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  return <Modal title="Create a task" description="Assign work and capture enough context for a clear follow-up." onClose={onClose} wide><form className="modal-form" onSubmit={onSubmit}>
    <label className="field-label">Task title<input name="title" maxLength={180} required placeholder="What needs to be done?" /></label>
    <label className="field-label">Description<textarea name="description" rows={3} maxLength={3000} placeholder="Add scope, context, and expected deliverable…" /></label>
    <div className="form-grid-2"><label className="field-label">Assign to<select name="assigneeId"><option value="">Unassigned</option>{data.agents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.title}</option>)}</select></label><label className="field-label">Priority<select name="priority"><option>Normal</option><option>Low</option><option>High</option><option>Critical</option></select></label></div>
    <div className="form-grid-2"><label className="field-label">Corporation<select name="corporation"><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="field-label">Due date<input name="dueDate" type="date" /></label></div>
    <label className="field-label">Link project<select name="projectId"><option value="">No linked project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? <span className="button-spinner" /> : <CirclePlus size={15} />} Create task</button></div>
  </form></Modal>;
}
