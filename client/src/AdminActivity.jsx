import React, { useState } from 'react';
import { del } from './api.js';
import Modal from './ui/Modal.jsx';
import { ActivityChart, Outcomes } from './AdminOverview.jsx';
import { EmptyRows, Feedback, LoadState, number, Pagination, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';

const TASKS = { notes: 'Study notes', exam: 'Exam', cards: 'Flashcards', flashcards: 'Flashcards', handout: 'Handout', export: 'Export' };
function TaskOptions({ content = false }) {
  const keys = content ? ['notes', 'exam', 'flashcards', 'handout'] : ['notes', 'exam', 'cards', 'handout', 'export'];
  return <><option value="">All types</option>{keys.map((key) => <option key={key} value={key}>{TASKS[key]}</option>)}</>;
}

function Results({ query, label, page, setPage, columns, row }) {
  const items = query.data?.items || [];
  return (
    <LoadState query={query} name={label.toLowerCase()}>
      {items.length ? <div className="admin-table-scroll" role="region" aria-label={label} tabIndex={0}>
        <table><thead><tr>{columns.map((name) => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>{row(item)}</tr>)}</tbody></table>
      </div> : <EmptyRows>No records match these filters.</EmptyRows>}
      <Pagination page={page} setPage={setPage} total={query.data?.total || 0} />
    </LoadState>
  );
}

export function Usage() {
  const [taskType, setTaskType] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);
  const summary = useAdminQuery('/admin/usage/summary');
  const query = useAdminQuery(`/admin/usage?${new URLSearchParams({ taskType, outcome, page, limit: 20 })}`);
  return (
    <div className="admin-stack">
      <div className="admin-overview-charts">
        <ActivityChart title="Requests over time" series={summary.data?.daily} metric="requests" description="All recorded requests · last 14 days (UTC)" />
        <Outcomes summary={summary.data} />
      </div>
      {summary.error && <p className="admin-feedback is-error" role="alert">Usage charts are unavailable. <button type="button" onClick={summary.reload}>Retry charts</button></p>}
      <section className="admin-panel">
        <h2>Usage events</h2>
        <p className="admin-muted">Filter the recorded events below. Charts show all recorded activity.</p>
        <div className="admin-filters">
          <label>Task<select value={taskType} onChange={(event) => { setTaskType(event.target.value); setPage(1); }}><TaskOptions /></select></label>
          <label>Outcome<select value={outcome} onChange={(event) => { setOutcome(event.target.value); setPage(1); }}>
            <option value="">All outcomes</option><option value="success">Succeeded</option><option value="failure">Failed</option>
          </select></label>
        </div>
        <Results query={query} label="Usage events" page={page} setPage={setPage}
          columns={['Task', 'Outcome', 'Reported tokens', 'Estimated tokens', 'Recorded']}
          row={(event) => <>
            <td>{TASKS[event.taskType] || event.taskType}</td>
            <td><span className={`admin-badge${event.success === true ? ' is-ok' : event.success === false ? ' is-alert' : ''}`}>
              {event.success === true ? 'Succeeded' : event.success === false ? 'Failed' : 'Unavailable'}
            </span></td>
            <td>{number(event.actualTokens)}</td><td>{number(event.estimatedTokens)}</td><td>{timestamp(event.createdAt)}</td>
          </>} />
      </section>
    </div>
  );
}

export function Content() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState(null);
  const query = useAdminQuery(`/admin/content?${new URLSearchParams({ search, kind, page, limit: 20 })}`);
  const mutation = useAdminAction();
  const close = () => { if (!mutation.pending) { mutation.clear(); setTarget(null); } };
  async function remove() {
    if (await mutation.run(() => del(`/admin/content/${target.id}`), 'Library item deleted.')) {
      setTarget(null);
      query.reload();
    }
  }
  return (
    <section className="admin-panel">
      <h2>Library moderation</h2>
      <p className="admin-muted">Review titles and document types.</p>
      <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setSearch(draft.trim()); setPage(1); }}>
        <label>Search titles<input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} /></label>
        <button type="submit">Search</button>
        <label>Document type<select value={kind} onChange={(event) => { setKind(event.target.value); setPage(1); }}><TaskOptions content /></select></label>
      </form>
      {!target && <Feedback feedback={mutation.feedback} />}
      <Results query={query} label="Library items" page={page} setPage={setPage} columns={['Title', 'Type', 'Created', 'Actions']}
        row={(item) => <><td>{item.title}</td><td>{TASKS[item.kind] || item.kind}</td><td>{timestamp(item.createdAt)}</td>
          <td><button type="button" onClick={() => { mutation.clear(); setTarget(item); }}>Delete</button></td></>} />
      {target && <Modal title="Delete library item" onClose={close}>
        <p>Remove “{target.title}” from its owner’s library?</p>
        <Feedback feedback={mutation.feedback} />
        <div className="studio-modal-actions">
          <button className="admin-danger" type="button" disabled={mutation.pending} onClick={remove}>{mutation.pending ? 'Deleting…' : 'Delete item'}</button>
          <button type="button" disabled={mutation.pending} onClick={close}>Cancel</button>
        </div>
      </Modal>}
    </section>
  );
}

export function Audit() {
  const [draft, setDraft] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const query = useAdminQuery(`/admin/audit?${new URLSearchParams({ action, page, limit: 20 })}`);
  return (
    <section className="admin-panel">
      <h2>Activity log</h2>
      <p className="admin-muted">Review changes recorded by platform administration.</p>
      <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setAction(draft.trim()); setPage(1); }}>
        <label>Filter by event<input type="search" placeholder="e.g. user.update" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={100} /></label>
        <button type="submit">Apply filter</button>
      </form>
      <Results query={query} label="Audit log" page={page} setPage={setPage} columns={['Event', 'Administrator', 'Target', 'Recorded']}
        row={(event) => <><td><code>{event.action}</code></td><td>{event.actorEmail || 'Unavailable'}</td><td>{event.targetType || '—'}</td><td>{timestamp(event.createdAt)}</td></>} />
    </section>
  );
}
