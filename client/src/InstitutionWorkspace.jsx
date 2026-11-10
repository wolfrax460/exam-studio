import React, { useState } from 'react';
import { post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';
import { InstitutionPages, institutionTypes } from './Institutions.jsx';
import Academics from './Academics.jsx';
import Modal from './ui/Modal.jsx';
import Icon from './ui/Icon.jsx';
import brandMark from './assets/exam-studio-mark.svg';

const roles = { admin: 'Institution administrator', teacher: 'Teacher', member: 'Member' };
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
    let joined;
    if (await action.run(async () => { joined = await post('/institutions/invitations/accept', { code }); })) {
      onJoined(joined.institutionId);
    }
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

function Directory({ institutionId, isAdmin, onChanged }) {
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  const query = useAdminQuery(`/institutions/members?page=${page}`, institutionId);
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
              <div><strong>{member.name}</strong><small>{roles[member.role]}{member.email ? ` · ${member.email}` : ''}</small></div>
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

function Overview({ workspace, openDirectory }) {
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
        <p>{isAdmin ? 'Start by inviting your teaching team and other members to this workspace.' : 'Open the directory to find the members of your institution.'}</p>
        <button type="button" onClick={openDirectory}>{isAdmin ? 'Manage members' : 'View member directory'}</button>
      </section>
    </div>
  );
}

export default function InstitutionWorkspace({ institutionId, workspaces, onSwitch }) {
  const [view, setView] = useState('overview');
  const overview = useAdminQuery('/institutions/workspace/overview', institutionId);
  const workspace = overview.data;
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-head">
          <div className="admin-brand"><img src={brandMark} alt="" width="40" height="40" /><div><strong>Exam Studio</strong><small>Institution workspace</small></div></div>
        </div>
        <WorkspacePicker workspaces={workspaces} selected={institutionId} onChange={onSwitch} />
        <nav className="admin-nav institution-workspace-nav" aria-label="Institution navigation">
          <button type="button" aria-current={view === 'overview' ? 'page' : undefined} onClick={() => setView('overview')}><Icon name="dashboard" /> Overview</button>
          <button type="button" aria-current={view === 'directory' ? 'page' : undefined} onClick={() => setView('directory')}><Icon name="user" /> Member directory</button>
          {workspace && workspace.role !== 'member' && <button type="button" aria-current={view === 'academics' ? 'page' : undefined} onClick={() => setView('academics')}><Icon name="book" /> Academics</button>}
        </nav>
      </aside>
      <main className="admin-main-content">
        <header className="admin-page-title">
          <div><p className="admin-kicker">Institution workspace</p><h1>{workspace?.name || 'Institution workspace'}</h1>
            {workspace && <p>{[institutionTypes[workspace.type], workspace.location, workspace.country].filter(Boolean).join(' · ')}</p>}
          </div>
          {workspace && <span className="admin-badge is-ok">{roles[workspace.role]}</span>}
        </header>
        <LoadState query={overview} name="institution workspace">
          {workspace && view === 'overview' && <Overview workspace={workspace} openDirectory={() => setView('directory')} />}
          {workspace && view === 'directory' && <Directory institutionId={institutionId} isAdmin={workspace.role === 'admin'} onChanged={overview.reload} />}
          {workspace && view === 'academics' && <Academics institutionId={institutionId} isAdmin={workspace.role === 'admin'} onChanged={overview.reload} />}
        </LoadState>
      </main>
    </div>
  );
}
