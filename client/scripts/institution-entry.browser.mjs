import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, it } from 'node:test';
import { chromium } from 'playwright';

// Exercise the built frontend against the real API on a loopback port and a disposable database.
process.env.DOTENV_CONFIG_PATH = path.join(tmpdir(), `exam-studio-browser-${randomUUID()}.env`);
process.env.TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017';
const { bootApi, call, makeUser } = await import('../../server/test/helpers.js');
const screenshotDir = process.env.EXAM_STUDIO_SCREENSHOTS;
const browserChannel = process.env.EXAM_STUDIO_BROWSER_CHANNEL;
const pageErrors = [];
let api;
let browser;
let owner;
let reviewer;
let teacher;
let member;
let alpha;
let beta;
let repo;

const application = (name) => ({ name, type: 'school', country: 'Rwanda', contactEmail: 'office@example.com' });
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const accountMode = (page, mode) => page.getByRole('radio', { name: new RegExp(mode) });
const identity = (account) => account.response.body.user.id;

async function makeAccount(name) {
  const account = await makeUser(api.base, { name, email: `${name.toLowerCase().replaceAll(' ', '.')}@example.com` });
  assert.equal(account.response.status, 201);
  return account;
}

async function review(id, version, status) {
  const response = await call(api.base, `/api/admin/institutions/${id}/status`, {
    method: 'PUT', token: reviewer.token, body: { status, version },
  });
  assert.equal(response.status, 200);
  return response.body;
}

async function createWorkspace(name) {
  const response = await call(api.base, '/api/institutions/requests', {
    method: 'POST', token: owner.token, body: application(name),
  });
  assert.equal(response.status, 201);
  return review(response.body.id, 0, 'active');
}

async function newPage(t, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark' });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return page;
}

async function capture(page, name) {
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(hasOverflow, false, `horizontal overflow in ${name}`);
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `${name}.png`), animations: 'disabled' });
}

async function signIn(page, account, institution = true) {
  await page.goto(`${api.base}/app${institution ? '?intent=institution' : ''}`);
  await page.getByLabel('Email address').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await button(page, 'Sign in').click();
}

async function invite(account, workspace, role) {
  const result = await fetch(`${api.base}/api/institutions/members/invitations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${owner.token}`, 'X-Institution-Id': workspace.id, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, role }),
  });
  assert.equal(result.status, 201);
  return (await result.json()).code;
}

async function expectDenied(account, endpoint, workspace, status) {
  const response = await fetch(`${api.base}${endpoint}`, {
    headers: { Authorization: `Bearer ${account.token}`, 'X-Institution-Id': workspace.id },
  });
  assert.equal(response.status, status);
}

before(async () => {
  api = await bootApi({
    EXAM_STUDIO_INSTITUTIONS_ENABLED: 'true', EXAM_STUDIO_SUPERADMIN_IDS: '',
    SMTP_HOST: '', UPDATE_REPO: '', UPDATE_FEED_URL: '',
  });
  assert.equal((await call(api.base, '/api/health')).body.storage.backend, 'mongodb');
  owner = await makeAccount('Review School Owner');
  reviewer = await makeAccount('Platform Reviewer');
  teacher = await makeAccount('Review Teacher');
  member = await makeAccount('Review Member');
  process.env.EXAM_STUDIO_SUPERADMIN_IDS = identity(reviewer);
  alpha = await createWorkspace('Greenfield Academy');
  beta = await createWorkspace('Riverbank School');
  const memberCode = await invite(member, beta, 'member');
  const joined = await call(api.base, '/api/institutions/invitations/accept', {
    method: 'POST', token: member.token, body: { code: memberCode },
  });
  assert.equal(joined.status, 200);
  repo = await import('../../server/lib/workspaceRepository.js');
  browser = await chromium.launch(browserChannel ? { channel: browserChannel } : {});
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
});

after(async () => {
  try { await browser?.close(); } finally { await api?.close(); }
  assert.deepEqual(pageErrors, []);
});

