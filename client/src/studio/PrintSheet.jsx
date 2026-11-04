import React from 'react';
import { outcomeTitle } from './engine.js';

// Rendered always, hidden on screen, shown by the print rules only while the body carries
// the `esx-printing` class. Numbers match the runner: one mark per question.
export default function PrintSheet({ paper, includeKey }) {
  if (!paper) return null;

  const order = new Map();
  let counter = 0;
  paper.sections.forEach((section) => {
    section.questions.forEach((question) => {
      counter += 1;
      order.set(question.id, counter);
    });
  });

  return (
    <div className="esx-print">
      <header className="esx-print-head">
        <p className="esx-print-kicker">{paper.code} · Trainee assessment</p>
        <h1>{paper.title}</h1>
        <p>
          {paper.config.mode === 'exam' ? 'End of module assessment' : 'Practice paper'} · {paper.totalMarks}{' '}
          questions · {paper.totalMarks} marks ·{' '}
          {paper.config.mode === 'exam' ? `${paper.config.durationMin} minutes` : 'Untimed'}
        </p>
        <p className="esx-print-fields">Trainee name: ______________________________ Date: ____________________</p>
        <p className="esx-print-note">Answer all questions. Each question carries one mark. Pass mark 50%.</p>
      </header>

      {paper.sections.map((section, sectionIndex) => (
        <section className="esx-print-section" key={section.outcome}>
          <h2>
            Section {String.fromCharCode(65 + sectionIndex)} - {outcomeTitle(paper.outcomes, section.outcome)}
          </h2>
          {section.questions.map((question) => (
            <div className="esx-print-q" key={question.id}>
              <p className="esx-print-q-prompt">
                <strong>{order.get(question.id)}.</strong> {question.prompt}
              </p>
              {question.options ? (
                <ol className="esx-print-options">
                  {question.options.map((option) => (
                    <li key={option}>{option}</li>
                  ))}
                </ol>
              ) : (
                <p className="esx-print-blank">Answer: ______________________________________</p>
              )}
            </div>
          ))}
        </section>
      ))}

      {includeKey && (
        <section className="esx-print-key">
          <h2>Answer key - trainer copy</h2>
          <table>
            <thead>
              <tr>
                <th>Q</th>
                <th>Answer</th>
                <th>Learning outcome · reference</th>
              </tr>
            </thead>
            <tbody>
              {paper.sections.flatMap((section) =>
                section.questions.map((question) => (
                  <tr key={question.id}>
                    <td>{order.get(question.id)}</td>
                    <td>{question.answer}</td>
                    <td>
                      LO {question.outcome} · {question.reference}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="esx-print-note">
            Question numbers match the paper above. Each item carries one mark; total {paper.totalMarks} marks.
          </p>
        </section>
      )}
    </div>
  );
}
