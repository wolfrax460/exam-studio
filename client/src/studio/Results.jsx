import React, { useState } from 'react';
import { formatClock, outcomeTitle, PASS_PERCENT, typeLabel } from './engine.js';

const RADIUS = 62;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Results({ paper, result, onRetake, onNew, onPrint }) {
  const [filter, setFilter] = useState('all');

  const items = result.items.filter((item) => {
    if (filter === 'incorrect') return !item.correct && item.given.trim().length > 0;
    if (filter === 'blank') return item.given.trim().length === 0;
    return true;
  });

  const csv = () => {
    const rows = [['Q', 'Section', 'Type', 'Question', 'Your answer', 'Correct answer', 'Correct', 'Reference']];
    result.items.forEach((item, index) => {
      rows.push([
        index + 1,
        outcomeTitle(paper.outcomes, item.question.outcome),
        typeLabel(item.question.type),
        item.question.prompt,
        item.given,
        item.question.answer,
        item.correct ? 'yes' : 'no',
        item.question.reference,
      ]);
    });
    rows.push([]);
    rows.push(['Score', `${result.correct}/${result.total}`, `${result.percent}%`, result.passed ? 'Passed' : 'Not yet at the pass mark']);

    const text = rows
      .map((row) => row.map((value) => `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${paper.code || 'paper'}-${paper.config.mode}-results.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  return (
    <div>
      <div className="esx-head">
        <p className="esx-eyebrow">Marked paper</p>
        <h1 className="esx-h1">{result.passed ? 'Passed.' : 'Not yet at the pass mark.'}</h1>
        <p className="esx-lede">
          {paper.code} · {paper.title} - {paper.totalMarks} questions marked. Pass mark {PASS_PERCENT}%.
        </p>
      </div>

      <section className="esx-score-hero">
        <div className="esx-score-ring">
          <svg viewBox="0 0 160 160" role="img" aria-label={`Score ${result.percent} percent`}>
            <circle className="esx-ring-track" cx="80" cy="80" r={RADIUS} />
            <circle
              className="esx-ring-value"
              cx="80"
              cy="80"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - result.percent / 100)}
            />
          </svg>
          <div className="esx-ring-label">
            <strong>{result.percent}%</strong>
            <span>
              {result.marks} / {result.total} marks
            </span>
          </div>
        </div>

        <div className="esx-score-body">
          <p className={result.passed ? 'esx-verdict is-pass' : 'esx-verdict is-fail'}>
            {result.passed ? 'Competent' : 'Additional practice needed'}
          </p>
          <p className="esx-verdict-sub">
            {paper.config.mode === 'exam' ? 'Timed exam' : 'Practice paper'} · {paper.totalMarks} questions ·
            completed in {formatClock(result.secondsUsed)}
          </p>

          <div className="esx-stats">
            <div className="esx-stat">
              <span className="esx-stat-label">Correct</span>
              <span className="esx-stat-value">{result.correct}</span>
            </div>
            <div className="esx-stat">
              <span className="esx-stat-label">Incorrect</span>
              <span className="esx-stat-value">{result.answered - result.correct}</span>
            </div>
            <div className="esx-stat">
              <span className="esx-stat-label">Unanswered</span>
              <span className="esx-stat-value">{result.total - result.answered}</span>
            </div>
            <div className="esx-stat">
              <span className="esx-stat-label">Pass mark</span>
              <span className="esx-stat-value">{PASS_PERCENT}%</span>
            </div>
          </div>
        </div>
      </section>

      <div className="esx-actions">
        <button type="button" className="esx-btn esx-btn-primary" onClick={onRetake}>
          Retake paper
        </button>
        <button type="button" className="esx-btn esx-btn-ghost" onClick={onNew}>
          Build another paper
        </button>
        <div className="esx-actions-print">
          <button type="button" className="esx-btn esx-btn-ghost" onClick={csv}>
            Download results (CSV)
          </button>
          <button type="button" className="esx-btn esx-btn-ghost" onClick={() => onPrint(false)}>
            Print question paper
          </button>
          <button type="button" className="esx-btn esx-btn-ghost" onClick={() => onPrint(true)}>
            Print paper + answer key
          </button>
        </div>
      </div>

      <section className="esx-panel">
        <div className="esx-panel-head">
          <div>
            <p className="esx-step">By learning outcome</p>
            <h2>Where the marks came from</h2>
          </div>
        </div>
        <div className="esx-bars">
          {result.byOutcome.map((entry) => {
            const percent = entry.total === 0 ? 0 : Math.round((entry.correct / entry.total) * 100);
            return (
              <div className="esx-bar-row" key={entry.outcome}>
                <div className="esx-bar-head">
                  <span className="esx-bar-title">
                    <span className="esx-mono esx-muted">LO {entry.outcome}</span> {outcomeTitle(paper.outcomes, entry.outcome)}
                  </span>
                  <span className="esx-bar-score">
                    {entry.correct}/{entry.total} · {percent}%
                  </span>
                </div>
                <div className="esx-bar-track">
                  <div
                    className={percent >= PASS_PERCENT ? 'esx-bar-fill' : 'esx-bar-fill is-low'}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="esx-panel">
        <div className="esx-panel-head">
          <div>
            <p className="esx-step">Review</p>
            <h2>Every question, marked</h2>
          </div>
          <div className="esx-segmented">
            {['all', 'incorrect', 'blank'].map((option) => (
              <button
                type="button"
                key={option}
                className={filter === option ? 'is-on' : ''}
                onClick={() => setFilter(option)}
              >
                {option === 'all' ? 'All' : option === 'incorrect' ? 'Incorrect' : 'Unanswered'}
              </button>
            ))}
          </div>
        </div>

        <div className="esx-review">
          {items.length === 0 && <p className="esx-muted">Nothing to show for this filter.</p>}
          {items.map((item) => {
            const index = result.items.findIndex((entry) => entry.question.id === item.question.id) + 1;
            return (
              <article className="esx-review-item" key={item.question.id}>
                <div className={item.correct ? 'esx-review-mark is-ok' : 'esx-review-mark is-bad'}>
                  {item.correct ? '\u2713' : '\u2715'}
                </div>
                <div>
                  <div className="esx-q-tags">
                    <span className="esx-tag">
                      Q{index} · {typeLabel(item.question.type)}
                    </span>
                    <span className="esx-tag">LO {item.question.outcome}</span>
                    <span className="esx-tag">{item.question.topic}</span>
                  </div>
                  <p className="esx-review-prompt">{item.question.prompt}</p>
                  <p className="esx-answer-line">
                    Your answer: <b>{item.given.trim() ? item.given : '- left blank -'}</b>
                  </p>
                  <p className="esx-answer-line">
                    Correct answer: <b className="esx-correct-answer">{item.question.answer}</b>
                  </p>
                  {item.question.explanation && <p className="esx-review-explanation">{item.question.explanation}</p>}
                  <p className="esx-ref">{item.question.reference}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
