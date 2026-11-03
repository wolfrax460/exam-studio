import React, { useEffect, useMemo, useRef, useState } from 'react';

const api = (path, opts = {}) => fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || data.message || 'Request failed'), { status: r.status, data });
  return data;
});

export default function TakeExam({ shareCode }) {
  const [meta, setMeta] = useState(null);
  const [name, setName] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState('Not saved yet');
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const saveTimer = useRef(null);
  const token = attempt?.attemptToken;
  const attemptId = attempt?.attemptId;

  useEffect(() => {
    api(`/api/take/${shareCode}`).then(setMeta).catch((e) => setError(e.message));
  }, [shareCode]);

  useEffect(() => {
    if (!attempt?.deadlineAt) return;
    const tick = () => setRemaining(Math.max(0, Math.floor((new Date(attempt.deadlineAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [attempt?.deadlineAt]);

  useEffect(() => {
    if (remaining === 0 && attempt && !submitted) submit(true);
  }, [remaining]);

  useEffect(() => {
    if (!attemptId) return;
    const raw = localStorage.getItem(`exam-attempt-${attemptId}`);
    if (raw) { try { setAnswers(JSON.parse(raw)); } catch {} }
  }, [attemptId]);

  const questions = attempt?.questions || [];
  const current = questions[index];
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').length;

  const persist = (next) => {
    setAnswers(next);
    if (attemptId) { try { localStorage.setItem(`exam-attempt-${attemptId}`, JSON.stringify(next)); } catch {} }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => autosave(next), 1200);
  };

  const autosave = async (next = answers) => {
    if (!token || !attemptId) return;
    try {
      await api(`/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: JSON.stringify({ attemptToken: token, answers: next }) });
      setSaved(`Saved ${new Date().toLocaleTimeString()}`);
    } catch (e) { setSaved('Offline — answers saved on this device'); }
  };

  const start = async () => {
    setError('');
    try {
      const data = await api(`/api/take/${shareCode}/start`, { method: 'POST', body: JSON.stringify({ participantName: name }) });
      setAttempt(data);
      setAnswers({});
    } catch (e) { setError(e.message); }
  };

  const submit = async (auto = false) => {
    if (!token || !attemptId) return;
    if (!auto && !window.confirm('Submit this exam? You cannot change your answers after submitting.')) return;
    try {
      await api(`/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: JSON.stringify({ attemptToken: token }) });
      setSubmitted(true);
      pollResult();
    } catch (e) { setError(e.message); }
  };

  const pollResult = async () => {
    for (let i = 0; i < 40; i++) {
      try {
        const r = await api(`/api/take/attempts/${attemptId}/result?attemptToken=${encodeURIComponent(token)}`);
        setResult(r);
        if (r.status === 'marked' || r.status === 'marking_failed') return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  };

  const time = useMemo(() => `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`, [remaining]);

  if (!meta && !error) return <main className="take-shell"><p>Loading exam…</p></main>;
  if (error && !attempt) return <main className="take-shell"><div className="take-card"><h1>Exam unavailable</h1><p>{error}</p></div></main>;

  if (!attempt) {
    return (
      <main className="take-shell">
        <div className="take-card take-start">
          <h1>{meta.exam.title}</h1>
          <p>{meta.exam.instructions || 'Answer every question. Your progress is saved automatically.'}</p>
          <p className="take-muted">{meta.questionCount} questions · {meta.totalMarks} marks · {meta.exam.durationMinutes} minutes</p>
          {meta.exam.requireName && <label className="take-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>}
          <button className="take-primary" onClick={start}>Start exam</button>
          <p className="take-muted">Your answers are sent to the exam owner and marked automatically; written answers are marked by AI.</p>
        </div>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="take-shell">
        <div className="take-card take-start">
          <h1>{result?.status === 'marked' ? 'Exam marked' : 'Exam submitted'}</h1>
          {result?.score ? <p className="take-score">{result.score.total} / {result.score.max}</p> : <p>Marking your answers…</p>}
          {result?.feedback?.map((f) => f.needsReview ? null : <p key={f.questionId} className="take-feedback">{f.feedback}</p>)}
          <p className="take-muted">{result?.markingProgress ? `${result.markingProgress.done} of ${result.markingProgress.total} answers marked` : ''}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="take-shell">
      <header className="take-top">
        <div><strong>{meta.exam.title}</strong><div className="take-muted">{answeredCount} of {questions.length} answered</div></div>
        <div className="take-timer" aria-live="polite">{time} left</div>
        <button className="take-secondary" onClick={() => setNavOpen((v) => !v)}>Questions</button>
        <button className="take-primary" onClick={() => submit(false)}>Submit</button>
      </header>
      <div className="take-layout">
        <nav className={`take-nav ${navOpen ? 'open' : ''}`} aria-label="Question navigator">
          {questions.map((q, i) => <button key={q.id} className={i === index ? 'on' : answers[q.id] !== undefined ? 'answered' : ''} onClick={() => { setIndex(i); setNavOpen(false); }}>{i + 1}</button>)}
        </nav>
        <section className="take-card take-question">
          <div className="take-muted">Question {index + 1} of {questions.length} · {current.marks || 1} marks</div>
          <h2>{current.text || current.prompt}</h2>
          {current.options ? current.options.map((opt, i) => (
            <label key={i} className={`take-option ${answers[current.id] === String.fromCharCode(65 + i) ? 'selected' : ''}`}>
              <input type="radio" name={current.id} checked={answers[current.id] === String.fromCharCode(65 + i)} onChange={() => persist({ ...answers, [current.id]: String.fromCharCode(65 + i) })} />
              <span>{String.fromCharCode(65 + i)}. {opt}</span>
            </label>
          )) : (
            <textarea className="take-essay" value={answers[current.id] || ''} onChange={(e) => persist({ ...answers, [current.id]: e.target.value })} placeholder="Write your answer here" />
          )}
          <div className="take-actions">
            <button className="take-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button className="take-secondary" onClick={() => autosave()}>Save now</button>
            <button className="take-primary" disabled={index >= questions.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
          </div>
          <p className="take-muted">{saved}</p>
          {error && <p className="take-error">{error}</p>}
        </section>
      </div>
    </main>
  );
}