it('keeps the personal login compatible and carries inline institution intent through auth screens', { timeout: 45_000 }, async (t) => {
  const page = await newPage(t);
  const requests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/institutions/')) requests.push(request);
  });
  await page.goto(`${api.base}/app`);
  assert.equal(await accountMode(page, 'Personal Account').isChecked(), true);
  await page.getByLabel('Email address').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await accountMode(page, 'Institution Account').check();
  assert.equal(await page.getByLabel('Email address').inputValue(), owner.email);
  assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), owner.password);
  await page.getByText('Sign in with your Exam Studio account to access, join, or register an institution.').waitFor();
  await capture(page, '01-desktop-institution-login');
  await button(page, 'Create an account').click();
  assert.match(page.url(), /intent=institution/);
  assert.equal(await accountMode(page, 'Institution Account').isChecked(), true);
  await button(page, 'Sign in').click();
  await button(page, 'Forgot password?').click();
  await heading(page, 'Reset your password').waitFor();
  await button(page, 'Back to sign in').click();
  assert.equal(await accountMode(page, 'Institution Account').isChecked(), true);
  await page.getByLabel('Password', { exact: true }).fill('IncorrectPassword1');
  await button(page, 'Sign in').click();
  await page.getByRole('alert').getByText('Email or password is not correct.').waitFor();
  assert.equal(requests.length, 0);
  await accountMode(page, 'Personal Account').check();
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  const loginRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/login'));
  await button(page, 'Sign in').click();
  const payload = (await loginRequest).postDataJSON();
  assert.deepEqual(Object.keys(payload).sort(), ['email', 'password']);
  assert.equal(payload.email, owner.email);
  await heading(page, 'Study Guide').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('intent'), false);
  await button(page, 'Institutions').click();
  await heading(page, 'Institution Access').waitFor();
  await button(page, 'Open workspace Greenfield Academy').waitFor();
  await button(page, 'Open workspace Riverbank School').waitFor();
  await capture(page, '02-desktop-access-hub');
  await button(page, 'Switch to light theme').click();
  await page.locator('html[data-theme="light"]').waitFor();
  await capture(page, '09-light-theme-access-hub');
});

it('signs up on mobile, distinguishes empty and failed loads, and follows a real application through review', { timeout: 60_000 }, async (t) => {
  const page = await newPage(t, { width: 390, height: 844 });
  await page.goto(`${api.base}/app?intent=institution&auth=signup`);
  assert.equal(await accountMode(page, 'Institution Account').isChecked(), true);
  await capture(page, '03-mobile-institution-signup');
  await page.getByLabel('Your name').fill('North Hill Applicant');
  await page.getByLabel('Email address').fill('applicant@example.com');
  await page.getByLabel('Password', { exact: true }).fill('DemoApplicant123');
  const pathPattern = '**/api/institutions/workspaces';
  let releaseFailure;
  const holdFailure = new Promise((resolve) => { releaseFailure = resolve; });
  await page.route(pathPattern, async (route) => {
    await holdFailure;
    await route.fulfill({ status: 503, json: { error: 'Temporary test interruption' } });
  }, { times: 1 });
  await button(page, 'Create account').click();
  await heading(page, 'Institution Access').waitFor();
  await page.getByText('Checking your institution access…', { exact: true }).waitFor();
  releaseFailure();
  await page.getByText(/Could not load institution access/).waitFor();
  assert.equal(await page.getByText(/don’t have access to an institution workspace/).count(), 0);
  await button(page, 'Try again').click();
  await page.getByText(/don’t have access to an institution workspace/).waitFor();
  await capture(page, '04-mobile-empty-access');
  await button(page, 'Register an institution').click();
  const dialog = page.getByRole('dialog', { name: 'Institution registration' });
  await dialog.getByLabel('Institution name').fill('North Hill School');
  await dialog.getByLabel('Institution type').selectOption('school');
  await dialog.getByLabel('Country').fill('Rwanda');
  await dialog.getByLabel('Contact email').fill('office@example.com');
  await capture(page, '05-mobile-application');
  await button(dialog, 'Submit application').click();
  const applicationList = page.getByRole('region', { name: 'Your applications' });
  await applicationList.getByText('Pending review', { exact: true }).waitFor();
  assert.equal(await button(page, 'Open workspace North Hill School').count(), 0);
  await page.reload();
  await applicationList.getByText('Pending review', { exact: true }).waitFor();
  await applicationList.scrollIntoViewIfNeeded();
  await capture(page, '06-mobile-pending-review');
  const pending = await call(api.base, '/api/admin/institutions?status=pending', { token: reviewer.token });
  const submitted = pending.body.items.filter(({ name }) => name === 'North Hill School');
  assert.equal(submitted.length, 1);
  const approved = await review(submitted[0].id, submitted[0].version, 'active');
  await button(page, 'Refresh status').click();
  await button(page, 'Open approved workspace North Hill School').click();
  await heading(page, 'North Hill School').waitFor();
  await page.getByText('Institution administrator', { exact: true }).waitFor();
  await button(page, 'Manage classes').click();
  await button(page, 'Add class').waitFor();
  await review(approved.id, approved.version, 'suspended');
  await button(page, 'Member directory').click();
  await heading(page, 'Workspace access is unavailable').waitFor();
  assert.equal(await heading(page, 'North Hill School').count(), 0);
  await button(page, 'Back to Institution Access').click();
  await applicationList.getByText('Suspended', { exact: true }).waitFor();
  assert.equal(await button(page, 'Open workspace North Hill School').count(), 0);
  await button(page, 'Continue to Personal Workspace').click();
  await heading(page, 'Study Guide').waitFor();
});

