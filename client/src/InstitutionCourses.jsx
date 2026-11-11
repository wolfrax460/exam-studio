import React, { useState } from 'react';
import { get, post, put } from './api.js';
import { EmptyRows, Feedback, LoadState, useAdminAction, useAdminQuery } from './AdminData.jsx';
import { InstitutionPages } from './Institutions.jsx';
import { studyNotesText, handoutPlainText } from './study-output.js';
import Modal from './ui/Modal.jsx';

const path = '/institutions/courses';
const statusNames = { draft: 'Draft', published: 'Published', archived: 'Archived' };
const lines = (value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const scoped = (institutionId) => ({ headers: { 'X-Institution-Id': institutionId } });

function Resources({ items }) {
  if (!items?.length) return null;
  return <section><h3>Resources</h3><ul>{items.map((url, index) => (
    <li key={index}><a href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>
  ))}</ul></section>;
}

function Objectives({ items }) {
  if (!items?.length) return null;
  return <section><h3>Learning objectives</h3><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}

function FormFields({ record }) {
  return <>
    <label>Title<input name="title" required maxLength={160} defaultValue={record?.title} /></label>
    <label>Description<textarea name="description" rows={3} maxLength={3000} defaultValue={record?.description} /></label>
    <label>Learning objectives<textarea name="objectives" rows={3} defaultValue={record?.objectives?.join('\n')} placeholder="One objective per line" /></label>
    <label>Resource links<textarea name="resources" rows={2} defaultValue={record?.resources?.join('\n')} placeholder="One HTTPS link per line" /></label>
  </>;
}

function CourseForm({ course, catalog, institutionId, isAdmin, onClose, onSaved }) {
  const [year, setYear] = useState(course?.yearId || '');
  const [classroom, setClassroom] = useState(course?.classId || '');
  const action = useAdminAction();
  async function submit(event) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    const record = { ...fields, objectives: lines(fields.objectives), resources: lines(fields.resources),
      sectionId: fields.sectionId || null, teacherId: fields.teacherId || null };
    const options = scoped(institutionId);
    if (await action.run(async () => {
      const result = course ? await put(`${path}/${course.id}`, { version: course.version, course: record }, options)
        : await post(path, record, options);
      onSaved(result.id);
    })) onClose();
  }
  return <Modal title={course ? 'Edit course' : 'Create course'} onClose={onClose} className="institution-modal">
    <form className="admin-form" onSubmit={submit}>
      <FormFields record={course} />
      <div className="admin-form-grid">
        <label>Academic year<select name="yearId" value={year} required onChange={(event) => { setYear(event.target.value); setClassroom(''); }}>
          <option value="">Select year</option>
          {catalog.years.filter(({ archived, id }) => !archived || id === course?.yearId).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Class<select name="classId" required value={classroom} onChange={(event) => setClassroom(event.target.value)}>
          <option value="">Select class</option>
          {catalog.classes.filter(({ yearId }) => yearId === year).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Section<select name="sectionId" key={classroom} defaultValue={classroom === course?.classId ? course.sectionId || '' : ''}>
          <option value="">Whole class</option>
          {catalog.sections.filter(({ classId }) => classId === classroom).map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Subject<select name="subjectId" required defaultValue={course?.subjectId || ''}>
          <option value="">Select subject</option>
          {catalog.subjects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        {isAdmin && <label>Assigned teacher<select name="teacherId" defaultValue={course?.teacherId || ''}>
          <option value="">Unassigned</option>
          {catalog.teachers.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        </select></label>}
        <label>Course status<select name="status" defaultValue={course?.status || 'draft'}>
          {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </div>
      <Feedback feedback={action.feedback} />
      <div className="admin-actions"><button type="submit" className="primary" disabled={action.pending}>Save course</button><button type="button" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

function LessonForm({ course, lesson, institutionId, onClose, onSaved }) {
  const [content, setContent] = useState(lesson?.content || '');
  const [importing, setImporting] = useState(false);
  const library = useAdminQuery(importing ? '/library' : null);
  const sources = (library.data || []).filter(({ kind }) => ['notes', 'handout'].includes(kind));
  const action = useAdminAction();
  async function importText(id) {
    await action.run(async () => {
      const item = await get(`/library/${id}`);
      const source = item.kind === 'notes' ? studyNotesText(item.data) : handoutPlainText(item.data);
      if (!source.trim()) throw new Error('This library item has no readable text.');
      const next = [content, source].filter(Boolean).join('\n\n');
      if (next.length > 24000) throw new Error('This item is too long. Copy the section you want into the editor.');
      setContent(next);
      setImporting(false);
    });
  }
  async function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { version: course.version, lesson: { ...values, content, objectives: lines(values.objectives),
      resources: lines(values.resources), published: values.published === 'on' } };
    const base = `${path}/${course.id}/lessons`;
    if (await action.run(async () => {
      const result = lesson ? await put(`${base}/${lesson.id}`, body, scoped(institutionId)) : await post(base, body, scoped(institutionId));
      onSaved(result.id);
    })) onClose();
  }
  return <Modal title={lesson ? 'Edit lesson' : 'Add lesson'} onClose={onClose} className="institution-modal">
    <form className="admin-form" onSubmit={submit}>
      <FormFields record={lesson} />
      <label>Lesson content<textarea required rows={10} maxLength={24000} value={content} onChange={(event) => setContent(event.target.value)} /></label>
      <div className="admin-actions"><button type="button" onClick={() => setImporting(!importing)} aria-expanded={importing}>Import from my Library</button></div>
      {importing && <LoadState query={library} name="your library">
        <p className="admin-muted">Review the copied text before publishing it to learners.</p>
        <ul className="institution-status-list">{sources.map(({ id, title }) => (
          <li key={id}>{title}<button type="button" onClick={() => importText(id)} disabled={action.pending}>Append text</button></li>
        ))}</ul>
        {!sources.length && <EmptyRows>No saved notes or handouts.</EmptyRows>}
      </LoadState>}
      <label className="admin-check"><input name="published" type="checkbox" defaultChecked={lesson?.published} /> Publish lesson</label>
      <Feedback feedback={action.feedback} />
      <div className="admin-actions"><button type="submit" className="primary" disabled={action.pending}>Save lesson</button><button type="button" onClick={onClose}>Cancel</button></div>
    </form>
  </Modal>;
}

export default function InstitutionCourses({ institutionId, isAdmin, onScopeLost }) {
  const [id, setId] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [filter, setFilter] = useState({ search: '', status: '', subjectId: '' });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState(null);
  const params = new URLSearchParams({ page, ...Object.fromEntries(Object.entries(filter).filter(([, value]) => value)) });
  const catalog = useAdminQuery(`${path}?${params}`, institutionId, undefined, onScopeLost);
  const detail = useAdminQuery(id ? `${path}/${id}` : null, institutionId);
  const action = useAdminAction();
  const course = detail.data;
  const lessonIndex = course?.lessons.findIndex((lesson) => lesson.id === lessonId) ?? -1;
  const lesson = course?.lessons[lessonIndex];
  const editable = catalog.data?.canManage && !detail.pending;
  const lessonsEditable = editable && course?.status !== 'archived';
  function open(courseId) {
    setId(courseId);
    setLessonId('');
    action.clear();
  }
  async function move(from, to) {
    const lessonIds = course.lessons.map((entry) => entry.id);
    [lessonIds[from], lessonIds[to]] = [lessonIds[to], lessonIds[from]];
    if (await action.run(() => put(`${path}/${id}/lesson-order`, { version: course.version, lessonIds }, scoped(institutionId)))) detail.reload();
  }
  return <section className="admin-panel institution-course" aria-label="Courses">
    <div className="admin-section-line">
      <h2>{id ? course?.title || 'Course details' : 'Courses'}</h2>
      <div className="admin-actions">
        {id && <button type="button" onClick={() => open('')}>Back to courses</button>}
        {editable && (!id || course) && <button className="primary" type="button" onClick={() => setDialog('course')}>{id ? 'Edit course' : 'Create course'}</button>}
      </div>
    </div>
    {!id ? <>
      <form className="admin-filters" onSubmit={(event) => {
        event.preventDefault(); setPage(1); setFilter(Object.fromEntries(new FormData(event.currentTarget)));
      }}>
        <label>Search courses<input name="search" type="search" maxLength={100} /></label>
        {catalog.data?.canManage && <>
          <label>Status<select name="status"><option value="">All statuses</option>
            {Object.entries(statusNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>Subject<select name="subjectId"><option value="">All subjects</option>
            {catalog.data.subjects.map(({ id: subjectId, name }) => <option key={subjectId} value={subjectId}>{name}</option>)}
          </select></label>
        </>}
        <button type="submit">Filter courses</button>
      </form>
      <LoadState query={catalog} name="courses">
        {catalog.data?.items.length ? <div className="institution-course-grid">{catalog.data.items.map((entry) => (
          <article className="admin-panel" key={entry.id}>
            <span className="admin-badge">{statusNames[entry.status]}</span><h3>{entry.title}</h3>
            <p className="admin-muted">{[entry.subject, entry.classroom, entry.section, entry.year].filter(Boolean).join(' · ')}</p>
            <p>{entry.teacher || 'Unassigned'} · {entry.lessonCount} {entry.lessonCount === 1 ? 'lesson' : 'lessons'}</p>
            <button type="button" onClick={() => open(entry.id)} aria-label={`Open course ${entry.title}`}>Open course</button>
          </article>
        ))}</div> : <EmptyRows>No courses match your access and filters.</EmptyRows>}
        <InstitutionPages page={page} setPage={setPage} hasMore={catalog.data?.hasMore} />
      </LoadState>
    </> : <LoadState query={detail} name="course">
      {course && <div className="admin-stack">
        <p className="admin-muted">{[course.subject, course.classroom, course.section, course.year, course.teacher, statusNames[course.status]].filter(Boolean).join(' · ')}</p>
        {course.description && <p>{course.description}</p>}
        <Objectives items={course.objectives} /><Resources items={course.resources} />
        <div className="admin-section-line"><h3>Lessons</h3>
          {lessonsEditable && <button type="button" onClick={() => setDialog('lesson')}>Add lesson</button>}
        </div>
        <Feedback feedback={action.feedback} />
        {course.lessons.length ? <ol className="institution-status-list">{course.lessons.map((entry, index) => (
          <li key={entry.id}>
            <button type="button" aria-current={entry.id === lessonId ? 'true' : undefined} onClick={() => setLessonId(entry.id)}>{entry.title}</button>
            {lessonsEditable && <div className="admin-actions">
              <span className="admin-badge">{entry.published ? 'Published' : 'Draft'}</span>
              <button type="button" aria-label={`Move ${entry.title} up`} onClick={() => move(index, index - 1)} disabled={action.pending || index === 0}>↑</button>
              <button type="button" aria-label={`Move ${entry.title} down`} onClick={() => move(index, index + 1)} disabled={action.pending || index === course.lessons.length - 1}>↓</button>
            </div>}
          </li>
        ))}</ol> : <EmptyRows>No lessons are available yet.</EmptyRows>}
        {lesson && <article className="admin-panel institution-lesson">
          <div className="admin-section-line"><h3>{lesson.title}</h3>{lessonsEditable && <button type="button" onClick={() => setDialog('edit-lesson')}>Edit lesson</button>}</div>
          {lesson.description && <p>{lesson.description}</p>}<Objectives items={lesson.objectives} />
          <div className="institution-lesson-text">{lesson.content}</div><Resources items={lesson.resources} />
          <nav className="admin-actions" aria-label="Lesson navigation">
            <button type="button" disabled={lessonIndex <= 0} onClick={() => setLessonId(course.lessons[lessonIndex - 1].id)}>Previous lesson</button>
            <button type="button" disabled={lessonIndex >= course.lessons.length - 1} onClick={() => setLessonId(course.lessons[lessonIndex + 1].id)}>Next lesson</button>
          </nav>
        </article>}
      </div>}
    </LoadState>}
    {dialog === 'course' && <CourseForm institutionId={institutionId} catalog={catalog.data} course={course}
      isAdmin={isAdmin} onClose={() => setDialog(null)} onSaved={(key) => { open(key); catalog.reload(); detail.reload(); }} />}
    {dialog && dialog !== 'course' && <LessonForm course={course} lesson={dialog === 'edit-lesson' ? lesson : null}
      institutionId={institutionId} onClose={() => setDialog(null)} onSaved={(key) => { setLessonId(key); detail.reload(); catalog.reload(); }} />}
  </section>;
}
