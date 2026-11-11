import React, { useCallback, useEffect, useRef, useState } from 'react';
import { post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';
import { InstitutionPages, institutionTypes } from './Institutions.jsx';
import Academics from './Academics.jsx';
import InstitutionDashboard from './InstitutionDashboard.jsx';
import { StaffDirectory, StaffProfileDialog, Students } from './InstitutionPeople.jsx';
import Modal from './ui/Modal.jsx';
import Icon from './ui/Icon.jsx';
import brandMark from './assets/exam-studio-mark.svg';
import './theme/institution.css';

export const institutionRoles = { admin: 'Institution administrator', teacher: 'Teacher', member: 'Member' };
const memberStatus = { invited: 'Invited', active: 'Active', suspended: 'Suspended', removed: 'Removed' };
const scoped = (institutionId) => ({ headers: { 'X-Institution-Id': institutionId } });

export function WorkspacePicker({ workspaces, selected = '', onChange }) {
  return (
    <label className="institution-picker">
      <span>Workspace</span>
      <select value={selected} onChange={(event) => onChange(event.target.value)}>
        <option value="">Personal workspace</option>
        {selected && !workspaces.some(({ id }) => id === selected) && <option value={selected}>Institution workspace</option>}
        {workspaces.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  );
}

export function JoinInstitution({ onClose, onJoined }) {
  const action = useAdminAction();
  async function submit(event) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get('code');
    if (await action.run(() => post('/institutions/invitations/accept', { code }))) onJoined();
  }
  return (
    <Modal title="Join an institution" onClose={onClose}>
      <p>Enter the invitation code shared by your institution administrator.</p>
      <form className="admin-form" onSubmit={submit}>
        <label>Invitation code<input name="code" autoComplete="off" spellCheck={false} required maxLength={60} /></label>
        <Feedback feedback={action.feedback} />
        <div className="admin-actions">
          <button type="submit" className="primary" disabled={action.pending}>Join institution</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function InviteMember({ institutionId, defaultRole, onClose, onSaved }) {
  const action = useAdminAction();
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (await action.run(async () => {
      setResult(await post('/institutions/members/invitations', fields, scoped(institutionId)));
    })) onSaved();
  }
  return (
    <Modal title="Invite a member" onClose={onClose}>
      {result ? (
        <div className="admin-form">
          <p>Share this one-time code privately with the invited account. It expires {timestamp(result.expiresAt)}.</p>
          <label>Invitation code<input readOnly value={result.code} onFocus={(event) => event.target.select()} /></label>
          <div className="admin-actions">
            {navigator.clipboard && <button type="button" onClick={() => navigator.clipboard.writeText(result.code).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy code'}</button>}
            <button type="button" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <form className="admin-form" onSubmit={submit}>
          <p>The recipient needs an existing Exam Studio account.</p>
          <label>Account email<input name="email" type="email" required maxLength={254} /></label>
          <label>Institution role<select name="role" defaultValue={defaultRole}><option value="member">Member</option><option value="teacher">Teacher</option></select></label>
          <Feedback feedback={action.feedback} />
          <div className="admin-actions">
            <button type="submit" className="primary" disabled={action.pending}>Create invitation</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function EditMember({ institutionId, member, onClose, onSaved }) {
  const action = useAdminAction();
  const invited = member.status === 'invited';
  async function submit(event) {
    event.preventDefault();
    const fields = invited ? { status: 'removed' } : Object.fromEntries(new FormData(event.currentTarget));
    if (await action.run(() => put(`/institutions/members/${member.id}`, fields, scoped(institutionId)))) onSaved();
  }
  return (
    <Modal title={invited ? 'Revoke invitation' : 'Manage member'} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <p>{member.name}</p>
        {!invited && <div className="admin-form-grid">
          <label>Institution role<select name="role" defaultValue={member.role}><option value="member">Member</option><option value="teacher">Teacher</option></select></label>
          <label>Membership status<select name="status" defaultValue={member.status}>
            <option value="active">Active</option><option value="suspended">Suspended</option><option value="removed">Removed</option>
          </select></label>
        </div>}
        <Feedback feedback={action.feedback} />
        <div className="admin-actions">
          <button type="submit" className="primary" disabled={action.pending}>{invited ? 'Revoke invitation' : 'Save membership'}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function Directory({ institutionId, isAdmin, onChanged, onScopeLost, initialInvite, inviteRole = 'member' }) {
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(initialInvite);
  const [editing, setEditing] = useState(null);
  const [staffProfile, setStaffProfile] = useState(null);
  const query = useAdminQuery(`/institutions/members?page=${page}`, institutionId, undefined, onScopeLost);
  function refresh() {
    query.reload();
    onChanged();
  }
  return (
    <section className="admin-panel">
      <div className="admin-section-line">
        <h2>Member directory</h2>
        {isAdmin && <button type="button" className="primary" onClick={() => setInviting(true)}>Invite a member</button>}
      </div>
      <LoadState query={query} name="member directory">
        {query.data?.items.length ? <ul className="institution-status-list">
          {query.data.items.map((member) => (
            <li key={member.id}>
              <div><strong>{member.name}</strong><small>{institutionRoles[member.role]}{member.email ? ` · ${member.email}` : ''}</small></div>
              <div className="admin-actions">
                <span className={`admin-badge${member.status === 'active' ? ' is-ok' : ''}`}>
                  {member.status === 'invited' && Date.parse(member.inviteExpiresAt) <= Date.now() ? 'Expired invitation' : memberStatus[member.status]}
                </span>
                {isAdmin && member.role !== 'admin' && <button type="button" onClick={() => setEditing(member)}>
                  {member.status === 'invited' ? 'Revoke invitation' : 'Manage'}
                </button>}
                {isAdmin && member.status !== 'invited' && <button type="button" aria-label={`Staff profile for ${member.name}`}
                  onClick={() => setStaffProfile(member)}>Staff profile</button>}
              </div>
            </li>
          ))}
        </ul> : <EmptyRows>No members to show.</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
      </LoadState>
      {inviting && <InviteMember institutionId={institutionId} defaultRole={inviteRole} onClose={() => setInviting(false)} onSaved={refresh} />}
      {editing && <EditMember institutionId={institutionId} member={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }} />}
      {staffProfile && <StaffProfileDialog institutionId={institutionId} member={staffProfile}
        onClose={() => setStaffProfile(null)} onSaved={() => { setStaffProfile(null); refresh(); }} />}
    </section>
  );
}

export default function InstitutionWorkspace({ institutionId, workspaces, onSwitch, onAccessHub, onSignOut, theme, toggleTheme }) {
  const [view, setView] = useState('overview');
  const [academic, setAcademic] = useState({ kind: 'years', create: false });
  const [studentList, setStudentList] = useState({ classId: '', create: false });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileToggle = useRef(null);
  const mobileClose = useRef(null);
  useEffect(() => { if (mobileOpen) mobileClose.current?.focus(); }, [mobileOpen]);
  const [scopeLost, setScopeLost] = useState(false);
  const onScopeLost = useCallback(() => setScopeLost(true), []);
  const overview = useAdminQuery(scopeLost ? null : '/institutions/workspace/overview', institutionId, undefined, onScopeLost);
  const workspace = overview.error ? null : overview.data;
  const directory = ['directory', 'invite', 'invite-teacher'].includes(view);
  const isAdmin = workspace?.role === 'admin';
  const isStaff = isAdmin || workspace?.role === 'teacher';

  function open(next) {
    setView(next);
    if (mobileOpen) mobileToggle.current?.focus();
    setMobileOpen(false);
  }

  function closeMenu() {
    setMobileOpen(false);
    mobileToggle.current?.focus();
  }

  function openAcademics(kind, create = false) {
    setAcademic({ kind, create });
    open('academics');
  }

  function openStudents(classId = '', create = false) {
    setStudentList({ classId, create });
    open('students');
  }

  function nav(label, icon, active, onClick) {
    return <button type="button" title={label} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon name={icon} /><span>{label}</span>
    </button>;
  }

  if (scopeLost) return (
    <main className="admin-access">
      <section className="admin-panel" aria-labelledby="workspace-unavailable">
        <h1 id="workspace-unavailable">Workspace access is unavailable</h1>
        <p role="alert">Your access may have changed. Return to Institution Access to refresh your workspaces.</p>
        <div className="admin-actions">
          <button type="button" className="primary" onClick={onAccessHub}>Back to Institution Access</button>
          <button type="button" onClick={() => onSwitch('')}>Continue to Personal Workspace</button>
        </div>
      </section>
    </main>
  );

  return (
    <div className={`admin-shell institution-shell${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
      onKeyDown={(event) => { if (mobileOpen && event.key === 'Escape') closeMenu(); }}>
      {mobileOpen && <button type="button" tabIndex={-1} className="institution-nav-scrim" aria-label="Dismiss institution navigation" onClick={closeMenu} />}
      <aside className="admin-sidebar institution-sidebar" id="institution-sidebar">
        <div className="admin-sidebar-head">
          <div className="admin-brand"><img src={brandMark} alt="" width="40" height="40" /><div><strong>Exam Studio</strong><small>Institution workspace</small></div></div>
          <button type="button" className="institution-nav-toggle institution-nav-mobile" ref={mobileClose}
            aria-label="Close institution navigation" onClick={closeMenu}><Icon name="close" /></button>
        </div>
        <nav className="admin-nav institution-workspace-nav" aria-label="Institution navigation">
          {workspace && <>
            <p>Workspace</p>
            {nav('Dashboard', 'dashboard', view === 'overview', () => open('overview'))}
            {isStaff && <>
              <p>Academic management</p>
              {nav('Academic calendar', 'clock', view === 'academics' && ['years', 'terms'].includes(academic.kind), () => openAcademics('years'))}
              {nav('Classes', 'modules', view === 'academics' && ['classes', 'sections'].includes(academic.kind), () => openAcademics('classes'))}
              {nav('Subjects', 'book', view === 'academics' && ['subjects', 'assignments'].includes(academic.kind), () => openAcademics('subjects'))}
            </>}
            <p>People</p>
            {isStaff && nav('Students', 'user', view === 'students', () => openStudents())}
            {isStaff && nav('Teachers', 'book', view === 'teachers', () => open('teachers'))}
            {isAdmin && nav('Staff', 'institution', view === 'staff', () => open('staff'))}
            {nav('Member directory', 'clipboard', view === 'directory', () => open('directory'))}
            {isAdmin && nav('Invitations', 'tokens', view.startsWith('invite'), () => open('invite'))}
          </>}
          <p>Account</p>
          {nav('Institution Access', 'institution', false, onAccessHub)}
          {nav('Sign out', 'sign-out', false, onSignOut)}
        </nav>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar institution-topbar">
          <button type="button" className="institution-nav-toggle institution-nav-desktop" aria-label="Toggle institution navigation"
            aria-controls="institution-sidebar" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><Icon name="menu" /></button>
          <button type="button" className="institution-nav-toggle institution-nav-mobile" ref={mobileToggle} aria-label="Toggle institution navigation"
            aria-controls="institution-sidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><Icon name="menu" /></button>
          <span className="admin-topbar-label"><Icon name="institution" /> Institution workspace</span>
          <WorkspacePicker workspaces={workspaces} selected={institutionId} onChange={onSwitch} />
          <button type="button" className="institution-nav-toggle" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
        </header>
        <main className="admin-main-content institution-workspace-main">
          <header className="admin-page-title institution-hero">
            <div className="institution-identity">
              <div className="institution-emblem" aria-hidden="true">
                {workspace ? workspace.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase()
                  : <Icon name="institution" size={28} />}
              </div>
              <div><p className="admin-kicker">Institution workspace</p><h1>{workspace?.name || 'Institution workspace'}</h1>
                {workspace && <p>{[institutionTypes[workspace.type], workspace.location, workspace.country].filter(Boolean).join(' · ')}</p>}
              </div>
            </div>
            {workspace && <div className="institution-hero-meta">
              <span className="admin-badge is-ok">{institutionRoles[workspace.role]}</span>
              <dl><div><dt>Academic year</dt><dd>{workspace.academicYear || 'No active year'}</dd></div>
                <div><dt>Current term</dt><dd>{workspace.academicTerm || 'No active term'}</dd></div></dl>
            </div>}
          </header>
          <LoadState query={overview} name="institution workspace">
            {workspace && view === 'overview' && <InstitutionDashboard workspace={workspace} openDirectory={() => open('directory')}
              openInvite={() => open('invite-teacher')} openAcademics={openAcademics} openStudents={openStudents} />}
            {workspace && directory && <Directory key={view} institutionId={institutionId} isAdmin={isAdmin}
              initialInvite={view !== 'directory'} inviteRole={view === 'invite-teacher' ? 'teacher' : 'member'}
              onChanged={overview.reload} onScopeLost={onScopeLost} />}
            {isStaff && view === 'academics' && <Academics key={`${academic.kind}:${academic.create}`} institutionId={institutionId} isAdmin={isAdmin}
              kind={academic.kind} onKindChange={openAcademics} initialCreate={academic.create} enrollment={workspace.dashboard.enrollment} openRoster={openStudents}
              onChanged={overview.reload} onScopeLost={onScopeLost} />}
            {isStaff && view === 'students' && <Students key={`${studentList.classId}:${studentList.create}`} institutionId={institutionId}
              isAdmin={isAdmin} initialClass={studentList.classId} startAdding={studentList.create}
              onChanged={overview.reload} onScopeLost={onScopeLost} />}
            {((isStaff && view === 'teachers') || (isAdmin && view === 'staff')) && <StaffDirectory key={view} institutionId={institutionId}
              kind={view} isAdmin={isAdmin} onInvite={() => open('invite-teacher')} onMemberships={() => open('directory')}
              onAssignments={() => openAcademics('assignments')} onScopeLost={onScopeLost} />}
          </LoadState>
        </main>
      </div>
    </div>
  );
}
