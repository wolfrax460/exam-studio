import React, { useEffect, useState } from 'react';
import { get, post, patch } from './api.js';

export default function PublishOnline({ exam }) {
  const [savedId, setSavedId] = useState('');
  const [pub, setPub] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ durationMinutes: 60, maxAttempts: 1, requireName: true, showResultsMode: 'immediately', shuffleQuestions: false, shuffleOptions: false, active: true });

  useEffect(() => { try { setSavedId(localStorage.getItem(`exam-publish-${exam.title}`) || ''); } catch {} }, [exam.title]);
  useEffect(() => { if (!savedId) return; get(`/exams/${savedId}/publication`).then((d) => setPub(d.publication)).catch(() => {}); }, [savedId]);

  const publish = async () => {
    setMsg('Saving exam…');
    try {
      let id = savedId;
      if (!id) {
        const saved = await post('/library', { kind: 'exam', title: exam.title || 'Exam', data: exam });
        id = saved.id; setSavedId(id);
        try { localStorage.setItem(`exam-publish-${exam.title}`, id); } catch {}
      }
      const d = await post(`/exams/${id}/publish`, form);
      setPub(d.publication); setMsg('Published.');
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
  const override = async (attempt, questionId, awarded) => {
    const perQuestion = (attempt.score?.perQuestion || []).map((p) => p.questionId === questionId ? { ...p, awarded } : p);
    await patch(`/exams/${savedId}/attempts/${attempt._id}/score`, { perQuestion });
    load();
  };

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
      {stats && <p className="hint">{stats.submitted} submitted · average {Number(stats.average).toFixed(1)} · highest {stats.highest} · lowest {stats.lowest}</p>}
      {attempts.length > 0 && (
        <div className="table-scroll" role="region" aria-label="Exam attempts table" tabIndex={0}>
          <table className="handout-table">
            <thead><tr><th>Student</th><th>Status</th><th>Score</th><th>Submitted</th></tr></thead>
            <tbody>{attempts.map((a) => <tr key={a._id}><td>{a.participantName || 'Anonymous'}</td><td>{a.status}</td><td>{a.score?.total ?? '—'} / {a.score?.max ?? '—'}</td><td>{a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {attempts.length > 0 && attempts[0].score?.perQuestion?.length > 0 && (
        <div className="hint">Open an attempt to override marks:
          {attempts.slice(0, 5).map((a) => <div key={a._id}><strong>{a.participantName || 'Anonymous'}</strong>
            {a.score.perQuestion.map((p) => <label key={p.questionId} className="inline" style={{ marginLeft: 8 }}>{p.questionId}
              <input type="number" step="0.5" min="0" max={p.max} defaultValue={p.awarded} onBlur={(e) => override(a, p.questionId, Number(e.target.value))} />
            </label>)}
          </div>)}
        </div>
      )}
    </div>
  );
}
