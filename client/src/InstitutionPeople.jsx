import React, { useState } from 'react';
import { EmptyRows, Feedback, LoadState, timestamp, useAdminAction, useAdminQuery } from './AdminData.jsx';
import { InstitutionPages } from './Institutions.jsx';
import { post, put } from './api.js';
import Modal from './ui/Modal.jsx';

const base = '/institutions/people';
const scoped = (institutionId) => ({ headers: { 'X-Institution-Id': institutionId } });
const studentStatuses = { active: 'Active', withdrawn: 'Withdrawn', graduated: 'Graduated' };
const membershipStatuses = { active: 'Active', suspended: 'Suspended' };
const classifications = { teaching: 'Teaching', administration: 'Administration', operations: 'Operations', support: 'Support' };
const classLabel = ({ name, year }) => [name, year].filter(Boolean).join(' · ');

function Status({ status, labels }) {
  return <span className={`admin-badge${status === 'active' ? ' is-ok' : ''}`}>{labels[status]}</span>;
}

function AccountPicker({ institutionId, membershipId }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(membershipId || '');
  const path = search.trim().length >= 2 ? `${base}/student-accounts?${new URLSearchParams({ search })}` : null;
  const query = useAdminQuery(path, institutionId);
  const options = query.data?.items || [];
  return (
    <fieldset className="admin-form-fieldset admin-stack">
      <legend>Linked Exam Studio account (optional)</legend>
      <label>Find an active member<input type="search" value={search} maxLength={100}
        placeholder="Search by name or email" onChange={(event) => setSearch(event.target.value)} /></label>
      {path && <LoadState query={query} name="matching accounts">
        {query.data?.hasMore && <p className="admin-muted">Refine your search to see fewer matches.</p>}
        {query.data?.items.length === 0 && <p className="admin-muted">No matching active members.</p>}
      </LoadState>}
      <label>Account<select name="membershipId" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">No linked account</option>
        {selected && !options.some(({ id }) => id === selected) && <option value={selected}>Selected member account</option>}
        {options.map(({ id, name, email }) => <option value={id} key={id}>{name} · {email}</option>)}
      </select></label>
    </fieldset>
  );
}

