import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import crypto from 'node:crypto';
import { bootApi, call, makeUser, dropTestDatabase } from './helpers.js';
import ExamAttempt from '../lib/models/ExamAttempt.js';
import ExamPublication from '../lib/models/ExamPublication.js';

describe('Online Exams - Server Gaps', () => {
  let api, ownerToken, studentToken, examId, shareCode;

  before(async () => {
    api = await bootApi({ DEMO_MODE: '1', TAKE_LIMIT_PER_HOUR: '10000', EXAM_STUDIO_ALLOW_REMOTE_SETTINGS: '1' });
    await dropTestDatabase();
    const owner = await makeUser(api.base);
    ownerToken = owner.token;
    const res = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: { title: 'Test Exam', layout: 'sections-a-e', moduleCode: 'TEST101', moduleName: 'Test Module', level: 'L4', trade: 'Test', school: 'Test School', duration: '3 hours', targetMarks: 100, sections: [
      { id: 'A', kind: 'mcq', title: 'MCQ', marks: 30, marksPerItem: 1, items: [{ text: 'Q1', options: ['A','B','C','D'], answer: 'A' }] },
      { id: 'B', kind: 'true_false', title: 'T/F', marks: 10, marksPerItem: 1, items: [{ text: 'Q2', answer: 'True' }] },
      { id: 'C', kind: 'fill_blank', title: 'Fill', marks: 10, marksPerItem: 1, items: [{ text: 'Fill ________', answer: 'word' }] },
      { id: 'D', kind: 'short_answer', title: 'SA', marks: 20, marksPerItem: 2, items: [{ text: 'SA Q', marks: 2, answer: 'Ans', markingPoints: [] }] },
      { id: 'E', kind: 'structured', title: 'Struct', marks: 30, marksPerItem: 0, items: [{ title: 'Struct Q', totalMarks: 8, parts: [{ letter: 'a', text: 'part', marks: 4 }], markingPoints: [{ point: 'pt', marks: 4 }] }] }
    ]}, title: 'Test Exam' } });
    assert.equal(res.status, 201);
    examId = res.body.id;
    const pubRes = await call(api.base, `/api/exams/${examId}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 1, requireName: true } });
    assert.equal(pubRes.status, 201);
    shareCode = pubRes.body.publication.shareCode;
  });

  after(async () => {
    await api.close();
  });

  describe('GET /api/take/:shareCode - Info', () => {
    test('returns exam info without answers/marking', async () => {
      const res = await call(api.base, `/api/take/${shareCode}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.exam);
      assert.ok(res.body.questionCount > 0);
      assert.ok(res.body.totalMarks > 0);
      const str = JSON.stringify(res.body);
      assert.ok(!str.includes('answer'));
      assert.ok(!str.includes('markingPoints'));
      assert.ok(!str.includes('modelAnswer'));
    });

    test('404 for invalid shareCode', async () => {
      const res = await call(api.base, '/api/take/invalid123');
      assert.equal(res.status, 404);
    });
  });

  describe('POST /api/take/:shareCode/start - Start attempt', () => {
    test('requires name when requireName=true', async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: {} });
      assert.equal(res.status, 400);
      assert.ok(res.body.error.includes('name'));
    });

    test('starts attempt with name', async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'John Doe' } });
      assert.equal(res.status, 201);
      assert.ok(res.body.attemptId);
      assert.ok(res.body.attemptToken);
      assert.ok(res.body.deadlineAt);
      assert.ok(res.body.questions);
      for (const q of res.body.questions) {
        assert.ok(!q.answer);
        assert.ok(!q.correct);
        assert.ok(!q.markingPoints);
      }
    });

    test('enforces maxAttempts', async () => {
      await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'John Doe' } });
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'John Doe' } });
      assert.equal(res.status, 429);
      assert.ok(res.body.error.includes('attempts'));
    });

    test('checks opensAt', async () => {
      const res2 = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: { title: 'Test Exam 2', layout: 'sections-a-e', moduleCode: 'TEST102', moduleName: 'Test Module 2', level: 'L4', trade: 'Test', school: 'Test School', duration: '3 hours', targetMarks: 100, sections: [
        { id: 'A', kind: 'mcq', title: 'MCQ', marks: 30, marksPerItem: 1, items: [{ text: 'Q1', options: ['A','B','C','D'], answer: 'A' }] },
      ]}, title: 'Test Exam 2' } });
      const examId2 = res2.body.id;
      const future = new Date(Date.now() + 3600000).toISOString();
      const pub = await call(api.base, `/api/exams/${examId2}/publish`, { method: 'POST', token: ownerToken, body: { opensAt: future } });
      const res = await call(api.base, `/api/take/${pub.body.publication.shareCode}/start`, { method: 'POST', body: { participantName: 'Test' } });
      assert.equal(res.status, 403);
    });

    test('checks closesAt', async () => {
      const res2 = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: { title: 'Test Exam 3', layout: 'sections-a-e', moduleCode: 'TEST103', moduleName: 'Test Module 3', level: 'L4', trade: 'Test', school: 'Test School', duration: '3 hours', targetMarks: 100, sections: [
        { id: 'A', kind: 'mcq', title: 'MCQ', marks: 30, marksPerItem: 1, items: [{ text: 'Q1', options: ['A','B','C','D'], answer: 'A' }] },
      ]}, title: 'Test Exam 3' } });
      const examId3 = res2.body.id;
      const past = new Date(Date.now() - 3600000).toISOString();
      const pub = await call(api.base, `/api/exams/${examId3}/publish`, { method: 'POST', token: ownerToken, body: { closesAt: past } });
      const res = await call(api.base, `/api/take/${pub.body.publication.shareCode}/start`, { method: 'POST', body: { participantName: 'Test' } });
      assert.equal(res.status, 403);
    });
  });

  describe('PUT /api/take/attempts/:id/answers - Autosave', () => {
    let attemptId, attemptToken;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: `Student ${Date.now()}${Math.random().toString(16).slice(2, 6)}` } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
    });

    test('autosaves answers', async () => {
      const res = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers: { 'Q-1': 'A' } } });
      assert.equal(res.status, 200);
      assert.ok(res.body.autosavedAt);
    });

    test('validates answer size', async () => {
      const long = 'x'.repeat(25000);
      const res = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers: { 'Q-1': long } } });
      assert.equal(res.status, 413);
    });
  });

  describe('POST /api/take/attempts/:id/submit - Submit', () => {
    let attemptId, attemptToken;

    beforeEach(async () => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: `Student ${Date.now()}${Math.random().toString(16).slice(2, 6)}` } });
      assert.equal(res.status, 201);
      attemptId = res.body.attemptId;
      attemptToken = res.body.attemptToken;
    });

    test('submits and returns score', async () => {
      const res = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
      assert.equal(res.status, 200);
      assert.ok(res.body.status);
      assert.ok(typeof res.body.score === 'object');
    });

    test('locks attempt after submit', async () => {
      // 1) First submission succeeds with a score and a final status.
      const res1 = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
      assert.equal(res1.status, 200);
      assert.equal(res1.body.status, 'marked');
      assert.ok(typeof res1.body.score === 'object');
      const firstSubmittedAt = res1.body.submittedAt;
      const firstScore = JSON.stringify(res1.body.score);

      // 2) A second submission returns HTTP 200, not 409: the endpoint is idempotent.
      const res2 = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
      assert.equal(res2.status, 200);

      // 3) With no written responses to queue, both replies report a finished mark.
      assert.equal(res2.body.status, 'marked');

      // 4) The original submittedAt timestamp is unchanged by a repeat submit.
      assert.equal(res2.body.submittedAt, firstSubmittedAt);

      // 5) The saved score/result is unchanged by a repeat submit.
      assert.equal(JSON.stringify(res2.body.score), firstScore);

      // 6) Trying to modify answers after submission returns HTTP 409.
      const res3 = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers: {} } });
      assert.equal(res3.status, 409);

      // 7) The attempt cannot be reopened or changed by submitting again; its
      //    status stays submitted and no further answers write is accepted.
      const res4 = await call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers: { 'Q-1': 'REVOKED' } } });
      assert.equal(res4.status, 409);
    });
  });

  // Deadlines are moved by rewriting the attempt row, so no test waits in real time.
  describe('Deadline enforcement on submit', () => {
    const startAttempt = async (name) => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: name } });
      assert.equal(res.status, 201);
      return res.body;
    };

    const setDeadline = async (attemptId, offsetMs) => {
      await ExamAttempt.updateOne({ _id: attemptId }, { $set: { deadlineAt: new Date(Date.now() + offsetMs) } });
    };

    const submit = (attemptId, attemptToken) => call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });

    test('accepts a submission made before the deadline', async () => {
      const attempt = await startAttempt('Early Student');
      await setDeadline(attempt.attemptId, 5 * 60 * 1000);
      const res = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.ok(['submitted', 'marked', 'marking_failed'].includes(res.body.status));
    });

    test('accepts a submission at the deadline itself', async () => {
      const attempt = await startAttempt('Boundary Student');
      await setDeadline(attempt.attemptId, 0);
      const res = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
    });

    test('accepts a submission inside the grace period', async () => {
      const attempt = await startAttempt('Grace Student');
      await setDeadline(attempt.attemptId, -5000);
      const res = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
    });

    test('refuses a submission after the grace period and leaves the attempt open', async () => {
      const attempt = await startAttempt('Late Student');
      await setDeadline(attempt.attemptId, -11_000);
      const res = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 410);
      const stored = await ExamAttempt.findById(attempt.attemptId).lean();
      assert.equal(stored.status, 'in_progress');
      assert.equal(stored.submittedAt, null);
    });

    test('a late submission cannot overwrite a finalized result', async () => {
      const attempt = await startAttempt('Locked Student');
      await setDeadline(attempt.attemptId, 60_000);
      const first = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(first.status, 200);
      const afterFirst = await ExamAttempt.findById(attempt.attemptId).lean();
      assert.ok(afterFirst.submittedAt);

      await setDeadline(attempt.attemptId, -60_000);
      const second = await submit(attempt.attemptId, attempt.attemptToken);
      assert.equal(second.status, 200);
      const afterSecond = await ExamAttempt.findById(attempt.attemptId).lean();
      assert.equal(afterSecond.submittedAt.getTime(), afterFirst.submittedAt.getTime());
      assert.notEqual(afterSecond.status, 'in_progress');
    });

    test('refuses a submission made with another attempt token', async () => {
      const mine = await startAttempt('Owner Student');
      const other = await startAttempt('Other Student');
      const res = await submit(mine.attemptId, other.attemptToken);
      assert.equal(res.status, 401);
      const stored = await ExamAttempt.findById(mine.attemptId).lean();
      assert.equal(stored.status, 'in_progress');
    });
  });

  // The payload is filtered by allowlist, so a field the generator invents tomorrow cannot leak just
  // because nobody added its name to a denylist today.
  describe('Student payload allowlist', () => {
    const SECRET = 'SECRET-VALUE';
    const FORBIDDEN_KEYS = new Set([
      'answer', 'answers', 'correct', 'correctAnswer', 'answerKey', 'answerText', 'expected',
      'markingPoints', 'modelAnswer', 'rubric', 'explanation', 'explanations', 'solution',
      'gradingNotes', 'aiPrompt', 'aiEvaluationPrompt', 'teacherNotes', 'notes', 'metadata', 'key',
    ]);

    const sneakyExam = () => ({
      title: 'Sneaky Exam',
      sections: [
        { id: 'A', title: 'Multiple choice', marks: 10, marksPerItem: 2, items: [
          {
            id: 'A1', text: 'Pick one', options: ['One', 'Two'],
            answer: 'One', correctAnswer: 'One', answerText: 'One', expected: 'One',
            explanation: SECRET, rubric: SECRET, gradingNotes: SECRET, aiPrompt: SECRET,
            metadata: { answer: 'One' }, markingPoints: [{ point: SECRET, marks: 1 }],
          },
        ] },
        { id: 'B', title: 'Short answer', marks: 10, marksPerItem: 10, items: [
          { id: 'B1', text: 'Explain normalisation', answer: SECRET, modelAnswer: SECRET, markingPoints: [{ point: SECRET, marks: 5 }] },
        ] },
        { id: 'C', title: 'Essay', marks: 10, marksPerItem: 0, items: [
          { id: 'C1', title: 'Discuss indexes', totalMarks: 10, modelAnswer: SECRET, aiEvaluationPrompt: SECRET,
            parts: [{ letter: 'a', text: 'Part one', marks: 5, answer: SECRET, markingPoints: [{ point: SECRET, marks: 5 }] }] },
        ] },
        { id: 'D', title: 'Nested true or false', marks: 10, marksPerItem: 1, items: [
          { id: 'D1', text: 'Nested statements', type: 'true_false',
            items: [{ text: 'Statement one', answer: 'True' }, { text: 'Statement two', answer: 'False', explanation: SECRET }] },
        ] },
      ],
    });

    const forbiddenKeyHits = (value, hits = []) => {
      if (Array.isArray(value)) { value.forEach((item) => forbiddenKeyHits(item, hits)); return hits; }
      if (!value || typeof value !== 'object') return hits;
      for (const [key, item] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(key)) hits.push(key);
        forbiddenKeyHits(item, hits);
      }
      return hits;
    };

    const publishExam = async (data, extra = {}) => {
      const created = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data, title: data.title } });
      assert.equal(created.status, 201);
      const pub = await call(api.base, `/api/exams/${created.body.id}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 0, requireName: false, ...extra } });
      assert.equal(pub.status, 201);
      return pub.body.publication.shareCode;
    };

    const startOn = async (shareCode) => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: {} });
      assert.equal(res.status, 201);
      return res.body;
    };

    let code;
    before(async () => { code = await publishExam(sneakyExam()); });

    test('exam information endpoint sends no question content at all', async () => {
      const res = await call(api.base, `/api/take/${code}`);
      assert.equal(res.status, 200);
      assert.ok(!JSON.stringify(res.body).includes(SECRET));
      assert.deepEqual(forbiddenKeyHits(res.body), []);
    });

    test('start sends no forbidden key at any depth', async () => {
      const body = await startOn(code);
      assert.ok(body.questions.length > 0);
      assert.deepEqual(forbiddenKeyHits(body.questions), []);
      assert.ok(!JSON.stringify(body.questions).includes(SECRET));
    });

    test('multiple choice keeps options and drops the key', async () => {
      const q = (await startOn(code)).questions.find((x) => x.id === 'A1');
      assert.ok(q, 'question A1 must be sent');
      assert.equal(q.text, 'Pick one');
      assert.deepEqual(q.options, ['One', 'Two']);
      assert.equal(q.answer, undefined);
      assert.equal(q.correctAnswer, undefined);
      assert.equal(q.answerText, undefined);
      assert.equal(q.expected, undefined);
    });

    test('short answer keeps the text and drops the model answer and marking points', async () => {
      const q = (await startOn(code)).questions.find((x) => x.id === 'B1');
      assert.equal(q.text, 'Explain normalisation');
      assert.equal(q.answer, undefined);
      assert.equal(q.modelAnswer, undefined);
      assert.equal(q.markingPoints, undefined);
    });

    test('structured question keeps its parts and drops nested marking data', async () => {
      const q = (await startOn(code)).questions.find((x) => x.id === 'C1');
      assert.equal(q.title, 'Discuss indexes');
      assert.equal(q.totalMarks, 10);
      assert.equal(q.parts.length, 1);
      assert.deepEqual(q.parts[0], { letter: 'a', text: 'Part one', marks: 5 });
      assert.equal(q.modelAnswer, undefined);
      assert.equal(q.aiEvaluationPrompt, undefined);
    });

    test('nested items are sanitised too', async () => {
      const q = (await startOn(code)).questions.find((x) => x.id === 'D1');
      assert.equal(q.items.length, 2);
      assert.equal(q.items[0].text, 'Statement one');
      assert.equal(q.items[0].answer, undefined);
      assert.equal(q.items[1].explanation, undefined);
    });

    test('result endpoint hides score and feedback until results are authorised', async () => {
      const hiddenCode = await publishExam({ ...sneakyExam(), title: 'Hidden Results Exam' }, { showResultsMode: 'never' });
      const attempt = await startOn(hiddenCode);
      const submitted = await call(api.base, `/api/take/attempts/${attempt.attemptId}/submit`, { method: 'POST', body: { attemptToken: attempt.attemptToken } });
      assert.equal(submitted.status, 200);
      const res = await call(api.base, `/api/take/attempts/${attempt.attemptId}/result?attemptToken=${encodeURIComponent(attempt.attemptToken)}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.resultsVisible, false);
      assert.equal(res.body.score, null);
      assert.deepEqual(res.body.feedback, []);
    });
  });

  // Token handling, and what a student may see once results are released.
  describe('Attempt token and result disclosure', () => {
    const SECRET_POINT = 'SECRET-POINT';

    const examData = (title) => ({
      title,
      sections: [
        { id: 'A', title: 'Multiple choice', marks: 10, marksPerItem: 2, items: [
          { id: 'A1', text: 'Pick one', options: ['One', 'Two'], answer: 'One', markingPoints: [{ point: SECRET_POINT, marks: 1 }] },
        ] },
        { id: 'B', title: 'Short answer', marks: 10, marksPerItem: 10, items: [
          { id: 'B1', text: 'Explain storage', answer: 'SECRET-MODEL', modelAnswer: 'SECRET-MODEL', markingPoints: [{ point: SECRET_POINT, marks: 5 }] },
        ] },
      ],
    });

    const publishExam = async (title, extra = {}) => {
      const created = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: examData(title), title } });
      assert.equal(created.status, 201);
      const pub = await call(api.base, `/api/exams/${created.body.id}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 0, requireName: false, ...extra } });
      assert.equal(pub.status, 201);
      return pub.body.publication.shareCode;
    };

    const startOn = async (shareCode) => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: {} });
      assert.equal(res.status, 201);
      return res.body;
    };

    const submitAttempt = (attemptId, attemptToken) => call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });

    // The token travels in a header, so this helper mimics the browser rather than call().
    const resultViaHeader = async (attemptId, attemptToken) => {
      const response = await fetch(`${api.base}/api/take/attempts/${attemptId}/result`, { headers: { 'x-attempt-token': attemptToken } });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };

    const expiredToken = (attemptId) => {
      const secret = process.env.EXAM_ATTEMPT_SECRET || process.env.JWT_SECRET || 'exam-studio-attempt-dev';
      const payload = Buffer.from(JSON.stringify({ attemptId, exp: Date.now() - 1000 })).toString('base64url');
      return `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
    };

    test('accepts a valid attempt token', async () => {
      const code = await publishExam('Token Valid');
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.ok(['submitted', 'marked', 'marking_failed'].includes(res.body.status));
    });

    test('rejects an invalid attempt token', async () => {
      const code = await publishExam('Token Invalid');
      const attempt = await startOn(code);
      const res = await resultViaHeader(attempt.attemptId, 'not-a-real-token');
      assert.equal(res.status, 401);
    });

    test('rejects a token issued for a different attempt', async () => {
      const code = await publishExam('Token Cross');
      const mine = await startOn(code);
      const other = await startOn(code);
      const res = await resultViaHeader(mine.attemptId, other.attemptToken);
      assert.equal(res.status, 401);
    });

    test('keeps the result reachable after submission while answers stay locked', async () => {
      const code = await publishExam('Token After Submit');
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      const write = await call(api.base, `/api/take/attempts/${attempt.attemptId}/answers`, { method: 'PUT', body: { attemptToken: attempt.attemptToken, answers: {} } });
      assert.equal(write.status, 409);
    });

    test('rejects an expired attempt token', async () => {
      const code = await publishExam('Token Expired');
      const attempt = await startOn(code);
      const res = await resultViaHeader(attempt.attemptId, expiredToken(attempt.attemptId));
      assert.equal(res.status, 401);
    });

    test('shows score under showResultsMode immediately', async () => {
      const code = await publishExam('Results Immediately');
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.body.resultsVisible, true);
      assert.equal(typeof res.body.score, 'object');
    });

    test('hides results under after_close until the close time passes', async () => {
      const code = await publishExam('Results After Close', { showResultsMode: 'after_close', closesAt: new Date(Date.now() + 3600_000).toISOString() });
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const before = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(before.body.resultsVisible, false);
      assert.equal(before.body.score, null);
      assert.deepEqual(before.body.feedback, []);

      await ExamPublication.updateOne({ shareCode: code }, { $set: { closesAt: new Date(Date.now() - 1000) } });
      const after = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(after.body.resultsVisible, true);
      assert.equal(typeof after.body.score, 'object');
    });

    test('never shows results under showResultsMode never', async () => {
      const code = await publishExam('Results Never', { showResultsMode: 'never' });
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.body.resultsVisible, false);
      assert.equal(res.body.score, null);
      assert.deepEqual(res.body.feedback, []);
    });

    test('never discloses marking points in student feedback', async () => {
      const code = await publishExam('Feedback Points');
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      await ExamAttempt.updateOne({ _id: attempt.attemptId }, {
        $set: { feedback: [{ questionId: 'B1', awarded: 3, max: 5, feedback: 'Add the storage engine detail.', pointsHit: [SECRET_POINT], pointsMissed: [SECRET_POINT] }] },
      });

      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.equal(res.body.feedback[0].feedback, 'Add the storage engine detail.');
      assert.equal(res.body.feedback[0].awarded, 3);
      assert.equal(res.body.feedback[0].pointsHit, undefined);
      assert.equal(res.body.feedback[0].pointsMissed, undefined);
      assert.ok(!JSON.stringify(res.body).includes(SECRET_POINT));
    });

    test('returns no owner-only attempt fields to the student', async () => {
      const code = await publishExam('Attempt Shape');
      const attempt = await startOn(code);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.deepEqual(Object.keys(res.body).sort(), ['feedback', 'markingProgress', 'resultsVisible', 'score', 'status', 'submittedAt']);
      assert.equal(res.body.ownerId, undefined);
      assert.equal(res.body.ipHash, undefined);
      assert.equal(res.body.seed, undefined);
      assert.equal(res.body.answers, undefined);
    });
  });

  // Unpublishing revokes outstanding tokens; a passed closesAt does not.
  describe('Publication revocation and teacher-only fields', () => {
    const OWNER_NOTE = 'SECRET-OWNER-NOTE';

    const simpleExam = (title) => ({
      title,
      sections: [{ id: 'A', title: 'Multiple choice', marks: 10, marksPerItem: 2, items: [
        { id: 'A1', text: 'Pick one', options: ['One', 'Two'], answer: 'One' },
      ] }],
    });

    const createExam = async (title, extra = {}) => {
      const created = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: simpleExam(title), title } });
      assert.equal(created.status, 201);
      const pub = await call(api.base, `/api/exams/${created.body.id}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 0, requireName: false, ...extra } });
      assert.equal(pub.status, 201);
      return { examId: created.body.id, shareCode: pub.body.publication.shareCode };
    };

    const startOn = async (shareCode) => {
      const res = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: {} });
      assert.equal(res.status, 201);
      return res.body;
    };

    const submitAttempt = (attemptId, attemptToken) => call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST', body: { attemptToken } });
    const saveAnswers = (attemptId, attemptToken) => call(api.base, `/api/take/attempts/${attemptId}/answers`, { method: 'PUT', body: { attemptToken, answers: { A1: 'One' } } });

    const resultViaHeader = async (attemptId, attemptToken) => {
      const response = await fetch(`${api.base}/api/take/attempts/${attemptId}/result`, { headers: { 'x-attempt-token': attemptToken } });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    };

    const withdraw = (shareCode) => ExamPublication.updateOne({ shareCode }, { $set: { active: false } });

    test('an active publication still serves attempt access', async () => {
      const { shareCode } = await createExam('Active Publication');
      const attempt = await startOn(shareCode);
      const save = await saveAnswers(attempt.attemptId, attempt.attemptToken);
      assert.equal(save.status, 200);
      assert.equal((await submitAttempt(attempt.attemptId, attempt.attemptToken)).status, 200);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.equal(res.body.resultsVisible, true);
    });

    test('a withdrawn publication blocks an in-progress attempt without destroying it', async () => {
      const { shareCode } = await createExam('Withdrawn In Progress');
      const attempt = await startOn(shareCode);
      assert.equal((await saveAnswers(attempt.attemptId, attempt.attemptToken)).status, 200);
      await withdraw(shareCode);

      const save = await saveAnswers(attempt.attemptId, attempt.attemptToken);
      assert.equal(save.status, 403);
      const send = await submitAttempt(attempt.attemptId, attempt.attemptToken);
      assert.equal(send.status, 403);

      const stored = await ExamAttempt.findById(attempt.attemptId).lean();
      assert.equal(stored.status, 'in_progress');
      assert.equal(stored.answers.A1, 'One');
    });

    test('a withdrawn publication stops serving a submitted result', async () => {
      const { shareCode } = await createExam('Withdrawn After Submit');
      const attempt = await startOn(shareCode);
      assert.equal((await submitAttempt(attempt.attemptId, attempt.attemptToken)).status, 200);
      assert.equal((await resultViaHeader(attempt.attemptId, attempt.attemptToken)).status, 200);

      await withdraw(shareCode);
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 403);
    });

    test('a passed closing time alone does not revoke result access', async () => {
      // The attempt must start while the exam is open: start correctly refuses a closed exam. The
      // close time is then moved into the past, which must open the results rather than revoke them.
      const { shareCode } = await createExam('Closed But Active', {
        showResultsMode: 'after_close',
        closesAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      const attempt = await startOn(shareCode);
      assert.equal((await submitAttempt(attempt.attemptId, attempt.attemptToken)).status, 200);

      await ExamPublication.updateOne({ shareCode }, { $set: { closesAt: new Date(Date.now() - 1000) } });
      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.equal(res.body.resultsVisible, true);
    });

    test('student results exclude the teacher override comment', async () => {
      const { shareCode } = await createExam('Override Hidden');
      const attempt = await startOn(shareCode);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      await ExamAttempt.updateOne({ _id: attempt.attemptId }, {
        $set: {
          score: { total: 2, max: 2, perQuestion: [{ questionId: 'A1', awarded: 2, max: 2, needsReview: false, overrideComment: OWNER_NOTE }] },
        },
      });

      const res = await resultViaHeader(attempt.attemptId, attempt.attemptToken);
      assert.equal(res.status, 200);
      assert.equal(res.body.score.perQuestion[0].awarded, 2);
      assert.equal(res.body.score.perQuestion[0].overrideComment, undefined);
      assert.ok(!JSON.stringify(res.body).includes(OWNER_NOTE));
    });

    test('the teacher route still exposes the override comment', async () => {
      const { examId, shareCode } = await createExam('Override Visible');
      const attempt = await startOn(shareCode);
      await submitAttempt(attempt.attemptId, attempt.attemptToken);
      await ExamAttempt.updateOne({ _id: attempt.attemptId }, {
        $set: {
          score: { total: 2, max: 2, perQuestion: [{ questionId: 'A1', awarded: 2, max: 2, needsReview: false, overrideComment: OWNER_NOTE }] },
        },
      });

      const res = await call(api.base, `/api/exams/${examId}/attempts/${attempt.attemptId}`, { token: ownerToken });
      assert.equal(res.status, 200);
      assert.equal(res.body.attempt.score.perQuestion[0].overrideComment, OWNER_NOTE);
    });

    test('expired tokens and post-submission answer writes are still refused', async () => {
      const { shareCode } = await createExam('Restrictions Hold');
      const attempt = await startOn(shareCode);

      const secret = process.env.EXAM_ATTEMPT_SECRET || process.env.JWT_SECRET || 'exam-studio-attempt-dev';
      const payload = Buffer.from(JSON.stringify({ attemptId: attempt.attemptId, exp: Date.now() - 1000 })).toString('base64url');
      const expired = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
      assert.equal((await resultViaHeader(attempt.attemptId, expired)).status, 401);

      assert.equal((await submitAttempt(attempt.attemptId, attempt.attemptToken)).status, 200);
      assert.equal((await saveAnswers(attempt.attemptId, attempt.attemptToken)).status, 409);
    });
  });
});
