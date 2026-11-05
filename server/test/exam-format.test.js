import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateExam, DIFFICULTY_LEVELS, EXAM_FORMAT, EXAM_VERSION, totalMarks, isSectionsExam } from '../../shared/exam-format.js';

const baseMeta = {
  title: 'Test Exam',
  moduleCode: 'SWDPP401',
  moduleName: 'Web Development',
  level: 'L4',
  trade: 'Software Development',
  school: 'RTVET School',
  duration: '3 hours',
  targetMarks: 80,
};

const baseSections = [
  {
    id: 'A',
    kind: 'mcq',
    marks: 30,
    marksPerItem: 1,
    items: Array.from({ length: 10 }, (_, i) => ({
      text: `Question ${i + 1}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 'ABCD'[i % 4],
    })),
  },
  {
    id: 'B',
    kind: 'true_false',
    marks: 10,
    marksPerItem: 1,
    items: Array.from({ length: 10 }, (_, i) => ({
      text: `Statement ${i + 1}`,
      answer: i % 2 === 0 ? 'True' : 'False',
    })),
  },
  {
    id: 'C',
    kind: 'fill_blank',
    marks: 10,
    marksPerItem: 1,
    items: Array.from({ length: 10 }, (_, i) => ({
      text: `Fill in the blank ________`,
      answer: 'word',
    })),
  },
  {
    id: 'D',
    kind: 'short_answer',
    marks: 20,
    marksPerItem: 2,
    items: Array.from({ length: 10 }, (_, i) => ({
      text: `Short answer ${i + 1}`,
      marks: 2,
      answer: 'Expected answer',
    })),
  },
  {
    id: 'E',
    kind: 'structured',
    marks: 30,
    marksPerItem: 0,
    items: [
      {
        title: 'Structured 1',
        totalMarks: 8,
        parts: [{ letter: 'a', text: 'Part a', marks: 4 }, { letter: 'b', text: 'Part b', marks: 4 }],
        markingPoints: [{ point: 'Point 1', marks: 4 }, { point: 'Point 2', marks: 4 }],
      },
      {
        title: 'Structured 2',
        totalMarks: 8,
        parts: [{ letter: 'a', text: 'Part a', marks: 4 }, { letter: 'b', text: 'Part b', marks: 4 }],
        markingPoints: [{ point: 'Point 1', marks: 4 }, { point: 'Point 2', marks: 4 }],
      },
      {
        title: 'Structured 3',
        totalMarks: 7,
        parts: [{ letter: 'a', text: 'Part a', marks: 3 }, { letter: 'b', text: 'Part b', marks: 4 }],
        markingPoints: [{ point: 'Point 1', marks: 3 }, { point: 'Point 2', marks: 4 }],
      },
      {
        title: 'Structured 4',
        totalMarks: 7,
        parts: [{ letter: 'a', text: 'Part a', marks: 3 }, { letter: 'b', text: 'Part b', marks: 4 }],
        markingPoints: [{ point: 'Point 1', marks: 3 }, { point: 'Point 2', marks: 4 }],
      },
    ],
  },
];

const validDoc = {
  format: EXAM_FORMAT,
  version: EXAM_VERSION,
  meta: baseMeta,
  sections: baseSections,
};

test('valid sectioned exam passes validation', () => {
  const result = validateExam(validDoc);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('wrong format is rejected', () => {
  const doc = { ...validDoc, format: 'wrong/format' };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === 'format'));
});

test('wrong version is rejected', () => {
  const doc = { ...validDoc, version: 2 };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === 'version'));
});

test('missing meta fields are reported', () => {
  const doc = { ...validDoc, meta: {} };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path.startsWith('meta.')));
});

test('invalid difficulty is rejected', () => {
  const doc = { ...validDoc, meta: { ...baseMeta, difficulty: 'Impossible' } };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === 'meta.difficulty'));
});

test('valid difficulties are accepted', () => {
  for (const d of DIFFICULTY_LEVELS) {
    const doc = { ...validDoc, meta: { ...baseMeta, difficulty: d } };
    const result = validateExam(doc);
    assert.equal(result.ok, true, `difficulty ${d} should be valid`);
  }
});

test('section marks must match targetMarks', () => {
  const doc = { ...validDoc, meta: { ...baseMeta, targetMarks: 99 } };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === 'meta.targetMarks'));
});

test('unknown section kind is rejected', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[0], kind: 'unknown' }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('unknown kind')));
});

test('empty section is rejected', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[0], items: [] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('no questions')));
});

test('mcq needs 4 options', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[0], items: [{ ...baseSections[0].items[0], options: ['A', 'B'] }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('4 options')));
});

test('mcq answer must be valid option', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[0], items: [{ ...baseSections[0].items[0], answer: 'Z' }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('not one of the options')));
});

test('true_false answer must be True/False', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[1], items: [{ ...baseSections[1].items[0], answer: 'Maybe' }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('True or False')));
});

test('fill_blank needs blank marker', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[2], items: [{ ...baseSections[2].items[0], text: 'No blank here' }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('blank to fill')));
});

test('short_answer needs marks', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[3], items: [{ ...baseSections[3].items[0], marks: 0 }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('needs marks')));
});

test('structured needs totalMarks', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[4], items: [{ ...baseSections[4].items[0], totalMarks: 0 }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('totalMarks')));
});

test('structured parts marks must sum to totalMarks', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[4], items: [{ ...baseSections[4].items[0], totalMarks: 10, parts: [{ letter: 'a', marks: 2 }, { letter: 'b', marks: 2 }] }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('part marks add up')));
});

test('structured markingPoints marks must sum to totalMarks', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[4], items: [{ ...baseSections[4].items[0], markingPoints: [{ point: 'p', marks: 1 }, { point: 'p', marks: 1 }] }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('marking points add up')));
});

test('structured needs markingPoints or modelAnswer', () => {
  const doc = { ...validDoc, sections: [{ ...baseSections[4], items: [{ ...baseSections[4].items[0], markingPoints: [], modelAnswer: '' }] }] };
  const result = validateExam(doc);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.message.includes('neither marking points nor a model answer')));
});

test('totalMarks computes correctly for sections exam', () => {
  const result = totalMarks(validDoc);
  // MCQ: 10*1=10, T/F: 10*1=10, Fill: 10*1=10, Short: 10*2=20, Structured: 8+8+7+7=30 = 80 total
  assert.equal(result, 80);
});

test('isSectionsExam returns true for sectioned exam', () => {
  assert.equal(isSectionsExam(validDoc), true);
});

test('isSectionsExam returns false for classic exam', () => {
  const classic = { format: EXAM_FORMAT, version: EXAM_VERSION, meta: baseMeta, questions: [] };
  assert.equal(isSectionsExam(classic), false);
});