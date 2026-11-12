import React, { useEffect, useMemo, useRef, useState } from 'react';
import { get, post, del, download } from './api.js';
import { logout, currentUser, setSession, clearSession, getToken } from './auth.js';
import { QUESTION_TYPES, totalMarks, validateExam, questionLines, answerText, validateHandout, handoutStats, estimateHandoutPages, isSectionsExam } from '../../shared/format.js';
import { validateNotes } from '../../shared/notes-format.js';
import Settings from './Settings.jsx';
import Admin from './Admin.jsx';
import InstitutionAccess from './InstitutionAccess.jsx';
import InstitutionWorkspace, { WorkspacePicker } from './InstitutionWorkspace.jsx';
import { useAdminQuery } from './AdminData.jsx';
import Auth from './Auth.jsx';
import Agents from './Agents.jsx';
import TakeExam from './TakeExam.jsx';
import PublishOnline from './PublishOnline.jsx';
import PaperStudio from './studio/PaperStudio.jsx';
import SourcePicker from './SourcePicker.jsx';
import NotesReader from './NotesReader.jsx';
import { outputTitle, handoutPlainText, studyNotesText, lastOutputKey, isNotesDocument } from './study-output.js';
import LibraryTab from './tabs/LibraryTab.jsx';
import Icon from './ui/Icon.jsx';
import brandMark from './assets/exam-studio-mark.svg';

const TABS = [
  ['guide', 'Study guide'],
  ['studio', 'Paper studio'],
  ['library', 'Library'],
];

const PAGE_META = {
  guide: {
    title: 'Study Guide',
    sub: 'Generate comprehensive study notes and complete teaching handouts from your source material.',
    icon: 'book',
  },
  studio: {
    title: 'Paper Studio',
    sub: 'Build papers, organise question banks and work with modules and flashcards.',
    icon: 'pen',
  },
  library: {
    title: 'Library',
    sub: 'Every generated document in one searchable teaching workspace.',
    icon: 'library',
  },
};

const NAV_ITEMS = [
  { key: 'guide', label: 'Study Guide', icon: 'book' },
  { key: 'studio', label: 'Paper Studio', icon: 'pen' },
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'flashcards', label: 'Flashcards', icon: 'cards' },
  { key: 'modules', label: 'Modules', icon: 'modules' },
  { key: 'bank', label: 'Question Bank', icon: 'question' },
  { key: 'exams', label: 'Online Exams', icon: 'trophy' },
  { key: 'mcp', label: 'MCP', icon: 'mcp' },
];

const BLANK_PROJECT = { module: '', level: '', trade: '', school: '', duration: '3 HOURS' };

