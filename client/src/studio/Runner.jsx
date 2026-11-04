import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatClock, isCorrect, outcomeTitle, typeLabel } from './engine.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export default function Runner({ paper, answers, checked, secondsLeft, onAnswer, onCheck, onSubmit, onExit }) {
  const practice = paper.config.mode === 'practice';
  const total = paper.totalMarks;
  const answered = paper.sections.reduce(
    (sum, section) => sum + section.questions.filter((question) => (answers[question.id] || '').trim()).length,
    0,
  );
  const progress = total === 0 ? 0 : Math.round((answered / total) * 100);

  const flat = useMemo(() => paper.sections.flatMap((section) => section.questions), [paper]);
  const [cursor, setCursor] = useState(0);
  const refs = useRef({});
  let number = 0;

  const goTo = (index) => {
    if (flat.length === 0) return;
    const next = Math.max(0, Math.min(flat.length - 1, index));
    setCursor(next);
    const node = refs.current[flat[next].id];
    if (node && node.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goTo(cursor + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goTo(cursor - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // goTo reads the current cursor and list on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, flat]);

  return (
    <div className="esx-runner">
      <div className="esx-runner-bar">
        <button type="button" className="esx-btn esx-btn-ghost esx-btn-sm" onClick={onExit}>
          &larr; Studio
        </button>

        <div className="esx-runner-mid">
          <span className={practice ? 'esx-mode-chip is-practice' : 'esx-mode-chip'}>
            {practice ? 'Practice' : 'Timed exam'}
          </span>
          <span className="esx-muted esx-small">
            {answered} of {total} answered
          </span>
          <span className="esx-progress" aria-hidden="true">
            <span className="esx-progress-fill" style={{ width: `${progress}%` }} />
          </span>
        </div>

        <div className="esx-runner-right">
          {!practice && (
            <span className={secondsLeft <= 60 ? 'esx-timer is-low' : 'esx-timer'}>
              <span className="esx-timer-label">Time</span>
              {formatClock(secondsLeft)}
            </span>
          )}
          <button type="button" className="esx-btn esx-btn-primary" onClick={onSubmit}>
            {practice ? 'Finish practice' : 'Submit paper'}
          </button>
        </div>
      </div>

      <nav className="esx-qnav" aria-label="Question navigator">
        <span className="esx-qnav-label">Questions</span>
        <div className="esx-qnav-grid">
          {flat.map((question, index) => {
            const done = (answers[question.id] || '').trim().length > 0;
            const classes = ['esx-qnav-btn'];
            if (done) classes.push('is-answered');
            if (index === cursor) classes.push('is-cursor');
            return (
              <button
                type="button"
                key={question.id}
                className={classes.join(' ')}
                aria-label={`Go to question ${index + 1}${done ? ', answered' : ''}`}
                aria-current={index === cursor ? 'true' : undefined}
                onClick={() => goTo(index)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <span className="esx-qnav-hint">Arrow keys jump between questions</span>
      </nav>

      <article className="esx-paper">
        <header className="esx-paper-head">
          <p className="esx-eyebrow">{paper.code} · Trainee assessment</p>
          <h1 className="esx-paper-title">{paper.title}</h1>
          <p className="esx-paper-sub">
            {practice ? 'Practice paper' : 'End of module assessment'} · {total} questions
          </p>

          <div className="esx-meta-grid">
            <div>
              <span className="esx-meta-label">Module code</span>
              <span className="esx-meta-value">{paper.code}</span>
            </div>
            <div>
              <span className="esx-meta-label">Questions</span>
              <span className="esx-meta-value">{total}</span>
            </div>
            <div>
              <span className="esx-meta-label">Total marks</span>
              <span className="esx-meta-value">{total} marks</span>
            </div>
            <div>
              <span className="esx-meta-label">Time allowed</span>
              <span className="esx-meta-value">
                {practice ? 'Untimed' : `${paper.config.durationMin} minutes`}
              </span>
            </div>
          </div>

          <ul className="esx-instructions">
            <li>Answer all questions. Each question carries one mark.</li>
            <li>Multiple-choice questions have exactly one correct option; true or false questions require one choice.</li>
            <li>For fill-in questions type a single word or short phrase. Capitalisation and punctuation are ignored.</li>
            <li>
              {practice
                ? 'Feedback and the matching reference appear as soon as you answer.'
                : 'Answers and the answer key are released after you submit the paper.'}
            </li>
          </ul>
        </header>

        {paper.sections.map((section, sectionIndex) => (
          <section key={section.outcome} className="esx-paper-section">
            <div className="esx-section-head">
              <span className="esx-section-badge">Section {String.fromCharCode(65 + sectionIndex)}</span>
              <h2>{outcomeTitle(paper.outcomes, section.outcome)}</h2>
              <span className="esx-section-marks">{section.questions.length} marks</span>
            </div>

            {section.questions.map((question) => {
              number += 1;
              const current = number;
              const given = answers[question.id] || '';
              const revealed = practice && Boolean(checked[question.id]);
              const correct = revealed && isCorrect(question, given);
              const isCursor = current - 1 === cursor;

              return (
                <div
                  className={isCursor ? 'esx-q-card is-current' : 'esx-q-card'}
                  key={question.id}
                  ref={(node) => {
                    refs.current[question.id] = node;
                  }}
                >
                  <div className="esx-q-num">{String(current).padStart(2, '0')}</div>
                  <div className="esx-q-body">
                    <div className="esx-q-tags">
                      <span className="esx-tag">{typeLabel(question.type)}</span>
                      <span className="esx-tag">{question.topic}</span>
                      {question.difficulty === 'advanced' && <span className="esx-tag esx-tag-advanced">Advanced</span>}
                      <span className="esx-tag esx-tag-marks">1 mark</span>
                    </div>
                    <p className="esx-q-prompt">{question.prompt}</p>

                    {question.type === 'fill' ? (
                      <div className="esx-fill-row">
                        <input
                          className="esx-input"
                          type="text"
                          value={given}
                          placeholder="Type your answer"
                          disabled={revealed}
                          onChange={(event) => onAnswer(question, event.target.value)}
                          aria-label={`Answer to question ${current}`}
                        />
                        {practice && !revealed && (
                          <button
                            type="button"
                            className="esx-btn esx-btn-dark esx-btn-sm"
                            disabled={!given.trim()}
                            onClick={() => onCheck(question.id)}
                          >
                            Check
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="esx-options">
                        {(question.options || []).map((option, optionIndex) => {
                          const selected = given === option;
                          const showCorrect = revealed && option === question.answer;
                          const showWrong = revealed && selected && option !== question.answer;
                          const classes = ['esx-option'];
                          if (selected && !revealed) classes.push('is-selected');
                          if (showCorrect) classes.push('is-correct');
                          if (showWrong) classes.push('is-wrong');
                          return (
                            <button
                              type="button"
                              key={option}
                              className={classes.join(' ')}
                              disabled={revealed}
                              aria-pressed={selected}
                              onClick={() => onAnswer(question, option)}
                            >
                              <span className="esx-key" aria-hidden="true">
                                {question.type === 'tf' ? option.charAt(0) : LETTERS[optionIndex] || '?'}
                              </span>
                              <span className="esx-option-text">{option}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {revealed && (
                      <div className={correct ? 'esx-feedback ok' : 'esx-feedback bad'}>
                        <strong>{correct ? 'Correct.' : 'Not quite.'}</strong>{' '}
                        {!correct && (
                          <>
                            The answer is <b>{question.answer}</b>.{' '}
                          </>
                        )}
                        {question.explanation}
                        <span className="esx-ref">{question.reference}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        ))}

        <footer className="esx-paper-foot">
          <div>
            <p className="esx-foot-title">End of paper</p>
            <p className="esx-muted esx-small">
              {answered} of {total} answered
              {answered < total ? ` · ${total - answered} left blank` : ' · all questions attempted'}
            </p>
          </div>
          <button type="button" className="esx-btn esx-btn-primary esx-btn-lg" onClick={onSubmit}>
            {practice ? 'Finish practice' : 'Submit paper'}
          </button>
        </footer>
      </article>
    </div>
  );
}
