import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCorrect } from '../src/studio/engine.js';
import { importExam, loadConfig } from '../src/studio/store.js';

test('local marking distinguishes technical options and accepts canonical Unicode answers', () => {
  assert.equal(isCorrect({ type: 'mcq', answer: 'C++' }, 'C#'), false);
  assert.equal(isCorrect({ type: 'fill', answer: 'C++' }, 'C#'), false);
  assert.equal(isCorrect({ type: 'fill', answer: 'naïve café' }, 'NAI\u0308VE  CAFE\u0301.'), true);
  assert.equal(isCorrect({ type: 'fill', answer: '水', accept: ['温水'] }, '雪'), false);
  assert.equal(isCorrect({ type: 'fill', answer: '水', accept: ['温水'] }, '温水'), true);
});

test('sectioned imports preserve objective types and exclude short written answers', () => {
  const imported = importExam({ sections: [
    { kind: 'mcq', items: [{ text: 'Choose a language', options: ['C++', 'C#'], answer: 'A' }] },
    { kind: 'fill_blank', items: [{ text: 'Name a Boolean constant', answer: 'True', accepted: ['1'] }] },
    { kind: 'short_answer', items: [{ text: 'Explain your result', answer: 'A brief model response' }] },
  ] });
  assert.deepEqual(imported.questions.map(({ type, answer }) => [type, answer]), [['mcq', 'C++'], ['fill', 'True']]);
  assert.deepEqual(imported.questions[1].accept, ['1']);
});

test('legacy builder preferences retain valid values when an older configuration has invalid lists', (t) => {
  const originalWindow = globalThis.window;
  t.after(() => { globalThis.window = originalWindow; });
  globalThis.window = { localStorage: {
    getItem: () => JSON.stringify({ outcomes: null, types: 'mcq', count: 30, durationMin: 45, mode: 'practice', shuffleOptions: false }),
  } };
  assert.deepEqual(loadConfig(), { count: 30, durationMin: 45, mode: 'practice', shuffleOptions: false });
});
