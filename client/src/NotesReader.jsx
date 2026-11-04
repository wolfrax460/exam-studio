import { useMemo } from 'react';
import { blockText, notesWordCount, validateNotes } from '../../shared/notes-format.js';
import './notes-reader.css';

// Renders an Exam Studio study-notes document. The document is validated before
// anything is drawn: a broken document shows the exact paths that failed instead
// of a blank page or a half-rendered outline.
function Block({ block }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="nr-p">{block.text}</p>;
    case 'list':
      return block.ordered
        ? <ol className="nr-list">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ol>
        : <ul className="nr-list">{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
    case 'definition':
      return (
        <dl className="nr-def">
          <dt>{block.term}</dt>
          <dd>{block.text}</dd>
        </dl>
      );
    case 'table':
      return (
        <div className="nr-table-wrap">
          <table className="nr-table">
            <thead>
              <tr>{block.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    cellIndex === 0
                      ? <th key={cellIndex} scope="row">{cell}</th>
                      : <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout':
      return (
        <aside className={`nr-callout nr-callout-${block.tone || 'note'}`}>
          {block.title && <p className="nr-callout-title">{block.title}</p>}
          <p className="nr-p">{block.text}</p>
        </aside>
      );
    case 'example':
      return (
        <div className="nr-example">
          {block.title && <p className="nr-example-title">{block.title}</p>}
          <ol className="nr-list">{block.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
          <p className="nr-answer">{block.answer}</p>
        </div>
      );
    case 'compare':
      return (
        <div className="nr-compare">
          {[block.left, block.right].map((side, index) => (
            <div className="nr-compare-side" key={index}>
              <p className="nr-compare-title">{side.title}</p>
              <ul className="nr-list">{side.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
            </div>
          ))}
        </div>
      );
    case 'check':
      return (
        <details className="nr-check">
          <summary>{block.question}</summary>
          <p className="nr-p">{block.answer}</p>
        </details>
      );
    case 'trap':
      return (
        <div className="nr-trap">
          <p className="nr-trap-row nr-trap-wrong"><span>Common mistake</span>{block.wrong}</p>
          <p className="nr-trap-row nr-trap-right"><span>Correct</span>{block.right}</p>
          <p className="nr-trap-why">{block.why}</p>
        </div>
      );
    default:
      return null;
  }
}

export default function NotesReader({ doc }) {
  const { ok, errors } = useMemo(() => validateNotes(doc), [doc]);

  if (!ok) {
    return (
      <div className="nr-page">
        <div className="nr-invalid" role="alert">
          <p className="nr-invalid-title">This notes document is not valid</p>
          <ul className="nr-list">
            {errors.slice(0, 12).map((error, index) => (
              <li key={index}><code>{error.path || '(root)'}</code> — {error.message}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const words = notesWordCount(doc);
  const { meta } = doc;

  return (
    <article className="nr-page">
      <header className="nr-head">
        <p className="nr-eyebrow">{meta.unit}</p>
        <h1 className="nr-title">{meta.title}</h1>
        <ul className="nr-chips">
          {meta.course && <li>{meta.course}</li>}
          {meta.level && <li>{meta.level}</li>}
          {meta.estimatedMinutes && <li>{meta.estimatedMinutes} min read</li>}
          <li>{words.toLocaleString()} words</li>
          <li>{doc.sections.length} sections</li>
        </ul>
        <p className="nr-summary">{doc.summary}</p>
      </header>

      <section className="nr-objectives">
        <h2 className="nr-h2">By the end you should be able to</h2>
        <ul className="nr-list">{doc.objectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul>
      </section>

      {doc.keyTerms?.length > 0 && (
        <section className="nr-terms">
          <h2 className="nr-h2">Key terms</h2>
          <div className="nr-term-grid">
            {doc.keyTerms.map((entry) => (
              <div className="nr-term" key={entry.term}>
                <p className="nr-term-name">{entry.term}</p>
                <p className="nr-term-def">{entry.definition}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {doc.sections.length > 1 && (
        <nav className="nr-toc" aria-label="Sections">
          {doc.sections.map((section, index) => (
            <a key={section.id} href={`#${section.id}`}>{index + 1}. {section.title}</a>
          ))}
        </nav>
      )}

      {doc.sections.map((section, index) => (
        <section className="nr-section" id={section.id} key={section.id}>
          <h2 className="nr-h2"><span className="nr-section-number">{index + 1}</span>{section.title}</h2>
          {section.blocks.map((block, blockIndex) => <Block block={block} key={blockIndex} />)}
        </section>
      ))}

      {doc.examFocus?.length > 0 && (
        <section className="nr-exam">
          <h2 className="nr-h2">What the exam asks for</h2>
          <ul className="nr-list">{doc.examFocus.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
      )}

      {doc.checklist?.length > 0 && (
        <section className="nr-checklist">
          <h2 className="nr-h2">Before you close the book</h2>
          <ul className="nr-checklist-list">
            {doc.checklist.map((item, index) => (
              <li key={index}><input type="checkbox" id={`nr-check-${index}`} /><label htmlFor={`nr-check-${index}`}>{item}</label></li>
            ))}
          </ul>
        </section>
      )}

      {doc.furtherReading?.length > 0 && (
        <footer className="nr-reading">
          <h2 className="nr-h2">Further reading</h2>
          <ul className="nr-list">
            {doc.furtherReading.map((entry, index) => (
              <li key={index}>
                {entry.url ? <a href={entry.url} rel="noreferrer noopener" target="_blank">{entry.label}</a> : entry.label}
              </li>
            ))}
          </ul>
        </footer>
      )}

      <p className="nr-sr-only">{doc.sections.map((section) => section.blocks.map(blockText).join(' ')).join(' ')}</p>
    </article>
  );
}
