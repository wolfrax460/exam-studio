import React, { useState } from 'react';
import { get, post, download } from '../api.js';
import { totalMarks, validateHandout, handoutStats, estimateHandoutPages } from '../../shared/format.js';
import SourcePicker from '../SourcePicker.jsx';
import NotesReader from '../NotesReader.jsx';
import NotesView from '../NotesView.jsx';
import HandoutView from '../HandoutView.jsx';
import Empty from '../Empty.jsx';
import HandoutSettings from '../HandoutSettings.jsx';

export default function GuideTab({
  text,
  setText,
  fileInfo,
  setFileInfo,
  project,
  setProject,
  focus,
  setFocus,
  guideMode,
  setGuideMode,
  notes,
  setNotes,
  handout,
  setHandout,
  handoutProgress,
  setHandoutProgress,
  handoutJobId,
  setHandoutJobId,
  handoutOpts,
  setHandoutOpts,
  busy,
  setBusy,
  run,
  cancelHandout,
  save,
  sourceReady,
  refreshNotesLib,
  notesLibFiles,
  notesLibSelected,
  setNotesLibSelected,
  notesLibUnits,
  setNotesLibUnits,
  notesLibSelectedUnits,
  setNotesLibSelectedUnits,
  loadNoteFromLib,
  loadSelectedUnits,
  health,
}) {
  const genNotes = () => run('notes', async () => {
    setNotes(await post('/notes/generate', { text, title: project.module, level: project.level, focus }));
    setGuideMode('notes');
  });

  const genHandout = () => run('handout', async () => {
    const jobId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHandoutJobId(jobId);
    const units = handoutOpts.units.split(',').map((u) => u.trim()).filter(Boolean);
    const timer = setInterval(() => {
      get(`/handouts/progress/${jobId}`).then((data) => {
        setHandoutProgress(data);
      }).catch(() => {});
    }, 2500);
    try {
      const result = await post('/handouts/generate', { text, title: project.module, level: project.level, units, includeRevision: handoutOpts.includeRevision, includePractical: handoutOpts.includePractical, jobId });
      setHandout(result);
      setGuideMode('handout');
    } finally {
      clearInterval(timer);
    }
  });

  const progressPercent = (p) => {
    if (!p || !p.total) return 0;
    const ranges = { 1: [2, 8], 2: [8, 78], 3: [78, 98] };
    const [from, to] = ranges[p.pass] || [98, 99];
    return Math.min(100, from + Math.round((to - from) * Math.min(1, (p.done || 0) / p.total)));
  };

  return (
    <div className="panel work">
      {health?.demo && (
        <div className="banner warn" role="status">
          <span>
            <strong>Demo mode is on.</strong> The buttons below return a built-in sample, not your notes —
            which is why the questions can look unrelated and why the marks do not match your Total marks.
            To write real material, set <code>DEMO_MODE=0</code> in <code>server/.env</code> and choose a
            provider in Settings.
          </span>
        </div>
      )}
      <ol className="steps" aria-label="Three step flow">
        <li className={sourceReady ? 'done' : 'active'}><span className="step-no">1</span> Source notes</li>
        <li className={'active'}><span className="step-no">2</span> Generate</li>
        <li className={(notes || handout) ? 'done' : ''}><span className="step-no">3</span> Review & export</li>
      </ol>
      <nav className="tabs" role="tablist">
        <button key="guide" role="tab" aria-selected={true} className="on">Study guide</button>
      </nav>
      {sourceReady && <p className="hint">Source: {text.length.toLocaleString()} characters (~{Math.ceil(text.length / 4).toLocaleString()} tokens).</p>}

      <div className="segmented" role="tablist" aria-label="Study guide mode">
        <button type="button" role="tab" aria-selected={guideMode === 'notes'} className={guideMode === 'notes' ? 'on' : ''} onClick={() => setGuideMode('notes')}>Notes</button>
        <button type="button" role="tab" aria-selected={guideMode === 'handout'} className={guideMode === 'handout' ? 'on' : ''} onClick={() => setGuideMode('handout')}>Handout</button>
      </div>

      {guideMode === 'notes' && (
        <section>
          <div className="bar">
            <input className="grow" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Optional: focus on a topic, e.g. normalization" />
            <button className="primary" disabled={!sourceReady || !!busy} onClick={genNotes}>{busy === 'notes' ? 'Writing…' : 'Write study notes'}</button>
          </div>
          {!notes && <Empty ready={sourceReady} what="study notes" />}
          {notes && <NotesView notes={notes} onSave={() => save('notes', notes)}
            onWord={() => run('export', () => download('/export/notes-docx', { notes }, 'Study_Notes.docx'))} />}
        </section>
      )}

      {guideMode === 'handout' && (
        <section>
          <HandoutSettings opts={handoutOpts} setOpts={setHandoutOpts} />
          <div className="bar">
            <button className="primary" disabled={!sourceReady || !!busy} onClick={genHandout}>
              {busy === 'handout' ? 'Writing the handout…' : handout ? 'Write a new handout' : 'Write study handout (this takes several minutes)'}
            </button>
            {busy === 'handout' && <button className="link" onClick={cancelHandout}>Cancel</button>}
            <span className="hint">A handout writes one lesson at a time and costs many AI calls.</span>
          </div>
          {busy === 'handout' && (
            <div className="progress" role="status" aria-live="polite">
              <div className="progress-bar"><span style={{ width: `${progressPercent(handoutProgress)}%` }} /></div>
              <p className="hint">
                {handoutProgress?.message || 'Working…'}
                {handoutProgress?.pass ? ` (pass ${handoutProgress.pass} of 4)` : ''}
              </p>
            </div>
          )}
          {!handout && busy !== 'handout' && <Empty ready={sourceReady} what="a study handout" />}
          {handout && <HandoutView handout={handout}
            onSave={() => save('handout', handout)}
            run={run} busy={busy} />}
        </section>
      )}
    </div>
  );
}