function cleanModuleName(name) {
  return String(name || '')
    .replace(/.[^.]+$/, '')
    .replace(/^s*d{6,}[s_-]*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/s{2,}/g, ' ')
    .trim()
    .slice(0, 80);
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [quota, setQuota] = useState(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState('guide');
  const [guideMode, setGuideMode] = useState('notes');
  const [studioView, setStudioView] = useState('generate');
  const [examSavedId, setExamSavedId] = useState('');
  const [genMode, setGenMode] = useState('questions');
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
  const [notesSavedId, setNotesSavedId] = useState('');
  const [handoutSavedId, setHandoutSavedId] = useState('');
  const [savingOutput, setSavingOutput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [institutionIntent, setInstitutionIntent] = useState(() => new URLSearchParams(window.location.search).get('intent') === 'institution');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const institutionEnabled = Boolean(health?.institutions?.enabled);
  const [showAgents, setShowAgents] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newToken, setNewToken] = useState(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('examStudioTheme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; }
  });
  const [update, setUpdate] = useState(null);
  const [navCollapsed, setNavCollapsed] = useState(() => { try { return localStorage.getItem('examStudioNav') === 'collapsed'; } catch { return false; } });
  const [focusMode, setFocusMode] = useState(() => { try { return localStorage.getItem('examStudioFocus') === '1'; } catch { return false; } });
  const [mobileNav, setMobileNav] = useState(false);
  const mobileNavToggle = useRef(null);
  const mobileNavClose = useRef(null);
  const mainContent = useRef(null);
  const [globalQuery, setGlobalQuery] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');

  // Structure detection state
  const [detectedStructure, setDetectedStructure] = useState(null); // {modules, confidence, message}
  const [structureSelected, setStructureSelected] = useState([]); // selected module/LO/unit indices
  const [structureMode, setStructureMode] = useState('none'); // 'none', 'library', 'pasted'

  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken') || '');
  const canLoadWorkspaces = !checking && user && institutionEnabled && !resetToken &&
    window.location.pathname !== '/admin' && !window.location.pathname.startsWith('/take/');
  const workspaceList = useAdminQuery(canLoadWorkspaces ? '/institutions/workspaces' : null, undefined, user?.id);
  const institutionWorkspaces = !workspaceList.pending && !workspaceList.error ? workspaceList.data?.items || [] : [];
  const showInstitutionAccess = canLoadWorkspaces && institutionIntent && !selectedInstitution;

  useEffect(() => {
    if (!resetToken) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('resetToken');
    window.history.replaceState(window.history.state, '', url);
  }, [resetToken]);

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
      changeAccountMode(false);
      setSelectedInstitution('');
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

  useEffect(() => {
    try { localStorage.setItem('examStudioNav', navCollapsed ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
  }, [navCollapsed]);

  useEffect(() => {
    try { localStorage.setItem('examStudioFocus', focusMode ? '1' : '0'); } catch { /* ignore */ }
  }, [focusMode]);

  useEffect(() => {
    if (!mobileNav || !user) return;
    const main = mainContent.current;
    if (!main) return;
    const toggle = mobileNavToggle.current;
    const mobile = window.matchMedia('(max-width: 1023px)');
    const onResize = (event) => { if (!event.matches) setMobileNav(false); };
    const onKey = (event) => { if (event.key === 'Escape') setMobileNav(false); };
    main.inert = true;
    const focusFrame = window.requestAnimationFrame(() => mobileNavClose.current?.focus());
    mobile.addEventListener('change', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      main.inert = false;
      toggle?.focus();
      mobile.removeEventListener('change', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileNav, user]);

  // F toggles focus mode unless the trainee is typing.
  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target && event.target.tagName;
      if (event.key !== 'f' || event.metaKey || event.ctrlKey || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (event.target && event.target.isContentEditable)) return;
      setFocusMode((value) => !value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Links written before the merge (#notes, #handout) still open the right study guide mode,
  // and any other recognised hash still opens its tab.
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'notes' || hash === 'handout') { setGuideMode(hash); setTab('guide'); return; }
      if (hash === 'exam') { setTab('studio'); setStudioView('generate'); return; }
      if (hash === 'flashcards') { setTab('studio'); setStudioView('flashcards'); return; }
      if (TABS.some(([key]) => key === hash)) setTab(hash);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2500); };

  function rememberOutput(kind, id) {
    try { localStorage.setItem(lastOutputKey(user?.id, kind), id); } catch { /* storage can be unavailable */ }
  }

  async function persistOutput(kind, data) {
    if (!user || !data) return null;
    setSavingOutput(kind);
    try {
      const saved = await post('/library', { kind, data, title: outputTitle(kind, data) });
      if (kind === 'notes') setNotesSavedId(saved.id);
      if (kind === 'handout') setHandoutSavedId(saved.id);
      rememberOutput(kind, saved.id);
      return saved;
    } catch (e) {
      flash(`${kind === 'handout' ? 'Handout' : 'Study notes'} generated, but could not be saved to Library: ${e.message}`);
      return null;
    } finally {
      setSavingOutput('');
    }
  }

  async function copyOutput(value) {
    const text = String(value || '');
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      flash('Copied to clipboard');
    } catch {
      setError('Could not copy to the clipboard. Select the document text and copy it manually.');
    }
  }

  // ---------------------------------------------------------------- auth actions
  function changeAccountMode(institution) {
    setInstitutionIntent(institution);
    const url = new URL(window.location.href);
    if (institution) url.searchParams.set('intent', 'institution');
    else if (url.searchParams.get('intent') === 'institution') url.searchParams.delete('intent');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }

  function openInstitutionAccess() {
    setMobileNav(false);
    setSelectedInstitution('');
    changeAccountMode(true);
    workspaceList.reload();
  }

  function switchWorkspace(id) {
    if (id && !institutionWorkspaces.some((workspace) => workspace.id === id)) return;
    setMobileNav(false);
    setSelectedInstitution(id);
    changeAccountMode(false);
    if (!id && selectedInstitution) workspaceList.reload();
  }

  function acceptSession(session, signup) {
    if (!institutionEnabled) changeAccountMode(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has('auth')) {
      url.searchParams.delete('auth');
      window.history.replaceState(window.history.state, '', url);
    }
    setSession(session);
    setUser(session.user);
    setError('');
    flash(signup ? 'Account created' : 'Signed in');
    get('/health').then((result) => {
      if (getToken() === session.token) setHealth(result);
    }).catch(() => {});
  }

  function exitRecovery(completed) {
    setResetToken('');
    if (completed) {
      clearSession();
      setUser(null);
    }
  }

  async function handleLogout() {
    await logout();
    clearSession();
    setUser(null);
    changeAccountMode(false);
    setSelectedInstitution('');
    // Do not leave one person's work on screen for the next person.
    setNotes(null); setExam(null); setCards(null); setHandout(null); setExamSavedId('');
    setNotesSavedId(''); setHandoutSavedId('');
    setText(''); setFileInfo(''); setFocus('');
    setProject(BLANK_PROJECT);
    setError('');
    flash('Signed out');
  }

  const refreshHealth = (h) => { if (h) setHealth(h); };

  // ---------------------------------------------------------------- API tokens
  const loadTokens = () => get('/tokens')
    .then((d) => setTokens(Array.isArray(d?.items) ? d.items : []))
    .catch(() => setTokens([]));

  const createToken = async () => {
    if (!newTokenName.trim()) return setError('Give the token a name.');
    setError('');
    setTokenBusy(true);
    try {
      const created = await post('/tokens', { name: newTokenName.trim(), scopes: ['generate:write', 'library:read', 'library:write', 'export:read'], expiresInDays: 90 });
      setNewToken(created.token);
      setNewTokenName('');
      setTokens([...tokens, { ...created, token: created.token }]);
      flash('API token created — copy it now, it is shown only once.');
    } catch (e) {
      setError(e.message);
    } finally {
      setTokenBusy(false);
    }
  };

  const revokeToken = async (id) => {
    setError('');
    try {
      await del(`/tokens/${id}`);
      setTokens(tokens.filter((t) => t.id !== id));
      flash('Token revoked.');
    } catch (e) {
      setError(e.message);
    }
  };

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
      module: r.moduleCode || r.moduleTitle || cleanModuleName(r.name),
    }));
    setNotesLibUnits(Array.isArray(r.units) ? r.units : []);
    setNotesLibSelectedUnits((r.units || []).map((_, i) => i));
  });

  // ---------------------------------------------------------------- detect structure
  // Call the server to detect modules, learning outcomes and units in notes text.
  const detectStructure = async () => {
    if (text.trim().length < 50) {
      setDetectedStructure(null);
      setStructureMode('none');
      return;
    }
    try {
      const r = await post('/notes/detect-structure', { text, title: project.module });
      setDetectedStructure(r.structure);
      setStructureMode('pasted');
      // Auto-select the first module if detected
      if (r.structure && r.structure.modules && r.structure.modules.length > 0) {
        setStructureSelected([0]);
      }
    } catch (e) {
      setError(e.message);
      setDetectedStructure(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshNotesLib();
    get('/me/quota').then(setQuota).catch(() => {});
  }, [user]);

  // Generated documents are saved to the existing Library immediately. The id is kept per user
  // so a browser refresh can reload the document from the server instead of losing it.
  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    (async () => {
      for (const kind of ['notes', 'handout']) {
        let id = '';
        try { id = localStorage.getItem(lastOutputKey(user.id, kind)) || ''; } catch { /* ignore */ }
        if (!id) continue;
        try {
          const item = await get(`/library/${id}`);
          if (!alive || item.kind !== kind) continue;
          if (kind === 'notes') { setNotes(item.data); setNotesSavedId(item.id); }
          else { setHandout(item.data); setHandoutSavedId(item.id); }
        } catch {
          try { localStorage.removeItem(lastOutputKey(user.id, kind)); } catch { /* ignore */ }
        }
      }
    })();
    return () => { alive = false; };
  }, [user]);

  const loadSelectedUnits = () => notesLibSelected && run('upload', async () => {
    const r = await post('/notes-lib/load', { name: notesLibSelected, units: notesLibSelectedUnits });
    setText(r.text || '');
    setFileInfo(`${r.name}: ${(r.chars ?? r.charCount).toLocaleString()} characters, ${r.numPages || '?'} page(s)}` + (notesLibSelectedUnits.length && r.units?.length ? ` (units: ${notesLibSelectedUnits.length})` : ''));
  });

  const genNotes = () => run('notes', async () => {
    const result = await post('/notes/generate', { ...body(), focus });
    setNotes(result);
    setNotesSavedId('');
    setTab('guide'); setGuideMode('notes');
    await persistOutput('notes', result);
  });
  const genCards = () => run('cards', async () => { setCards(await post('/flashcards/generate', { ...body(), count: cardCount })); setTab('studio'); setStudioView('flashcards'); });
  const genExam = () => run('exam', async () => {
    let avoid = [];
    if (examOpts.avoidSaved) avoid = await savedQuestionTexts();
    setExam(await post('/exams/generate', { ...body(), ...examOpts, avoid }));
    setExamSavedId('');
    setTab('studio');
    setStudioView('generate');
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
      setHandoutSavedId('');
      setTab('guide');
      setGuideMode('handout');
      await persistOutput('handout', result);
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

  const save = (kind, data) => run('save', async () => {
    const saved = await post('/library', { kind, data, title: outputTitle(kind, data) });
    if (kind === 'notes') { setNotesSavedId(saved.id); rememberOutput('notes', saved.id); }
    if (kind === 'handout') { setHandoutSavedId(saved.id); rememberOutput('handout', saved.id); }
    if (kind === 'exam') setExamSavedId(saved.id);
    flash('Saved to library');
  });

  function editExam(next) {
    setExam(next);
    setExamSavedId('');
  }

  function openSavedPaper(item) {
    setExam(item.data);
    setExamSavedId(item.id);
    setTab('studio');
    setStudioView('generate');
    setGenMode('questions');
  }

  // The two AI generators live inside Paper studio now. Their handlers, settings and result
  // views are the same ones the old Exam and Flashcards tabs used.
  const examOutput = exam && (isSectionsExam(exam)
    ? <SectionsExamView exam={exam} setExam={editExam} target={examOpts.totalMarks} project={project} busy={busy}
      run={run} onSave={() => save('exam', exam)} />
    : <ExamView exam={exam} setExam={editExam} target={examOpts.totalMarks} project={project} busy={busy}
      run={run} onSave={() => save('exam', exam)} />);

  const cardsOutput = cards && <CardsView cards={cards} onSave={() => save('flashcards', cards)} />;

  const cardCountField = (
    <label className="inline">Cards <input type="number" min={5} max={80} value={cardCount} onChange={(e) => setCardCount(e.target.value)} /></label>
  );

  const generatePanel = (
    <section>
      <div className="studio-source-bar">
        <span><Icon name="document" size={16} /> {sourceReady ? `Source ready: ${text.length.toLocaleString()} characters` : 'Add source notes before generating a paper.'}</span>
        <button type="button" className="link" onClick={() => { setTab('guide'); setGuideMode('notes'); }}>{sourceReady ? 'Edit source notes' : 'Open Study Guide'} <Icon name="arrow" size={14} /></button>
      </div>
      <div className="segmented" role="tablist" aria-label="What to generate">
        {[['questions', 'Questions'], ['flashcards', 'Flashcards'], ['both', 'Both']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={genMode === key}
            className={genMode === key ? 'on' : ''}
            onClick={() => setGenMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {genMode !== 'flashcards' && <ExamSettings opts={examOpts} setOpts={setExamOpts} />}
      {genMode !== 'questions' && <div className="bar">{cardCountField}</div>}

      <div className="bar wrap">
        {genMode !== 'flashcards' && (
          <button className="primary" disabled={!sourceReady || !!busy || !examOpts.types.length} onClick={genExam}>
            {busy === 'exam' ? 'Writing the exam… this can take a minute or two' : exam ? 'Write a new exam' : 'Write exam'}
          </button>
        )}
        {genMode !== 'questions' && (
          <button className={genMode === 'flashcards' ? 'primary' : ''} disabled={!sourceReady || !!busy} onClick={genCards}>
            {busy === 'cards' ? 'Writing…' : 'Make flashcards'}
          </button>
        )}
      </div>

      {genMode !== 'flashcards' && (
        <>
          {!exam && <Empty ready={sourceReady} what="an exam" />}
          {examOutput}
          {exam && <div id="publish-online"><PublishOnline key={examSavedId || 'draft'} exam={exam} libraryId={examSavedId} onSaved={setExamSavedId} /></div>}
        </>
      )}

      {genMode !== 'questions' && (
        <>
          {!cards && <Empty ready={sourceReady} what="flashcards" />}
          {cardsOutput}
        </>
      )}
    </section>
  );

  const flashcardsPanel = (
    <section>
      <div className="bar">
        {cardCountField}
        <button className="primary" disabled={!sourceReady || !!busy} onClick={genCards}>
          {busy === 'cards' ? 'Writing…' : 'Make flashcards'}
        </button>
      </div>
      {!cards && <Empty ready={sourceReady} what="flashcards" />}
      {cardsOutput}
    </section>
  );

  const version = health?.version ? <span className="version">v{health.version}</span> : null;
  const currentPage = PAGE_META[tab] || PAGE_META.guide;
  const accountName = user?.name || user?.email || 'Account';
  const accountInitial = accountName.trim().charAt(0).toUpperCase();
  const canOpenAdmin = user?.role === 'admin' ||
    (health?.user?.id === user?.id && health?.institutions?.canReview);
  const closeMobileNav = () => setMobileNav(false);
  const closeMenu = (event) => { const details = event.currentTarget.closest('details'); if (details) details.open = false; };

  const activeNav = tab === 'library'
    ? 'library'
    : tab === 'guide'
      ? 'guide'
      : tab === 'studio'
        ? ({ bank: 'bank', modules: 'modules', flashcards: 'flashcards' }[studioView] || 'studio')
        : '';

  const goNav = (key) => {
    closeMobileNav();
    if (showInstitutionAccess && key !== 'mcp') changeAccountMode(false);
    setError('');
    if (key === 'guide') { setTab('guide'); return; }
    if (key === 'studio') { setTab('studio'); setStudioView('generate'); return; }
    if (key === 'library') { setLibraryQuery(''); setTab('library'); return; }
    if (key === 'flashcards') { setTab('studio'); setStudioView('flashcards'); return; }
    if (key === 'modules') { setTab('studio'); setStudioView('modules'); return; }
    if (key === 'bank') { setTab('studio'); setStudioView('bank'); return; }
    if (key === 'exams') {
      setTab('studio'); setStudioView(exam ? 'generate' : 'papers');
      setGenMode('questions');
      if (!exam) return;
      window.setTimeout(() => {
        const target = document.getElementById('publish-online');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return;
    }
    if (key === 'mcp') { setShowAgents(true); }
  };

  const submitGlobalSearch = (event) => {
    event.preventDefault();
    const query = globalQuery.trim();
    if (!query) return;
    if (showInstitutionAccess) changeAccountMode(false);
    setError('');
    setLibraryQuery(query);
    setTab('library');
    closeMobileNav();
  };

  const topBar = (
    <header className="topbar">
      {user ? (
        <form className="global-search" role="search" onSubmit={submitGlobalSearch}>
          <Icon name="search" size={17} />
          <input
            type="search"
            id="workspace-search"
            value={globalQuery}
            onChange={(event) => setGlobalQuery(event.target.value)}
            placeholder="Search your library…"
            aria-label="Search your library"
          />
          {globalQuery && <button type="button" className="search-clear" onClick={() => setGlobalQuery('')} aria-label="Clear search"><Icon name="close" size={14} /></button>}
        </form>
      ) : (
        <div className="topbar-brand">
          <img className="app-brand-mark" src={brandMark} alt="" />
          <strong>Exam Studio</strong>
        </div>
      )}
      <div className="topright">
        <div className="top-status">
          {health?.demo
            ? <span className="pill warn" title="DEMO_MODE=1: sample output, no AI calls">Demo mode</span>
            : health?.defaultAI
              ? <span className="pill" title="Exam Studio AI (default)">Studio AI</span>
              : health?.provider && <span className="pill" title={health.model ? `Your model: ${health.model}` : health.provider}>{health.model ? `Your model: ${health.model}` : health.provider}</span>}
          {user && quota?.plan && <span className="pill quota-pill" title="Remaining quota today">{quota.used.requestsToday}/{quota.plan.requestsPerDay ?? '∞'} today</span>}
        </div>
        <div className="top-actions">
          <button ref={mobileNavToggle} type="button" className="icon-btn mobile-nav-toggle" onClick={() => setMobileNav(true)} aria-controls="main-navigation" aria-expanded={mobileNav} aria-label="Open navigation" title="Open navigation"><Icon name="menu" size={18} /></button>
          <button type="button" className="icon-btn nav-toggle" onClick={() => setNavCollapsed((value) => !value)} aria-controls="main-navigation" aria-expanded={!navCollapsed} aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'} title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}><Icon name="menu" size={17} /></button>
          <button type="button" className={focusMode ? 'icon-btn is-on' : 'icon-btn'} onClick={() => setFocusMode((value) => !value)} aria-pressed={focusMode} aria-label="Toggle focus mode" title="Focus mode (F)"><Icon name="spark" size={17} /></button>
          <button type="button" className="icon-btn theme-toggle" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
        </div>
        {user && (
          <details className="account-menu">
            <summary aria-label="Open account menu" title={accountName}>
              <span className="avatar" aria-hidden="true">{accountInitial}</span>
            </summary>
            <div className="account-menu-panel">
              <div className="account-menu-head">
                <strong>{accountName}</strong>
                <span>{user.email}</span>
              </div>
              <button type="button" onClick={(event) => { closeMenu(event); setShowSettings(true); }}>Settings</button>
              <button type="button" onClick={(event) => { closeMenu(event); setShowAgents(true); }}>Agents</button>
              <button type="button" onClick={(event) => { closeMenu(event); setShowTokens(true); loadTokens(); }}>API tokens</button>
              {canOpenAdmin && <button type="button" onClick={(event) => { closeMenu(event); window.location.assign('/admin'); }}>Admin</button>}
              <button type="button" className="danger" onClick={(event) => { closeMenu(event); handleLogout(); }}>Sign out</button>
            </div>
          </details>
        )}
      </div>
    </header>
  );

  const pageHero = user ? (
    <header className="page-hero">
      <span className="page-hero-icon" aria-hidden="true"><Icon name={currentPage.icon} size={28} /></span>
      <div className="page-hero-copy">
        <div className="page-hero-title"><h1>{currentPage.title}</h1>{version}</div>
        <p>{currentPage.sub}</p>
      </div>
      <div className="page-hero-actions">
        <span className="quick-actions-label">Quick actions</span>
        {tab !== 'library' && <button type="button" onClick={() => goNav('library')}><Icon name="library" size={15} /> View Library</button>}
        {tab === 'library' && <button type="button" onClick={() => goNav('guide')}><Icon name="book" size={15} /> Study Guide</button>}
        <button type="button" onClick={() => setShowSettings(true)}><Icon name="settings" size={15} /> Settings</button>
      </div>
    </header>
  ) : null;

  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/take/')) {
    return <TakeExam shareCode={window.location.pathname.split('/').filter(Boolean)[1]} />;
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
    return <Admin onExit={() => window.location.assign('/app')} theme={theme}
      toggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} />;
  }

  if (!checking && (!user || resetToken)) {
    return <Auth theme={theme} toggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}
      notice={error} onDismissNotice={() => setError('')} onSession={acceptSession}
      resetToken={resetToken} onRecoveryExit={exitRecovery}
      institutionEnabled={institutionEnabled} institutionIntent={institutionIntent} onAccountModeChange={changeAccountMode} />;
  }
  if (user && institutionEnabled && selectedInstitution) {
    return <InstitutionWorkspace key={`${user.id}:${selectedInstitution}`} institutionId={selectedInstitution}
      workspaces={institutionWorkspaces} onSwitch={switchWorkspace} onAccessHub={openInstitutionAccess} onSignOut={handleLogout}
      theme={theme} toggleTheme={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} />;
  }

  return (
    <div className={(user ? 'app app-shell' : 'app') + (user && navCollapsed && !mobileNav ? ' nav-collapsed' : '') + (user && focusMode ? ' focus-mode' : '')}>

      {toast && <div className="toast" role="status">{toast}</div>}

      {checking && <p className="empty">Loading…</p>}

      {/* ---------------------------------------------------------- the app */}
      {!checking && user && (
        <>
          <button className={mobileNav ? 'nav-scrim is-open' : 'nav-scrim'} type="button" aria-hidden="true" tabIndex={-1} onClick={closeMobileNav} />
          <aside id="main-navigation" className={'sidebar' + (mobileNav ? ' is-mobile-open' : '')} aria-label="Main navigation">
            <button ref={mobileNavClose} className="sidebar-close" type="button" onClick={closeMobileNav} aria-label="Close navigation"><Icon name="close" size={18} /></button>
            <div className="app-brand">
              <img className="app-brand-mark" src={brandMark} alt="" />
              <span className="app-brand-text">
                <strong>Exam Studio</strong>
                <span>Teaching Workspace</span>
              </span>
            </div>
            {institutionEnabled && <WorkspacePicker workspaces={institutionWorkspaces} onChange={switchWorkspace} />}
            <nav className="sidebar-nav" aria-label="Workspace navigation">
              {NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={!showInstitutionAccess && activeNav === item.key ? 'on' : ''}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={!showInstitutionAccess && activeNav === item.key ? 'page' : undefined}
                  onClick={() => goNav(item.key)}
                >
                  <Icon name={item.icon} size={21} />
                  <span className="nav-item-label">{item.label}</span>
                </button>
              ))}
            </nav>
            <nav className="sidebar-nav sidebar-nav-secondary" aria-label="Account navigation">
              {institutionEnabled && <button type="button" className={showInstitutionAccess ? 'on' : 'link'}
                aria-current={showInstitutionAccess ? 'page' : undefined} aria-label="Institutions" onClick={openInstitutionAccess}><Icon name="institution" size={17} /><span className="nav-item-label">Institutions</span></button>}
              <button type="button" className="link" onClick={() => { closeMobileNav(); setShowSettings(true); }}><Icon name="settings" size={17} /><span className="nav-item-label">Settings</span></button>
              <button type="button" className="link" onClick={() => { closeMobileNav(); setShowAgents(true); }}><Icon name="agents" size={17} /><span className="nav-item-label">Agents</span></button>
              <button type="button" className="link" onClick={() => { closeMobileNav(); setShowTokens(true); loadTokens(); }}><Icon name="tokens" size={17} /><span className="nav-item-label">API Tokens</span></button>
              {canOpenAdmin && <button type="button" className="link" onClick={() => window.location.assign('/admin')}><Icon name="admin" size={17} /><span className="nav-item-label">Admin</span></button>}
            </nav>
            <div className="sidebar-account">
              <div className="sidebar-user">
                <span className="avatar" aria-hidden="true">{accountInitial}</span>
                <span className="sidebar-user-copy">
                  <strong title={accountName}>{accountName}</strong>
                  <small title={user.email}>{user.email}</small>
                </span>
              </div>
              <button type="button" className="sidebar-signout" onClick={handleLogout}><Icon name="sign-out" size={18} /> Sign out</button>
            </div>
          </aside>

          <div className="main" ref={mainContent}>
            {topBar}
            {!showInstitutionAccess && pageHero}
          {error && (
            <div className="banner error workspace-error" role="alert">
              <span>{error}</span>
              <button type="button" className="icon-btn" aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={15} /></button>
            </div>
          )}

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

            {showInstitutionAccess ? <InstitutionAccess key={user.id} userId={user.id}
              workspaceQuery={workspaceList} workspaces={institutionWorkspaces} onOpen={switchWorkspace}
              onPersonal={() => switchWorkspace('')} /> : (
            <div className={'layout' + (tab === 'studio' ? ' layout-wide' : '') + (tab === 'library' ? ' layout-library' : '') + (tab === 'guide' ? ' layout-guide' : '')}>
            {tab !== 'library' && (
            <aside className="panel source">
              <div className="section-head source-head">
                <span className="workspace-icon"><Icon name="document" size={20} /></span>
                <div>
                  <h2>1. Your Source</h2>
                  <p className="hint">Add your study material and choose options.</p>
                </div>
              </div>
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
                  <button className="primary" onClick={loadSelectedUnits} disabled={!notesLibSelectedUnits.length || !!busy}>
                    {busy === 'upload' ? 'Loading…' : 'Use selected units'}
                  </button>
                ) : null}
              />
              {fileInfo && <p className="hint source-file-info">{fileInfo}</p>}
              <div className="source-fields">
                <label className="field"><span>Module title</span>
                  <input value={project.module} onChange={(e) => setProject({ ...project, module: e.target.value })} placeholder="e.g. Database Development" /></label>
                <label className="field"><span>Academic level</span>
                  <input value={project.level} onChange={(e) => setProject({ ...project, level: e.target.value })} placeholder="L4" /></label>
                <label className="field"><span>Duration</span>
                  <input value={project.duration} onChange={(e) => setProject({ ...project, duration: e.target.value })} /></label>
                <label className="field"><span>Trade <small>(optional)</small></span>
                  <input value={project.trade} onChange={(e) => setProject({ ...project, trade: e.target.value })} placeholder="Software Development" /></label>
                <label className="field"><span>School <small>(optional)</small></span>
                  <input value={project.school} onChange={(e) => setProject({ ...project, school: e.target.value })} placeholder="Enter your school" /></label>
                {tab === 'guide' && guideMode === 'notes' && (
                  <label className="field"><span>Focus topic <small>(optional)</small></span>
                    <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. normalization, SQL" /></label>
                )}
              </div>
              {tab === 'guide' && guideMode === 'notes' && (
                <div className="source-generate">
                  <button className="primary" disabled={!sourceReady || !!busy} onClick={genNotes}>
                    <Icon name="spark" size={18} /> {busy === 'notes' ? 'Writing study notes…' : notes ? 'Generate another version' : 'Generate Study Notes'}
                  </button>
                  {!sourceReady && <p className="hint">Add at least 50 characters of source material to generate.</p>}
                </div>
              )}
            </aside>
            )}

            <main className="panel work">
              {tab !== 'library' && (
                <>
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
                    <li className={sourceReady ? 'done' : 'active'}><span className="step-no">{sourceReady ? <Icon name="check" size={13} /> : '1'}</span> Source notes</li>
                    <li className={sourceReady ? 'active' : ''}><span className="step-no">2</span> Generate</li>
                    <li className={(notes || cards || exam || handout) ? 'done' : ''}><span className="step-no">3</span> Review &amp; export</li>
                  </ol>
                  {sourceReady && <p className="hint source-count">Source: {text.length.toLocaleString()} characters (~{Math.ceil(text.length / 4).toLocaleString()} tokens).</p>}
                </>
              )}

              {tab === 'guide' && (
                <div className="workspace-head">
                  <div className="workspace-title">
                    <span className="workspace-icon"><Icon name="document" size={22} /></span>
                    <div>
                      <h2>{guideMode === 'notes' ? 'Study notes' : 'Teaching handout'}</h2>
                      <p className="eyebrow">Document workspace</p>
                      <p className="hint">{guideMode === 'notes' ? 'A concise, readable revision document built from your source material.' : 'A complete unit-by-unit handout with lessons, examples and revision support.'}</p>
                    </div>
                  </div>
                  <div className="segmented" role="tablist" aria-label="Study guide mode">
                    <button type="button" role="tab" aria-selected={guideMode === 'notes'} className={guideMode === 'notes' ? 'on' : ''} onClick={() => setGuideMode('notes')}>Notes</button>
                    <button type="button" role="tab" aria-selected={guideMode === 'handout'} className={guideMode === 'handout' ? 'on' : ''} onClick={() => setGuideMode('handout')}>Handout</button>
                  </div>
                </div>
              )}

              {tab === 'guide' && guideMode === 'notes' && (
                <section>
                  {busy === 'notes' && (
                    <div className="empty-state guide-state" role="status">
                      <span className="guide-spinner" aria-hidden="true" />
                      <div><strong>Writing study notes…</strong><p>Exam Studio is working through your source material.</p></div>
                    </div>
                  )}
                  {!notes && busy !== 'notes' && <Empty ready={sourceReady} what="study notes" />}
                  {notes && <NotesView notes={notes}
                    onSave={() => save('notes', notes)}
                    onWord={() => run('export', () => download('/export/notes-docx', { notes }, 'Study_Notes.docx'))}
                    onCopy={() => copyOutput(studyNotesText(notes))}
                    onRegenerate={genNotes}
                    onOpenLibrary={() => setTab('library')}
                    savedId={notesSavedId} saving={savingOutput === 'notes'} busy={busy} />}
                </section>
              )}

              {tab === 'guide' && guideMode === 'handout' && (
                <section>
                  <HandoutSettings opts={handoutOpts} setOpts={setHandoutOpts} />
                  <div className="generation-bar">
                    <div className="generation-note">
                      <strong>Build the complete handout</strong>
                      <p className="hint">A handout writes one lesson at a time and costs many AI calls.</p>
                    </div>
                    <button className="primary" disabled={!sourceReady || !!busy} onClick={genHandout}>
                      {busy === 'handout' ? 'Writing the handout…' : handout ? 'Write a new version' : 'Write study handout'}
                    </button>
                    {busy === 'handout' && <button className="link" onClick={cancelHandout}>Cancel</button>}
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
                    onCopy={() => copyOutput(handoutPlainText(handout))}
                    onRegenerate={genHandout}
                    onOpenLibrary={() => setTab('library')}
                    savedId={handoutSavedId} saving={savingOutput === 'handout'}
                    run={run} busy={busy} />}
                </section>
              )}

              {user && (
                <section hidden={tab !== 'studio'} key={user.id}>
                  <PaperStudio
                    exam={exam}
                    project={project}
                    view={studioView}
                    visible={tab === 'studio'}
                    onView={setStudioView}
                    onOpenPaper={openSavedPaper}
                    generatePanel={generatePanel}
                    flashcardsPanel={flashcardsPanel}
                  />
                </section>
              )}

              {tab === 'library' && (
                <LibraryTab initialQuery={libraryQuery} onOpen={(item) => {
                  if (item.kind === 'exam') openSavedPaper(item);
                  if (item.kind === 'notes') { setNotes(item.data); setNotesSavedId(item.id); rememberOutput('notes', item.id); setTab('guide'); setGuideMode('notes'); }
                  if (item.kind === 'flashcards') { setCards(item.data); setTab('studio'); setStudioView('flashcards'); }
                  if (item.kind === 'handout') { setHandout(item.data); setHandoutSavedId(item.id); rememberOutput('handout', item.id); setTab('guide'); setGuideMode('handout'); }
                }} />
              )}
            </main>
          </div>
            )}
          </div>
        </>
      )}

      {showSettings && <Settings onClose={() => setShowSettings(false)} onChanged={refreshHealth} update={update} onUpdate={setUpdate} />}
      {showAgents && <Agents onClose={() => setShowAgents(false)} onOpenSettings={() => { setShowAgents(false); setShowSettings(true); }} />}
      {showTokens && (
        <div className="modal">
          <div className="modal-card">
            <h2>API Tokens</h2>
            <p className="hint">Personal access tokens (PATs) starting with <code>est_</code> let Claude, ChatGPT, DeepSeek and other tools call Exam Studio. Copy a token when it is created — it is shown only once.</p>

            <div className="settings">
              <label className="field grow">
                <span>New token name</span>
                <input value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="e.g. Claude Desktop" />
              </label>
              <button className="primary" disabled={tokenBusy || !newTokenName.trim()} onClick={createToken}>{tokenBusy ? 'Creating…' : 'Create token'}</button>
            </div>

            {newToken && (
              <>
                <div className="settings">
                  <label className="field grow">
                    <span>Copy this token (shown once)</span>
                    <input className="mono" readOnly value={newToken} onClick={(e) => { e.target.select(); document.execCommand('copy'); flash('Token copied.'); }} />
                  </label>
                  <button className="link" onClick={() => setNewToken(null)}>Dismiss</button>
                </div>
                <div className="settings">
                  <label className="field grow">
                    <span>MCP connector URL (paste into Claude or ChatGPT)</span>
                    <input className="mono" readOnly value={`https://examstudio.duckdns.org/mcp/${newToken}`} onClick={(e) => { e.target.select(); document.execCommand('copy'); flash('Connector URL copied.'); }} />
                  </label>
                  <button className="link" onClick={() => { navigator.clipboard.writeText(`https://examstudio.duckdns.org/mcp/${newToken}`); flash('Connector URL copied.'); }}>Copy</button>
                </div>
                <p className="hint warn">Anyone with this URL can use your account. Revoke the key if it leaks.</p>
              </>
            )}

            <h3>Existing tokens</h3>
            {tokens.length === 0 ? <p className="hint">No tokens yet. Create one above.</p> : (
              <div className="table-scroll" role="region" aria-label="Existing API tokens table" tabIndex={0}>
                <table className="handout-table">
                  <thead><tr><th>Name</th><th>Scopes</th><th>Created</th><th>Revoked</th><th></th></tr></thead>
                  <tbody>
                    {tokens.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td><span className="mono">{Array.isArray(t.scopes) ? t.scopes.join(', ') : (t.scopes || '')}</span></td>
                        <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                        <td>{t.revoked ? <span className="warn">revoked</span> : 'active'}</td>
                        <td>{!t.revoked && <button className="link danger" onClick={() => revokeToken(t.id)}>Revoke</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/*
              Public demo connector card: a no-auth MCP endpoint for visitors who want to try
              Exam Studio without creating an account.
            */}
            <div className="settings">
              <label className="field grow">
                <span>Public demo connector (no sign-in)</span>
              </label>
              <p className="hint">Add <code>https://examstudio.duckdns.org/mcp/public</code> as an MCP server with "No authentication". Limited to 5 generations per day per IP and 12,000 characters per request. Signed-in users get higher limits through a personal access token.</p>
              <input className="mono" readOnly value="https://examstudio.duckdns.org/mcp/public" onClick={(e) => { e.target.select(); document.execCommand('copy'); flash('Public endpoint URL copied.'); }} />
            </div>

            <button className="link" onClick={() => setShowTokens(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces
function Empty({ ready, what }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-mark"><Icon name="document" size={21} /></span>
      <div>
        <strong>{ready ? `Ready to make ${what}` : `Start with your source notes`}</strong>
        <p>{ready ? 'Use the generate action in your source panel or above. Your existing document stays here until the new one is ready.' : `Add or paste your course notes in the source panel, then come back to make ${what}.`}</p>
      </div>
    </div>
  );
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


function NotesView({ notes, onSave, onWord, onCopy, onRegenerate, onOpenLibrary, savedId, saving, busy }) {
  const preview = useRef(null);
  const rich = isNotesDocument(notes);
  const validation = useMemo(() => (rich ? validateNotes(notes) : null), [notes, rich]);
  const disabled = !!busy || saving;
  const saveLabel = savedId ? 'Saved to Library' : (saving || busy === 'save') ? 'Saving…' : 'Save to Library';
  return (
    <div className="document-shell">
      {notes.demo && <p className="hint">Built-in demo sample, not written from your notes.</p>}
      <div className="document-preview">
        <div className="document-sheet" data-theme="light" ref={preview} tabIndex={-1} role="region" aria-label="Study notes preview">
          {rich ? (
            validation.ok ? <NotesReader doc={notes} /> : (
              <div className="banner error" role="alert">
                <strong>This notes document cannot be displayed.</strong>
                <ul>{validation.errors.slice(0, 12).map((error, index) => <li key={index}><code>{error.path || '(root)'}</code> — {error.message}</li>)}</ul>
              </div>
            )
          ) : (
            <>
              <h2 className="doc">{notes.title}</h2>
              {(notes.sections || []).map((s, i) => (
                <article key={i} className="note">
                  <h3>{s.topic}</h3>
                  <ul>{(s.keyPoints || []).map((k, j) => <li key={j}>{k}</li>)}</ul>
                  {s.example && <p className="remember"><strong>Remember:</strong> {s.example}</p>}
                </article>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="bar wrap doc-actions" aria-label="Document actions">
        <button type="button" className="primary" onClick={() => preview.current?.focus()}><Icon name="eye" size={17} /> View notes</button>
        <button disabled={disabled || (rich && !validation.ok)} onClick={onWord}><Icon name="download" size={16} /> Download Word</button>
        <button disabled={disabled} onClick={() => window.print()}><Icon name="print" size={16} /> Print</button>
        <button disabled={disabled} onClick={onCopy}><Icon name="copy" size={16} /> Copy notes</button>
        <button disabled={disabled || !!savedId} onClick={onSave}><Icon name="bookmark" size={16} /> {saveLabel}</button>
        {savedId && <button disabled={disabled} onClick={onOpenLibrary}>View in Library</button>}
        <button disabled={disabled} onClick={onRegenerate}>Write a new version</button>
      </div>
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

function HandoutView({ handout, onSave, onCopy, onRegenerate, onOpenLibrary, savedId, saving, run, busy }) {
  const warnings = useMemo(() => validateHandout(handout), [handout]);
  const stats = useMemo(() => handoutStats(handout), [handout]);
  const pages = useMemo(() => estimateHandoutPages(handout), [handout]);
  const base = (handout.title || 'Study_Handout').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Study_Handout';
  const disabled = !!busy || saving;
  const saveLabel = savedId ? 'Saved to Library' : (saving || busy === 'save') ? 'Saving…' : 'Save to Library';

  return (
    <div className="document-shell">
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

      <div className="bar wrap doc-actions" aria-label="Document actions">
        <button className="primary" disabled={disabled} onClick={() => run('export', () => download('/export/handout-docx', { handout }, `${base}.docx`))}>Download Word</button>
        <button disabled={disabled} onClick={() => run('export', () => download('/export/handout-pdf', { handout }, `${base}.pdf`))}>Download (PDF)</button>
        <button disabled={disabled} onClick={() => window.print()}>Print preview</button>
        <button disabled={disabled} onClick={onCopy}>Copy content</button>
        <button className="primary" disabled={disabled || !!savedId} onClick={onSave}>{saveLabel}</button>
        {savedId && <button disabled={disabled} onClick={onOpenLibrary}>View in Library</button>}
        <button disabled={disabled} onClick={onRegenerate}>Write a new version</button>
      </div>

      <div className="document-preview">
        <div className="document-sheet" data-theme="light">
          {handout.units.map((unit) => <HandoutUnit key={unit.number} unit={unit} />)}
        </div>
      </div>
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
