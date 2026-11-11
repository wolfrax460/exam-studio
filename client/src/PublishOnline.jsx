import React, { useEffect, useState } from 'react';
import { get, post, patch } from './api.js';
import Modal from './ui/Modal.jsx';

const statusName = { in_progress: 'In progress', submitted: 'AI marking', marking_failed: 'Needs teacher review', marked: 'Marked' };

export default function PublishOnline({ exam, libraryId, onSaved }) {
  const [savedId, setSavedId] = useState(libraryId || '');
  const [pub, setPub] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const [review, setReview] = useState(null);
  const [reviewError, setReviewError] = useState('');
  const [working, setWorking] = useState(false);
  const [form, setForm] = useState({ durationMinutes: 60, maxAttempts: 1, requireName: true, showResultsMode: 'immediately', shuffleQuestions: false, shuffleOptions: false, active: true });

  useEffect(() => {
    if (libraryId !== undefined) return;
    try { setSavedId(localStorage.getItem(`exam-publish-${exam.title}`) || ''); } catch {}
  }, [exam.title, libraryId]);
  useEffect(() => { if (!savedId) return; get(`/exams/${savedId}/publication`).then((d) => setPub(d.publication)).catch(() => {}); }, [savedId]);

  const publish = async () => {
    setMsg('Saving exam…');
    try {
      let id = savedId;
      if (!id) {
        const saved = await post('/library', { kind: 'exam', title: exam.title || 'Exam', data: exam });
        id = saved.id; setSavedId(id);
        if (libraryId === undefined) {
          try { localStorage.setItem(`exam-publish-${exam.title}`, id); } catch {}
        }
      }
      const d = await post(`/exams/${id}/publish`, form);
      setPub(d.publication); setMsg('Published.');
      onSaved?.(id);
      load(id);
    } catch (e) { setMsg(e.message); }
  };
  const load = async (id = savedId) => {
    if (!id) return;
    try {
      const [p, a, s] = await Promise.all([get(`/exams/${id}/publication`), get(`/exams/${id}/attempts`), get(`/exams/${id}/attempts/stats`)]);
      setPub(p.publication); setAttempts(a.attempts || []); setStats(s);
    } catch (e) { setMsg(e.message); }
  };
  const copy = () => { if (pub?.url) { navigator.clipboard.writeText(pub.url); setMsg('Link copied.'); } };
  async function openReview(attemptId) {
    try {
      setReview(await get(`/exams/${savedId}/attempts/${attemptId}`));
      setReviewError('');
    } catch (error) { setMsg(error.message); }
  }
  async function override(event, questionId) {
    event.preventDefault();
    setWorking(true);
    setReviewError('');
    const fields = new FormData(event.currentTarget);
    try {
      const result = await patch(`/exams/${savedId}/attempts/${review.attempt._id}/score`, {
        revision: review.attempt.__v ?? 0,
        perQuestion: [{ questionId, awarded: Number(fields.get('awarded')), comment: fields.get('comment') }],
      });
      setReview({ ...review, attempt: result.attempt });
      await load();
    } catch (error) { setReviewError(error.message); }
    finally { setWorking(false); }
  }
  async function retryWritten() {
    if (!window.confirm('Regrade written answers? Teacher-reviewed marks are preserved.')) return;
    setWorking(true);
    setReviewError('');
    try {
      await post(`/exams/${savedId}/attempts/${review.attempt._id}/regrade`, {});
      await openReview(review.attempt._id);
      await load();
    } catch (error) { setReviewError(error.message); }
    finally { setWorking(false); }
  }

  return (
    <div className="publish-card">
      <h3>Publish online</h3>
      <p className="hint">Students open a link, answer, and get objective marks instantly. Written answers are marked by AI.</p>
      <div className="row2">
        <label className="field"><span>Duration (minutes)</span><input type="number" min="1" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></label>
        <label className="field"><span>Max attempts (0 = unlimited)</span><input type="number" min="0" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })} /></label>
        <label className="field"><span>Results</span><select value={form.showResultsMode} onChange={(e) => setForm({ ...form, showResultsMode: e.target.value })}><option value="immediately">Immediately</option><option value="after_close">After close</option><option value="never">Never</option></select></label>
      </div>
      <div className="bar wrap">
        <label className="inline"><input type="checkbox" checked={form.requireName} onChange={(e) => setForm({ ...form, requireName: e.target.checked })} /> Require name</label>
        <label className="inline"><input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm({ ...form, shuffleQuestions: e.target.checked })} /> Shuffle questions</label>
        <label className="inline"><input type="checkbox" checked={form.shuffleOptions} onChange={(e) => setForm({ ...form, shuffleOptions: e.target.checked })} /> Shuffle options</label>
      </div>
      <div className="bar wrap">
        <button className="primary" onClick={publish}>Publish online</button>
        {pub && <button onClick={copy}>Copy student link</button>}
        {savedId && <button onClick={() => load()}>Refresh results</button>}
      </div>
      {pub && <p className="hint">Link: <code>{pub.url}</code>{pub.active ? '' : ' (not active)'}</p>}
      {msg && <p className="hint">{msg}</p>}
      {stats && <p className="hint">{stats.submitted} submitted · {stats.marked} fully marked{stats.marked > 0 && ` · average ${Number(stats.average).toFixed(1)}`}</p>}
      {attempts.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Exam attempts table" tabIndex={0}>
          <table className="handout-table">
            <thead><tr><th>Student</th><th>Status</th><th>Score</th><th>Submitted</th><th>Review</th></tr></thead>
            <tbody>{attempts.map((a) => <tr key={a._id}><td>{a.participantName || 'Anonymous'}</td><td>{statusName[a.status]}</td>
              <td>{a.status === 'marked' && a.score ? `${a.score.total} / ${a.score.max}` : 'Pending'}</td>
              <td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td>
              <td>{a.submittedAt && <button type="button" onClick={() => openReview(a._id)}>Review answers</button>}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {review && <Modal title={`Review ${review.attempt.participantName || 'exam attempt'}`} onClose={() => setReview(null)} className="institution-modal">
        <div className="admin-actions">
          <button type="button" onClick={() => openReview(review.attempt._id)} disabled={working}>Refresh review</button>
          <button type="button" onClick={retryWritten} disabled={working}>Regrade written answers</button>
          <button type="button" onClick={() => setReview(null)}>Close</button>
        </div>
        {reviewError && <p role="alert">{reviewError}</p>}
        <p className="hint">{statusName[review.attempt.status]}</p>
        <div className="admin-stack">{review.attempt.score?.perQuestion?.map((row) => {
          const question = review.questions?.find(({ id }) => String(id) === String(row.questionId));
          const answer = review.attempt.answers?.[row.questionId];
          const ai = row.originalAI || (row.method === 'ai' ? row : null);
          return <section className="admin-panel" key={`${row.questionId}:${review.attempt.__v}`}>
            <h3>{question?.text || question?.prompt || question?.title || row.questionId}</h3>
            {question?.parts?.length > 0 && <ol>{question.parts.map((part, index) => <li key={index}>{part.text || part.prompt} ({part.marks} marks)</li>)}</ol>}
            <p className="hint">{row.needsReview ? 'Needs teacher review' : row.method === 'teacher' ? 'Teacher reviewed' : row.method === 'ai' ? 'AI assessed' : 'Recorded mark'}</p>
            <p><strong>Student answer</strong></p>
            <p className="institution-lesson-text">{(Array.isArray(answer) ? answer.join('\n') : String(answer ?? '')) || 'No answer'}</p>
            {(question?.modelAnswer || typeof question?.answer === 'string') && <p><strong>Reference</strong> {question.modelAnswer || question.answer}</p>}
            {question?.markingPoints?.length > 0 && <details><summary>Rubric</summary><ul>{question.markingPoints.map((point, index) => (
              <li key={index}>{point?.point || point?.text || String(point)}{point?.marks ? ` (${point.marks} marks)` : ''}</li>
            ))}</ul></details>}
            {ai && <div><p><strong>AI assessment</strong> {ai.awarded} / {row.max}. {ai.feedback}</p>
              {ai.criteria?.length > 0 && <ul>{ai.criteria.map((entry, index) => (
                <li key={index}>{entry.criterion} · {entry.awarded} marks · {entry.rationale}</li>
              ))}</ul>}
              {ai.pointsHit?.length > 0 && <p>Strengths · {ai.pointsHit.join('; ')}</p>}
              {ai.pointsMissed?.length > 0 && <p>Missing or incorrect · {ai.pointsMissed.join('; ')}</p>}
            </div>}
            <form className="admin-form" onSubmit={(event) => override(event, row.questionId)}>
              <label>Marks out of {row.max}<input name="awarded" type="number" step="any" min="0" max={row.max} required defaultValue={row.needsReview ? '' : row.awarded} /></label>
              <label>Feedback<textarea name="comment" maxLength={500} defaultValue={row.overrideComment || ''} /></label>
              <button type="submit" disabled={working}>Save mark</button>
            </form>
          </section>;
        })}</div>
      </Modal>}
    </div>
  );
}
