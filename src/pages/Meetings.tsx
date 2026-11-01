import { useMemo, useState } from 'react';
import { CalendarClock, Check, Clock3, FileText, MessageSquareText, MicOff, Plus, Radio, Users, Video, Workflow } from 'lucide-react';
import { post, patch } from '../api';
import type { Agent, Bootstrap, Meeting } from '../types';
import { Avatar } from '../components/Avatar';
import { DemoNotice, EmptyState, InlineNotice, SectionHeading, StatusPill } from '../components/Ui';
import { Modal } from '../components/Modal';
import { compactDate, fullDate, timeAgo } from '../utils';

interface Props {
  data: Bootstrap;
  onRefresh: () => Promise<unknown>;
  notify: (message: string, tone?: 'success' | 'error' | 'info') => void;
}

const meetingTypes = ['Executive Board Meeting', 'Financial Review', 'Strategic Planning', 'Department Review', 'Project Review', 'Emergency Meeting', 'Cross-Company Meeting'];

export function MeetingsPage({ data, onRefresh, notify }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const meetings = useMemo(() => [...data.meetings].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)), [data.meetings]);
  const selectedMeeting = meetings.find((meeting) => meeting.id === selectedMeetingId);
  const inProgress = meetings.filter((meeting) => meeting.status === 'In Progress');
  const upcoming = meetings.filter((meeting) => meeting.status === 'Scheduled');
  const completed = meetings.filter((meeting) => meeting.status === 'Completed');

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const participantIds = Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[name="participantIds"]:checked')).map((input) => input.value);
    const topics = String(form.get('topics') || '').split('\n').map((value) => value.trim()).filter(Boolean);
    const payload = {
      title: String(form.get('title') || ''), type: String(form.get('type') || meetingTypes[0]),
      objective: String(form.get('objective') || ''), corporation: String(form.get('corporation') || 'Holding Headquarters'),
      scheduledAt: String(form.get('scheduledAt') || new Date().toISOString()), moderatorId: String(form.get('moderatorId') || 'ceo-holding'), participantIds, topics,
    };
    setSaving(true);
    try { const response = await post<{ meeting: Meeting }>('/meetings', payload); setShowCreate(false); setSelectedMeetingId(response.meeting.id); await onRefresh(); notify('Meeting scheduled.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Meeting could not be scheduled.', 'error'); }
    finally { setSaving(false); }
  };
  const start = async (meeting: Meeting) => {
    try { const result = await post<{ meeting: Meeting; aiFacilitationConfigured: boolean }>(`/meetings/${meeting.id}/start`, {}); setSelectedMeetingId(meeting.id); await onRefresh(); notify(result.aiFacilitationConfigured ? 'Meeting started. AI participation requires an explicit provider workflow.' : 'Meeting started for owner notes. AI facilitation and transcription are not configured.', 'info'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Meeting could not be started.', 'error'); }
  };
  const addNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMeeting || !note.trim()) return;
    setSaving(true);
    try { await post(`/meetings/${selectedMeeting.id}/notes`, { note: note.trim() }); setNote(''); await onRefresh(); notify('Meeting note added.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Meeting note could not be saved.', 'error'); }
    finally { setSaving(false); }
  };
  const finish = async (meeting: Meeting) => {
    if (!window.confirm('Mark this meeting as completed? Only owner-entered notes will be retained; no AI transcript is available.')) return;
    try { await patch(`/meetings/${meeting.id}/status`, { status: 'Completed' }); await onRefresh(); notify('Meeting marked complete.'); }
    catch (error) { notify(error instanceof Error ? error.message : 'Meeting status could not be updated.', 'error'); }
  };

  return <div className="meetings-page">
    <SectionHeading eyebrow="EXECUTIVE SESSIONS" title="Meeting Center" description="Plan a structured session, invite the right people, and capture owner-entered notes." action={<button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={15} /> Schedule meeting</button>} />
    <DemoNotice />
    <InlineNotice>AI facilitator, participant responses, transcription, and automated summaries are unavailable until an agent provider is configured. Meetings can still be scheduled and manually recorded.</InlineNotice>

    <section className="meeting-hero panel"><div className="meeting-hero-copy"><span className="eyebrow"><Radio size={13} /> LIVE SESSION STATUS</span><h2>Bring leadership into the room.</h2><p>Set an objective, define a discussion path, and leave with accountable follow-up.</p><button className="button button-primary" onClick={() => setShowCreate(true)}><Video size={15} /> Start a meeting <Plus size={13} /></button></div><div className="meeting-hero-stats"><div><span>{inProgress.length}</span><small>In progress</small></div><div><span>{upcoming.length}</span><small>Scheduled</small></div><div><span>{completed.length}</span><small>Completed</small></div></div><div className="meeting-hero-art"><div className="meeting-art-circle"><Users size={27} /></div><span className="meeting-art-line" /><span className="meeting-art-node node-one" /><span className="meeting-art-node node-two" /><span className="meeting-art-node node-three" /></div></section>

    <div className="meeting-columns">
      <section className="meeting-list-column"><div className="panel-heading meeting-list-heading"><div><span className="panel-eyebrow">UP NEXT</span><h3>Scheduled meetings <span className="panel-count">{upcoming.length}</span></h3></div><button className="text-action" onClick={() => setShowCreate(true)}>New session <Plus size={13} /></button></div>
        {!upcoming.length && <div className="panel meeting-empty"><EmptyState icon={<CalendarClock size={21} />} title="No upcoming meetings" detail="Schedule a session with an objective and clear participants." action={<button className="button button-quiet" onClick={() => setShowCreate(true)}><Plus size={14} /> Schedule one</button>} /></div>}
        <div className="meeting-card-list">{upcoming.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} data={data} selected={selectedMeetingId === meeting.id} onSelect={() => setSelectedMeetingId(meeting.id)} onStart={() => void start(meeting)} />)}</div>
        {completed.length > 0 && <><div className="completed-meeting-title"><span className="panel-eyebrow">PAST SESSIONS</span><span>{completed.length} completed</span></div><div className="meeting-card-list">{completed.slice(0, 3).map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} data={data} selected={selectedMeetingId === meeting.id} onSelect={() => setSelectedMeetingId(meeting.id)} />)}</div></>}
      </section>

      <section className="meeting-detail-column">
        {selectedMeeting ? <article className="panel meeting-detail-card">
          <div className="meeting-detail-top"><div><span className="eyebrow">{selectedMeeting.type.toUpperCase()}</span><h2>{selectedMeeting.title}</h2></div><StatusPill status={selectedMeeting.status} /></div>
          <div className="meeting-meta-grid"><div><CalendarClock size={14} /><span><small>Scheduled</small><strong>{fullDate(selectedMeeting.scheduledAt)}</strong></span></div><div><Users size={14} /><span><small>Participants</small><strong>{selectedMeeting.participantIds.length}</strong></span></div></div>
          <div className="meeting-objective"><span className="inspector-label">OBJECTIVE</span><p>{selectedMeeting.objective}</p></div>
          {selectedMeeting.topics.length > 0 && <div className="meeting-topic-section"><span className="inspector-label">DISCUSSION TOPICS</span><ol>{selectedMeeting.topics.map((topic, index) => <li key={`${topic}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span>{topic}</li>)}</ol></div>}
          <div className="meeting-attendees"><span className="inspector-label">INVITED ATTENDEES</span><div className="attendee-list">{selectedMeeting.participantIds.map((agentId) => { const agent = data.agents.find((item) => item.id === agentId); if (!agent) return null; return <button key={agent.id} onClick={() => undefined} title={`${agent.name} · ${agent.title}`}><Avatar name={agent.name} color={agent.avatarColor} size="xs" /></button>; })}<span>{selectedMeeting.participantIds.length} invited</span></div></div>
          {selectedMeeting.status === 'Scheduled' && <div className="meeting-start-note"><MicOff size={14} /> Starting opens an owner-led session. Agent participation is not configured.</div>}
          {selectedMeeting.status === 'Scheduled' && <button className="button button-primary button-full" onClick={() => void start(selectedMeeting)}><Video size={15} /> Start Meeting</button>}
          {selectedMeeting.status === 'In Progress' && <><div className="meeting-note-section"><div className="meeting-note-title"><span className="inspector-label">OWNER-ENTERED NOTES</span><span><Check size={12} /> Saved to the audit log</span></div>{selectedMeeting.notes.length ? <ul>{selectedMeeting.notes.map((entry, index) => <li key={`${entry}-${index}`}><FileText size={13} /><span>{entry}</span></li>)}</ul> : <p className="inspector-empty">No notes captured yet.</p>}<form onSubmit={(event) => void addNote(event)}><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Capture a decision, owner, or follow-up…" /><button className="button button-primary button-sm" disabled={!note.trim() || saving}>{saving ? <span className="button-spinner" /> : <Plus size={13} />} Add note</button></form></div><button className="button button-quiet button-full" onClick={() => void finish(selectedMeeting)}><Check size={14} /> Complete meeting</button></>}
          {selectedMeeting.status === 'Completed' && <div className="meeting-completed-note"><Check size={14} /> Completed · {selectedMeeting.notes.length} manually captured notes</div>}
        </article> : <div className="panel meeting-detail-empty"><EmptyState icon={<MessageSquareText size={22} />} title="Meeting details" detail="Select an upcoming session to review its objective, attendees, and action notes." /></div>}
        {inProgress.length > 0 && !selectedMeeting && <div className="meeting-live-indicator"><span className="recording-dot" /> {inProgress.length} session{inProgress.length > 1 ? 's' : ''} in progress</div>}
        <div className="meeting-type-chips"><span>SESSION TYPES</span>{meetingTypes.slice(0, 5).map((type) => <span key={type}>{type}</span>)}</div>
      </section>
    </div>
    {showCreate && <CreateMeetingModal data={data} saving={saving} onClose={() => setShowCreate(false)} onSubmit={(event) => void create(event)} />}
  </div>;
}

function MeetingCard({ meeting, data, selected, onSelect, onStart }: { meeting: Meeting; data: Bootstrap; selected: boolean; onSelect: () => void; onStart?: () => void }) {
  const moderator = data.agents.find((agent) => agent.id === meeting.moderatorId);
  return <article className={`meeting-card ${selected ? 'selected' : ''}`}><button className="meeting-card-main" onClick={onSelect}>
    <span className="meeting-date-block"><strong>{new Date(meeting.scheduledAt).getDate()}</strong><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(meeting.scheduledAt))}</small></span>
    <span className="meeting-card-copy"><span className="meeting-card-type">{meeting.type}</span><strong>{meeting.title}</strong><small>{timeAgo(meeting.scheduledAt)} · {meeting.participantIds.length} invited</small><span className="meeting-card-moderator"><Avatar name={moderator?.name || 'Owner'} color={moderator?.avatarColor} size="xs" /> Moderator: {moderator?.name || 'Owner'}</span></span>
    <span className="meeting-card-chevron"><ChevronRightIcon /></span>
  </button>{onStart && <button className="meeting-card-start" onClick={onStart}><Video size={13} /> Start</button>}</article>;
}

function ChevronRightIcon() { return <span className="chevron-icon">›</span>; }

function CreateMeetingModal({ data, saving, onClose, onSubmit }: { data: Bootstrap; saving: boolean; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const executives = data.agents.filter((agent) => agent.isExecutive);
  const managers = data.agents.filter((agent) => agent.level === 'Department Manager' || agent.isExecutive);
  return <Modal title="Schedule an executive session" description="Define the objective, participants, and discussion path." onClose={onClose} wide>
    <form className="modal-form meeting-create-form" onSubmit={onSubmit}>
      <div className="meeting-form-grid"><label className="field-label">Meeting title<input name="title" required maxLength={180} placeholder="e.g. Cross-company operating review" /></label><label className="field-label">Meeting type<select name="type">{meetingTypes.map((type) => <option key={type}>{type}</option>)}</select></label></div>
      <div className="meeting-form-grid"><label className="field-label">Corporation<select name="corporation"><option>Holding Headquarters</option><option>Trading Corporation</option><option>Development Corporation</option><option>Marketing Corporation</option></select></label><label className="field-label">Scheduled for<input name="scheduledAt" type="datetime-local" defaultValue={new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)} /></label></div>
      <label className="field-label">Meeting objective<textarea name="objective" required rows={3} maxLength={1500} placeholder="What should participants accomplish?" /></label>
      <label className="field-label">Discussion topics <small>One topic per line</small><textarea name="topics" rows={2} placeholder={'Current state\nDecisions required\nNext steps'} /></label>
      <div className="meeting-form-grid"><label className="field-label">Moderator<select name="moderatorId">{executives.map((agent) => <option value={agent.id} key={agent.id}>{agent.name} · {agent.title}</option>)}</select></label><div className="field-label participant-picker-label">Invite participants <small>Select any number</small><div className="participant-picker">{managers.map((agent) => <label key={agent.id}><input type="checkbox" name="participantIds" value={agent.id} /><Avatar name={agent.name} color={agent.avatarColor} size="xs" /><span>{agent.name}<small>{agent.title}</small></span></label>)}</div></div></div>
      <div className="form-note"><MicOff size={14} /> Live AI participation and recording are disabled until an agent provider and transcription service are configured.</div>
      <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? <span className="button-spinner" /> : <CalendarClock size={15} />} Schedule meeting</button></div>
    </form>
  </Modal>;
}
