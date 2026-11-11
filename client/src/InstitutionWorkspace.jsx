import React, { useCallback, useState } from 'react';
import { post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';
import { InstitutionPages, institutionTypes } from './Institutions.jsx';
import Academics from './Academics.jsx';
import Modal from './ui/Modal.jsx';
import Icon from './ui/Icon.jsx';
import brandMark from './assets/exam-studio-mark.svg';

export const institutionRoles = { admin: 'Institution administrator', teacher: 'Teacher', member: 'Member' };
const roleTotals = { admin: 'Administrators', teacher: 'Teachers', member: 'Members' };
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

function InviteMember({ institutionId, onClose, onSaved }) {
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
          <label>Institution role<select name="role" defaultValue="member"><option value="member">Member</option><option value="teacher">Teacher</option></select></label>
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

function Directory({ institutionId, isAdmin, onChanged, onScopeLost, initialInvite }) {
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(initialInvite);
  const [editing, setEditing] = useState(null);
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
              </div>
            </li>
          ))}
        </ul> : <EmptyRows>No members to show.</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
      </LoadState>
      {inviting && <InviteMember institutionId={institutionId} onClose={() => setInviting(false)} onSaved={refresh} />}
      {editing && <EditMember institutionId={institutionId} member={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }} />}
    </section>
  );
}

function Overview({ workspace, openDirectory, openInvite, openAcademics }) {
  const isAdmin = workspace.role === 'admin';
  return (
    <div className="admin-stack">
      <section className="admin-panel">
        <h2>Academic calendar</h2>
        <dl className="admin-key-values">
          <div><dt>Academic year</dt><dd>{workspace.academicYear || 'No active academic year'}</dd></div>
          <div><dt>Current term</dt><dd>{workspace.academicTerm || 'No active term'}</dd></div>
        </dl>
      </section>
      <dl className="admin-metric-grid">
        {Object.entries(workspace.counts).map(([role, count]) => (
          <div className="admin-metric" key={role}><div><dt>{roleTotals[role]}</dt><dd>{count}</dd><small>Active memberships</small></div></div>
        ))}
      </dl>
      <section className="admin-panel">
        <h2>{isAdmin ? 'Get your institution ready' : 'Welcome to your institution'}</h2>
        <div className="admin-actions">
          <button type="button" onClick={openDirectory}>{isAdmin ? 'Manage members' : 'View member directory'}</button>
          {isAdmin && <>
            <button type="button" onClick={openInvite}>Invite a member</button>
            <button type="button" onClick={() => openAcademics('years')}>Set up academic year</button>
            <button type="button" onClick={() => openAcademics('classes')}>Manage classes</button>
          </>}
          {workspace.role === 'teacher' && <button type="button" onClick={() => openAcademics('years')}>View academics</button>}
        </div>
      </section>
    </div>
  );
}

export default function InstitutionWorkspace({ institutionId, workspaces, onSwitch, onAccessHub, onSignOut }) {
  const [view, setView] = useState('overview');
  const [academicKind, setAcademicKind] = useState('years');
  const [scopeLost, setScopeLost] = useState(false);
  const onScopeLost = useCallback(() => setScopeLost(true), []);
  const overview = useAdminQuery(scopeLost ? null : '/institutions/workspace/overview', institutionId, undefined, onScopeLost);
  const workspace = overview.error ? null : overview.data;
  const directory = view === 'directory' || view === 'invite';

  function openAcademics(kind) {
    setAcademicKind(kind);
    setView('academics');
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
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head">
          <div className="admin-brand"><img src={brandMark} alt="" width="40" height="40" /><div><strong>Exam Studio</strong><small>Institution workspace</small></div></div>
        </div>
        <WorkspacePicker workspaces={workspaces} selected={institutionId} onChange={onSwitch} />
        <nav className="admin-nav institution-workspace-nav" aria-label="Institution navigation">
          {workspace && <>
          <button type="button" aria-current={view === 'overview' ? 'page' : undefined} onClick={() => setView('overview')}><Icon name="dashboard" /> Overview</button>
          <button type="button" aria-current={directory ? 'page' : undefined} onClick={() => setView('directory')}><Icon name="user" /> Member directory</button>
          {workspace.role !== 'member' && <button type="button" aria-current={view === 'academics' ? 'page' : undefined} onClick={() => openAcademics('years')}><Icon name="book" /> Academics</button>}
          </>}
          <button type="button" onClick={onAccessHub}><Icon name="institution" /> Institution Access</button>
          <button type="button" onClick={onSignOut}><Icon name="sign-out" /> Sign out</button>
        </nav>
      </aside>
      <main className="admin-main-content institution-workspace-main">
        <header className="admin-page-title">
          <div><p className="admin-kicker">Institution workspace</p><h1>{workspace?.name || 'Institution workspace'}</h1>
            {workspace && <p>{[institutionTypes[workspace.type], workspace.location, workspace.country].filter(Boolean).join(' · ')}</p>}
          </div>
          {workspace && <span className="admin-badge is-ok">{institutionRoles[workspace.role]}</span>}
        </header>
        <LoadState query={overview} name="institution workspace">
          {workspace && view === 'overview' && <Overview workspace={workspace} openDirectory={() => setView('directory')}
            openInvite={() => setView('invite')} openAcademics={openAcademics} />}
          {workspace && directory && <Directory key={view} institutionId={institutionId} isAdmin={workspace.role === 'admin'}
            initialInvite={view === 'invite'} onChanged={overview.reload} onScopeLost={onScopeLost} />}
          {workspace && view === 'academics' && <Academics institutionId={institutionId} isAdmin={workspace.role === 'admin'}
            initialKind={academicKind} onChanged={overview.reload} onScopeLost={onScopeLost} />}
        </LoadState>
      </main>
    </div>
  );
}
