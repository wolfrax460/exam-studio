import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { bootApi, call, makeUser } from './helpers.js';
import { aiMarkAnswer, markObjective } from '../lib/examTake.js';

// A canonical sectioned paper: section kinds come from shared/format.js SECTION_KINDS. The old
// fixture used select_all/matching/sequencing sections, which the format does not allow (it turns
// those classic question types into structured questions), so those assertions were testing a
// layout that can never be stored.
describe('Marking Engine', () => {
  let api, ownerToken, examId, shareCode;

  before(async () => {
    api = await bootApi({ DEMO_MODE: '1', TAKE_LIMIT_PER_HOUR: '10000' });
    const owner = await makeUser(api.base);
    ownerToken = owner.token;
    const res = await call(api.base, '/api/library', {
      method: 'POST',
      token: ownerToken,
      body: {
        kind: 'exam',
        title: 'Marking Test Exam',
        data: {
          title: 'Marking Test Exam',
          layout: 'sections-a-e',
          moduleCode: 'MARK101',
          moduleName: 'Marking Module',
          level: 'L4',
          trade: 'Test',
          school: 'Test School',
          duration: '3 hours',
          targetMarks: 14,
          sections: [
            { id: 'A', kind: 'mcq', title: 'MULTIPLE CHOICE', marks: 1, marksPerItem: 1, items: [
              { text: 'MCQ Q1', options: ['A', 'B', 'C', 'D'], answer: 'A' },
            ] },
            { id: 'B', kind: 'true_false', title: 'TRUE / FALSE', marks: 2, marksPerItem: 1, items: [
              { text: 'T/F Q1', answer: 'True' },
              { text: 'T/F Q2', answer: 'False' },
            ] },
            { id: 'C', kind: 'fill_blank', title: 'FILL IN THE BLANKS', marks: 1, marksPerItem: 1, items: [
              { text: 'Fill ________', answer: 'word', accepted: ['word', 'phrase'] },
            ] },
            { id: 'D', kind: 'short_answer', title: 'SHORT ANSWER QUESTIONS', marks: 2, marksPerItem: 2, items: [
              { text: 'SA Q', marks: 2, answer: 'Expected', markingPoints: ['Key point 1'] },
            ] },
            { id: 'E', kind: 'structured', title: 'STRUCTURED / PRACTICAL QUESTIONS', marks: 8, marksPerItem: 0, items: [
              {
                title: 'Struct Q',
                totalMarks: 8,
                parts: [{ letter: 'a', text: 'Part a', marks: 4 }, { letter: 'b', text: 'Part b', marks: 4 }],
                markingPoints: [{ point: 'Point a', marks: 4 }, { point: 'Point b', marks: 4 }],
              },
            ] },
          ],
        },
      },
    });
    assert.equal(res.status, 201);
    examId = res.body.id;
    const pubRes = await call(api.base, `/api/exams/${examId}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 10, requireName: false } });
    assert.equal(pubRes.status, 201);
    shareCode = pubRes.body.publication.shareCode;
  });

  after(async () => {
    await api?.close();
  });

  describe('Objective Marking (deterministic)', () => {
    let attemptId, attemptToken, questions, submit;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'Test Student' } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
      questions = res.body.questions;
      // The submit route reads the attempt token from the body (as the client sends it).
      // The client autosaves answers and then submits with just the token; mirror that contract.
      submit = async (answers) => {
        const saved = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers } });
        assert.equal(saved.status, 200);
        return call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
      };
    });

    test('start exposes the section kind on every numbered question', () => {
      const mcq = questions.find(q => q.id === 'A-1');
      assert.ok(mcq, 'MCQ A-1 should be in the flattened question list');
      assert.equal(mcq.kind, 'mcq');
      assert.equal(mcq.sectionId, 'A');
      assert.equal(questions.find(q => q.id === 'B-1').kind, 'true_false');
      assert.equal(questions.find(q => q.id === 'E-1').kind, 'structured');
    });

    test('MCQ: awards full marks for correct answer', async () => {
      const mcq = questions.find(q => q.kind === 'mcq');
      const res = await submit({ [mcq.id]: 'A' });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === mcq.id);
      assert.equal(pq.awarded, pq.max);
      assert.equal(pq.needsReview, false);
    });

    test('MCQ: awards 0 for wrong answer', async () => {
      const mcq = questions.find(q => q.kind === 'mcq');
      const res = await submit({ [mcq.id]: 'B' });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === mcq.id);
      assert.equal(pq.awarded, 0);
      assert.equal(pq.needsReview, false);
    });

    test('True/False: awards marks for each statement', async () => {
      const tf = questions.filter(q => q.kind === 'true_false');
      assert.equal(tf.length, 2);
      const res = await submit({ [tf[0].id]: 'True', [tf[1].id]: 'False' });
      assert.equal(res.status, 200);
      for (const q of tf) {
        const pq = res.body.score.perQuestion.find(p => p.questionId === q.id);
        assert.equal(pq.awarded, pq.max);
        assert.equal(pq.needsReview, false);
      }
    });

    test('Fill in the blanks: accepts an alternative accepted answer case-insensitive', async () => {
      const fill = questions.find(q => q.kind === 'fill_blank');
      const res = await submit({ [fill.id]: 'Phrase' });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === fill.id);
      assert.equal(pq.awarded, pq.max);
      assert.equal(pq.needsReview, false);
    });

    test('Fill blanks: ignores case/spaces/accents', async () => {
      const fill = questions.find(q => q.kind === 'fill_blank');
      const res = await submit({ [fill.id]: '  WORD  ' });
      assert.equal(res.status, 200);
      const pq = res.body.score.perQuestion.find(p => p.questionId === fill.id);
      assert.equal(pq.awarded, pq.max);
    });
  });

  describe('Subjective Marking (AI)', () => {
    let attemptId, attemptToken, questions, submit;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'Test Student' } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
      questions = res.body.questions;
      // The client autosaves answers and then submits with just the token; mirror that contract.
      submit = async (answers) => {
        const saved = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers } });
        assert.equal(saved.status, 200);
        return call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
      };
    });

    test('Short answer and structured questions are marked needsReview', async () => {
      const sa = questions.find(q => q.kind === 'short_answer');
      const structured = questions.find(q => q.kind === 'structured');
      const res = await submit({ [sa.id]: 'Student answer', [structured.id]: 'Structured answer' });
      assert.equal(res.status, 200);
      const saResult = res.body.score.perQuestion.find(p => p.questionId === sa.id);
      const structResult = res.body.score.perQuestion.find(p => p.questionId === structured.id);
      assert.equal(saResult.needsReview, true);
      assert.equal(saResult.awarded, null);
      assert.ok(saResult.max > 0);
      assert.equal(structResult.needsReview, true);
      assert.equal(structResult.awarded, null);
      assert.ok(structResult.max > 0);
    });

    test('saves final written answers and preserves ungraded answers when a teacher changes one mark', async () => {
      const written = { 'D-1': 'A different explanation', 'E-1': 'An alternative method' };
      const submitted = await call(api.base, `/api/take/attempts/${attemptId}/submit`, {
        method: 'POST', body: { attemptToken, answers: written },
      });
      assert.equal(submitted.status, 200);
      const path = `/api/exams/${examId}/attempts/${attemptId}`;
      let attempt;
      for (let i = 0; i < 25; i += 1) {
        attempt = (await call(api.base, path, { token: ownerToken })).body.attempt;
        if (attempt.status === 'marking_failed') break;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.equal(attempt.status, 'marking_failed');
      assert.deepEqual(attempt.answers, written);
      const stranger = await makeUser(api.base);
      assert.equal((await call(api.base, path, { token: stranger.token })).status, 404);
      const update = (awarded) => call(api.base, `${path}/score`, { method: 'PATCH', token: ownerToken,
        body: { revision: attempt.__v, perQuestion: [{ questionId: 'D-1', awarded, comment: 'Valid idea; add an example.' }] } });
      assert.equal((await update(3)).status, 400);
      const adjusted = await update(1.5);
      assert.equal(adjusted.status, 200);
      const saved = adjusted.body.attempt;
      assert.equal(saved.score.total, 1.5);
      assert.equal(saved.score.perQuestion.find(({ questionId }) => questionId === 'D-1').method, 'teacher');
      assert.ok(saved.score.perQuestion.find(({ questionId }) => questionId === 'D-1').reviewedBy);
      assert.equal(saved.score.perQuestion.find(({ questionId }) => questionId === 'E-1').needsReview, true);
      assert.equal((await update(2)).status, 409);
      const retry = await call(api.base, `${path}/regrade`, { method: 'POST', token: ownerToken, body: {} });
      assert.equal(retry.status, 202);
      const reviewed = (await call(api.base, path, { token: ownerToken })).body.attempt;
      assert.equal(reviewed.score.perQuestion.find(({ questionId }) => questionId === 'D-1').awarded, 1.5);
      assert.equal(reviewed.score.perQuestion.find(({ questionId }) => questionId === 'E-1').needsReview, true);
    });

    test('assigns zero to blank written answers without queueing an AI request', async () => {
      const res = await submit({ 'D-1': '  ', 'E-1': '' });
      assert.equal(res.body.status, 'marked');
      assert.equal(res.body.score.perQuestion.find(({ questionId }) => questionId === 'D-1').awarded, 0);
    });
  });
});

describe('Rubric-based written grading', () => {
  const question = {
    title: 'Photosynthesis and energy', totalMarks: 10,
    modelAnswer: 'Photosynthesis converts light energy into chemical energy.',
    parts: [{ letter: 'a', text: 'Explain the energy conversion and give a relevant detail.', marks: 10 }],
    markingPoints: [{ point: 'Explains sunlight and stored energy in sugars', marks: 7 }, { point: 'Explains chlorophyll', marks: 3 }],
  };
  for (const [name, student, awarded] of [
    ['accepts alternate wording', 'Plants use sunlight to make energy-rich sugars; chlorophyll absorbs the light.', 10],
    ['accepts a different reasoning path', 'Sugars store energy. Plants build them using energy from light, which chlorophyll captures.', 10],
    ['accepts partial credit', 'Plants use sunlight to make energy-rich sugars.', 7],
    ['records a justified incorrect grade', 'Plant roots absorb finished sugar from the soil.', 0],
  ]) {
    test(name, async () => {
      const grade = await aiMarkAnswer(question, student, async ({ system, user }) => {
        assert.match(system, /valid paraphrases/);
        assert.match(system, /partial credit/);
        const input = JSON.parse(user);
        assert.equal(input.reference, question.modelAnswer);
        assert.equal(input.parts[0].marks, 10);
        assert.equal(input.rubric[1].marks, 3);
        assert.equal(input.studentResponse, student);
        return { awarded, needsReview: false, feedback: 'Assessment based on the concepts explained.' };
      });
      assert.equal(grade.awarded, awarded);
      assert.equal(grade.max, 10);
    });
  }
  test('rejects uncertain, out-of-range, malformed and inconsistent grades', async () => {
    for (const response of [
      { awarded: null }, { awarded: '8' }, { awarded: 20 }, { awarded: -2 },
      { awarded: 7, needsReview: true },
      { awarded: 7, criteria: [{ criterion: 'Concept', awarded: 6, rationale: 'Mostly correct' }] },
    ]) await assert.rejects(aiMarkAnswer(question, 'A response', async () => ({ feedback: 'Test', needsReview: false, ...response })));
    await assert.rejects(aiMarkAnswer(question, 'A response', async () => { throw new Error('Provider unavailable'); }), /Provider unavailable/);
  });
  test('marks matching and sequencing without AI', () => {
    const score = markObjective([{ id: 'm', type: 'matching', marks: 2, matchAnswers: ['B', 'A'] },
      { id: 's', type: 'sequencing', marks: 3, sequenceAnswer: [3, 2, 1] }], { m: ['B', 'C'], s: ['3', '2', '1'] });
    assert.equal(score.total, 4);
    assert.ok(score.perQuestion.every(({ needsReview }) => !needsReview));
  });
});

// Select-all is a classic-layout question type, not a section kind, so it is covered directly on
// the marking function rather than through an invalid section.
describe('Select-all objective marking', () => {
  test('awards full marks only for the exact set of correct options', () => {
    const questions = [{ id: 'S-1', kind: 'select_all', marks: 2, correct: ['A', 'C'] }];
    const correct = markObjective(questions, { 'S-1': ['A', 'C'] });
    assert.equal(correct.total, 2);
    assert.equal(correct.perQuestion[0].awarded, 2);
    assert.equal(correct.perQuestion[0].needsReview, false);

    const partial = markObjective(questions, { 'S-1': ['A'] });
    assert.equal(partial.total, 0);
    assert.equal(partial.perQuestion[0].awarded, 0);
    assert.equal(partial.perQuestion[0].needsReview, false);
  });
});
