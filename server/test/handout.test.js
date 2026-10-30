// Acceptance tests for the study handout: the plan/lesson/extras schemas, the validator, the
// cleaners, the routes and the library kind. No network: the API runs in DEMO_MODE.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { handoutPlanTool, handoutLessonTool, handoutExtrasTool } from '../lib/schema.js';
import { validateHandout, handoutStats, estimateHandoutPages } from '../../shared/format.js';
import { demoHandout } from '../lib/demo.js';
import { handoutFixture, brokenHandout } from './fixtures.js';
import { bootApi, call, makeUser } from './helpers.js';

// ai.js freezes DEMO_MODE at import time, so it is imported in the hook, after the environment
// says demo mode is on. Importing it at the top would make the route tests call a real provider.
let cleanHandoutPlan;
let cleanHandoutLesson;
let cleanHandoutExtras;
let mergeHandoutPlans;
let locateLessonSlices;

let api;
let token;

before(async () => {
  process.env.DEMO_MODE = '1';
  ({ cleanHandoutPlan, cleanHandoutLesson, cleanHandoutExtras, mergeHandoutPlans, locateLessonSlices } = await import('../lib/ai.js'));
  // DEMO_MODE=1: /api/handouts/generate returns the built-in sample without calling an AI.
  api = await bootApi({ MONGODB_URI: 'mongodb://127.0.0.1:59999/none', MONGODB_TIMEOUT_MS: '400' });
  token = (await makeUser(api.base)).token;
});

after(async () => { await api?.close(); });

describe('handout schemas', () => {
  it('are three submit_handout tools with an object schema and required fields', () => {
    for (const tool of [handoutPlanTool, handoutLessonTool, handoutExtrasTool]) {
      assert.match(tool.name, /^submit_handout/, `${tool.name} must start with submit_handout`);
      assert.equal(tool.input_schema.type, 'object');
      assert.ok(Array.isArray(tool.input_schema.required) && tool.input_schema.required.length, `${tool.name} needs required fields`);
      assert.ok(tool.description);
    }
  });

  it('name the fields the renderer reads', () => {
    assert.ok(handoutLessonTool.input_schema.properties.blocks, 'lessons have blocks');
    assert.deepEqual(
      handoutLessonTool.input_schema.properties.blocks.items.properties.kind.enum,
      ['prose', 'bullets', 'steps', 'table', 'compare'],
    );
    assert.deepEqual(
      handoutExtrasTool.input_schema.properties.revision.properties.trueFalse.items.properties.answer.type,
      'string',
    );
  });
});

describe('validateHandout', () => {
  it('accepts a complete handout with no warnings', () => {
    assert.deepEqual(validateHandout(handoutFixture()), []);
  });

  it('accepts the demo sample, so demo mode stays honest', () => {
    assert.deepEqual(validateHandout(demoHandout()), []);
  });

  it('catches an mcq with three choices', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].revision.mcq[0].choices = ['a', 'b', 'c']; }));
    assert.ok(warnings.some((w) => /exactly 4 are needed/.test(w)), warnings.join(' | '));
  });

  it('catches an mcq whose answer letter does not exist', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].revision.mcq[0].answer = 'D'; h.units[0].revision.mcq[0].choices = ['a', 'b', 'c', 'd']; }));
    assert.deepEqual(warnings, [], 'D is a valid letter for four choices');
    const broken = validateHandout(brokenHandout((h) => { h.units[0].revision.mcq[0].answer = 'Z'; }));
    assert.ok(broken.some((w) => /not one of the choices/.test(w)), broken.join(' | '));
  });

  it('catches a lesson with no worked example', () => {
    const warnings = validateHandout(brokenHandout((h) => { delete h.units[0].lessons[0].workedExample; }));
    assert.ok(warnings.some((w) => /no worked example/.test(w)), warnings.join(' | '));
  });

  it('catches a lesson with no key terms and no blocks', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].lessons[1].keyTerms = []; h.units[0].lessons[1].blocks = []; }));
    assert.ok(warnings.some((w) => /no key terms/.test(w)));
    assert.ok(warnings.some((w) => /no content blocks/.test(w)));
  });

  it('catches a compare block with only two headers', () => {
    const warnings = validateHandout(brokenHandout((h) => {
      const compare = h.units[0].lessons[1].blocks.find((b) => b.kind === 'compare');
      compare.headers = ['Feature', 'A'];
      compare.rows = compare.rows.map(() => ['x', 'y']);
    }));
    assert.ok(warnings.some((w) => /at least 3 columns/.test(w)), warnings.join(' | '));
  });

  it('catches a steps block with one step', () => {
    const warnings = validateHandout(brokenHandout((h) => {
      const steps = h.units[0].lessons[0].blocks.find((b) => b.kind === 'steps');
      steps.items = ['only one'];
    }));
    assert.ok(warnings.some((w) => /at least 2 steps/.test(w)), warnings.join(' | '));
  });

  it('catches a table row with the wrong number of cells', () => {
    const warnings = validateHandout(brokenHandout((h) => {
      const table = h.units[0].lessons[0].blocks.find((b) => b.kind === 'table');
      table.rows.push(['one cell only']);
    }));
    assert.ok(warnings.some((w) => /expected 2/.test(w)), warnings.join(' | '));
  });

  it('catches eleven study tips instead of twelve', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].studyTips = h.units[0].studyTips.slice(0, 11); }));
    assert.ok(warnings.some((w) => /12 to 15/.test(w)), warnings.join(' | '));
  });

  it('catches a true/false answer of "Maybe"', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].revision.trueFalse[0].answer = 'Maybe'; }));
    assert.ok(warnings.some((w) => /must be True or False/.test(w)), warnings.join(' | '));
  });

  it('catches a unit with too few diagrams and a missing practical task', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].diagrams = h.units[0].diagrams.slice(0, 2); h.units[0].practical = {}; }));
    assert.ok(warnings.some((w) => /at least 3 are expected/.test(w)));
    assert.ok(warnings.some((w) => /practical task has no steps/.test(w)));
  });

  it('catches a last study tip that is not the practical-work one', () => {
    const warnings = validateHandout(brokenHandout((h) => { h.units[0].studyTips[12] = 'When you see a key, think unique.'; }));
    assert.ok(warnings.some((w) => /last study tip/.test(w)), warnings.join(' | '));
  });

  it('reports an empty handout rather than pretending it is fine', () => {
    assert.deepEqual(validateHandout({ units: [] }), ['The handout has no units.']);
  });

  it('counts what the banner shows and estimates the length', () => {
    const stats = handoutStats(handoutFixture());
    assert.deepEqual(
      { units: stats.units, lessons: stats.lessons, workedExamples: stats.workedExamples, questions: stats.questions },
      { units: 1, lessons: 2, workedExamples: 2, questions: 15 },
    );
    assert.ok(stats.keyTerms > 0 && stats.callouts > 0 && stats.diagrams === 3);
    const pages = estimateHandoutPages(handoutFixture());
    assert.ok(pages >= 5 && pages <= 40, `page estimate out of range: ${pages}`);
    assert.equal(estimateHandoutPages({}), 1);
  });
});

