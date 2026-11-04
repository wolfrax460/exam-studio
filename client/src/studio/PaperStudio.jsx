import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONFIG, generatePaper, poolFor, scorePaper } from './engine.js';
import {
  importExam,
  loadActiveId,
  loadConfig,
  loadModules,
  saveActiveId,
  saveConfig,
  saveModules,
} from './store.js';
import Build from './Build.jsx';
import Bank from './Bank.jsx';
import Modules from './Modules.jsx';
import Runner from './Runner.jsx';
import Results from './Results.jsx';
import PrintSheet from './PrintSheet.jsx';
import './paper.css';
import './rail.css';

const EMPTY_MODULE = {
  id: 'empty',
  code: 'NEW',
  title: 'No module yet',
  description: '',
  outcomes: [],
  questions: [],
  builtin: true,
};

const SUBTABS = [
  ['generate', 'Generate'],
  ['bank', 'Question bank'],
  ['papers', 'Papers'],
  ['modules', 'Modules'],
  ['flashcards', 'Flashcards'],
];

export default function PaperStudio({ exam, project, view, onView, generatePanel, flashcardsPanel }) {
  const [modules, setModules] = useState(loadModules);
  const [activeId, setActiveId] = useState(loadActiveId);
  const [internalSub, setInternalSub] = useState('generate');
  const sub = view || internalSub;
  const setSub = (next) => {
    setInternalSub(next);
    if (onView) onView(next);
  };
  const [stage, setStage] = useState('build');
  const [config, setConfig] = useState(() => ({ ...DEFAULT_CONFIG, ...(loadConfig() || {}) }));
  const [paper, setPaper] = useState(null);
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState({});
  const [result, setResult] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [printKey, setPrintKey] = useState(false);
  const [history, setHistory] = useState([]);

  const generated = useMemo(() => importExam(exam), [exam]);
  const allModules = useMemo(
    () => [generated, ...modules].filter(Boolean),
    [generated, modules],
  );
  const activeModule = allModules.find((module) => module.id === activeId) || allModules[0] || EMPTY_MODULE;
  const bank = activeModule.questions || [];

  useEffect(() => {
    saveModules(modules);
  }, [modules]);

  useEffect(() => {
    saveActiveId(activeModule.id);
  }, [activeModule.id]);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // Keep the selection valid when the module changes (or a saved selection refers to it).
  useEffect(() => {
    const valid = activeModule.outcomes.map((outcome) => outcome.id);
    setConfig((previous) => {
      const outcomes = previous.outcomes.filter((id) => valid.includes(id));
      const next = outcomes.length > 0 ? outcomes : valid;
      if (next.length === previous.outcomes.length && next.every((id, i) => id === previous.outcomes[i])) {
        return previous;
      }
      return { ...previous, outcomes: next };
    });
  }, [activeModule]);

  useEffect(() => {
    if (stage !== 'exam' || !paper || paper.config.mode !== 'exam') return undefined;
    const id = window.setInterval(() => {
      setSecondsLeft((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [stage, paper]);

  const counts = useMemo(() => {
    const map = {};
    activeModule.outcomes.forEach((outcome) => {
      map[outcome.id] = bank.filter(
        (question) =>
          question.outcome === outcome.id &&
          config.types.includes(question.type) &&
          (config.difficulty === 'all' || question.difficulty === config.difficulty),
      ).length;
    });
    return map;
  }, [bank, activeModule, config.types, config.difficulty]);

  const available = useMemo(() => poolFor(bank, config).length, [bank, config]);

  const finish = (currentPaper) => {
    const used = currentPaper.config.mode === 'exam'
      ? Math.max(0, currentPaper.config.durationMin * 60 - secondsLeft)
      : Math.round((Date.now() - startedAt) / 1000);
    setResult(scorePaper(currentPaper, answers, used));
    setStage('results');
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (stage === 'exam' && paper && paper.config.mode === 'exam' && secondsLeft === 0 && startedAt) {
      finish(paper);
    }
    // finish is stable for this purpose: it reads the current answers through state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, stage, paper, startedAt]);

  const startPaper = () => {
    const next = generatePaper(bank, config, {
      code: activeModule.code,
      title: activeModule.title,
      outcomes: activeModule.outcomes,
    });
    if (next.totalMarks === 0) return;
    setPaper(next);
    setHistory((previous) => [...previous, next]);
    setAnswers({});
    setChecked({});
    setResult(null);
    setSecondsLeft(next.config.durationMin * 60);
    setStartedAt(Date.now());
    setStage('exam');
  };

  const answer = (question, value) => {
    const practice = paper && paper.config.mode === 'practice';
    if (practice && checked[question.id]) return;
    setAnswers((previous) => ({ ...previous, [question.id]: value }));
    if (practice && question.type !== 'fill') {
      setChecked((previous) => ({ ...previous, [question.id]: true }));
    }
  };

  const submit = () => {
    if (!paper) return;
    if (!window.confirm('Submit this paper? You cannot change your answers after submitting.')) return;
    finish(paper);
  };

  const leaveExam = () => {
    if (!window.confirm('Leave this paper? Your answers will be lost.')) return;
    setStage('build');
    setPaper(null);
    setResult(null);
  };

  const print = (withKey) => {
    setPrintKey(withKey);
    document.body.classList.add('esx-printing');
    window.setTimeout(() => window.print(), 60);
  };

  // Opening or printing a paper that was built earlier in this session.
  const openPaper = (entry) => {
    setPaper(entry);
    setAnswers({});
    setChecked({});
    setResult(null);
    setSecondsLeft(entry.config.durationMin * 60);
    setStartedAt(Date.now());
    setStage('exam');
    window.scrollTo({ top: 0 });
  };

  const printPaper = (entry) => {
    setPaper(entry);
    setPrintKey(false);
    document.body.classList.add('esx-printing');
    window.setTimeout(() => window.print(), 120);
  };

  useEffect(() => {
    const off = () => document.body.classList.remove('esx-printing');
    window.addEventListener('afterprint', off);
    return () => {
      window.removeEventListener('afterprint', off);
      document.body.classList.remove('esx-printing');
    };
  }, []);

  const selectModule = (id) => {
    setActiveId(id);
    setSub('papers');
    setStage('build');
    window.scrollTo({ top: 0 });
  };

  const createModule = (module) => {
    setModules((previous) => [...previous, module]);
    setActiveId(module.id);
    setSub('modules');
  };

  const deleteModule = (id) => {
    const target = modules.find((module) => module.id === id);
    if (!target) return;
    if (!window.confirm(`Delete "${target.code} - ${target.title}" and its ${target.questions.length} questions?`)) return;
    setModules((previous) => previous.filter((module) => module.id !== id));
    if (activeModule.id === id) setActiveId(generated ? generated.id : '');
  };

  const addQuestion = (moduleId, question) => {
    setModules((previous) =>
      previous.map((module) =>
        module.id === moduleId ? { ...module, questions: [...module.questions, question] } : module,
      ),
    );
  };

  const deleteQuestion = (moduleId, questionId) => {
    setModules((previous) =>
      previous.map((module) =>
        module.id === moduleId
          ? { ...module, questions: module.questions.filter((question) => question.id !== questionId) }
          : module,
      ),
    );
  };

  const moduleMeta = { code: paper ? paper.code : activeModule.code, title: paper ? paper.title : activeModule.title };

  return (
    <div className="esx">
      <div className="esx-screen">
        {stage === 'exam' && paper && (
          <Runner
            paper={paper}
            answers={answers}
            checked={checked}
            secondsLeft={secondsLeft}
            onAnswer={answer}
            onCheck={(id) => setChecked((previous) => ({ ...previous, [id]: true }))}
            onSubmit={submit}
            onExit={leaveExam}
          />
        )}

        {stage === 'results' && paper && result && (
          <Results
            paper={paper}
            result={result}
            onRetake={startPaper}
            onNew={() => {
              setStage('build');
              setSub('papers');
              window.scrollTo({ top: 0 });
            }}
            onPrint={print}
          />
        )}

        {stage === 'build' && (
          <>
            {!generated && modules.length === 0 && (
              <div className="esx-notice">
                <strong>Start with a bank.</strong> Generate questions in Generate to import their
                auto-markable items, or open Modules and create one by hand.
              </div>
            )}

            <div className="esx-body">
              <nav className="esx-rail" aria-label="Paper studio views">
                {SUBTABS.map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    aria-current={sub === key ? 'page' : undefined}
                    className={sub === key ? 'is-on' : ''}
                    onClick={() => setSub(key)}
                  >
                    {label}
                  </button>
                ))}
                <p className="esx-subnav-meta">
                  {moduleMeta.code} · {bank.length} questions
                </p>
              </nav>

              <div className="esx-view">
                {sub === 'generate' && generatePanel}

                {sub === 'flashcards' && flashcardsPanel}

                {sub === 'bank' && (
                  <Bank module={activeModule} outcomes={activeModule.outcomes} onManage={() => setSub('modules')} />
                )}

                {sub === 'papers' && (
                  <>
                    <Build
                      module={activeModule}
                      outcomes={activeModule.outcomes}
                      config={config}
                      onChange={setConfig}
                      counts={counts}
                      available={available}
                      onStart={startPaper}
                    />
                    <section className="esx-panel">
                      <div className="esx-panel-head">
                        <div>
                          <h2>Papers from this session</h2>
                        </div>
                        <span className="esx-muted esx-small">{history.length}</span>
                      </div>
                      {history.length === 0 ? (
                        <p className="esx-empty">Build a paper above and it appears here.</p>
                      ) : (
                        <ul className="esx-paper-list">
                          {history.map((entry, index) => (
                            <li key={`${entry.code}-${index}`}>
                              <span className="esx-mono esx-muted">{entry.code}</span>
                              <strong>{entry.title}</strong>
                              <span className="esx-muted esx-small">
                                {entry.questions.length} questions · {entry.totalMarks} marks
                              </span>
                              <button type="button" className="esx-btn esx-btn-ghost esx-btn-sm" onClick={() => openPaper(entry)}>Open</button>
                              <button type="button" className="esx-btn esx-btn-ghost esx-btn-sm" onClick={() => printPaper(entry)}>Print</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </>
                )}

                {sub === 'modules' && (
                  <Modules
                    modules={allModules.length > 0 ? allModules : []}
                    activeModule={activeModule}
                    onSelect={selectModule}
                    onCreate={createModule}
                    onDeleteModule={deleteModule}
                    onAddQuestion={addQuestion}
                    onDeleteQuestion={deleteQuestion}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {project && project.module && stage === 'build' && (
          <p className="esx-foot-note">
            Project: {project.module}
            {project.school ? ` · ${project.school}` : ''}
            {project.level ? ` · ${project.level}` : ''}
          </p>
        )}
      </div>

      <PrintSheet paper={paper} includeKey={printKey} />
    </div>
  );
}
