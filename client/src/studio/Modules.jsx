import React, { useState } from 'react';
import { typeLabel } from './engine.js';
import SourcePicker from '../SourcePicker.jsx';
import { createModuleId, createQuestionId } from './store.js';
import { post } from '../api.js';
import { suggestOutcomes } from '../../../shared/outcomes.js';

export default function Modules({
  modules,
  activeModule,
  onSelect,
  onCreate,
  onDeleteModule,
  onAddQuestion,
  onDeleteQuestion,
}) {
  return (
    <div>
      <div className="esx-head">
        <p className="esx-eyebrow">Modules</p>
        <h1 className="esx-h1">Teach another module.</h1>
        <p className="esx-lede">
          Create a module, list its learning outcomes, then type its questions in by hand. Each
          module gets its own paper builder, marking and printable answer key.
        </p>
      </div>

      <section className="esx-panel">
        <div className="esx-panel-head">
          <div>
            <p className="esx-step">Library</p>
            <h2>Your modules</h2>
          </div>
          <span className="esx-muted esx-small">
            {modules.length} module{modules.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="esx-module-grid">
          {modules.map((module) => {
            const on = module.id === activeModule.id;
            return (
              <div key={module.id} className={on ? 'esx-module-card is-on' : 'esx-module-card'}>
                <button
                  type="button"
                  className="esx-module-pick"
                  aria-pressed={on}
                  onClick={() => onSelect(module.id)}
                >
                  <span className="esx-module-top">
                    <span className="esx-module-code">{module.code}</span>
                    <span className="esx-tag">{module.builtin ? 'Generated' : 'Custom'}</span>
                  </span>
                  <strong>{module.title}</strong>
                  <span className="esx-module-meta">
                    {module.outcomes.length} outcomes · {module.questions.length} questions
                  </span>
                </button>
                {!module.builtin && (
                  <button type="button" className="esx-module-del" onClick={() => onDeleteModule(module.id)}>
                    Delete module
                  </button>
                )}
              </div>
            );
          })}
          {modules.length === 0 && (
            <p className="esx-empty">No modules yet. Create one below, or generate an exam to import its questions.</p>
          )}
        </div>

        <CreateModule modules={modules} onCreate={onCreate} />
      </section>

      {activeModule.builtin ? (
        <section className="esx-panel">
          <div className="esx-panel-head">
            <div>
              <p className="esx-step">Imported bank</p>
              <h2>{activeModule.code} is read-only</h2>
            </div>
          </div>
          <p className="esx-hint">
            These questions come from your generated exam. Create a module above to add questions
            of your own.
          </p>
        </section>
      ) : (
        <>
          <QuestionForm key={activeModule.id} module={activeModule} onAdd={onAddQuestion} />
          <QuestionList module={activeModule} onDelete={onDeleteQuestion} />
        </>
      )}
    </div>
  );
}

function CreateModule({ modules, onCreate }) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState('');
  const [error, setError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  // The box fills from the shared heuristic first, which costs nothing. Only when the notes carry no
  // marked outcomes and no usable sentences does this spend one short AI call on the first 8k
  // characters, and the teacher can always overwrite what lands here.
  const fillOutcomes = async (text) => {
    const picked = suggestOutcomes(text);
    if (picked.length > 0) {
      setLines(picked.join('\n'));
      setSuggestError('');
      return;
    }
    if (!String(text || '').trim()) {
      setLines('');
      setSuggestError('');
      return;
    }
    setSuggesting(true);
    setSuggestError('');
    try {
      const { outcomes } = await post('/modules/suggest-outcomes', { text: String(text).slice(0, 8000), title: title.trim() });
      if (!outcomes || outcomes.length === 0) {
        setSuggestError('No outcomes were found in these notes. Type them in below.');
      } else {
        setLines(outcomes.join('\n'));
      }
    } catch (err) {
      setSuggestError(err.message || 'Could not suggest outcomes. Type them in below.');
    } finally {
      setSuggesting(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanTitle = title.trim();
    const outcomes = lines
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!cleanCode || !cleanTitle) return setError('Give the module a code and a title.');
    if (outcomes.length === 0) return setError('Add at least one learning outcome, one per line.');
    if (modules.some((module) => module.code.toUpperCase() === cleanCode)) {
      return setError(`A module with the code ${cleanCode} already exists.`);
    }

    onCreate({
      id: createModuleId(),
      code: cleanCode,
      title: cleanTitle,
      description: description.trim(),
      outcomes: outcomes.map((line, index) => ({ id: index + 1, title: line })),
      questions: [],
    });

    setCode('');
    setTitle('');
    setDescription('');
    setLines('');
    setError('');
    return undefined;
  };

  return (
    <form className="esx-module-form" onSubmit={submit}>
      <h3 className="esx-form-title">Create a module</h3>
      <div className="esx-form-grid">
        <label className="esx-field">
          <span className="esx-label">Module code</span>
          <input className="esx-input" value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. SWDBA502" />
        </label>
        <label className="esx-field">
          <span className="esx-label">Module title</span>
          <input className="esx-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Database Administration" />
        </label>
        <label className="esx-field esx-field-wide">
          <span className="esx-label">Description (optional)</span>
          <input
            className="esx-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="One line shown on the module card"
          />
        </label>
        <div className="esx-field esx-field-wide">
          <details>
            <summary>Start from your notes</summary>
            <SourcePicker onText={fillOutcomes} />
          </details>
          <span className="esx-hint">Pick a file or paste text and the likely outcomes are filled in below. Edit them before creating the module.</span>
          {suggesting && <span className="esx-hint">Suggesting outcomes…</span>}
          {suggestError && <p className="esx-form-error" role="alert">{suggestError}</p>}
        </div>

        <label className="esx-field esx-field-wide">
          <span className="esx-label">Learning outcomes - one per line</span>
          <textarea
            className="esx-input"
            rows={4}
            value={lines}
            onChange={(event) => setLines(event.target.value)}
            placeholder={'Install and configure a database server\nDesign a normalised schema\nBack up and restore a database'}
          />
          <span className="esx-hint">Each line becomes a section (Section A, B, ...) on the paper.</span>
        </label>
      </div>

      {error && <p className="esx-form-error">{error}</p>}

      <div className="esx-form-actions">
        <button type="submit" className="esx-btn esx-btn-primary">
          Create module
        </button>
        <span className="esx-form-note">Saved in this browser only.</span>
      </div>
    </form>
  );
}

function QuestionForm({ module, onAdd }) {
  const [outcomeId, setOutcomeId] = useState(module.outcomes[0] ? module.outcomes[0].id : 1);
  const [type, setType] = useState('mcq');
  const [difficulty, setDifficulty] = useState('core');
  const [topic, setTopic] = useState('');
  const [prompt, setPrompt] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [answer, setAnswer] = useState('');
  const [accept, setAccept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const options = optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const changeType = (next) => {
    setType(next);
    setAnswer(next === 'tf' ? 'True' : '');
    setError('');
    setNotice('');
  };

  const submit = (event) => {
    event.preventDefault();
    const cleanPrompt = prompt.trim();

    if (!cleanPrompt) return setError('Write the question prompt.');
    if (type === 'mcq' && options.length < 2) return setError('Add at least two answer options, one per line.');
    if (type === 'mcq' && !options.includes(answer)) return setError('Choose which option is the correct answer.');
    if (type === 'fill' && !answer.trim()) return setError('Add the answer that marking should accept.');

    const base = {
      id: createQuestionId(),
      outcome: outcomeId,
      topic: topic.trim() || 'General',
      difficulty,
      prompt: cleanPrompt,
      explanation: explanation.trim(),
      reference: reference.trim() || 'Manually added question',
    };

    let question;
    if (type === 'mcq') {
      question = { ...base, type: 'mcq', options, answer };
    } else if (type === 'tf') {
      question = { ...base, type: 'tf', options: ['True', 'False'], answer };
    } else {
      question = {
        ...base,
        type: 'fill',
        answer: answer.trim(),
        accept: accept
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      };
    }

    onAdd(module.id, question);
    setPrompt('');
    setOptionsText('');
    setAnswer(type === 'tf' ? 'True' : '');
    setAccept('');
    setExplanation('');
    setReference('');
    setError('');
    setNotice('Question added to the bank.');
    return undefined;
  };

  return (
    <section className="esx-panel">
      <div className="esx-panel-head">
        <div>
          <p className="esx-step">Question editor</p>
          <h2>Add a question to {module.code}</h2>
        </div>
        <span className="esx-muted esx-small">{module.questions.length} in the bank</span>
      </div>

      <form onSubmit={submit}>
        <div className="esx-form-grid">
          <label className="esx-field">
            <span className="esx-label">Learning outcome</span>
            <select
              className="esx-input"
              value={outcomeId}
              onChange={(event) => setOutcomeId(Number(event.target.value))}
            >
              {module.outcomes.map((outcome) => (
                <option key={outcome.id} value={outcome.id}>
                  LO {outcome.id} - {outcome.title}
                </option>
              ))}
            </select>
          </label>

          <label className="esx-field">
            <span className="esx-label">Topic (optional)</span>
            <input className="esx-input" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Indexing" />
          </label>

          <div className="esx-field esx-field-wide">
            <span className="esx-label">Question type</span>
            <div className="esx-segmented">
              {['mcq', 'tf', 'fill'].map((entry) => (
                <button type="button" key={entry} className={type === entry ? 'is-on' : ''} onClick={() => changeType(entry)}>
                  {typeLabel(entry)}
                </button>
              ))}
            </div>
          </div>

          <label className="esx-field esx-field-wide">
            <span className="esx-label">Question</span>
            <textarea
              className="esx-input"
              rows={3}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Write the question exactly as it should appear on the paper."
            />
          </label>

          {type === 'mcq' && (
            <>
              <label className="esx-field esx-field-wide">
                <span className="esx-label">Answer options - one per line</span>
                <textarea
                  className="esx-input"
                  rows={4}
                  value={optionsText}
                  onChange={(event) => setOptionsText(event.target.value)}
                  placeholder={'Primary key\nForeign key\nCandidate key\nComposite key'}
                />
              </label>
              <label className="esx-field esx-field-wide">
                <span className="esx-label">Correct answer</span>
                <select
                  className="esx-input"
                  value={options.includes(answer) ? answer : ''}
                  onChange={(event) => setAnswer(event.target.value)}
                >
                  <option value="">Choose the correct option...</option>
                  {options.map((option, index) => (
                    <option key={`${option}-${index}`} value={option}>
                      {String.fromCharCode(65 + index)} - {option}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {type === 'tf' && (
            <div className="esx-field esx-field-wide">
              <span className="esx-label">Correct answer</span>
              <div className="esx-segmented">
                {['True', 'False'].map((entry) => (
                  <button type="button" key={entry} className={answer === entry ? 'is-on' : ''} onClick={() => setAnswer(entry)}>
                    {entry}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'fill' && (
            <>
              <label className="esx-field">
                <span className="esx-label">Answer</span>
                <input className="esx-input" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="e.g. primary key" />
              </label>
              <label className="esx-field">
                <span className="esx-label">Also accept (optional)</span>
                <input
                  className="esx-input"
                  value={accept}
                  onChange={(event) => setAccept(event.target.value)}
                  placeholder="comma separated, e.g. PK, primary index"
                />
              </label>
            </>
          )}

          <div className="esx-field esx-field-wide">
            <span className="esx-label">Difficulty</span>
            <div className="esx-segmented">
              {['core', 'advanced'].map((entry) => (
                <button
                  type="button"
                  key={entry}
                  className={difficulty === entry ? 'is-on' : ''}
                  onClick={() => setDifficulty(entry)}
                >
                  {entry === 'core' ? 'Core' : 'Advanced'}
                </button>
              ))}
            </div>
          </div>

          <label className="esx-field esx-field-wide">
            <span className="esx-label">Explanation (optional)</span>
            <textarea
              className="esx-input"
              rows={3}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
              placeholder="Shown after marking, so trainees learn from a wrong answer."
            />
          </label>

          <label className="esx-field esx-field-wide">
            <span className="esx-label">Reference (optional)</span>
            <input
              className="esx-input"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="e.g. Key reading 3.2.1 - Indexing"
            />
          </label>
        </div>

        {error && <p className="esx-form-error">{error}</p>}

        <div className="esx-form-actions">
          <button type="submit" className="esx-btn esx-btn-primary">
            Add question
          </button>
          {notice && <span className="esx-form-note">{notice}</span>}
        </div>
      </form>
    </section>
  );
}

function QuestionList({ module, onDelete }) {
  const title = (id) => {
    const found = module.outcomes.find((outcome) => outcome.id === id);
    return found ? found.title : `Learning outcome ${id}`;
  };

  return (
    <section className="esx-panel">
      <div className="esx-panel-head">
        <div>
          <p className="esx-step">Question bank</p>
          <h2>
            {module.questions.length} question{module.questions.length === 1 ? '' : 's'} in {module.code}
          </h2>
        </div>
      </div>

      {module.questions.length === 0 ? (
        <p className="esx-empty">No questions yet. Use the form above to add the first one.</p>
      ) : (
        <div className="esx-q-list">
          {module.questions.map((question, index) => (
            <article className="esx-q-mini" key={question.id}>
              <div>
                <div className="esx-q-tags">
                  <span className="esx-tag">Q{index + 1}</span>
                  <span className="esx-tag">{title(question.outcome)}</span>
                  <span className="esx-tag">{typeLabel(question.type)}</span>
                  {question.difficulty === 'advanced' && <span className="esx-tag esx-tag-advanced">Advanced</span>}
                </div>
                <p className="esx-q-mini-prompt">{question.prompt}</p>
                <p className="esx-q-mini-answer">
                  Answer: <b>{question.answer}</b>
                </p>
              </div>
              <button
                type="button"
                className="esx-q-mini-del"
                onClick={() => {
                  if (window.confirm('Remove this question from the module?')) onDelete(module.id, question.id);
                }}
              >
                Remove
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
