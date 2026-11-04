import React from 'react';
import SourcePicker from '../SourcePicker.jsx';

export default function SourcePanel({
  text,
  setText,
  fileInfo,
  setFileInfo,
  project,
  setProject,
  notesLibFiles,
  notesLibSelected,
  setNotesLibSelected,
  notesLibUnits,
  setNotesLibUnits,
  notesLibSelectedUnits,
  setNotesLibSelectedUnits,
  refreshNotesLib,
  loadNoteFromLib,
  loadSelectedUnits,
  sourceReady,
}) {
  return (
    <aside className="panel source">
      <h2>1. Your notes</h2>
      <label className="field">
        <span>Module title</span>
        <input value={project.module} onChange={(e) => setProject({ ...project, module: e.target.value })} placeholder="e.g. SWDDD401 Database Development" />
      </label>
      <div className="row2">
        <label className="field"><span>Level</span>
          <input value={project.level} onChange={(e) => setProject({ ...project, level: e.target.value })} placeholder="L4" /></label>
        <label className="field"><span>Duration</span>
          <input value={project.duration} onChange={(e) => setProject({ ...project, duration: e.target.value })} /></label>
      </div>
      <label className="field"><span>Trade (shown on the exam)</span>
        <input value={project.trade} onChange={(e) => setProject({ ...project, trade: e.target.value })} placeholder="Software Development" /></label>
      <label className="field"><span>School (shown on the exam)</span>
        <input value={project.school} onChange={(e) => setProject({ ...project, school: e.target.value })} /></label>

      <SourcePicker
        text={text}
        onText={setText}
        onFileInfo={setFileInfo}
        libraryItems={notesLibFiles}
        onRefreshLibrary={refreshNotesLib}
        onPickLibrary={(name) => { setNotesLibSelected(name); loadNoteFromLib(name); }}
        libraryExtra={notesLibUnits.length > 0 ? (
          <fieldset className="notes-lib-units">
            <legend>Units / learning outcomes (choose one or more)</legend>
            {notesLibUnits.map((u, i) => (
              <label key={i} className="notes-lib-unit">
                <input type="checkbox" checked={notesLibSelectedUnits.includes(i)} onChange={(e) => setNotesLibSelectedUnits((prev) => e.target.checked ? [...prev, i] : prev.filter((n) => n !== i))} />
                <span>{u.title}{u.pageStart ? ` (pp. ${u.pageStart}–${u.pageEnd || u.pageStart})` : ''}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        footer={notesLibSelected && notesLibUnits.length > 0 ? (
          <button className="primary" onClick={loadSelectedUnits} disabled={!notesLibSelectedUnits.length || false}>
            Use selected units
          </button>
        ) : null}
      />
      {fileInfo && <p className="hint">{fileInfo}</p>}
    </aside>
  );
}
