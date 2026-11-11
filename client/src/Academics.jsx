import React, { useState } from 'react';
import { post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, useAdminAction, useAdminQuery } from './AdminData.jsx';
import Modal from './ui/Modal.jsx';

const kinds = {
  years: ['Academic years', 'academic year'],
  terms: ['Terms', 'term'],
  classes: ['Classes', 'class'],
  sections: ['Sections', 'section'],
  subjects: ['Subjects', 'subject'],
  assignments: ['Teaching assignments', 'teaching assignment'],
};
const named = { name: 'name', label: 'Name', maxLength: 100 };
const range = [
  { name: 'startsOn', label: 'Start date', type: 'date' },
  { name: 'endsOn', label: 'End date', type: 'date' },
];
const reference = (name, label, collection, optional = false) => ({ name, label, collection, optional });
const year = reference('yearId', 'Academic year', 'years');
const classroom = reference('classId', 'Class', 'classes');
const teacher = (optional) => reference('teacherId', 'Teacher', 'teachers', optional);
const fields = {
  years: [named, ...range, { name: 'archived', label: 'Archive this year', type: 'checkbox' }],
  terms: [named, year, ...range],
  classes: [named, year, teacher(true)],
  sections: [named, classroom],
  subjects: [named, { name: 'code', label: 'Subject code', maxLength: 24 }],
  assignments: [classroom, reference('sectionId', 'Section', 'sections', true), reference('subjectId', 'Subject', 'subjects'), teacher(false)],
};

const lookup = (records, id) => records.find((record) => record.id === id);
const scope = (institutionId) => ({ headers: { 'X-Institution-Id': institutionId } });

function optionsFor(structure, collection, classroomId) {
  if (collection === 'years') return structure.years.filter(({ archived }) => !archived);
  if (collection === 'classes') return structure.classes
    .filter(({ yearId }) => !lookup(structure.years, yearId)?.archived)
    .map((row) => ({ ...row, name: `${row.name} · ${lookup(structure.years, row.yearId)?.name}` }));
  if (collection === 'sections') return structure.sections.filter(({ classId }) => classId === classroomId);
  return structure[collection];
}

