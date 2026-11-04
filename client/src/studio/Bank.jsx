import React, { useMemo, useState } from 'react';
import { typeLabel } from './engine.js';

export default function Bank({ module, outcomes, onManage }) {
  const [outcome, setOutcome] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [showAnswers, setShowAnswers] = useState(true);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return module.questions.filter((question) => {
      if (outcome !== 'all' && question.outcome !== outcome) return false;
      if (type !== 'all' && question.type !== type) return false;
      if (!term) return true;
      return (
        question.prompt.toLowerCase().includes(term) ||
        question.topic.toLowerCase().includes(term) ||
        String(question.reference || '').toLowerCase().includes(term) ||
        (question.options || []).some((option) => option.toLowerCase().includes(term))
      );
    });
  }, [module, outcome, type, search]);

  return (
    <div>
      <div className="esx-head">
        <p className="esx-eyebrow">Library</p>
        <h1 className="esx-h1">Question bank</h1>
        <p className="esx-lede">
          {module.questions.length} items in {module.code} · {module.title}, tagged by learning
          outcome. Use this view to check wording before a paper is generated.
        </p>
      </div>

      <section className="esx-panel">
        <div className="esx-filters">
          <div className="esx-field">
            <span className="esx-label">Learning outcome</span>
            <div className="esx-chip-row">
              <button
                type="button"
                className={outcome === 'all' ? 'esx-chip is-on' : 'esx-chip'}
                onClick={() => setOutcome('all')}
              >
                All
              </button>
              {outcomes.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={outcome === entry.id ? 'esx-chip is-on' : 'esx-chip'}
                  onClick={() => setOutcome(entry.id)}
                >
                  LO {entry.id}
                </button>
              ))}
            </div>
          </div>

          <div className="esx-field">
            <span className="esx-label">Type</span>
            <div className="esx-chip-row">
              {['all', 'mcq', 'tf', 'fill'].map((entry) => (
                <button
                  type="button"
                  key={entry}
                  className={type === entry ? 'esx-chip is-on' : 'esx-chip'}
                  onClick={() => setType(entry)}
                >
                  {entry === 'all' ? 'All' : typeLabel(entry)}
                </button>
              ))}
            </div>
          </div>

          <div className="esx-bank-search">
            <input
              className="esx-input"
              type="search"
              placeholder="Search prompts, topics or references"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              role="switch"
              aria-checked={showAnswers}
              className={showAnswers ? 'esx-switch is-on' : 'esx-switch'}
              onClick={() => setShowAnswers((value) => !value)}
            >
              <span className="esx-switch-track" aria-hidden="true">
                <span className="esx-switch-knob" />
              </span>
              Show answers
            </button>
          </div>
        </div>
      </section>

      <div className="esx-bank-toolbar">
        <p className="esx-muted esx-small">
          Showing {filtered.length} of {module.questions.length} questions
        </p>
        <button type="button" className="esx-btn esx-btn-ghost esx-btn-sm" onClick={onManage}>
          {module.builtin ? 'Add a module' : 'Add or edit questions'}
        </button>
      </div>

      {outcomes.map((entry) => {
        const group = filtered.filter((question) => question.outcome === entry.id);
        if (group.length === 0) return null;
        return (
          <section className="esx-bank-group" key={entry.id}>
            <div className="esx-section-head">
              <span className="esx-section-badge">LO {entry.id}</span>
              <h2>{entry.title}</h2>
              <span className="esx-section-marks">{group.length} items</span>
            </div>
            {group.map((question, index) => (
              <article className="esx-bank-q" key={question.id}>
                <div className="esx-bank-q-head">
                  <span className="esx-mono esx-muted">{String(index + 1).padStart(2, '0')}</span>
                  <span className="esx-tag">{typeLabel(question.type)}</span>
                  <span className="esx-tag">{question.topic}</span>
                  {question.difficulty === 'advanced' && <span className="esx-tag esx-tag-advanced">Advanced</span>}
                </div>
                <p className="esx-bank-prompt">{question.prompt}</p>
                {question.options && (
                  <ul className="esx-bank-options">
                    {question.options.map((option, optionIndex) => (
                      <li key={option} className={showAnswers && option === question.answer ? 'is-answer' : ''}>
                        <span className="esx-mono esx-muted">
                          {question.type === 'tf' ? option.charAt(0) : String.fromCharCode(65 + optionIndex)}
                        </span>
                        {option}
                      </li>
                    ))}
                  </ul>
                )}
                {showAnswers && (
                  <div className="esx-bank-answer">
                    <p>
                      <strong>Answer:</strong> {question.answer}
                    </p>
                    {question.explanation && <p className="esx-muted esx-small">{question.explanation}</p>}
                    <p className="esx-ref">{question.reference}</p>
                  </div>
                )}
              </article>
            ))}
          </section>
        );
      })}

      {filtered.length === 0 && (
        <p className="esx-empty">
          {module.questions.length === 0
            ? 'This module has no questions yet. Add some under Modules, or generate an exam and import it.'
            : 'No questions match these filters.'}
        </p>
      )}
    </div>
  );
}
