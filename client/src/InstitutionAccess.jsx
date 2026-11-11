import React, { useEffect, useRef, useState } from 'react';
import { EmptyRows, LoadState, useAdminQuery } from './AdminData.jsx';
import { InstitutionApplications, InstitutionRegistration } from './Institutions.jsx';
import { institutionRoles, JoinInstitution } from './InstitutionWorkspace.jsx';
import Icon from './ui/Icon.jsx';

export default function InstitutionAccess({ userId, workspaceQuery, workspaces, onOpen, onPersonal }) {
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const applications = useAdminQuery(`/institutions/requests?page=${page}`, undefined, userId);
  const heading = useRef(null);
  const confirmation = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (notice) confirmation.current?.focus(); }, [notice]);

  function refreshStatus() {
    applications.reload();
    workspaceQuery.reload();
  }

  return (
    <main className="institution-access" aria-labelledby="institution-access-title">
      <header className="page-hero">
        <span className="page-hero-icon" aria-hidden="true"><Icon name="institution" size={28} /></span>
        <div className="page-hero-copy">
          <div className="page-hero-title"><h1 id="institution-access-title" ref={heading} tabIndex={-1}>Institution Access</h1></div>
          <p>Open a workspace, accept an invitation, or apply to register your institution.</p>
        </div>
        <div className="page-hero-actions">
          <button type="button" onClick={onPersonal}>Continue to Personal Workspace</button>
        </div>
      </header>

      {notice && <p className="admin-feedback" role="status" ref={confirmation} tabIndex={-1}>{notice}</p>}
      <div className="institution-access-grid">
        <section className="admin-panel" aria-labelledby="institution-workspaces">
          <div className="admin-section-line">
            <h2 id="institution-workspaces">Open Institution Workspace</h2>
            <button type="button" onClick={workspaceQuery.reload} disabled={workspaceQuery.pending}>Refresh workspaces</button>
          </div>
          <LoadState query={{ ...workspaceQuery, data: workspaceQuery.pending ? undefined : workspaceQuery.data }}
            name="active institution memberships" loading="Checking your institution access…">
            {workspaces.length ? (
              <>
                <p className="admin-muted" role="status">Active membership verified for {workspaces.length} {workspaces.length === 1 ? 'institution' : 'institutions'}.</p>
                <ul className="institution-status-list">
                  {workspaces.map(({ id, name, role }) => (
                    <li key={id}>
                      <div><strong>{name}</strong><small>{institutionRoles[role]}</small></div>
                      <button type="button" className="primary" aria-label={`Open workspace ${name}`} onClick={() => onOpen(id)}>Open workspace</button>
                    </li>
                  ))}
                </ul>
              </>
            ) : <EmptyRows>This account has no active institution membership. Use an invitation code or register an institution below.</EmptyRows>}
          </LoadState>
        </section>
        <section className="admin-panel">
          <h2>Join with an Invitation Code</h2>
          <p className="admin-muted">Use the code your institution administrator shared with you.</p>
          <button type="button" onClick={() => { setNotice(''); setDialog('join'); }}>Enter invitation code</button>
        </section>
        <section className="admin-panel">
          <h2>Register an Institution</h2>
          <p className="admin-muted">Submit your institution details for platform approval.</p>
          <button type="button" onClick={() => { setNotice(''); setDialog('register'); }}>Register an institution</button>
        </section>
      </div>
      <InstitutionApplications query={{ ...applications, reload: refreshStatus }} page={page} setPage={setPage}
        workspaces={workspaces} onOpen={onOpen} />

      {dialog === 'join' && <JoinInstitution onClose={() => setDialog(null)} onJoined={() => {
        setDialog(null);
        setNotice('Invitation accepted. You can open your institution workspace when it appears in the list.');
        workspaceQuery.reload();
      }} />}
      {dialog === 'register' && <InstitutionRegistration onClose={() => setDialog(null)}
        onRefreshApplications={() => { setDialog(null); refreshStatus(); }}
        onSubmitted={() => {
          setDialog(null);
          setNotice('Application received. A platform administrator will review it.');
          setPage(1);
          refreshStatus();
        }} />}
    </main>
  );
}
