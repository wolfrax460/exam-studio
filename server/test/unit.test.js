// Unit tests for the pieces that do not need a server running.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateExam, totalMarks, answerText, questionLines } from '../../shared/format.js';
import { demoExam } from '../lib/demo.js';

// Imported in a hook, not at the top: setting JWT_SECRET first keeps the test from writing a
// generated secret file into server/data.
let extractJson;
let validatePassword;
let partsFor;

const SETTINGS = path.join(os.tmpdir(), `exam-studio-units-${process.pid}.json`);

before(async () => {
  process.env.JWT_SECRET ||= 'unit-test-secret-0123456789abcdef0123456789';
  // Set before anything reads it: settings.js resolves its file location once, on import.
  process.env.SETTINGS_FILE = SETTINGS;
  ({ extractJson } = await import('../lib/engine.js'));
  ({ validatePassword } = await import('../lib/auth.js'));
  ({ partsFor } = await import('../lib/ai.js'));
});

describe('exam validation', () => {
  it('accepts the built-in sample paper', () => {
    const exam = demoExam();
    assert.deepEqual(validateExam(exam, exam.totalMarks), []);
  });

  it('adds the marks up', () => {
    assert.equal(totalMarks(demoExam()), demoExam().totalMarks);
    assert.equal(totalMarks({ questions: [{ marks: 5 }, { marks: '7' }] }), 12);
    assert.equal(totalMarks({}), 0);
    assert.equal(totalMarks(null), 0);
  });

  it('reports a total that does not match', () => {
    const exam = demoExam();
    const warnings = validateExam(exam, 999);
    assert.ok(warnings.some((w) => /add up to/.test(w)));
  });

  it('catches a sequencing answer that is not a permutation', () => {
    const warnings = validateExam({ questions: [{ type: 'sequencing', marks: 4, prompt: 'x', steps: ['a', 'b', 'c'], sequenceAnswer: [1, 1, 3] }] }, null);
    assert.ok(warnings.some((w) => /sequence/i.test(w)));
  });

  it('catches an answer letter that is not among the options', () => {
    const warnings = validateExam({ questions: [{ type: 'mcq', marks: 4, prompt: 'x', items: [{ text: 'q', options: ['a', 'b'], answer: 'D' }] }] }, null);
    assert.ok(warnings.some((w) => /not one of the options/.test(w)));
  });

  it('catches essay marks that do not add up', () => {
    const warnings = validateExam({ questions: [{ type: 'essay', marks: 10, prompt: 'x', parts: [{ label: '(a)', text: 't', marks: 4 }], markingPoints: [{ text: 'm', marks: 5 }] }] }, null);
    assert.equal(warnings.filter((w) => /add up to/.test(w)).length, 2);
  });

  it('flags an unknown question type and an empty paper', () => {
    assert.ok(validateExam({ questions: [{ type: 'telepathy', marks: 1, prompt: 'x' }] }, null).some((w) => /unknown type/.test(w)));
    assert.deepEqual(validateExam({ questions: [] }, null), ['The exam has no questions.']);
  });

  it('renders question lines and answers without crashing on missing fields', () => {
    assert.deepEqual(questionLines({ type: 'mcq', items: [] }), []);
    assert.deepEqual(questionLines({ type: 'nonsense' }), []);
    assert.equal(answerText({ type: 'nonsense' }), '');
    assert.equal(questionLines({ type: 'matching', columnA: ['a'], columnB: ['b'] }).length, 4);
  });
});

describe('password rules', () => {
  it('accepts a good password', () => {
    assert.equal(validatePassword('Str0ngPass'), null);
  });

  it('names what is missing', () => {
    assert.match(validatePassword('Short1'), /at least 8/i);
    assert.match(validatePassword('alllowercase1'), /uppercase/i);
    assert.match(validatePassword('ALLUPPERCASE1'), /lowercase/i);
    assert.match(validatePassword('NoDigitsHere'), /digit/i);
  });

  it('caps the length at the bcrypt limit', () => {
    assert.match(validatePassword(`Aa1${'x'.repeat(80)}`), /72/);
  });

  it('rejects anything that is not a string', () => {
    for (const value of [undefined, null, 12345678, {}, [], true]) {
      assert.equal(typeof validatePassword(value), 'string', `${JSON.stringify(value)} must be refused`);
    }
  });
});

