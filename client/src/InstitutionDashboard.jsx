import React from 'react';
import { EmptyRows, number } from './AdminData.jsx';
import Icon from './ui/Icon.jsx';

function EnrollmentChart({ enrollment, assigned, onRoster }) {
  const classes = [...enrollment].sort((a, b) => b.students - a.students || a.name.localeCompare(b.name)).slice(0, 6);
  const max = Math.max(1, ...classes.map(({ students }) => students));
  return (
    <section className="admin-panel institution-chart" aria-labelledby="enrollment-chart-title">
      <h2 id="enrollment-chart-title">Class enrollment</h2>
      <p className="admin-muted">{assigned ? 'Active students in up to six of your assigned classes and sections.'
        : 'Active students in up to six classes across open academic years.'}</p>
      {classes.length ? <ul className="institution-chart-rows">
        {classes.map(({ id, name, year, students }) => (
          <li key={id}>
            <div>
              <button type="button" className="link" onClick={() => onRoster(id)}>{name}</button>
              <span>{number(students)}</span>
            </div>
            <div className="institution-chart-track" aria-hidden="true">
              <span style={{ inlineSize: `${students / max * 100}%` }} />
            </div>
            <small>{year}</small>
          </li>
        ))}
      </ul> : <EmptyRows>No classes are available to chart.</EmptyRows>}
    </section>
  );
}

export default function InstitutionDashboard({ workspace, openDirectory, openInvite, openAcademics, openStudents }) {
  const { dashboard, counts, academicYear, academicTerm, role } = workspace;
  const isAdmin = role === 'admin';
  const setup = isAdmin ? [
    { label: 'Activate an academic year', complete: Boolean(academicYear), open: () => openAcademics('years') },
    { label: 'Create a class', complete: dashboard.classes > 0, open: () => openAcademics('classes', true) },
    { label: 'Add a subject', complete: dashboard.subjects > 0, open: () => openAcademics('subjects', true) },
    { label: 'Invite a teacher', complete: counts.teacher > 0, open: openInvite },
    { label: 'Enroll a student', complete: dashboard.enrollment.some(({ students }) => students > 0), open: () => openStudents('', true) },
  ] : [];
  const complete = setup.filter((step) => step.complete).length;
  const metrics = dashboard ? [
    [role === 'teacher' ? 'Assigned students' : 'Active students', dashboard.students, 'user'],
    ['Active teachers', counts.teacher, 'institution'],
    [role === 'teacher' ? 'Assigned classes' : 'Classes', dashboard.classes, 'modules'],
    [role === 'teacher' ? 'Assigned subjects' : 'Subjects', dashboard.subjects, 'book'],
  ] : [];
  return (
    <div className="admin-stack">
      {metrics.length > 0 && <dl className="admin-metric-grid institution-metric-grid" aria-label="Workspace statistics">
        {metrics.map(([label, value, icon]) => (
          <div className="admin-metric" key={label}>
            <span className="admin-metric-icon"><Icon name={icon} /></span>
            <div><dt>{label}</dt><dd>{number(value)}</dd></div>
          </div>
        ))}
      </dl>}
      {dashboard && <section className="admin-panel institution-quick-actions">
        <h2>Quick actions</h2>
        <div className="admin-actions">
          {isAdmin ? <>
            <button className="primary" type="button" onClick={() => openStudents('', true)}>Add student</button>
            <button type="button" onClick={openInvite}>Invite teacher</button>
            <button type="button" onClick={() => openAcademics('classes', true)}>Create class</button>
            <button type="button" onClick={() => openAcademics('subjects', true)}>Create subject</button>
            <button type="button" onClick={() => openAcademics('years')}>Manage academic calendar</button>
            <button type="button" onClick={() => openAcademics('classes')}>Manage classes</button>
            <button type="button" onClick={openDirectory}>Manage members</button>
          </> : <>
            <button className="primary" type="button" onClick={() => openStudents('')}>View assigned students</button>
            <button type="button" onClick={() => openAcademics('years')}>View academics</button>
            <button type="button" onClick={openDirectory}>View member directory</button>
          </>}
        </div>
      </section>}
      {dashboard ? (
        <div className={`institution-dashboard-grid${isAdmin && complete < setup.length ? '' : ' is-single'}`}>
          <EnrollmentChart enrollment={dashboard.enrollment} assigned={role === 'teacher'} onRoster={openStudents} />
          {isAdmin && complete < setup.length && <section className="admin-panel institution-setup" aria-labelledby="institution-setup-title">
            <div className="admin-section-line">
              <h2 id="institution-setup-title">Set up your institution</h2>
              <span className="admin-badge">{complete} of {setup.length} complete</span>
            </div>
            <progress aria-label="Institution setup progress" value={complete} max={setup.length} />
            <ol>
              {setup.map(({ label, complete: done, open }) => (
                <li key={label}>
                  <span className={`institution-step${done ? ' is-done' : ''}`}>{done && <Icon name="check" size={13} />}</span>
                  {done ? <span>{label}<span className="sr-only"> complete</span></span>
                    : <button className="link" type="button" onClick={open}>{label}</button>}
                </li>
              ))}
            </ol>
          </section>}
        </div>
      ) : (
        <section className="admin-panel">
          <h2>Academic calendar</h2>
          <dl className="admin-key-values">
            <div><dt>Academic year</dt><dd>{academicYear || 'No active academic year'}</dd></div>
            <div><dt>Current term</dt><dd>{academicTerm || 'No active term'}</dd></div>
          </dl>
          <div className="admin-actions"><button type="button" onClick={openDirectory}>View member directory</button></div>
        </section>
      )}
    </div>
  );
}