it('checks invitation codes and restricts teacher and member navigation', { timeout: 60_000 }, async (t) => {
  const page = await newPage(t);
  const expired = randomBytes(32).toString('base64url');
  await repo.inviteWorkspaceMember({
    userId: identity(teacher), institutionId: beta.id, email: teacher.email, role: 'teacher', invitedBy: identity(owner),
    inviteHash: createHash('sha256').update(expired).digest('hex'), inviteExpiresAt: new Date(Date.now() - 60_000),
  });
  const valid = await invite(teacher, alpha, 'teacher');
  await signIn(page, teacher);
  await button(page, 'Enter invitation code').click();
  const dialog = page.getByRole('dialog', { name: 'Join an institution' });
  for (const code of [randomBytes(32).toString('base64url'), expired]) {
    await dialog.getByLabel('Invitation code').fill(code);
    const response = page.waitForResponse((result) => result.url().endsWith('/api/institutions/invitations/accept'));
    await button(dialog, 'Join institution').click();
    assert.equal((await response).status(), 404);
    await dialog.getByRole('alert').getByText(/invalid, expired or unavailable/).waitFor();
  }
  await dialog.getByLabel('Invitation code').fill(valid);
  await button(dialog, 'Join institution').click();
  await heading(page, 'Institution Access').waitFor();
  await page.getByText(/Invitation accepted/).waitFor();
  await button(page, 'Open workspace Greenfield Academy').click();
  await heading(page, 'Greenfield Academy').waitFor();
  assert.equal(await button(page, 'Invite a member').count(), 0);
  await button(page, 'View academics').click();
  await page.getByRole('region', { name: 'Academic structure' }).waitFor();
  assert.equal(await button(page, 'Add academic year').count(), 0);
  await expectDenied(teacher, '/api/institutions/workspace/overview', beta, 404);
  await expectDenied(owner, '/api/admin/institutions', alpha, 403);

  const memberPage = await newPage(t);
  await signIn(memberPage, member);
  await button(memberPage, 'Open workspace Riverbank School').click();
  await heading(memberPage, 'Riverbank School').waitFor();
  await button(memberPage, 'View member directory').waitFor();
  assert.equal(await button(memberPage, 'Academics').count(), 0);
  await expectDenied(member, '/api/institutions/academics', beta, 403);
});

it('ignores a delayed response after switching tenants or signing out', { timeout: 45_000 }, async (t) => {
  const page = await newPage(t);
  await signIn(page, owner);
  await button(page, 'Open workspace Greenfield Academy').click();
  await heading(page, 'Greenfield Academy').waitFor();
  const pattern = /\/api\/institutions\/members\?page=1$/;
  async function holdDirectoryResponse() {
    let release;
    let finished;
    let started;
    const held = new Promise((resolve) => { release = resolve; });
    const ready = new Promise((resolve) => { started = resolve; });
    const completed = new Promise((resolve) => { finished = resolve; });
    await page.route(pattern, async (route) => {
      started();
      await held;
      try { await route.fulfill({ status: 401, json: { error: 'Stale workspace response' } }); }
      catch { /* The scoped request may already have been aborted. */ }
      finally { finished(); }
    }, { times: 1 });
    await button(page, 'Member directory').click();
    await ready;
    return async () => { release(); await completed; };
  }
  const releaseAlpha = await holdDirectoryResponse();
  await page.getByRole('combobox', { name: 'Workspace' }).selectOption(beta.id);
  await heading(page, 'Riverbank School').waitFor();
  await releaseAlpha();
  assert.equal(await heading(page, 'Greenfield Academy').count(), 0);
  assert.equal(await heading(page, 'Riverbank School').isVisible(), true);
  await capture(page, '07-desktop-institution-overview');
  const releaseBeta = await holdDirectoryResponse();
  await button(page, 'Sign out').click();
  await heading(page, 'Welcome back').waitFor();
  await releaseBeta();
  await signIn(page, teacher, false);
  await heading(page, 'Study Guide').waitFor();
  const picker = page.getByRole('combobox', { name: 'Workspace' });
  await picker.getByRole('option', { name: 'Greenfield Academy' }).waitFor({ state: 'attached' });
  assert.equal(await picker.getByRole('option', { name: 'Riverbank School' }).count(), 0);
});

it('preserves the Coming Soon fallback and personal sign-in when disabled', { timeout: 35_000 }, async (t) => {
  process.env.EXAM_STUDIO_INSTITUTIONS_ENABLED = 'false';
  t.after(() => { process.env.EXAM_STUDIO_INSTITUTIONS_ENABLED = 'true'; });
  const page = await newPage(t);
  const requests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/institutions/')) requests.push(request);
  });
  await page.goto(`${api.base}/app?intent=institution`);
  await page.getByRole('button', { name: /Institution Account/ }).click();
  const dialog = page.getByRole('dialog', { name: /Coming Soon/ });
  await dialog.waitFor();
  await capture(page, '08-disabled-coming-soon');
  await button(dialog, 'Back to Personal Account').click();
  await page.getByLabel('Email address').fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await button(page, 'Sign in').click();
  await heading(page, 'Study Guide').waitFor();
  assert.equal(requests.length, 0);
});
