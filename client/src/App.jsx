import React, { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, del, uploadFile, download } from './api.js';
import { login, logout, register, currentUser, setSession, clearSession } from './auth.js';
import { QUESTION_TYPES, totalMarks, validateExam, questionLines, answerText, validateHandout, handoutStats, estimateHandoutPages, isSectionsExam } from '../../shared/format.js';
import Settings from './Settings.jsx';
import Agents from './Agents.jsx';

const TABS = [
  ['notes', 'Study notes'],
  ['handout', 'Study handout'],
  ['exam', 'Exam'],
  ['cards', 'Flashcards'],
  ['library', 'Library'],
];

const BLANK_PROJECT = { module: '', level: '', trade: '', school: '', duration: '3 HOURS' };
const BLANK_FIELDS = { email: '', password: '', name: '' };

export default function App() {
  const [health, setHealth] = useState(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('exam');
  const [text, setText] = useState('');
  const [fileInfo, setFileInfo] = useState('');
  const [notesLibFiles, setNotesLibFiles] = useState([]);
  const [notesLibSelected, setNotesLibSelected] = useState('');
  const [notesLibUnits, setNotesLibUnits] = useState([]);
  const [notesLibSelectedUnits, setNotesLibSelectedUnits] = useState([]);
  const [project, setProject] = useState(BLANK_PROJECT);
  const [notes, setNotes] = useState(null);
  const [exam, setExam] = useState(null);
  const [cards, setCards] = useState(null);
  const [handout, setHandout] = useState(null);
  const [handoutProgress, setHandoutProgress] = useState(null);
  const [handoutJobId, setHandoutJobId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('examStudioTheme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; }
  });
  const [update, setUpdate] = useState(null);

  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authFields, setAuthFields] = useState(BLANK_FIELDS);
  const [authBusy, setAuthBusy] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [examOpts, setExamOpts] = useState({
    totalMarks: 100,
    essayCount: 2,
    types: ['sequencing', 'matching', 'mcq', 'select_all', 'true_false', 'short_answer', 'essay'],
    avoidSaved: true,
  });
  const [cardCount, setCardCount] = useState(30);
  const [focus, setFocus] = useState('');
  const [handoutOpts, setHandoutOpts] = useState({ units: '', includeRevision: true, includePractical: true });

  // Start-up: which AI is in use, and is the stored session still good?
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await get('/health');
        if (alive) setHealth(h);
      } catch (e) {
        if (alive) setError(e.message);
      }
      const me = await currentUser();
      if (!alive) return;
      setUser(me);
      setChecking(false);
    })();
    return () => { alive = false; };
  }, []);

  // A request came back 401: the token expired or was signed out elsewhere.
  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setAuthMode('login');
      setError('Your session ended. Please sign in again.');
    };
    window.addEventListener('exam-studio:signed-out', onSignedOut);
    return () => window.removeEventListener('exam-studio:signed-out', onSignedOut);
  }, []);

  // A newer version? The server answers from a cache it refreshes at most once every 24 hours, so
  // this is a cheap read rather than the browser going out to the internet.
  useEffect(() => {
    if (!user) { setUpdate(null); return undefined; }
    let alive = true;
    get('/update').then((data) => { if (alive) setUpdate(data); }).catch(() => {});
    return () => { alive = false; };
  }, [user]);

  useEffect(() => {
    try {
      const root = document.documentElement;
      root.dataset.theme = theme;
      localStorage.setItem('examStudioTheme', theme);
    } catch { /* ignore */ }
  }, [theme]);

    const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  // ---------------------------------------------------------------- auth actions
  const switchMode = (mode) => {
    setAuthMode(mode);
    setError('');
    setAuthFields(BLANK_FIELDS);
  };

  async function handleAuth(e) {
    e.preventDefault();
    const email = authFields.email.trim();
    if (!email) return setError('Enter your email address.');
    if (!authFields.password) return setError('Enter your password.');
    if (authMode === 'register') {
      if (!authFields.name.trim()) return setError('Enter your name.');
      const missing = PASSWORD_RULES.filter((rule) => !rule.test(authFields.password)).map((rule) => rule.label.toLowerCase());
      if (missing.length) return setError(`Your password needs ${missing.join(', ')}.`);
      if (authFields.password.length > 72) return setError('Your password must be 72 characters or fewer.');
    }

    setError('');
    setAuthBusy(authMode);
    try {
      const call = authMode === 'register' ? register : login;
      const { token, user: signedIn } = await call({ email, password: authFields.password, name: authFields.name.trim() });
      setSession({ token, user: signedIn });
      setUser(signedIn);
      setAuthFields(BLANK_FIELDS);
      flash(authMode === 'register' ? 'Account created' : 'Signed in');
      get('/health').then(setHealth).catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthBusy('');
    }
  }

  async function handleLogout() {
    await logout();
    clearSession();
    setUser(null);
    // Do not leave one person's work on screen for the next person.
    setNotes(null); setExam(null); setCards(null); setHandout(null);
    setText(''); setFileInfo(''); setFocus('');
    setProject(BLANK_PROJECT);
    setError('');
    flash('Signed out');
  }

  const refreshHealth = (h) => { if (h) setHealth(h); };

  // ---------------------------------------------------------------- work
  async function run(label, fn) {
    setError('');
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
        setError('Session expired. Please sign in again.');
      } else {
        setError(e.message);
      }
    } finally {
      setBusy('');
    }
  }

  const sourceReady = text.trim().length >= 50;
  const body = () => ({ text, title: project.module, level: project.level });

  const refreshNotesLib = () => get('/notes-lib/list')
    .then((d) => setNotesLibFiles(Array.isArray(d?.files) ? d.files : []))
    .catch((e) => setError(e.message));

  const loadNoteFromLib = (name) => run('upload', async () => {
    const r = await post('/notes-lib/load', { name });
    setText(r.text || '');
    setFileInfo(`${r.name}: ${(r.chars ?? r.charCount).toLocaleString()} characters, ${r.numPages || '?'} page(s)`);
    if (!project.module) setProject((p) => ({
      ...p,
      module: r.moduleCode || r.moduleTitle || r.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '),
    }));
    setNotesLibUnits(Array.isArray(r.units) ? r.units : []);
    setNotesLibSelectedUnits((r.units || []).map((_, i) => i));
  });

  useEffect(() => {
    if (!user) return;
    refreshNotesLib();
  }, [user]);

  const loadSelectedUnits = () => notesLibSelected && run('upload', async () => {
    const r = await post('/notes-lib/load', { name: notesLibSelected, units: notesLibSelectedUnits });
    setText(r.text || '');
    setFileInfo(`${r.name}: ${(r.chars ?? r.charCount).toLocaleString()} characters, ${r.numPages || '?'} page(s)}` + (notesLibSelectedUnits.length && r.units?.length ? ` (units: ${notesLibSelectedUnits.length})` : ''));
  });

  const onFile = (file) => file && run('upload', async () => {
    const r = await uploadFile(file);
    setText(r.text);
    setFileInfo(`${r.name}: ${r.chars.toLocaleString()} characters${r.truncated ? ' (cut to the size limit)' : ''}`);
    if (!project.module) setProject((p) => ({ ...p, module: r.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ') }));
  });

  const genNotes = () => run('notes', async () => { setNotes(await post('/notes/generate', { ...body(), focus })); setTab('notes'); });
  const genCards = () => run('cards', async () => { setCards(await post('/flashcards/generate', { ...body(), count: cardCount })); setTab('cards'); });
  const genExam = () => run('exam', async () => {
    let avoid = [];
    if (examOpts.avoidSaved) avoid = await savedQuestionTexts();
    setExam(await post('/exams/generate', { ...body(), ...examOpts, avoid }));
    setTab('exam');
  });

  // A handout is built in passes and can run for several minutes, so it reports progress on the
  // side: the job id is made here, the server records the steps under it while the build runs,
  // and this polls them so the screen can say which lesson is being written.
  const genHandout = () => run('handout', async () => {
    const jobId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setHandoutJobId(jobId);
    const units = handoutOpts.units.split(',').map((u) => u.trim()).filter(Boolean);
    setHandoutProgress({ message: 'Reading the manual and planning the units and lessons' });
    const tick = async () => {
      try {
        const { steps } = await get(`/handouts/progress/${jobId}`);
        const last = steps?.[steps.length - 1];
        if (last) setHandoutProgress(last);
      } catch { /* progress is a nicety; the build carries on without it */ }
    };
    const timer = setInterval(tick, 2500);
    try {
      const result = await post('/handouts/generate', {
        ...body(), jobId, units,
        includeRevision: handoutOpts.includeRevision,
        includePractical: handoutOpts.includePractical,
      });
      setHandout(result);
      setTab('handout');
      flash(result.demo ? 'Demo sample ready' : `Handout ready: ${result.stats?.lessons || 0} lessons`);
    } finally {
      clearInterval(timer);
      setHandoutProgress(null);
    }
  });

  const cancelHandout = () => {
    if (!handoutJobId) return;
    post(`/handouts/cancel/${handoutJobId}`, {}).catch(() => {});
  };

  async function savedQuestionTexts() {
    const list = (await get('/library')).filter((i) => i.kind === 'exam').slice(0, 5);
    const out = [];
    for (const it of list) {
      const full = await get(`/library/${it.id}`);
      for (const q of full.data.questions || []) {
        out.push(q.prompt, ...(q.items || []).map((x) => x.text));
      }
    }
    return out.filter(Boolean).slice(0, 60);
  }

  const save = (kind, data) => run('save', async () => { await post('/library', { kind, data, title: data.title }); flash('Saved to library'); });

  const version = health?.version ? <span className="version">v{health.version}</span> : null;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Exam Studio {version}</h1>
          <p className="sub">Turn course notes into study notes, flashcards and exams.</p>
        </div>
        <div className="topright">
          {health?.demo
            ? <span className="pill warn" title="DEMO_MODE=1: sample output, no AI calls">Demo mode: sample output only</span>
            : health?.provider && <span className="pill">AI: {health.provider} ({health.model})</span>}
          <button className="link theme-toggle" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
          {user && (
            <div className="userbox">
              <span className="who" title={user.email}>{user.name || user.email}</span>
              <button type="button" onClick={() => setShowSettings(true)}>Settings</button>
              <button type="button" onClick={() => setShowAgents(true)}>Agents</button>
              <button type="button" onClick={handleLogout}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      {toast && <div className="toast" role="status">{toast}</div>}

      {checking && <p className="empty">Loading…</p>}

      {/* ---------------------------------------------------------- sign in / register */}
      {!checking && !user && (
        <div className="auth-container">
          <form className="auth-box" onSubmit={handleAuth} noValidate>
            <h2>{authMode === 'register' ? 'Create your account' : 'Sign in'}</h2>
            <p className="hint auth-intro">
              {authMode === 'register'
                ? 'Your library is private to this account.'
                : 'Use the account you created for this app.'}
            </p>

            {error && <div className="banner error" role="alert">{error}</div>}

            {authMode === 'register' && (
              <label className="field">
                <span>Your name</span>
                <input
                  value={authFields.name}
                  onChange={(e) => setAuthFields((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Your full name"
                  autoComplete="name"
                  maxLength={80}
                  autoFocus
                />
              </label>
            )}

            <label className="field">
              <span>Email</span>
              <input
                value={authFields.email}
                onChange={(e) => setAuthFields((f) => ({ ...f, email: e.target.value }))}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                maxLength={254}
                autoFocus={authMode === 'login'}
              />
            </label>

            <label className="field">
              <span>Password</span>
              <span className="password-row">
                <input
                  value={authFields.password}
                  onChange={(e) => setAuthFields((f) => ({ ...f, password: e.target.value }))}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  maxLength={72}
                />
                <button type="button" className="link" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>

            {authMode === 'register' && <PasswordRules value={authFields.password} />}

            <button className="primary auth-submit" type="submit" disabled={!!authBusy}>
              {authBusy ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}
            </button>

            <p className="auth-toggle">
              {authMode === 'register' ? 'Already have an account? ' : 'New here? '}
              <button type="button" className="auth-link" onClick={() => switchMode(authMode === 'register' ? 'login' : 'register')}>
                {authMode === 'register' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          </form>

          {health && (
            <p className="hint auth-foot">
              {health.storage?.backend === 'file'
                ? 'Storing accounts and your library in a local file (no database server found).'
                : `Storing accounts and your library in ${health.storage?.backend || 'the database'}.`}
            </p>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- the app */}
      {!checking && user && (
        <>
          {error && <div className="banner error" role="alert">{error}</div>}

          {update?.updateAvailable && (
            <div className="banner warn" role="status">
              <span>
                <strong>Exam Studio {String(update.latest).replace(/^v/i, '')} is available.</strong> You are using {update.current}.{' '}
                {update.url
                  ? <a href={update.url} target="_blank" rel="noreferrer">See what is new</a>
                  : 'Ask whoever installed it for the new version.'}
              </span>
            </div>
          )}

          <aside className="sidebar" aria-label="Main navigation">
            <nav className="sidebar-nav">
              {TABS.map(([k, label]) => (
                <button type="button" key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
              ))}
              <button type="button" className="link" onClick={() => setShowSettings(true)}>Settings</button>
              <button type="button" className="link" onClick={() => setShowAgents(true)}>Agents</button>
            </nav>
          </aside>

          <div className="layout">
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

              {notesLibFiles.length > 0 && (
                <div className="notes-lib">
                  <div className="bar">
                    <span>Notes library (read-only folder)</span>
                    <button className="link" onClick={refreshNotesLib}>Refresh</button>
                  </div>
                  <div className="cards notes-lib-cards">
                     {notesLibFiles.map((f) => (
                       <button key={f.name} type="button" className={'card ' + (notesLibSelected === f.name ? 'selected' : '')} onClick={() => { setNotesLibSelected(f.name); loadNoteFromLib(f.name); }}>
                         <span className="qtype">{f.moduleCode || 'DOC'}</span>
                         <span className="front">{f.moduleTitle || f.name}</span>
                         <span className="hint">{(f.charCount || 0).toLocaleString()} chars{f.numPages ? ` · ${f.numPages} pages` : ''}</span>
                         {f.scanned && <span className="hint warn">Possibly scanned</span>}
                       </button>
                     ))}
                   </div>
                   {notesLibFiles.find((f) => f.name === notesLibSelected)?.scanned && (
                     <p className="hint warn">This PDF has little or no text layer and may be scanned. OCR will be attempted, or upload a text-based file.</p>
                   )}

                   {notesLibSelected && notesLibUnits.length > 0 && (
                     <button className="primary" onClick={loadSelectedUnits} disabled={!notesLibSelectedUnits.length || !!busy}>
                       {busy === 'upload' ? 'Loading…' : 'Use selected units'}
                     </button>
                   )}

                  {notesLibUnits.length > 0 && (
                    <fieldset className="notes-lib-units">
                       <legend>Units / learning outcomes (choose one or more)</legend>
                       {notesLibUnits.map((u, i) => (
                         <label key={i} className="notes-lib-unit">
                           <input type="checkbox" checked={notesLibSelectedUnits.includes(i)} onChange={(e) => setNotesLibSelectedUnits((prev) => e.target.checked ? [...prev, i] : prev.filter((n) => n !== i))} />
                           <span>{u.title}{u.pageStart ? ` (pp. ${u.pageStart}–${u.pageEnd || u.pageStart})` : ''}</span>
                         </label>
                       ))}
                     </fieldset>
                  )}
                </div>
              )}

              <FileDrop onFile={onFile} busy={busy === 'upload'} />
              {fileInfo && <p className="hint">{fileInfo}</p>}
              <label className="field">
                <span>Or paste notes</span>
                <textarea rows={10} value={text} onChange={(e) => { setText(e.target.value); setFileInfo(''); }} placeholder="Paste chapters or lesson notes here" />
              </label>
              <p className="hint">{text.length.toLocaleString()} characters{!sourceReady && text.length > 0 ? ' (add a little more)' : ''}</p>
            </aside>

            <main className="panel work">
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
                <li className={tab ? 'active' : ''}><span className="step-no">2</span> Generate</li>
                <li className={(notes || cards || exam || handout) ? 'done' : ''}><span className="step-no">3</span> Review &amp; export</li>
              </ol>
              <nav className="tabs" role="tablist">
                {TABS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
                ))}
              </nav>
              {sourceReady && <p className="hint">Source: {text.length.toLocaleString()} characters (~{Math.ceil(text.length / 4).toLocaleString()} tokens).</p>}

              {tab === 'notes' && (
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

              {tab === 'handout' && (
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

              {tab === 'exam' && (
                <section>
                  <ExamSettings opts={examOpts} setOpts={setExamOpts} />
                  <div className="bar">
                    <button className="primary" disabled={!sourceReady || !!busy || !examOpts.types.length} onClick={genExam}>
                      {busy === 'exam' ? 'Writing the exam… this can take a minute or two' : exam ? 'Write a new exam' : 'Write exam'}
                    </button>
                  </div>
                  {!exam && <Empty ready={sourceReady} what="an exam" />}
                   {exam && (isSectionsExam(exam)
                     ? <SectionsExamView exam={exam} setExam={setExam} target={examOpts.totalMarks} project={project} busy={busy}
                       run={run} onSave={() => save('exam', exam)} />
                     : <ExamView exam={exam} setExam={setExam} target={examOpts.totalMarks} project={project} busy={busy}
                       run={run} onSave={() => save('exam', exam)} />)}
                </section>
              )}

              {tab === 'cards' && (
                <section>
                  <div className="bar">
                    <label className="inline">Cards <input type="number" min={5} max={80} value={cardCount} onChange={(e) => setCardCount(e.target.value)} /></label>
                    <button className="primary" disabled={!sourceReady || !!busy} onClick={genCards}>{busy === 'cards' ? 'Writing…' : 'Make flashcards'}</button>
                  </div>
                  {!cards && <Empty ready={sourceReady} what="flashcards" />}
                  {cards && <CardsView cards={cards} onSave={() => save('flashcards', cards)} />}
                </section>
              )}

              {tab === 'library' && (
                <Library onOpen={(item) => {
                  if (item.kind === 'exam') { setExam(item.data); setTab('exam'); }
                  if (item.kind === 'notes') { setNotes(item.data); setTab('notes'); }
                  if (item.kind === 'flashcards') { setCards(item.data); setTab('cards'); }
                  if (item.kind === 'handout') { setHandout(item.data); setTab('handout'); }
                }} />
              )}
            </main>
          </div>
        </>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} onChanged={refreshHealth} update={update} onUpdate={setUpdate} />}
      {showAgents && <Agents onClose={() => setShowAgents(false)} onOpenSettings={() => { setShowAgents(false); setShowSettings(true); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- pieces
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A number', test: (p) => /[0-9]/.test(p) },
];

// Live checklist, so the rule that the server enforces is visible before submitting.
function PasswordRules({ value }) {
  return (
    <ul className="pw-rules">
      {PASSWORD_RULES.map((rule) => (
        <li key={rule.label} className={rule.test(value) ? 'ok' : ''}>
          <span aria-hidden="true">{rule.test(value) ? '✓' : '•'}</span> {rule.label}
        </li>
      ))}
    </ul>
  );
}

function FileDrop({ onFile, busy }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
    >
      <input ref={ref} type="file" hidden accept=".pdf,.docx,.txt,.md" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current.click()} disabled={busy}>{busy ? 'Reading file…' : 'Upload PDF, Word or text'}</button>
      <span className="hint">or drop a file here (up to 15 MB)</span>
    </div>
  );
}

function Empty({ ready, what }) {
  return <p className="empty">{ready ? `Ready. Press the button to make ${what}.` : `Add your notes on the left, then make ${what}.`}</p>;
}

function ExamSettings({ opts, setOpts }) {
  const toggle = (t) => setOpts({ ...opts, types: opts.types.includes(t) ? opts.types.filter((x) => x !== t) : [...opts.types, t] });
  return (
    <div className="settings">
      <label className="inline">Total marks
        <input type="number" min={10} max={200} value={opts.totalMarks} onChange={(e) => setOpts({ ...opts, totalMarks: Number(e.target.value) })} /></label>
      <label className="inline">Essays
        <input type="number" min={1} max={4} value={opts.essayCount} disabled={!opts.types.includes('essay')}
          onChange={(e) => setOpts({ ...opts, essayCount: Number(e.target.value) })} /></label>
      <label className="inline check">
        <input type="checkbox" checked={opts.avoidSaved} onChange={(e) => setOpts({ ...opts, avoidSaved: e.target.checked })} />
        Avoid questions from saved exams</label>
       <label className="inline">Variant
        <select value={opts.variant || 'A'} onChange={(e) => setOpts({ ...opts, variant: e.target.value })}>
          <option value="A">A</option>
          <option value="B">B</option>
        </select></label>
      <fieldset>
        <legend>Question types</legend>
        {Object.entries(QUESTION_TYPES).map(([k, label]) => (
          <label key={k} className="chip"><input type="checkbox" checked={opts.types.includes(k)} onChange={() => toggle(k)} />{label}</label>
        ))}
      </fieldset>
    </div>
  );
}

function ExamView({ exam, setExam, target, project, busy, run, onSave }) {
  const warnings = useMemo(() => validateExam(exam, target), [exam, target]);
  const total = totalMarks(exam);
  const meta = project;
  const setQ = (i, patch) => setExam({ ...exam, questions: exam.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const removeQ = (i) => setExam({ ...exam, questions: exam.questions.filter((_, j) => j !== i) });
  const dl = (path, file) => run('export', () => download(path, { exam, meta }, file));
  const base = (exam.title || 'Exam').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Exam';

  return (
    <div>
      <div className={`summary ${exam.demo ? 'warn' : warnings.length ? 'bad' : 'good'}`}>
        <strong>{exam.questions.length} questions, {total} marks</strong>
        {exam.demo
          ? <span>Built-in demo sample, not written from your notes</span>
          : warnings.length ? <span>{warnings.length} to fix before you print</span> : <span>All checks pass</span>}
      </div>
      {!exam.demo && warnings.length > 0 && (
        <ul className="warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      <div className="bar wrap">
        <button className="primary" disabled={!!busy} onClick={() => dl('/export/exam-docx', `${base}.docx`)}>Download exam (Word)</button>
        <button disabled={!!busy} onClick={() => dl('/export/key-docx', `${base}_Marking_Scheme.docx`)}>Marking scheme (Word)</button>
        <button disabled={!!busy} onClick={() => dl('/export/exam-csv', 'Exam_Questions.csv')}>Questions (CSV for Sheets)</button>
        <button disabled={!!busy} onClick={() => dl('/export/key-csv', 'Exam_Answer_Key.csv')}>Answer key (CSV)</button>
        <button disabled={!!busy} onClick={() => run('export', async () => {
          const r = await post('/export/google-sheets', { exam, meta });
          if (r?.url) window.open(r.url, '_blank', 'noopener,noreferrer');
        })}>Export to Google Sheets</button>
        <button disabled={!!busy} onClick={onSave}>Save to library</button>
      </div>
      <ol className="questions">
        {exam.questions.map((q, i) => (
          <li key={i} className="q">
            <div className="qhead">
              <span className="qtype">{QUESTION_TYPES[q.type] || q.type}</span>
              <label className="inline small">Marks
                <input type="number" min={1} value={q.marks} onChange={(e) => setQ(i, { marks: Number(e.target.value) })} /></label>
              <button className="link" onClick={() => removeQ(i)}>Remove</button>
            </div>
            <textarea rows={2} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} aria-label={`Question ${i + 1} text`} />
            {(q.type === 'mcq' || q.type === 'select_all') && Array.isArray(q.options) && (
              <div className="option-list">
                <fieldset>
                  <legend>Options ({q.type === 'mcq' ? 'choose one' : 'select all that apply'})</legend>
                  {q.options.map((o, k) => (
                    <label key={k} className="option-row">
                      <span className="qtype">{String.fromCharCode(65 + k)}</span>
                      <input value={o}
                        onChange={(e) => setQ(i, { options: q.options.map((x, j) => j === k ? e.target.value : x ) })} />
                      {q.type === 'mcq' && (
                        <label className="inline small">
                          <input type="radio" name={`answer-${i}`} checked={q.answer === String.fromCharCode(65 + k)} onChange={() => setQ(i, { answer: String.fromCharCode(65 + k) })}/>
                          answer
                        </label>
                      )}
                      {q.type === 'select_all' && (
                        <label className="inline small">
                          <input type="checkbox" checked={(q.correct||[]).includes(String.fromCharCode(65 + k))}
                            onChange={(e) => setQ(i, { correct: e.target.checked ? [...(q.correct||[]),String.fromCharCode(65+k)] : (q.correct||[]).filter((x)=>x!==String.fromCharCode(65+k))})}/>
                          correct
                        </label>
                      )}
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
            {q.type === 'true_false' && Array.isArray(q.items) && (
              <div className="option-list">
                {q.items.map((it, k) => (
                  <div key={k} className="option-row" style={{gridTemplateColumns:'32px 1fr 140px'}}>
                    <span className="qtype">{String.fromCharCode(65 + k)}</span>
                    <input value={it.text||''} onChange={(e) => setQ(i,{items:q.items.map((x,j)=> j===k?{...x,text:e.target.value}:x)})}/>
                    <select value={typeof it.answer==='boolean'?String(it.answer):it.answer} onChange={(e)=> setQ(i,{items:q.items.map((x,j)=>j===k?{...x,answer:e.target.value==='True'?true:e.target.value==='False'?false:e.target.value}:x)})}>
                      <option>True</option>
                      <option>False</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
            <pre className="lines">{questionLines(q).join('\n')}</pre>
            <details><summary>Answer</summary><pre className="lines ans">{answerText(q)}</pre></details>
          </li>
        ))}
      </ol>
      <p className="hint">You can edit a question's wording and marks here. Options and answers are fixed: to change those, write a new exam or edit the Word file.</p>
    </div>
  );
}

function SectionsExamView({ exam, setExam, target, project, busy, run, onSave }) {
  const warnings = useMemo(() => validateExam(exam, target), [exam, target]);
  const total = totalMarks(exam);
  const meta = project;
  const dl = (path, file) => run('export', () => download(path, { exam, meta }, file));
  const base = (exam.title || 'Exam').replace(/[^\w\- ]+/g, '').trim().replace(/\\s+/g, '_') || 'Exam';
  const setSections = (sections) => setExam({ ...exam, sections });
  const setSection = (si, patch) => setSections(exam.sections.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const setItem = (si, ii, patch) => {
    const section = exam.sections[si];
    const items = (section.items || []).map((it, j) => (j === ii ? { ...it, ...patch } : it));
    setSection(si, { items });
  };
  const setList = (si, ii, field, index, value) => {
    const section = exam.sections[si];
    const item = section.items[ii];
    const list = Array.isArray(item[field]) ? [...item[field]] : [];
    list[index] = value;
    setItem(si, ii, { [field]: list });
  };
  const addListItem = (si, ii, field) => {
    const section = exam.sections[si];
    const item = section.items[ii];
    const list = Array.isArray(item[field]) ? [...item[field], ''] : [''];
    setItem(si, ii, { [field]: list });
  };
  const removeListItem = (si, ii, field, index) => {
    const section = exam.sections[si];
    const item = section.items[ii];
    const list = (Array.isArray(item[field]) ? item[field] : []).filter((_, j) => j !== index);
    setItem(si, ii, { [field]: list });
  };

  const editMarks = (si, value) => {
    const section = exam.sections[si];
    setSection(si, { marks: Number.isFinite(Number(value)) ? Number(value) : section.marks });
  };

  const renderMcq = (section, item, si, ii) => (
    <div className="qbody">
      <textarea rows={2} value={item.text || ''} onChange={(e) => setItem(si, ii, { text: e.target.value })} aria-label={`Question ${ii + 1} text`} />
      <div className="options">
        {(item.options || []).map((opt, oi) => (
          <label key={oi} className="option-row">
            <span>{String.fromCharCode(65 + oi)}.</span>
            <input value={opt || ''} onChange={(e) => setList(si, ii, 'options', oi, e.target.value)} />
          </label>
        ))}
      </div>
      <label className="inline small">Answer
        <input value={item.answer || ''} onChange={(e) => setItem(si, ii, { answer: e.target.value.toUpperCase().slice(0, 1) })} style={{ width: 60 }} />
      </label>
      {item.notes && <p className="hint">{item.notes}</p>}
    </div>
  );

  const renderTf = (item, si, ii) => (
    <div className="qbody">
      <textarea rows={2} value={item.text || ''} onChange={(e) => setItem(si, ii, { text: e.target.value })} />
      <label className="inline small">Answer
        <select value={item.answer || 'True'} onChange={(e) => setItem(si, ii, { answer: e.target.value })}>
          <option>True</option>
          <option>False</option>
        </select>
      </label>
    </div>
  );

  const renderFill = (item, si, ii) => (
    <div className="qbody">
      <textarea rows={2} value={item.text || ''} onChange={(e) => setItem(si, ii, { text: e.target.value })} />
      <label className="inline small">Answer
        <input value={item.answer || ''} onChange={(e) => setItem(si, ii, { answer: e.target.value })} />
      </label>
    </div>
  );

  const renderShort = (item, si, ii) => (
    <div className="qbody">
      <textarea rows={2} value={item.text || ''} onChange={(e) => setItem(si, ii, { text: e.target.value })} />
      <label className="inline small">Marks
        <input type="number" min={1} value={item.marks || 0} onChange={(e) => setItem(si, ii, { marks: Number(e.target.value) })} />
      </label>
      <label className="inline small">Answer
        <textarea rows={2} value={item.answer || ''} onChange={(e) => setItem(si, ii, { answer: e.target.value })} />
      </label>
    </div>
  );

  const renderStructured = (item, si, ii) => (
    <div className="qbody">
      <label className="inline">Title
        <input value={item.title || ''} onChange={(e) => setItem(si, ii, { title: e.target.value })} style={{ width: 320 }} />
      </label>
      <label className="inline small">Total marks
        <input type="number" min={1} value={item.totalMarks || 0} onChange={(e) => setItem(si, ii, { totalMarks: Number(e.target.value) })} />
      </label>
      <div>
        <strong>Parts</strong>
        {(item.parts || []).map((p, pi) => (
          <div key={pi} className="option-row" style={{ alignItems: 'flex-start' }}>
            <span>{p.letter || String.fromCharCode(97 + pi)}.</span>
            <textarea rows={2} value={p.text || ''} onChange={(e) => {
              const parts = (item.parts || []).map((pp, pj) => (pj === pi ? { ...pp, text: e.target.value } : pp));
              setItem(si, ii, { parts });
            }} />
            <label className="inline small">marks
              <input type="number" min={0} value={p.marks || 0} onChange={(e) => {
                const parts = (item.parts || []).map((pp, pj) => (pj === pi ? { ...pp, marks: Number(e.target.value) } : pp));
                setItem(si, ii, { parts });
              }} style={{ width: 60 }} />
            </label>
          </div>
        ))}
      </div>
      <div>
        <strong>Marking points</strong>
        {(item.markingPoints || []).map((mp, mi) => (
          <div key={mi} className="option-row">
            <textarea rows={1} value={mp.point || ''} onChange={(e) => {
              const markingPoints = (item.markingPoints || []).map((m, mj) => (mj === mi ? { ...m, point: e.target.value } : m));
              setItem(si, ii, { markingPoints });
            }} />
            <label className="inline small">marks
              <input type="number" min={0} value={mp.marks || 0} onChange={(e) => {
                const markingPoints = (item.markingPoints || []).map((m, mj) => (mj === mi ? { ...m, marks: Number(e.target.value) } : m));
                setItem(si, ii, { markingPoints });
              }} style={{ width: 60 }} />
            </label>
          </div>
        ))}
      </div>
      <label className="inline small">Model answer
        <textarea rows={4} value={item.modelAnswer || ''} onChange={(e) => setItem(si, ii, { modelAnswer: e.target.value })} />
      </label>
      <label className="inline small">Code
        <textarea rows={4} value={item.code || ''} onChange={(e) => setItem(si, ii, { code: e.target.value })} />
      </label>
    </div>
  );

  return (
    <div>
      <div className={`summary ${exam.demo ? 'warn' : warnings.length ? 'bad' : 'good'}`}>
        <strong>{exam.sections.length} sections, {totalMarks(exam)} marks</strong>
        {exam.demo
          ? <span>Built-in demo sample, not written from your notes</span>
          : warnings.length ? <span>{warnings.length} to fix before you print</span> : <span>All checks pass</span>}
      </div>
      {!exam.demo && warnings.length > 0 && (
        <ul className="warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      <div className="bar wrap">
        <button className="primary" disabled={!!busy} onClick={() => dl('/export/exam-docx', `${base}.docx`)}>Download exam (Word)</button>
        <button disabled={!!busy} onClick={() => dl('/export/key-docx', `${base}_Marking_Scheme.docx`)}>Marking scheme (Word)</button>
        <button disabled={!!busy} onClick={() => dl('/export/exam-csv', 'Exam_Questions.csv')}>Questions (CSV for Sheets)</button>
        <button disabled={!!busy} onClick={() => dl('/export/key-csv', 'Exam_Answer_Key.csv')}>Answer key (CSV)</button>
        <button disabled={!!busy} onClick={() => run('export', async () => {
          const r = await post('/export/google-sheets', { exam, meta });
          if (r?.url) window.open(r.url, '_blank', 'noopener,noreferrer');
        })}>Export to Google Sheets</button>
        <button disabled={!!busy} onClick={onSave}>Save to library</button>
      </div>
      <label className="inline">Title

        <input value={exam.title || ''} onChange={(e) => setExam({ ...exam, title: e.target.value })} style={{ width: 320 }} />
      </label>
      {exam.sections.map((section, si) => (
        <section key={section.id || si} className="exam-section" style={{ marginTop: 16, borderTop: '1px solid #ddd', paddingTop: 12 }}>
          <div className="qhead">
            <h3 style={{ margin: 0 }}>Section {section.id}: {section.title}</h3>
            <span className="qtype">{section.kind}</span>
            <label className="inline small">Marks
              <input type="number" min={1} value={section.marks || 0} onChange={(e) => editMarks(si, e.target.value)} style={{ width: 70 }} />
            </label>
            <label className="inline small">Title
              <input value={section.title || ''} onChange={(e) => setSection(si, { title: e.target.value })} style={{ width: 220 }} />
            </label>
          </div>
          {section.instruction && <p className="hint">{section.instruction}</p>}
          <ol className="questions">
            {(section.items || []).map((item, ii) => (
              <li key={ii} className="q">
                <div className="qhead">
                  <span className="qtype">Q{item.number || ii + 1}</span>
                </div>
                {section.kind === 'mcq' && renderMcq(section, item, si, ii)}
                {section.kind === 'true_false' && renderTf(item, si, ii)}
                {section.kind === 'fill_blank' && renderFill(item, si, ii)}
                {section.kind === 'short_answer' && renderShort(item, si, ii)}
                {section.kind === 'structured' && renderStructured(item, si, ii)}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}


function NotesView({ notes, onSave, onWord }) {
  return (
    <div>
      <div className="bar wrap">
        <button className="primary" onClick={onWord}>Download (Word)</button>
        <button onClick={onSave}>Save to library</button>
      </div>
      <h2 className="doc">{notes.title}</h2>
      {notes.demo && <p className="hint">Built-in demo sample, not written from your notes.</p>}
      {notes.sections.map((s, i) => (
        <article key={i} className="note">
          <h3>{s.topic}</h3>
          <ul>{s.keyPoints.map((k, j) => <li key={j}>{k}</li>)}</ul>
          {s.example && <p className="remember"><strong>Remember:</strong> {s.example}</p>}
        </article>
      ))}
    </div>
  );
}

function CardsView({ cards, onSave }) {
  const [open, setOpen] = useState({});
  const [onlyTraps, setOnlyTraps] = useState(false);
  const traps = cards.cards.filter((c) => c.cardType === 'trap').length;
  const shown = onlyTraps ? cards.cards.filter((c) => c.cardType === 'trap') : cards.cards;
  const tsv = () => {
    const blob = new Blob([cards.cards.map((c) => `${c.front.replace(/\t|\n/g, ' ')}\t${c.back.replace(/\t|\n/g, ' ')}`).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'flashcards.tsv';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div>
      <div className="bar wrap">
        <button onClick={() => setOpen(Object.fromEntries(cards.cards.map((_, i) => [i, true])))}>Show all answers</button>
        <button onClick={() => setOpen({})}>Hide all</button>
        <button onClick={tsv}>Download for Quizlet (TSV)</button>
        <button onClick={onSave}>Save to library</button>
        {traps > 0 && (
          <label className="inline check">
            <input type="checkbox" checked={onlyTraps} onChange={(e) => setOnlyTraps(e.target.checked)} />
            Only the {traps} trap card{traps === 1 ? '' : 's'}
          </label>
        )}
      </div>
      <h2 className="doc">{cards.title}</h2>
      {cards.demo && <p className="hint">Built-in demo sample, not written from your notes.</p>}
      <div className="cards">
        {shown.map((c, i) => (
          <button key={i} className={`card ${open[i] ? 'flipped' : ''} ${c.cardType === 'trap' ? 'trap' : ''}`} onClick={() => setOpen({ ...open, [i]: !open[i] })}>
            {c.cardType === 'trap' && <span className="qtype">trap</span>}
            <span className="card-face front">{c.front}</span>
            <span className="card-face back">{c.back}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Library({ onOpen }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const load = () => get('/library').then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const open = async (id) => { try { onOpen(await get(`/library/${id}`)); } catch (e) { setErr(e.message); } };
  const remove = async (id) => { if (window.confirm('Delete this item?')) { try { await del(`/library/${id}`); load(); } catch (e) { setErr(e.message); } } };
  if (err) return <p className="banner error">{err}</p>;
  if (!items) return <p className="empty">Loading…</p>;
  if (!items.length) return <p className="empty">Nothing saved yet. Use "Save to library" on any result.</p>;
  return (
    <ul className="library">
      {items.map((it) => (
        <li key={it.id}>
          <span className="qtype">{it.kind}</span>
          <button className="link grow" onClick={() => open(it.id)}>{it.title}</button>
          <time>{new Date(it.createdAt).toLocaleDateString()}</time>
          <button className="link" onClick={() => remove(it.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- study handout
// Where the marking scheme scores the exam, a handout is judged by coverage: is there one lesson
// per indicative content, does every lesson have key terms and a worked example. So the banner
// counts those instead of marks.

const PROGRESS_RANGE = { 1: [2, 8], 2: [8, 78], 3: [78, 98] };
function progressPercent(progress) {
  if (!progress) return 2;
  const [from, to] = PROGRESS_RANGE[progress.pass] || [98, 99];
  const ratio = progress.total ? Math.min(1, (progress.done || 0) / progress.total) : 0;
  return Math.round(from + (to - from) * ratio);
}

// The AI writes bold lead-ins as **Lead-in:** inside plain strings; show them as bold, never as
// asterisks. The Word renderer has the same rule.
function Rich({ text }) {
  const parts = String(text ?? '').split('**');
  return <>{parts.map((chunk, i) => (i % 2 ? <strong key={i}>{chunk}</strong> : chunk))}</>;
}

function HandoutSettings({ opts, setOpts }) {
  return (
    <div className="settings">
      <label className="field grow">
        <span>Units to include</span>
        <input value={opts.units} onChange={(e) => setOpts({ ...opts, units: e.target.value })} placeholder="e.g. 1,2 — leave empty to build the whole manual" />
      </label>
      <label className="inline check">
        <input type="checkbox" checked={opts.includeRevision} onChange={(e) => setOpts({ ...opts, includeRevision: e.target.checked })} />
        Include the revision questions</label>
      <label className="inline check">
        <input type="checkbox" checked={opts.includePractical} onChange={(e) => setOpts({ ...opts, includePractical: e.target.checked })} />
        Include the practical task</label>
      <p className="hint">
        One lesson per indicative content, each with a key terms table and a worked example, then diagrams,
        an exam memory sheet, revision questions, a practical task and study tips.
      </p>
    </div>
  );
}

function HandoutView({ handout, onSave, run, busy }) {
  const warnings = useMemo(() => validateHandout(handout), [handout]);
  const stats = useMemo(() => handoutStats(handout), [handout]);
  const pages = useMemo(() => estimateHandoutPages(handout), [handout]);
  const base = (handout.title || 'Study_Handout').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Study_Handout';

  return (
    <div>
      <div className={`summary ${handout.demo ? 'warn' : warnings.length ? 'bad' : 'good'}`}>
        <strong>{stats.units} unit{stats.units === 1 ? '' : 's'}, {stats.lessons} lesson{stats.lessons === 1 ? '' : 's'}</strong>
        {handout.demo
          ? <span>Built-in demo sample, not written from your notes</span>
          : warnings.length ? <span>{warnings.length} to check</span> : <span>All checks pass</span>}
      </div>
      <p className="hint">
        {stats.keyTerms} key terms · {stats.workedExamples} worked examples · {stats.callouts} callout boxes · {stats.diagrams} diagrams ·{' '}
        {stats.memoryRows} memory rows · {stats.questions} revision questions · about {pages} printed pages
      </p>

      {warnings.length > 0 && <ul className="warnings">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      {!!handout.errorsInSource?.length && (
        <details className="handout-defects">
          <summary>{handout.errorsInSource.length} defect{handout.errorsInSource.length === 1 ? '' : 's'} found in the notes</summary>
          <ul className="warnings">
            {handout.errorsInSource.map((e, i) => <li key={i}><strong>{e.where}</strong> — the notes say “{e.says}”. {e.correction}</li>)}
          </ul>
        </details>
      )}

      <div className="bar wrap">
        <button className="primary" disabled={!!busy} onClick={() => run('export', () => download('/export/handout-docx', { handout }, `${base}.docx`))}>Download handout (Word)</button>
        <button disabled={!!busy} onClick={() => run('export', () => download('/export/handout-pdf', { handout }, `${base}.pdf`))}>Download (PDF)</button>
        <button disabled={!!busy} onClick={() => window.print()}>Print preview</button>
        <button disabled={!!busy} onClick={onSave}>Save to library</button>
      </div>

      {handout.units.map((unit) => <HandoutUnit key={unit.number} unit={unit} />)}
    </div>
  );
}

function HandoutUnit({ unit }) {
  return (
    <article className="handout-unit">
      <h2 className="doc">Unit {unit.number}: {unit.title}</h2>
      {unit.learningOutcome && <p className="callout remember"><strong>Learning outcome:</strong> {unit.learningOutcome}</p>}
      <p className="hint">
        {unit.duration ? `Duration: ${unit.duration} · ` : ''}
        {unit.indicativeContents?.length ? `${unit.indicativeContents.length} indicative content(s)` : ''}
      </p>
      {unit.lessons.map((lesson) => <HandoutLesson key={lesson.number} lesson={lesson} />)}
      <HandoutExtras unit={unit} />
      <p className="handout-end">END OF UNIT {unit.number} HANDOUT</p>
    </article>
  );
}

function HandoutLesson({ lesson }) {
  if (lesson.failed) {
    return (
      <section className="handout-lesson">
        <h3>{lesson.number} {lesson.title}</h3>
        <p className="banner error">This lesson could not be written. Write the handout again to retry it.</p>
      </section>
    );
  }
  return (
    <section className="handout-lesson">
      <h3>{lesson.number} {lesson.title}</h3>

      {!!lesson.keyTerms?.length && (
        <table className="handout-table">
          <thead><tr><th>Key term</th><th>Clear meaning</th></tr></thead>
          <tbody>{lesson.keyTerms.map((t, i) => <tr key={i}><td><strong>{t.term}</strong></td><td><Rich text={t.meaning} /></td></tr>)}</tbody>
        </table>
      )}

      {lesson.blocks?.map((block, i) => <HandoutBlock key={i} block={block} />)}

      {lesson.callouts?.map((c, i) => (
        <p key={i} className={`callout ${c.kind}`}><strong>{c.label}</strong> <Rich text={c.text} /></p>
      ))}

      {lesson.workedExample && (
        <div className="worked-example">
          <p className="we-title">WORKED EXAMPLE: {lesson.workedExample.title}</p>
          {lesson.workedExample.task && <p><strong>Task:</strong> <Rich text={lesson.workedExample.task} /></p>}
          {lesson.workedExample.thinking && <p><strong>Thinking it through:</strong> <Rich text={lesson.workedExample.thinking} /></p>}
          {!!lesson.workedExample.steps?.length && (
            <ol>{lesson.workedExample.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>
          )}
          {lesson.workedExample.code && <pre className="mono">{lesson.workedExample.code}</pre>}
          {lesson.workedExample.expected && <p><strong>Expected result:</strong> <Rich text={lesson.workedExample.expected} /></p>}
          {lesson.workedExample.why && <p><strong>Why this is right:</strong> <Rich text={lesson.workedExample.why} /></p>}
          {!!lesson.workedExample.mistakes?.length && (
            <>
              <p><strong>Common mistakes:</strong></p>
              <ul>{lesson.workedExample.mistakes.map((m, i) => <li key={i}><Rich text={m} /></li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function HandoutBlock({ block }) {
  const heading = block.heading ? <p className="block-heading">{block.heading}</p> : null;
  if (block.kind === 'prose') {
    return <>{heading}<p><Rich text={block.text} /></p>{block.code && <pre className="mono">{block.code}</pre>}</>;
  }
  if (block.kind === 'bullets') {
    return <>{heading}<ul>{block.items.map((it, i) => <li key={i}><Rich text={it} /></li>)}</ul>{block.code && <pre className="mono">{block.code}</pre>}</>;
  }
  if (block.kind === 'steps') {
    return <>{heading}<ol>{block.items.map((it, i) => <li key={i}><Rich text={it} /></li>)}</ol>{block.code && <pre className="mono">{block.code}</pre>}</>;
  }
  return (
    <>
      {heading}
      <table className="handout-table">
        <thead><tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{block.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}><Rich text={cell} /></td>)}</tr>)}</tbody>
      </table>
      {block.code && <pre className="mono">{block.code}</pre>}
    </>
  );
}

function HandoutExtras({ unit }) {
  const revision = unit.revision || {};
  const practical = unit.practical || {};
  return (
    <>
      {!!unit.diagrams?.length && (
        <>
          <h3>Diagrams explained step by step</h3>
          {unit.diagrams.map((d, i) => (
            <div key={i} className="handout-diagram">
              <p className="block-heading">{d.title}</p>
              <pre className="mono">{d.ascii}</pre>
              <ol>{d.readSteps.map((s, j) => <li key={j}><Rich text={s} /></li>)}</ol>
              {d.redraw && <p><strong>Redrawing it in the exam:</strong> <Rich text={d.redraw} /></p>}
            </div>
          ))}
        </>
      )}

      {!!unit.memorySheet?.length && (
        <>
          <h3>Exam memory sheet</h3>
          <table className="handout-table">
            <thead><tr><th>Remember</th><th>Quick answer</th></tr></thead>
            <tbody>{unit.memorySheet.map((row, i) => <tr key={i}><td><Rich text={row.remember} /></td><td><Rich text={row.answer} /></td></tr>)}</tbody>
          </table>
        </>
      )}

      {(revision.mcq?.length || revision.trueFalse?.length || revision.scenario?.length) ? (
        <>
          <h3>Revision questions</h3>
          <RevisionGroup title="Multiple choice" items={revision.mcq} render={(item) => (
            <>
              <Rich text={item.q} />
              <ol type="A">{item.choices.map((c, i) => <li key={i}><Rich text={c} /></li>)}</ol>
            </>
          )} />
          <RevisionGroup title="True or false" items={revision.trueFalse} render={(item) => <Rich text={item.statement} />} />
          <RevisionGroup title="Scenario" items={revision.scenario} render={(item) => <Rich text={item.q} />} />

          <h3>Answer key</h3>
          <table className="handout-table">
            <thead><tr><th>Question</th><th>Answer</th><th>Reason</th></tr></thead>
            <tbody>
              {revision.mcq?.map((item, i) => <tr key={`m${i}`}><td>MCQ {i + 1}</td><td>{item.answer}</td><td><Rich text={item.reason} /></td></tr>)}
              {revision.trueFalse?.map((item, i) => <tr key={`t${i}`}><td>True/False {i + 1}</td><td>{item.answer}</td><td><Rich text={item.reason} /></td></tr>)}
              {revision.scenario?.map((item, i) => <tr key={`s${i}`}><td>Scenario {i + 1}</td><td><Rich text={item.answer} /></td><td><Rich text={item.reason} /></td></tr>)}
            </tbody>
          </table>

          {!!revision.extraPractice?.length && (
            <>
              <h3>Answers to the extra practice</h3>
              <table className="handout-table">
                <thead><tr><th>Reference</th><th>Answer</th><th>Reason</th></tr></thead>
                <tbody>{revision.extraPractice.map((item, i) => (
                  <tr key={i}><td>{item.reference}</td><td><Rich text={item.answer} /></td><td><Rich text={item.reason} /></td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </>
      ) : null}

      {practical.steps?.length ? (
        <>
          <h3>Practical assessment task</h3>
          {practical.scenario && <p className="callout remember"><Rich text={practical.scenario} /></p>}
          <ol>{practical.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>
          {!!practical.assessor?.length && (
            <>
              <p className="block-heading">What the Assessor Looks For</p>
              <ul className="checklist">{practical.assessor.map((a, i) => <li key={i}>□&nbsp;&nbsp;<Rich text={a} /></li>)}</ul>
            </>
          )}
          {!!practical.report?.length && (
            <>
              <p className="block-heading">Report Checklist</p>
              <ul className="checklist">{practical.report.map((r, i) => <li key={i}>□&nbsp;&nbsp;<Rich text={r} /></li>)}</ul>
            </>
          )}
        </>
      ) : null}

      {!!unit.studyTips?.length && (
        <>
          <h3>Last-minute study tips</h3>
          <ul>{unit.studyTips.map((tip, i) => <li key={i}><Rich text={tip} /></li>)}</ul>
        </>
      )}
    </>
  );
}

function RevisionGroup({ title, items, render }) {
  if (!items?.length) return null;
  return (
    <>
      <p className="block-heading">{title}</p>
      <ol>{items.map((item, i) => <li key={i}>{render(item)}</li>)}</ol>
    </>
  );
}
