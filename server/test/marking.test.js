import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { bootApi, call, makeUser, dropTestDatabase } from './helpers.js';

describe('Marking Engine', () => {
  let api, ownerToken, examId, shareCode;

  before(async () => {
    api = await bootApi({ DEMO_MODE: '1', TAKE_LIMIT_PER_HOUR: '10000' });
    await dropTestDatabase();
    const owner = await makeUser(api.base);
    ownerToken = owner.token;
    const res = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: { title: 'Marking Test Exam', layout: 'sections-a-e', moduleCode: 'MARK101', moduleName: 'Marking Module', level: 'L4', trade: 'Test', school: 'Test School', duration: '3 hours', targetMarks: 100, sections: [
      { id: 'A', kind: 'mcq', title: 'MCQ', marks: 30, marksPerItem: 1, items: [{ text: 'MCQ Q1', options: ['A','B','C','D'], answer: 'A', markingPoints: ['A is correct'] }] },
      { id: 'B', kind: 'true_false', title: 'T/F', marks: 10, marksPerItem: 1, items: [{ text: 'T/F Q1', answer: 'True' }, { text: 'T/F Q2', answer: 'False' }] },
      { id: 'C', kind: 'fill_blank', title: 'Fill', marks: 10, marksPerItem: 1, items: [{ text: 'Fill ________', answer: 'word', accepted: ['word', 'Word'] }] },
      { id: 'D', kind: 'select_all', title: 'Select All', marks: 10, marksPerItem: 2, items: [{ text: 'Select Q', options: ['A','B','C','D','E'], correct: ['A','C'], markingPoints: ['A is right', 'C is right'] }] },
      { id: 'E', kind: 'matching', title: 'Matching', marks: 10, marksPerItem: 1, items: [{ text: 'Match Q', columnA: ['A1','A2'], columnB: ['B1','B2'], matchAnswers: ['B','A'], markingPoints: ['A1->B2', 'A2->B1'] }] },
      { id: 'F', kind: 'sequencing', title: 'Sequencing', marks: 10, marksPerItem: 2, items: [{ text: 'Seq Q', steps: ['Step 1','Step 2','Step 3'], sequenceAnswer: [1,2,3], markingPoints: ['Step 1 first', 'Step 2 second', 'Step 3 third'] }] },
      { id: 'G', kind: 'short_answer', title: 'Short Answer', marks: 10, marksPerItem: 2, items: [{ text: 'SA Q', marks: 2, answer: 'Expected', markingPoints: ['Key point 1', 'Key point 2'] }] },
      { id: 'H', kind: 'structured', title: 'Structured', marks: 30, marksPerItem: 0, items: [{ title: 'Struct Q', totalMarks: 8, parts: [{ letter: 'a', text: 'Part a', marks: 4 }, { letter: 'b', text: 'Part b', marks: 4 }], markingPoints: [{ point: 'Point a', marks: 4 }, { point: 'Point b', marks: 4 }] }] }
    ]}, title: 'Marking Test Exam' } });
    assert.equal(res.status, 201);
    examId = res.body.id;
    const pubRes = await call(api.base, `/api/exams/${examId}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 3, requireName: false } });
    assert.equal(pubRes.status, 201);
    shareCode = pubRes.body.publication.shareCode;
  });

  after(async () => {
    // api.close() handled by test runner
  });

  describe('Objective Marking (deterministic)', () => {
    let attemptId, attemptToken, questions;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'Test Student' } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
      questions = res.body.questions;
    });

    test('MCQ: awards full marks for correct answer', async () => {
      const mcq = questions.find(q => q.kind === 'mcq');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [mcq.id]: 'A' } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === mcq.id);
      assert.equal(pq.awarded, pq.max);
      assert.equal(pq.needsReview, false);
    });

    test('MCQ: awards 0 for wrong answer', async () => {
      const mcq = questions.find(q => q.kind === 'mcq');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [mcq.id]: 'B' } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === mcq.id);
      assert.equal(pq.awarded, 0);
    });

    test('True/False: awards marks correctly', async () => {
      const tf = questions.find(q => q.kind === 'true_false');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [tf.id]: ['True', 'False'] } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === tf.id);
      assert.equal(pq.awarded, pq.max);
    });

    test('Fill in the blanks: accepts accepted answers case-insensitive', async () => {
      const fill = questions.find(q => q.kind === 'fill_blank');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [fill.id]: 'Word' } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === fill.id);
      assert.equal(pq.awarded, pq.max);
    });

    test('Select All: all-or-nothing scoring', async () => {
      const sa = questions.find(q => q.kind === 'select_all');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [sa.id]: ['A', 'C'] } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === sa.id);
      assert.equal(pq.awarded, pq.max);
    });

    test('Select All: partial gets 0 (all-or-nothing)', async () => {
      const sa = questions.find(q => q.kind === 'select_all');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [sa.id]: ['A'] } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === sa.id);
      assert.equal(pq.awarded, 0);
    });

    test('Matching: per-pair scoring', async () => {
      const match = questions.find(q => q.kind === 'matching');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [match.id]: ['B', 'A'] } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === match.id);
      assert.equal(pq.awarded, pq.max);
    });

    test('Sequencing: exact sequence required', async () => {
      const seq = questions.find(q => q.kind === 'sequencing');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [seq.id]: [1, 2, 3] } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === seq.id);
      assert.equal(pq.awarded, pq.max);
    });

    test('Fill blanks: ignores case/spaces/accents', async () => {
      const fill = questions.find(q => q.kind === 'fill_blank');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [fill.id]: '  WORD  ' } } });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === fill.id);
      assert.equal(pq.awarded, pq.max);
    });
  });

  describe('Subjective Marking (AI)', () => {
    let attemptId, attemptToken, questions;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'Test Student' } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
      questions = res.body.questions;
    });

    test('Short answer and essay questions are marked needsReview', async () => {
      const sa = questions.find(q => q.kind === 'short_answer');
      const structured = questions.find(q => q.kind === 'structured');
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', token: attemptToken, body: { answers: { [sa.id]: 'Student answer', [structured.id]: 'Structured answer' } } });
      assert.equal(res.status, 200);
      const saResult = res.body.score.perQuestion.find(p => p.questionId === sa.id);
      const structResult = res.body.score.perQuestion.find(p => p.questionId === structured.id);
      assert.equal(saResult.needsReview, true);
      assert.equal(structResult.needsReview, true);
    });
  });
});