describe('handout cleaners', () => {
  it('keeps what is valid in a messy plan and drops the rest', () => {
    const plan = cleanHandoutPlan({
      moduleName: 'Backend',
      units: [
        null,
        { number: '1', title: 'No lessons at all', lessons: [] },
        { number: '2', title: 'Real unit', lessons: [{ number: '2.1', title: 'Lesson', sourceMarker: 'Marker text here' }, null] },
        'not an object',
      ],
    });
    assert.equal(plan.units.length, 1);
    assert.equal(plan.units[0].number, '2');
    assert.deepEqual(plan.units[0].lessons[0].subtopics, [], 'a missing subtopics list becomes an empty one');
    assert.equal(plan.moduleName, 'Backend');
  });

  it('throws 502 when a plan has nothing usable', () => {
    assert.throws(() => cleanHandoutPlan({ units: [null, 'x'] }), (error) => error.status === 502);
  });

  it('keeps what is valid in a messy lesson', () => {
    const lesson = cleanHandoutLesson({
      number: '1.1',
      title: 'Keys',
      keyTerms: [{ term: 'Primary key', meaning: 'Identifies a row' }, { term: 'Empty', meaning: '' }, null],
      blocks: [
        { kind: 'steps', items: ['one', 'two'] },
        { kind: 'nonsense' },
        { kind: 'table', headers: ['A', 'B'], rows: [['1', '2'], ['only-one']] },
        null,
      ],
      callouts: [{ kind: 'tip', text: 'Watch out' }, { kind: 'unknown', text: 'no' }],
      workedExample: { title: 'W', steps: ['s'] },
    });
    assert.equal(lesson.keyTerms.length, 1);
    assert.equal(lesson.blocks.length, 2, 'the nonsense block is dropped');
    assert.equal(lesson.blocks[1].rows.length, 2, 'rows are kept as written; the validator reports the width');
    assert.equal(lesson.callouts.length, 1);
    assert.equal(lesson.callouts[0].label, 'Exam tip', 'a missing label falls back to the kind');
    assert.equal(lesson.workedExample.title, 'W');
  });

  it('throws 502 when a lesson has nothing usable', () => {
    assert.throws(() => cleanHandoutLesson({ number: '1', title: 'X' }), (error) => error.status === 502);
  });

  it('keeps what is valid in messy extras', () => {
    const extras = cleanHandoutExtras({
      unitNumber: '1',
      diagrams: [{ title: 'D', ascii: '+-+', readSteps: ['read it'], redraw: 'redraw' }, { title: 'no drawing' }],
      memorySheet: [{ remember: 'r', answer: 'a' }, { remember: 'no answer' }],
      revision: { mcq: [{ q: 'q', choices: ['a', 'b', 'c', 'd'], answer: 'b', reason: 'r' }], trueFalse: 'not an array' },
      practical: { steps: ['s'], assessor: ['a'] },
      studyTips: ['t'],
    });
    assert.equal(extras.diagrams.length, 1);
    assert.equal(extras.memorySheet.length, 1);
    assert.equal(extras.revision.mcq.length, 1);
    assert.deepEqual(extras.revision.trueFalse, []);
    assert.equal(extras.revision.mcq[0].answer, 'B', 'the answer letter is upper-cased');
  });

  it('throws 502 when the extras are empty', () => {
    assert.throws(() => cleanHandoutExtras({ unitNumber: '1' }), (error) => error.status === 502);
  });
});

