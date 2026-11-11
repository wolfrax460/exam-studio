import React from 'react';
import { previewDistribution } from './engine.js';

const COUNTS = [10, 20, 30, 40];
const DURATIONS = [15, 30, 45, 60, 90, 120];
const TYPES = [
  ['mcq', 'Multiple choice'],
  ['tf', 'True / false'],
  ['fill', 'Fill in the blank'],
];

export default function Build({ module, outcomes, config, onChange, counts, available, onStart }) {
  const toggle = (list, value) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value].sort();

  const planned = Math.min(config.count, available);
  const sections = outcomes.filter((outcome) => config.outcomes.includes(outcome.id));
  const distribution = previewDistribution(
    sections.map((outcome) => counts[outcome.id] || 0),
    planned,
  );
  const ready = config.outcomes.length > 0 && config.types.length > 0 && available > 0;
  const empty = module.questions.length === 0;
  const noModule = module.id === 'empty';

  return (
    <div className="esx-build">
      <div className="esx-head">
        <p className="esx-eyebrow">
          {noModule ? 'Paper studio' : `${module.code} · ${module.builtin ? 'Imported bank' : 'Your module'}`}
        </p>
        <h1 className="esx-h1">{noModule ? 'Build your first paper.' : `Build a paper from ${module.code}.`}</h1>
        <p className="esx-lede">
          {noModule
            ? 'Generate an exam in Create to reuse its objective questions, or add your own questions in Modules. Then choose what to include and practise or print the paper.'
            : `${module.title}. Choose the coverage, set the format, then sit the paper or print it for the class. Every question is marked automatically.`}
        </p>
      </div>

      <div className="esx-columns">
        <div className="esx-stack">
          <section className="esx-panel">
            <div className="esx-panel-head">
              <div>
                <p className="esx-step">Step 1</p>
                <h2>Learning outcomes</h2>
              </div>
              <span className="esx-muted esx-small">
                {config.outcomes.length} of {outcomes.length} selected
              </span>
            </div>

            <div className="esx-outcome-grid">
              {outcomes.map((outcome) => {
                const on = config.outcomes.includes(outcome.id);
                return (
                  <button
                    type="button"
                    key={outcome.id}
                    className={on ? 'esx-outcome-card is-on' : 'esx-outcome-card'}
                    aria-pressed={on}
                    onClick={() => onChange({ ...config, outcomes: toggle(config.outcomes, outcome.id) })}
                  >
                    <span className="esx-outcome-top">
                      <span className="esx-outcome-code">LO {outcome.id}</span>
                      <span className={on ? 'esx-tick is-on' : 'esx-tick'} aria-hidden="true">
                        {on ? '\u2713' : ''}
                      </span>
                    </span>
                    <strong>{outcome.title}</strong>
                    <span className="esx-outcome-foot">
                      <span>{counts[outcome.id] || 0} items</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="esx-panel">
            <div className="esx-panel-head">
              <div>
                <p className="esx-step">Step 2</p>
                <h2>Question types</h2>
              </div>
            </div>
            <div className="esx-chip-row">
              {TYPES.map(([id, label]) => {
                const on = config.types.includes(id);
                return (
                  <button
                    type="button"
                    key={id}
                    className={on ? 'esx-chip is-on' : 'esx-chip'}
                    aria-pressed={on}
                    onClick={() => onChange({ ...config, types: toggle(config.types, id) })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="esx-hint">
              Fill-in questions accept a short word or phrase; marking ignores case and punctuation.
            </p>
          </section>

          <section className="esx-panel">
            <div className="esx-panel-head">
              <div>
                <p className="esx-step">Step 3</p>
                <h2>Format and length</h2>
              </div>
            </div>

            <div className="esx-row2">
              <div className="esx-field">
                <span className="esx-label">Mode</span>
                <div className="esx-segmented">
                  <button
                    type="button"
                    className={config.mode === 'exam' ? 'is-on' : ''}
                    onClick={() => onChange({ ...config, mode: 'exam' })}
                  >
                    Timed exam
                  </button>
                  <button
                    type="button"
                    className={config.mode === 'practice' ? 'is-on' : ''}
                    onClick={() => onChange({ ...config, mode: 'practice' })}
                  >
                    Practice
                  </button>
                </div>
                <p className="esx-hint">
                  {config.mode === 'exam'
                    ? 'Answers stay hidden until the paper is submitted.'
                    : 'Each answer is marked immediately, with the reference.'}
                </p>
              </div>

              <div className="esx-field">
                <span className="esx-label">Difficulty</span>
                <div className="esx-segmented">
                  {['all', 'core', 'advanced'].map((level) => (
                    <button
                      type="button"
                      key={level}
                      className={config.difficulty === level ? 'is-on' : ''}
                      onClick={() => onChange({ ...config, difficulty: level })}
                    >
                      {level === 'all' ? 'All' : level === 'core' ? 'Core' : 'Advanced'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="esx-field">
              <span className="esx-label">Length</span>
              <div className="esx-chip-row">
                {COUNTS.map((count) => (
                  <button
                    type="button"
                    key={count}
                    className={config.count === count ? 'esx-chip is-on' : 'esx-chip'}
                    disabled={count > available}
                    onClick={() => onChange({ ...config, count })}
                  >
                    {count} questions
                  </button>
                ))}
                {available > 0 && available < 10 && (
                  <button
                    type="button"
                    className={config.count >= available ? 'esx-chip is-on' : 'esx-chip'}
                    onClick={() => onChange({ ...config, count: available })}
                  >
                    All {available}
                  </button>
                )}
              </div>
              <p className="esx-hint">
                {empty
                  ? 'This bank has no questions yet. Add some under Modules, or generate an exam first.'
                  : available === 0
                    ? 'No items match this selection. Add an outcome or a question type.'
                    : `${planned} question${planned === 1 ? '' : 's'} will be drawn from ${available} matching items.`}
              </p>
            </div>

            <div className="esx-row2">
              <div className="esx-field">
                <span className="esx-label">Time allowed</span>
                <select
                  className="esx-input"
                  value={config.durationMin}
                  disabled={config.mode === 'practice'}
                  onChange={(event) => onChange({ ...config, durationMin: Number(event.target.value) })}
                >
                  {DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
                {config.mode === 'practice' && <p className="esx-hint">Practice papers are untimed.</p>}
              </div>

              <div className="esx-field">
                <span className="esx-label">Options</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={config.shuffleOptions}
                  className={config.shuffleOptions ? 'esx-switch is-on' : 'esx-switch'}
                  onClick={() => onChange({ ...config, shuffleOptions: !config.shuffleOptions })}
                >
                  <span className="esx-switch-track" aria-hidden="true">
                    <span className="esx-switch-knob" />
                  </span>
                  Shuffle answer options
                </button>
                <p className="esx-hint">Questions are always shuffled between attempts.</p>
              </div>
            </div>
          </section>
        </div>

        <aside className="esx-summary">
          <p className="esx-summary-eyebrow">Paper preview</p>
          <h2>{config.mode === 'exam' ? 'Timed examination' : 'Practice paper'}</h2>
          <p className="esx-summary-sub">
            {module.code} · {module.title}
          </p>

          <div className="esx-summary-stats">
            <div className="esx-summary-row">
              <span>Questions</span>
              <strong>{planned}</strong>
            </div>
            <div className="esx-summary-row">
              <span>Total marks</span>
              <strong>{planned}</strong>
            </div>
            <div className="esx-summary-row">
              <span>Sections</span>
              <strong>{sections.length}</strong>
            </div>
            <div className="esx-summary-row">
              <span>Time allowed</span>
              <strong>{config.mode === 'exam' ? `${config.durationMin} min` : 'Untimed'}</strong>
            </div>
            <div className="esx-summary-row">
              <span>Pass mark</span>
              <strong>50%</strong>
            </div>
          </div>

          <div className="esx-summary-sections">
            {sections.length === 0 ? (
              <p className="esx-summary-empty">No section selected yet.</p>
            ) : (
              sections.map((outcome, index) => (
                <div className="esx-summary-section" key={outcome.id}>
                  <span className="esx-summary-letter">{String.fromCharCode(65 + index)}</span>
                  <span className="esx-summary-title">{outcome.title}</span>
                  <span className="esx-summary-count">{distribution[index] || 0}</span>
                </div>
              ))
            )}
          </div>

          <button type="button" className="esx-generate" onClick={onStart} disabled={!ready}>
            Generate exam paper
          </button>
          <p className="esx-summary-note">
            {ready
              ? 'Marks are calculated automatically and the answer key prints with the paper.'
              : 'Select at least one learning outcome and question type.'}
          </p>
        </aside>
      </div>
    </div>
  );
}