function RecordForm({ kind, record, structure, institutionId, onClose, onSaved }) {
  const action = useAdminAction();
  const [classroomId, setClassroomId] = useState(record?.classId || '');
  const label = kinds[kind][1];
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const data = Object.fromEntries(fields[kind].map(({ name, type, optional }) => [
      name, type === 'checkbox' ? values[name] === 'on' : optional && !values[name] ? null : values[name],
    ]));
    const body = { version: structure.version, record: data };
    const path = `/institutions/academics/${kind}`;
    if (await action.run(() => record
      ? put(`${path}/${record.id}`, body, scope(institutionId))
      : post(path, body, scope(institutionId)))) onSaved();
  }
  return (
    <Modal title={`${record ? 'Edit' : 'Add'} ${label}`} onClose={onClose}>
      <form className="admin-form" onSubmit={submit}>
        <div className="admin-form-grid">
          {fields[kind].map(({ name, label, type = 'text', maxLength, collection, optional }) => {
            if (collection) {
              const items = optionsFor(structure, collection, classroomId);
              const current = record?.[name];
              const unavailable = current && !lookup(items, current) && (name !== 'sectionId' || classroomId === record.classId);
              return (
                <label key={name}>{label}<select name={name} defaultValue={current || ''} required={!optional}
                  onChange={name === 'classId' ? (event) => setClassroomId(event.target.value) : undefined}
                  key={name === 'sectionId' ? classroomId : name}>
                  <option value="">{optional ? 'None' : `Select ${label.toLowerCase()}`}</option>
                  {unavailable && <option value={current}>{lookup(structure[collection], current)?.name || 'Current selection'}</option>}
                  {items.map(({ id, name: option }) => <option key={id} value={id}>{option}</option>)}
                </select></label>
              );
            }
            if (type === 'checkbox') return <label className="admin-check" key={name}><input name={name} type={type} defaultChecked={record?.[name]} />{label}</label>;
            return <label key={name}>{label}<input name={name} type={type} maxLength={maxLength} defaultValue={record?.[name] || ''} required /></label>;
          })}
        </div>
        <Feedback feedback={action.feedback} />
        <div className="admin-actions">
          <button className="primary" type="submit" disabled={action.pending}>Save {label}</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

function RecordDetails({ record, structure, kind, roster, isAdmin }) {
  const year = record.yearId && lookup(structure.years, record.yearId)?.name;
  const classroom = record.classId && lookup(structure.classes, record.classId)?.name;
  const section = record.sectionId && lookup(structure.sections, record.sectionId)?.name;
  const subject = record.subjectId && lookup(structure.subjects, record.subjectId)?.name;
  const teacher = record.teacherId && (lookup(structure.teachers, record.teacherId)?.name || 'Inactive teacher');
  const dates = record.startsOn && `${record.startsOn} to ${record.endsOn}`;
  const classSections = kind === 'classes' && structure.sections.filter(({ classId }) => classId === record.id).map(({ name }) => name).join(', ');
  const assigned = kind === 'classes' ? [...new Set(structure.assignments.filter(({ classId }) => classId === record.id)
    .map(({ teacherId }) => lookup(structure.teachers, teacherId)?.name).filter((name) => name && name !== teacher))].join(', ') : null;
  const students = roster && `${roster.students} ${isAdmin ? 'active' : 'assigned'} students`;
  const details = [year, classroom, section, classSections, teacher, assigned, students, record.code, dates].filter(Boolean);
  return <div><strong>{record.name || subject}</strong>{details.length > 0 && <small>{details.join(' · ')}</small>}</div>;
}

export default function Academics({ institutionId, isAdmin, onChanged, kind, onKindChange, initialCreate, enrollment, openRoster, onScopeLost }) {
  const [editing, setEditing] = useState(initialCreate ? {} : null);
  const query = useAdminQuery('/institutions/academics', institutionId, undefined, onScopeLost);
  const action = useAdminAction();
  const structure = query.data;
  const [title, label] = kinds[kind];
  function refresh() {
    query.reload();
    onChanged();
  }
  async function activate(record) {
    const path = `/institutions/academics/active/${kind}/${record.id}`;
    if (await action.run(() => put(path, { version: structure.version }, scope(institutionId)), `${record.name} is active.`)) refresh();
  }
  const currentId = kind === 'years' ? structure?.activeYearId : kind === 'terms' ? structure?.activeTermId : null;
  return (
    <section className="admin-panel" aria-label="Academic structure">
      <div className="admin-section-line">
        <div><h2>Academic structure</h2><p className="admin-muted">Manage academic periods, classes, subjects and teaching assignments.</p></div>
        <button type="button" onClick={query.reload}>Refresh</button>
      </div>
      <div className="admin-filters">
        <label>Academic records<select value={kind} onChange={(event) => onKindChange(event.target.value)}>
          {Object.entries(kinds).map(([key, [title]]) => <option key={key} value={key}>{title}</option>)}
        </select></label>
        {isAdmin && structure && <button className="primary" type="button" onClick={() => setEditing({})}>Add {label}</button>}
      </div>
      <Feedback feedback={action.feedback} />
      <LoadState query={query} name="academic records">
        {structure?.[kind].length ? (
          <ul className="institution-status-list" aria-label={title}>
            {structure[kind].map((record) => {
              const roster = kind === 'classes' && enrollment.find(({ id }) => id === record.id);
              return (
                <li key={record.id}>
                  <RecordDetails record={record} structure={structure} kind={kind} roster={roster} isAdmin={isAdmin} />
                  <div className="admin-actions">
                    {roster && <button type="button" onClick={() => openRoster(record.id)}>View roster</button>}
                    {record.id === currentId && <span className="admin-badge is-ok">Active</span>}
                    {record.archived && <span className="admin-badge">Archived</span>}
                    {isAdmin && (
                      <>
                        {record.id !== currentId && !record.archived && (kind === 'years' || (kind === 'terms' && record.yearId === structure.activeYearId)) && (
                          <button type="button" disabled={action.pending || query.pending} onClick={() => activate(record)}>Activate</button>
                        )}
                        <button type="button" onClick={() => setEditing({ record })}>Edit</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyRows>No {title.toLowerCase()} have been added.</EmptyRows>}
      </LoadState>
      {editing && structure && <RecordForm kind={kind} record={editing.record} structure={structure} institutionId={institutionId}
        onClose={() => { setEditing(null); query.reload(); }} onSaved={() => { setEditing(null); refresh(); }} />}
    </section>
  );
}
