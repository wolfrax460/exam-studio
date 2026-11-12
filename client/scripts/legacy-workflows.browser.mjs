import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { chromium } from 'playwright';

process.env.DOTENV_CONFIG_PATH = path.join(tmpdir(), 'exam-studio-legacy-' + randomUUID() + '.env');
process.env.TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017';
const { bootApi, call, makeUser } = await import('../../server/test/helpers.js');
const button = (page, name) => page.getByRole('button', { name, exact: true });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const studioTab = (page, name) => page.getByRole('tablist', { name: 'Paper Studio views' }).getByRole('tab', { name, exact: true });
const source = 'Learning outcome: Explain relational databases. A database stores tables. Primary keys identify rows, while foreign keys connect tables. Café inventory uses those relationships.';

async function checkOverflow(page, stage) {
  const dimensions = await page.evaluate(() => [window.innerWidth, document.documentElement.scrollWidth]);
  assert.ok(dimensions[1] <= dimensions[0], stage + ' has horizontal overflow at ' + dimensions[0] + ' pixels');
}

async function captureDownload(page, label) {
  const ready = page.waitForEvent('download');
  await button(page, label).click();
  const download = await ready;
  assert.equal(await download.failure(), null);
  return readFile(await download.path());
}

test('legacy personal workspace and online exam journeys', { timeout: 240_000 }, async (t) => {
  const api = await bootApi({ SMTP_HOST: '', EMAIL_PROVIDER: '', UPDATE_REPO: '', UPDATE_FEED_URL: '',
    EXAM_STUDIO_MASTER_KEY: randomBytes(32).toString('hex') });
  t.after(() => api.close());
  assert.equal((await call(api.base, '/api/health')).body.storage.backend, 'mongodb');
  const browser = await chromium.launch({ channel: process.env.EXAM_STUDIO_BROWSER_CHANNEL || undefined });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const pageErrors = [];
  await context.route((url) => url.origin !== api.base, (route) => route.abort());
  const teacher = await context.newPage();
  teacher.setDefaultTimeout(12_000);
  teacher.on('pageerror', (error) => pageErrors.push(error.message));
  const account = { email: 'legacy-' + randomUUID() + '@example.com', password: 'CourseNotes1', name: 'Legacy Teacher' };

  await teacher.goto(api.base + '/app');
  await checkOverflow(teacher, 'sign in');
  await button(teacher, 'Create an account').click();
  await teacher.getByLabel('Your name').fill(account.name);
  await teacher.getByLabel('Email address').fill(account.email);
  await teacher.getByLabel('Password', { exact: true }).fill(account.password);
  const registered = teacher.waitForResponse((res) => res.url().endsWith('/api/auth/register'));
  await button(teacher, 'Create account').click();
  assert.equal((await registered).status(), 201);
  await heading(teacher, 'Study Guide').waitFor();
  await teacher.locator('.sidebar-signout').click();
  await heading(teacher, 'Welcome back').waitFor();
  await teacher.getByLabel('Email address').fill(account.email);
  await teacher.getByLabel('Password', { exact: true }).fill(account.password);
  const signedIn = teacher.waitForResponse((res) => res.url().endsWith('/api/auth/login'));
  await button(teacher, 'Sign in').click();
  const session = await (await signedIn).json();
  assert.ok(session.token);
  await heading(teacher, 'Study Guide').waitFor();

  await button(teacher, 'Settings').first().click();
  const settings = teacher.getByRole('dialog', { name: 'AI settings' });
  await settings.getByLabel('Provider', { exact: true }).first().selectOption('openai');
  await settings.getByLabel(/^Model /).first().fill('legacy-fixture-model');
  await settings.getByLabel(/^API key /).first().fill('fixture-key');
  await button(settings, 'Save my provider').click();
  await settings.getByText(/Your provider settings were saved/).waitFor();
  await button(settings, 'Close settings').click();

  await teacher.locator('.source-picker input[type=file]').first().setInputFiles([
    { name: 'module.md', mimeType: 'text/markdown', buffer: Buffer.from(source) },
    { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
  ]);
  await teacher.getByText('This file is empty.', { exact: true }).waitFor();
  await teacher.getByRole('tab', { name: 'Paste text' }).first().click();
  assert.equal(await teacher.getByLabel('Paste your notes').first().inputValue(), source);
  await button(teacher, 'Generate Study Notes').click();
  await button(teacher, 'Saved to Library').waitFor();
  await button(teacher, 'View in Library').click();
  await heading(teacher, 'Your library').waitFor();
  await button(teacher, 'Open').click();
  await teacher.getByRole('region', { name: 'Study notes preview' }).waitFor();
  assert.equal((await captureDownload(teacher, 'Download Word')).subarray(0, 2).toString(), 'PK');

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 },
    { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await teacher.setViewportSize(viewport);
    await checkOverflow(teacher, 'Study Guide with generated output');
  }
  await button(teacher, 'Switch to light theme').click();
  await checkOverflow(teacher, 'light Study Guide');
  await teacher.setViewportSize({ width: 1366, height: 768 });
  await button(teacher, 'Paper Studio').click();
  await button(teacher, 'Write exam').click();
  await button(teacher, 'Download exam (Word)').waitFor();
  const csv = (await captureDownload(teacher, 'Questions (CSV for Sheets)')).toString('utf8');
  assert.ok(csv.split('\r\n').length > 2);
  await button(teacher, 'Save to library').click();
  await studioTab(teacher, 'My Papers').click();
  await heading(teacher, 'Saved papers').waitFor();
  await button(teacher, 'Open').click();
  await heading(teacher, 'Publish online').waitFor();
  await button(teacher, 'Publish online').click();
  await button(teacher, 'Copy student link').waitFor();

  await studioTab(teacher, 'Modules').click();
  const moduleForm = teacher.locator('form.esx-module-form');
  await moduleForm.getByLabel('Module code').fill('DB101');
  await moduleForm.getByLabel('Module title').fill('Database practice');
  await moduleForm.getByLabel(/^Learning outcomes - one per line/).fill('Explain database keys');
  await button(moduleForm, 'Create module').click();
  await heading(teacher, 'Add a question to DB101').waitFor();
  await button(teacher, 'True or false').click();
  await teacher.getByLabel('Question', { exact: true }).fill('A primary key identifies a record.');
  await button(teacher, 'Add question').click();
  await teacher.getByText('Question added to the bank.', { exact: true }).waitFor();
  await studioTab(teacher, 'Question Bank').click();
  await teacher.getByText('A primary key identifies a record.', { exact: true }).waitFor();
  await checkOverflow(teacher, 'Question Bank');

  await studioTab(teacher, 'Flashcards').click();
  await button(teacher, 'Make flashcards').click();
  await button(teacher, 'Show all answers').click();
  assert.ok((await captureDownload(teacher, 'Download for Quizlet (TSV)')).toString().includes('\t'));
  await button(teacher, 'Save to library').click();

  const exam = await call(api.base, '/api/library', { method: 'POST', token: session.token,
    body: { kind: 'exam', title: 'Synthetic review', data: { sections: [
      { id: 'A', kind: 'mcq', marksPerItem: 1, items: [{ id: 'objective', text: 'Pick a primary key.', options: ['Unique ID', 'Name'], answer: 'A' }] },
      { id: 'D', kind: 'short_answer', items: [{ id: 'written', text: 'Explain why the ID matters.', answer: 'IDs identify one record.', marks: 3 }] },
    ] } } });
  assert.equal(exam.status, 201);
  const examPath = '/api/exams/' + exam.body.id;
  const published = await call(api.base, examPath + '/publish', { method: 'POST', token: session.token,
    body: { requireName: false, showResultsMode: 'immediately', durationMinutes: 10 } });
  assert.equal(published.status, 201);
  const shareCode = published.body.publication.shareCode;
  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  student.setDefaultTimeout(12_000);
  student.on('pageerror', (error) => pageErrors.push(error.message));
  await student.route((url) => url.origin !== api.base, (route) => route.abort());
  await student.goto(api.base + '/take/' + shareCode);
  await button(student, 'Start exam').click();
  await student.getByLabel('A. Unique ID').check();
  await button(student, 'Next').click();
  const written = 'The ID keeps records distinct.';
  const autosaved = student.waitForResponse((res) => res.request().method() === 'PUT' && res.url().endsWith('/answers')
    && res.request().postDataJSON().answers?.written === written);
  await student.getByLabel('Your answer').fill(written);
  const savedAnswers = await autosaved;
  assert.equal(savedAnswers.status(), 200);
  const attemptId = new URL(savedAnswers.url()).pathname.split('/').at(-2);
  await checkOverflow(student, 'student attempt');
  student.once('dialog', (dialog) => dialog.accept());
  await button(student, 'Submit').click();
  await student.getByText('Written answers are awaiting teacher review.').waitFor();
  const ownerPath = examPath + '/attempts/' + attemptId;
  const other = await makeUser(api.base);
  assert.equal((await call(api.base, ownerPath)).status, 401);
  assert.equal((await call(api.base, ownerPath, { token: other.token })).status, 404);
  const reviewed = await call(api.base, ownerPath, { token: session.token });
  assert.equal(reviewed.body.attempt.score.perQuestion.find(({ questionId }) => questionId === 'objective').awarded, 1);
  const override = await call(api.base, ownerPath + '/score', { method: 'PATCH', token: session.token,
    body: { perQuestion: [{ questionId: 'written', awarded: 2.5 }] } });
  assert.equal(override.status, 200);
  await button(student, 'Refresh result').click();
  await student.getByText('3.5 / 4', { exact: true }).waitFor();
  assert.deepEqual(pageErrors, []);
});