describe('plan merging and lesson location', () => {
  it('joins a unit that was split across two planning slices', () => {
    const merged = mergeHandoutPlans([
      { moduleName: 'M', units: [{ number: '1', title: 'Unit one', lessons: [{ number: '1.1' }] }], errorsInSource: [{ where: 'a', says: 'b', correction: 'c' }] },
      { moduleName: '', units: [{ number: '1', title: 'Unit one', lessons: [{ number: '1.2' }] }, { number: '2', title: 'Unit two', lessons: [{ number: '2.1' }] }], errorsInSource: [{ where: 'a', says: 'b', correction: 'c' }] },
    ]);
    assert.equal(merged.units.length, 2);
    assert.deepEqual(merged.units[0].lessons.map((l) => l.number), ['1.1', '1.2']);
    assert.equal(merged.moduleName, 'M');
    assert.equal(merged.errorsInSource.length, 1, 'the same defect reported twice is listed once');
  });

  it('slices each lesson from its own marker to the next one', () => {
    const text = 'intro ALPHA start of lesson one text BRAVO start of lesson two text';
    const plan = { units: [{ number: '1', lessons: [{ number: '1.1', sourceMarker: 'ALPHA start' }, { number: '1.2', sourceMarker: 'BRAVO start' }] }] };
    const { slices, located, total } = locateLessonSlices(text, plan);
    assert.equal(located, 2);
    assert.equal(total, 2);
    assert.match(slices.get(plan.units[0].lessons[0]), /lesson one text/);
    assert.match(slices.get(plan.units[0].lessons[1]), /lesson two text/);
  });

  it('falls back to the nearest located text when a marker was paraphrased', () => {
    const text = 'ALPHA one two three four five six seven eight nine ten';
    const plan = { units: [{ number: '1', lessons: [{ number: '1.1', sourceMarker: 'ALPHA one two' }, { number: '1.2', sourceMarker: 'never appears anywhere' }] }] };
    const { slices, located, total } = locateLessonSlices(text, plan);
    assert.equal(located, 1);
    assert.equal(total, 2);
    assert.match(slices.get(plan.units[0].lessons[1]), /ALPHA/, 'the unearthed lesson still gets source text');
  });
});

describe('handout routes', () => {
  it('builds the demo handout without calling an AI', async () => {
    const { status, body } = await call(api.base, '/api/handouts/generate', {
      method: 'POST', token, body: { text: 'x'.repeat(200), title: 'Database', level: 'L4' },
    });
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(Array.isArray(body.units) && body.units.length >= 1);
    assert.equal(body.demo, true);
    assert.deepEqual(validateHandout(body), [], 'the demo handout the route returns must validate');
  });

  it('refuses notes that are too short', async () => {
    const { status } = await call(api.base, '/api/handouts/generate', { method: 'POST', token, body: { text: 'short' } });
    assert.equal(status, 400);
  });

  it('exposes handout progress without leaking another account\'s build', async () => {
    const mine = await call(api.base, '/api/handouts/progress/some-job-id', { token });
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.steps, []);
    const anonymous = await call(api.base, '/api/handouts/progress/some-job-id');
    assert.equal(anonymous.status, 401);
  });

  it('refuses to export when there is no handout', async () => {
    const { status, body } = await call(api.base, '/api/export/handout-docx', { method: 'POST', token, body: {} });
    assert.equal(status, 400);
    assert.match(body.error, /No handout/i);
    const empty = await call(api.base, '/api/export/handout-pdf', { method: 'POST', token, body: { handout: { units: [] } } });
    assert.equal(empty.status, 400);
  });

  it('exports a Word file with the right content type', async () => {
    const response = await fetch(`${api.base}/api/export/handout-docx`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ handout: handoutFixture() }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    assert.match(response.headers.get('content-disposition'), /\.docx/);
  });

  it('exports a PDF', async () => {
    const response = await fetch(`${api.base}/api/export/handout-pdf`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ handout: handoutFixture() }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  });
});

describe('library', () => {
  it('stores a handout and lists it', async () => {
    const saved = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: 'handout', data: handoutFixture(), title: 'Study handout' } });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    const list = await call(api.base, '/api/library', { token });
    assert.ok(list.body.some((item) => item.kind === 'handout' && item.title === 'Study handout'));
  });

  it('still refuses an unknown kind', async () => {
    const bad = await call(api.base, '/api/library', { method: 'POST', token, body: { kind: 'poster', data: { a: 1 } } });
    assert.equal(bad.status, 400);
  });
});