function StudentForm({ institutionId, student, classes, sections, initialClass, onClose, onSaved }) {
  const [classId, setClassId] = useState(student?.classId ?? initialClass ?? '');
  const [sectionId, setSectionId] = useState(student?.sectionId || '');
  const action = useAdminAction();
  const allowedClasses = classes.filter(({ id, archived }) => !archived || id === student?.classId);
  async function submit(event) {
    event.preventDefault();
    const record = Object.fromEntries(new FormData(event.currentTarget));
    for (const field of ['classId', 'sectionId', 'membershipId']) record[field] ||= null;
    const options = scoped(institutionId);
    if (await action.run(() => student
      ? put(`${base}/students/${student.id}`, { version: student.version, record }, options)
      : post(`${base}/students`, record, options))) onSaved();
  }
  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-form-grid">
        <label>Student name<input name="name" required maxLength={160} defaultValue={student?.name} /></label>
        <label>Student identifier<input name="studentNumber" required maxLength={40} defaultValue={student?.studentNumber} /></label>
        <label>Class<select name="classId" value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId(''); }}>
          <option value="">Unassigned</option>
          {allowedClasses.map((item) => <option value={item.id} key={item.id}>{classLabel(item)}</option>)}
        </select></label>
        <label>Section<select name="sectionId" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
          <option value="">No section</option>
          {sections.filter((section) => section.classId === classId).map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
        </select></label>
        <label>Academic status<select name="status" defaultValue={student?.status || 'active'}>
          {Object.entries(studentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <AccountPicker institutionId={institutionId} membershipId={student?.membershipId} />
      <fieldset className="admin-form-fieldset">
        <legend>Guardian contact (optional)</legend>
        <div className="admin-form-grid">
          <label>Guardian name<input name="guardianName" maxLength={160} defaultValue={student?.guardianName} /></label>
          <label>Guardian email<input name="guardianEmail" type="email" maxLength={254} defaultValue={student?.guardianEmail} /></label>
          <label>Guardian telephone<input name="guardianTelephone" type="tel" maxLength={40} defaultValue={student?.guardianTelephone} /></label>
        </div>
      </fieldset>
      <Feedback feedback={action.feedback} />
      <div className="admin-actions">
        <button type="submit" className="primary" disabled={action.pending}>Save student</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

function enrollmentLabel(record, classes, sections) {
  const classroom = classes.find(({ id }) => id === record.classId);
  const section = sections.find(({ id }) => id === record.sectionId)?.name;
  return classroom ? [classLabel(classroom), section].filter(Boolean).join(' · ') : 'Unassigned';
}

function StudentDialog({ institutionId, selected, classes, sections, initialClass, isAdmin, onClose, onSaved }) {
  const [editing, setEditing] = useState(!selected.id);
  const detail = useAdminQuery(selected.id ? `${base}/students/${selected.id}` : null, institutionId);
  const student = detail.data;
  const form = <StudentForm institutionId={institutionId} student={student} classes={classes}
    sections={sections} initialClass={initialClass} onClose={onClose} onSaved={onSaved} />;
  return (
    <Modal title={editing ? (selected.id ? 'Edit student' : 'Add student') : 'Student details'} onClose={onClose} className="institution-modal">
      {selected.id ? <LoadState query={detail} name="student">
        {student && (editing ? form : <>
          <h3>{student.name}</h3>
          <dl className="admin-key-values">
            <div><dt>Student identifier</dt><dd>{student.studentNumber}</dd></div>
            <div><dt>Enrollment</dt><dd>{enrollmentLabel(student, classes, sections)}</dd></div>
            <div><dt>Academic status</dt><dd><Status status={student.status} labels={studentStatuses} /></dd></div>
            {isAdmin && <>
              <div><dt>Account</dt><dd>{student.membershipId ? 'Linked' : 'No linked account'}</dd></div>
              <div><dt>Guardian</dt><dd>{[student.guardianName, student.guardianEmail, student.guardianTelephone].filter(Boolean).join(' · ') || 'No contact on file'}</dd></div>
            </>}
          </dl>
          {isAdmin && <section className="institution-history">
            <h3>Enrollment history</h3>
            <ul className="institution-status-list">
              {[...student.history].reverse().map((record, index) => (
                <li key={index}><div><strong>{enrollmentLabel(record, classes, sections)}</strong><small>{timestamp(record.at)}</small></div>
                  <Status status={record.status} labels={studentStatuses} /></li>
              ))}
            </ul>
          </section>}
        </>)}
      </LoadState> : form}
      {!editing && <div className="admin-actions institution-dialog-actions">
        {isAdmin && student && <button className="primary" type="button" onClick={() => setEditing(true)}>Edit student</button>}
        <button type="button" onClick={onClose}>Close</button>
      </div>}
    </Modal>
  );
}

export function Students({ institutionId, isAdmin, initialClass = '', startAdding, onChanged, onScopeLost }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [classId, setClassId] = useState(initialClass);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(startAdding ? {} : null);
  const filters = new URLSearchParams({ page, search, ...(classId && { classId }), ...(status && { status }) });
  const query = useAdminQuery(`${base}/students?${filters}`, institutionId, undefined, onScopeLost);
  const { classes = [], sections = [] } = query.data || {};
  return (
    <section className="admin-panel institution-directory" aria-labelledby="student-directory">
      <div className="admin-section-line">
        <div><h2 id="student-directory">Students</h2><p className="admin-muted">{isAdmin ? 'Manage student records and enrollment.' : 'Active students in your assigned classes and sections.'}</p></div>
        {isAdmin && <button type="button" className="primary" onClick={() => setSelected({})}>Add student</button>}
      </div>
      <form className="admin-filters" onSubmit={(event) => {
        event.preventDefault(); setPage(1); setSearch(new FormData(event.currentTarget).get('search').trim());
      }}>
        <label>Search students<input name="search" type="search" maxLength={100} placeholder="Name or identifier" /></label>
        <label>Class<select value={classId} onChange={(event) => { setPage(1); setClassId(event.target.value); }}>
          <option value="">All classes</option>
          {classId && !classes.some(({ id }) => id === classId) && <option value={classId}>Selected class</option>}
          {classes.map((item) => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}
        </select></label>
        {isAdmin && <label>Status<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          {Object.entries(studentStatuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select></label>}
        <button type="submit">Search</button>
      </form>
      <LoadState query={query} name="students">
        {query.data?.items.length ? (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label="Student directory table">
            <table><thead><tr><th scope="col">Student</th><th scope="col">Enrollment</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
              <tbody>{query.data.items.map((student) => (
                <tr key={student.id}>
                  <td><strong>{student.name}</strong><small>{student.studentNumber}</small></td>
                  <td>{enrollmentLabel(student, classes, sections)}</td>
                  <td><Status status={student.status} labels={studentStatuses} /></td>
                  <td><button type="button" aria-label={`View ${student.name}`} onClick={() => setSelected(student)}>View</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyRows>{search || classId || status ? 'No students match these filters.' : 'No students to show.'}</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
      </LoadState>
      {selected && query.data && <StudentDialog institutionId={institutionId} selected={selected} classes={classes}
        sections={sections} initialClass={classId} isAdmin={isAdmin} onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); query.reload(); onChanged(); }} />}
    </section>
  );
}

export function StaffProfileDialog({ institutionId, member, onClose, onSaved }) {
  const path = `${base}/staff/${member.id}`;
  const profile = useAdminQuery(path, institutionId);
  const action = useAdminAction();
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (await action.run(() => put(path, { ...values, version: profile.data.version }, scoped(institutionId)))) onSaved();
  }
  return (
    <Modal title="Staff profile" onClose={onClose}>
      <LoadState query={profile} name="staff profile">
        {profile.data && <form className="admin-form" onSubmit={submit}>
          <p>{member.name}</p>
          <label>Classification<select name="classification" defaultValue={profile.data.classification}>
            {Object.entries(classifications).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <label>Job title<input name="title" maxLength={100} defaultValue={profile.data.title} /></label>
          <Feedback feedback={action.feedback} />
          <div className="admin-actions">
            <button type="submit" className="primary" disabled={action.pending}>Save profile</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>}
      </LoadState>
      {!profile.data && <div className="admin-actions institution-dialog-actions"><button type="button" onClick={onClose}>Close</button></div>}
    </Modal>
  );
}

export function StaffDirectory({ institutionId, kind, isAdmin, onInvite, onMemberships, onAssignments, onScopeLost }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const query = useAdminQuery(`${base}/staff?${new URLSearchParams({ kind, page, search })}`, institutionId, undefined, onScopeLost);
  const teachers = kind === 'teachers';
  return (
    <section className="admin-panel institution-directory" aria-labelledby="staff-directory">
      <div className="admin-section-line">
        <div><h2 id="staff-directory">{teachers ? 'Teachers' : 'Staff'}</h2>
          <p className="admin-muted">{teachers ? 'Teaching staff, classes and subjects.' : 'Staff profiles linked to institution memberships.'}</p></div>
        {isAdmin && <div className="admin-actions">
          {teachers && <button type="button" onClick={onAssignments}>Teaching assignments</button>}
          {teachers && <button type="button" className="primary" onClick={onInvite}>Invite teacher</button>}
          <button type="button" onClick={onMemberships}>Manage memberships</button>
        </div>}
      </div>
      <form className="admin-filters" onSubmit={(event) => {
        event.preventDefault(); setPage(1); setSearch(new FormData(event.currentTarget).get('search').trim());
      }}>
        <label>Search {teachers ? 'teachers' : 'staff'}<input name="search" type="search" maxLength={100} placeholder="Name" /></label>
        <button type="submit">Search</button>
      </form>
      <LoadState query={query} name={teachers ? 'teachers' : 'staff'}>
        {query.data?.items.length ? (
          <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={teachers ? 'Teacher directory table' : 'Staff directory table'}>
            <table><thead><tr>
              <th scope="col">Name</th><th scope="col">{teachers ? 'Classes and subjects' : 'Classification'}</th><th scope="col">Membership</th>
              {isAdmin && <th scope="col">Profile</th>}
            </tr></thead>
              <tbody>{query.data.items.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong>{row.title && <small>{row.title}</small>}{row.email && <small>{row.email}</small>}</td>
                  <td>{teachers ? [...row.classes, ...row.subjects].join(' · ') || 'Unassigned' : classifications[row.classification] || 'Unclassified'}</td>
                  <td><Status status={row.status} labels={membershipStatuses} /></td>
                  {isAdmin && <td><button type="button" aria-label={`Edit profile for ${row.name}`} onClick={() => setSelected(row)}>Edit profile</button></td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyRows>{teachers ? 'No teachers to show.' : 'No staff to show.'}</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={query.data?.hasMore} />
      </LoadState>
      {selected && <StaffProfileDialog institutionId={institutionId} member={selected} onClose={() => setSelected(null)}
        onSaved={() => { setSelected(null); query.reload(); }} />}
    </section>
  );
}
