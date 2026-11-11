import React from 'react';

export default function TakeAnswer({ question, value, onChange }) {
  const kind = question.type || question.kind;
  const list = Array.isArray(value) ? value : [];
  const setPart = (index, next) => {
    const updated = Array.from({ length: Math.max(index + 1, list.length) }, (_, i) => list[i] ?? '');
    updated[index] = next;
    onChange(updated);
  };
  const choices = (options, answer, setAnswer, name, multiple = false) => options.map((option, index) => {
    const letter = String.fromCharCode(65 + index);
    const checked = multiple ? answer.includes(letter) : answer === letter;
    return <label className="take-option" key={letter}>
      <input type={multiple ? 'checkbox' : 'radio'} name={name} checked={checked}
        onChange={() => setAnswer(multiple ? (checked ? answer.filter((entry) => entry !== letter) : [...answer, letter]) : letter)} />
      <span>{letter}. {option}</span>
    </label>;
  });
  if (kind === 'matching' && question.columnA?.length && question.columnB?.length) {
    return question.columnA.map((item, index) => <label className="take-field" key={index}>{item}
      <select value={list[index] || ''} onChange={(event) => setPart(index, event.target.value)}>
        <option value="">Choose a match</option>
        {question.columnB.map((option, i) => <option key={i} value={String.fromCharCode(65 + i)}>{option}</option>)}
      </select>
    </label>);
  }
  if (kind === 'sequencing' && question.steps?.length) {
    return question.steps.map((_, index) => <label className="take-field" key={index}>Position {index + 1}
      <select value={list[index] || ''} onChange={(event) => setPart(index, event.target.value)}>
        <option value="">Choose a step</option>
        {question.steps.map((step, i) => <option key={i} value={i + 1}>{step}</option>)}
      </select>
    </label>);
  }
  if (question.items?.length && ['true_false', 'mcq', 'short_answer'].includes(kind)) {
    return question.items.map((item, index) => <fieldset className="take-field" key={index}>
      <legend>{item.text || item.prompt}</legend>
      {kind === 'true_false' ? <select aria-label={item.text || item.prompt} value={list[index] || ''} onChange={(event) => setPart(index, event.target.value)}>
        <option value="">Choose an answer</option><option>True</option><option>False</option>
      </select> : kind === 'mcq' && item.options?.length ? choices(item.options, list[index], (next) => setPart(index, next), `${question.id}-${index}`) :
        <textarea className="take-essay" aria-label={item.text || item.prompt} value={list[index] || ''} onChange={(event) => setPart(index, event.target.value)} />}
    </fieldset>);
  }
  if (question.options?.length) return choices(question.options, kind === 'select_all' ? list : value, onChange, question.id, kind === 'select_all');
  if (kind === 'true_false') return <label className="take-field">Answer<select value={value || ''} onChange={(event) => onChange(event.target.value)}>
    <option value="">Choose an answer</option><option>True</option><option>False</option>
  </select></label>;
  return <>
    {question.parts?.length > 0 && <ol>{question.parts.map((part, index) => <li key={index}>{part.text || part.prompt || part.title} ({part.marks} marks)</li>)}</ol>}
    <textarea className="take-essay" value={value || ''} onChange={(event) => onChange(event.target.value)} placeholder="Write your answer here" aria-label="Your answer" />
  </>;
}