describe('extractJson', () => {
  it('reads plain JSON', () => {
    assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  });

  it('reads a fenced block', () => {
    assert.deepEqual(extractJson('Here you go:\n```json\n{"a":{"b":[1,2]}}\n```\nDone.'), { a: { b: [1, 2] } });
  });

  it('reads an object with text around it', () => {
    assert.deepEqual(extractJson('Sure! {"a":"}"} trailing'), { a: '}' });
  });

  it('handles escaped quotes and braces inside strings', () => {
    assert.deepEqual(extractJson('{"a":"say \\"hi\\" {now}"}'), { a: 'say "hi" {now}' });
  });

  it('returns null when there is nothing to read', () => {
    for (const value of ['', 'no json here', '{ broken', null, undefined]) {
      assert.equal(extractJson(value), null);
    }
  });

  // What a small model actually gets wrong. The content is right, so it must not be thrown away.
  it('repairs a raw line break inside a string', () => {
    assert.deepEqual(extractJson('{"a":"line one\nline two"}'), { a: 'line one\nline two' });
  });

  it('repairs a quote the model forgot to escape', () => {
    assert.deepEqual(extractJson('{"prompt":"What is a "database"?"}'), { prompt: 'What is a "database"?' });
  });

  it('repairs a trailing comma', () => {
    assert.deepEqual(extractJson('{"questions":[{"a":1,},]}'), { questions: [{ a: 1 }] });
  });

  it('closes an answer that ran out mid-object', () => {
    assert.deepEqual(extractJson('{"title":"Exam","questions":[{"type":"mcq","marks":2,'), {
      title: 'Exam',
      questions: [{ type: 'mcq', marks: 2 }],
    });
  });

  it('closes an answer that ran out mid-string', () => {
    assert.deepEqual(extractJson('{"a":"started but never fin'), { a: 'started but never fin' });
  });

  it('puts back a property name that lost its opening quote', () => {
    assert.deepEqual(extractJson('{"questions":[{"marks":2,options":["A","B"],answer":"A"}]}'), {
      questions: [{ marks: 2, options: ['A', 'B'], answer: 'A' }],
    });
  });

  it('still refuses output with no recoverable object', () => {
    assert.equal(extractJson('I am sorry, I cannot help with that.'), null);
  });
});

describe('repairJson', () => {
  let repairJson;
  before(async () => { ({ repairJson } = await import('../lib/engine.js')); });

  it('leaves a valid object untouched', () => {
    assert.deepEqual(repairJson('{"a":[1,2,{"b":"c"}]}'), { a: [1, 2, { b: 'c' }] });
  });

  it('does not lose a real escaped quote while fixing an unescaped one', () => {
    assert.deepEqual(repairJson('{"a":"He said \\"hi\\", then "stop""}'), { a: 'He said "hi", then "stop"' });
  });

  it('ignores a closing bracket that matches nothing', () => {
    assert.deepEqual(repairJson('{"a":1}}'), { a: 1 });
  });

  it('returns null when there is no object at all', () => {
    assert.equal(repairJson('no braces here'), null);
  });
});

describe('partsFor', () => {
  // Real trainee manuals run to a few hundred thousand characters. Refusing them because the
  // "notes per request" slice is small made the default setting the thing that broke long files.
  const paragraph = `${'Normalisation removes redundancy and keeps the data consistent. '.repeat(5)}\n\n`;
  const useChunk = (chunkChars) => {
    fs.writeFileSync(SETTINGS, JSON.stringify({ provider: 'cli-opencode', profiles: { 'cli-opencode': { chunkChars } } }));
  };

  it('uses the requested slice when the notes already fit', () => {
    useChunk(8000);
    const notes = paragraph.repeat(100); // ~30k characters
    const parts = partsFor(notes);
    assert.ok(parts.length <= 30, `expected at most 30 parts, got ${parts.length}`);
    // Five parts at the 8000 slice: the setting the user asked for is the one that is used, so
    // short notes stay on short, quick requests.
    assert.equal(parts.length, 5);
    assert.equal(parts.join('').replace(/\n\n/g, ''), notes.replace(/\n\n/g, ''));
  });

  it('grows the slice instead of refusing a long manual', () => {
    useChunk(8000);
    const long = paragraph.repeat(400); // ~260k characters, the size of a real trainee manual
    const parts = partsFor(long);
    assert.ok(parts.length <= 30, `a long manual must not be refused, got ${parts.length} parts`);
    assert.ok(parts.length >= 2, 'it should still be written in more than one part');
    // Nothing may be lost while the slice grows.
    assert.equal(parts.join('').replace(/\n\n/g, ''), long.replace(/\n\n/g, ''));
  });

  it('still refuses notes too long for any safe slice', () => {
    useChunk(8000);
    const absurd = paragraph.repeat(4000); // ~2.6 million characters
    assert.throws(() => partsFor(absurd), (e) => {
      assert.equal(e.status, 413);
      assert.match(e.message, /longer than one paper can hold/i);
      return true;
    });
  });
});
