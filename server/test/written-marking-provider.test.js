import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { bootApi, call, makeUser } from './helpers.js';

let api;
const fetchLocal = globalThis.fetch;
const captured = [];

before(async () => {
  globalThis.fetch = async (target, options) => {
    const url = new URL(target);
    if (url.hostname === '127.0.0.1') return fetchLocal(target, options);
    assert.equal(url.href, 'https://api.openai.com/v1/chat/completions');
    const payload = JSON.parse(options.body);
    captured.push(payload.model);
    const { studentResponse } = JSON.parse(payload.messages[1].content);
    const awarded = {
      'Plants use sunlight to store energy in sugars.': 3,
      'Subtract the smaller term from both sides, then divide.': 3,
      'Sunlight is used, but I am unsure how the energy is stored.': 1.5,
      'The roots absorb sugars from the soil.': 0,
      'Sunlight powers the process.': null,
    }[studentResponse];
    return new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: {
      arguments: JSON.stringify({ awarded, needsReview: false, feedback: 'Mock assessment.' }),
    } }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  api = await bootApi({ DEMO_MODE: '0', AI_PROVIDER: 'nvidia', EXAM_STUDIO_MASTER_KEY: '11'.repeat(32) });
});

after(async () => {
  globalThis.fetch = fetchLocal;
  await api?.close();
});

it('uses the exam owner’s provider and stores valid partial marks without releasing uncertain results as final', async () => {
  const owner = await makeUser(api.base);
  const { saveUserAISettings } = await import('../lib/userAISettings.js');
  await saveUserAISettings(owner.response.body.user.id, { provider: 'openai', model: 'mock-rubric-model', apiKey: 'fixture-key' });
  const responses = ['Plants use sunlight to store energy in sugars.',
    'Subtract the smaller term from both sides, then divide.',
    'Sunlight is used, but I am unsure how the energy is stored.',
    'The roots absorb sugars from the soil.', 'Sunlight powers the process.'];
  const items = responses.map((_, index) => ({
    id: `written-${index}`, text: index === 1 ? 'Solve the equation and explain the method.' : 'Explain how plants store light energy.',
    marks: 3, answer: 'Reference answer', markingPoints: [{ point: 'Reasoning and result', marks: 3 }],
  }));
  const saved = await call(api.base, '/api/library', { method: 'POST', token: owner.token,
    body: { kind: 'exam', title: 'Written assessment', data: { sections: [{ id: 'D', kind: 'short_answer', items }] } } });
  assert.equal(saved.status, 201);
  const published = await call(api.base, `/api/exams/${saved.body.id}/publish`, { method: 'POST', token: owner.token,
    body: { requireName: false, showResultsMode: 'never' } });
  assert.equal(published.status, 201, JSON.stringify(published.body));
  const started = await call(api.base, `/api/take/${published.body.publication.shareCode}/start`, { method: 'POST', body: {} });
  assert.equal(started.status, 201);
  const { attemptId, attemptToken } = started.body;
  const submitted = await call(api.base, `/api/take/attempts/${attemptId}/submit`, { method: 'POST',
    body: { attemptToken, answers: Object.fromEntries(items.map(({ id }, index) => [id, responses[index]])) } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.score, null);
  const ownerPath = `/api/exams/${saved.body.id}/attempts/${attemptId}`;
  let attempt;
  for (let i = 0; i < 70; i += 1) {
    attempt = (await call(api.base, ownerPath, { token: owner.token })).body.attempt;
    if (attempt.status === 'marking_failed') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(attempt.status, 'marking_failed');
  assert.equal(attempt.score.total, 7.5);
  assert.deepEqual(attempt.score.perQuestion.map(({ awarded, needsReview }) => [awarded, needsReview]),
    [[3, false], [3, false], [1.5, false], [0, false], [0, true]]);
  assert.deepEqual(captured, responses.map(() => 'mock-rubric-model'));
  assert.equal(attempt.score.perQuestion[0].provider, 'openai');
  assert.equal(attempt.answers['written-4'], responses[4]);
});
