import React, { useState } from 'react';
import { post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';
import Modal from './ui/Modal.jsx';

export const institutionTypes = { school: 'School', college: 'College', university: 'University', training: 'Training institution', other: 'Other' };
const statuses = { pending: 'Pending review', active: 'Active', suspended: 'Suspended' };

function Status({ status }) {
  const style = status === 'active' ? ' is-ok' : status === 'suspended' ? ' is-alert' : '';
  return <span className={`admin-badge${style}`}>{statuses[status]}</span>;
}

export function InstitutionPages({ page, setPage, hasMore }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="admin-pagination" aria-label="Institution list pages">
      <span>Page {page}</span>
      <div>
        <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
        <button type="button" disabled={!hasMore} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}

export function InstitutionOnboarding({ onClose }) {
  const [page, setPage] = useState(1);
  const query = useAdminQuery(`/institutions/requests?page=${page}`);
  const action = useAdminAction();

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const application = Object.fromEntries(new FormData(form));
    if (await action.run(() => post('/institutions/requests', application), 'Application submitted for review.')) {
      form.reset();
      setPage(1);
      query.reload();
    }
  }

  return (
    <Modal title="Institution registration" className="institution-modal" onClose={onClose}>
      <p className="admin-modal-context">Register a school, college, university or training institution using your Exam Studio account. Platform approval is required before workspace access.</p>
      <form className="admin-form" onSubmit={submit}>
        <fieldset className="admin-form-fieldset" disabled={action.pending}>
          <legend>Institution details</legend>
          <div className="admin-form-grid">
            <label>Institution name<input name="name" required maxLength={160} /></label>
            <label>Institution type<select name="type" required defaultValue="">
              <option value="" disabled>Select institution type</option>
              {Object.entries(institutionTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Country<input name="country" required maxLength={100} /></label>
            <label>Location (optional)<input name="location" maxLength={160} /></label>
            <label>Contact email<input type="email" name="contactEmail" required maxLength={254} /></label>
            <label>Telephone (optional)<input type="tel" name="telephone" maxLength={40} /></label>
            <label className="institution-wide">Description (optional)<textarea name="description" rows={3} maxLength={1000} /></label>
          </div>
        </fieldset>
        <div className="admin-actions">
          <button className="primary" type="submit" disabled={action.pending}>{action.pending ? 'Submitting…' : 'Submit application'}</button>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <Feedback feedback={action.feedback} />
      </form>
      <section className="institution-requests" aria-label="Your institution requests">
        <h3>Your institution requests</h3>
        <LoadState query={query} name="institution requests">
          {query.data?.items.length ? (
            <ul className="institution-status-list">
              {query.data.items.map((item) => (
                <li key={item.id}><div><strong>{item.name}</strong><small>{institutionTypes[item.type]} · {item.country || 'Country unavailable'}</small></div><Status status={item.status} /></li>
              ))}
            </ul>
          ) : <EmptyRows>You have no institution requests.</EmptyRows>}
          <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
        </LoadState>
      </section>
    </Modal>
  );
}

function ReviewDialog({ item, onClose, onSaved }) {
  const action = useAdminAction();
  const status = item.status === 'active' ? 'suspended' : 'active';
  const verb = item.status === 'pending' ? 'Approve' : status === 'active' ? 'Reactivate' : 'Suspend';
  async function submit(event) {
    event.preventDefault();
    const reason = new FormData(event.currentTarget).get('reason');
    if (await action.run(() => put(`/admin/institutions/${item.id}/status`, { status, version: item.version, reason }))) {
      onSaved(`${item.name} is now ${statuses[status].toLowerCase()}.`);
    }
  }
  return (
    <Modal title={`${verb} institution`} onClose={onClose}>
      <p className="admin-modal-context"><strong>{item.name}</strong></p>
      <p>{status === 'suspended' ? 'Members will lose access to this institution workspace.' : item.status === 'pending' ? 'The applicant will become the institution administrator.' : 'Active members will regain access to this institution workspace.'}</p>
      <form className="admin-form" onSubmit={submit}>
        <label>Review reason (optional)<textarea name="reason" rows={3} maxLength={300} /></label>
        <Feedback feedback={action.feedback} />
        <div className="admin-actions">
          <button className="primary" type="submit" disabled={action.pending}>{verb} institution</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export function InstitutionReview() {
  const [filter, setFilter] = useState('pending');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const query = useAdminQuery(`/admin/institutions?page=${page}${filter ? `&status=${filter}` : ''}`);
  const closeReview = () => { setSelected(null); query.reload(); };

  return (
    <section className="admin-panel" aria-label="Institution requests">
      <div className="admin-section-line">
        <div><h2>Institution requests</h2><p className="admin-muted">Review applications and manage workspace access.</p></div>
        <button type="button" onClick={query.reload}>Refresh</button>
      </div>
      <div className="admin-filters">
        <label>Status<select value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <Feedback feedback={message && { message }} />
      <LoadState query={query} name="institution requests">
        {query.data?.items.length ? (
          <div className="admin-stack">
            {query.data.items.map((item) => (
              <article className="admin-panel" key={item.id}>
                <div className="admin-section-line">
                  <div><h3>{item.name}</h3><p className="admin-muted">{institutionTypes[item.type]} · {item.country || 'Country unavailable'}</p></div>
                  <Status status={item.status} />
                </div>
                <dl className="admin-key-values">
                  <div><dt>Contact email</dt><dd>{item.contactEmail || 'Unavailable'}</dd></div>
                  {item.location && <div><dt>Location</dt><dd>{item.location}</dd></div>}
                  {item.telephone && <div><dt>Telephone</dt><dd>{item.telephone}</dd></div>}
                  <div><dt>Submitted</dt><dd>{timestamp(item.createdAt)}</dd></div>
                </dl>
                {item.description && <p>{item.description}</p>}
                {item.history.length > 0 && (
                  <details className="institution-requests">
                    <summary>Review history ({item.history.length})</summary>
                    <ol>
                      {item.history.map((entry, index) => (
                        <li key={index}>
                          <strong>{statuses[entry.from]} → {statuses[entry.status]}</strong>
                          <div>{timestamp(entry.at)} · Account {entry.by}</div>
                          {entry.reason && <p>{entry.reason}</p>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="admin-actions">
                  <button type="button" onClick={() => { setMessage(''); setSelected(item); }}>
                    {item.status === 'pending' ? 'Approve' : item.status === 'active' ? 'Suspend' : 'Reactivate'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : <EmptyRows>No institutions match this status.</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
      </LoadState>
      {selected && <ReviewDialog item={selected} onClose={closeReview} onSaved={(notice) => {
        setMessage(notice);
        setPage(1);
        closeReview();
      }} />}
    </section>
  );
}
