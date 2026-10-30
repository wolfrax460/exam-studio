// End-to-end check against a running app, using the same HTTP calls the browser makes.
//
//   npm run live-check                                  # API on http://127.0.0.1:3001
//   E2E_BASE=http://127.0.0.1:4000 npm run live-check
//
// It registers one throwaway account. When the configured database is reachable the account is
// deleted again at the end; otherwise the address is printed so it can be removed by hand.
import 'dotenv/config';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3001';
const email = `dsh.e2e.${Date.now()}@example.com`;
const password = 'Str0ngPass1';

let failures = 0;
const check = (label, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

const json = async (path, { method = 'GET', token, body } = {}) => {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, headers: response.headers, body: type.includes('json') ? await response.json() : await response.text() };
};

// 1. health
const health = await json('/api/health');
check('GET /api/health is public', health.status === 200, `provider=${health.body.provider} demo=${health.body.demo} storage=${health.body.storage?.backend} v${health.body.version}`);
check('health reports the storage backend', ['mongodb', 'file'].includes(health.body.storage?.backend));

// 2. register
const reg = await json('/api/auth/register', { method: 'POST', body: { email, password, name: 'E2E Tester' } });
check('POST /api/auth/register creates the account', reg.status === 201, `${reg.status} ${reg.body?.error || reg.body?.user?.email || ''}`);
if (reg.status === 429) {
  // Registration is limited to REGISTER_LIMIT_PER_HOUR per address (10 by default). Running this
  // script repeatedly hits that on purpose; everything below needs an account, so stop here
  // instead of reporting a wall of misleading failures.
  console.log('\nStopped: this address has created too many accounts in the last hour (that limit is working).');
  console.log('Wait for the window to pass, raise REGISTER_LIMIT_PER_HOUR, or restart the server to clear the counter.');
  process.exitCode = 1;
  process.exit(1);
}
const token = reg.body?.token;

// 3. duplicate + bad password
const dupe = await json('/api/auth/register', { method: 'POST', body: { email: email.toUpperCase(), password, name: 'Copy' } });
check('a duplicate account is refused with 409', dupe.status === 409, dupe.body?.error);

const weak = await json('/api/auth/register', { method: 'POST', body: { email: `weak.${Date.now()}@example.com`, password: 'weakpassword', name: 'W' } });
check('a weak password is refused with 400', weak.status === 400, weak.body?.error);

// 4. login
const login = await json('/api/auth/login', { method: 'POST', body: { email, password } });
check('POST /api/auth/login signs in', login.status === 200 && Boolean(login.body.token));

const wrong = await json('/api/auth/login', { method: 'POST', body: { email, password: 'Wr0ngPassword' } });
check('a wrong password is refused with 401', wrong.status === 401, wrong.body?.error);

// 5. session
const me = await json('/api/auth/me', { token });
check('GET /api/auth/me returns the signed-in user', me.status === 200 && me.body.user?.email === email);
const anon = await json('/api/auth/me');
check('GET /api/auth/me says "signed out" without a token', anon.status === 200 && anon.body.user === null);
const denied = await json('/api/library');
check('GET /api/library needs a token', denied.status === 401, denied.body?.error);

// 6. library
const saved = await json('/api/library', { method: 'POST', token, body: { kind: 'exam', data: { title: 'E2E exam', questions: [] } } });
check('POST /api/library saves an item', saved.status === 201, saved.body?.id);
const list = await json('/api/library', { token });
check('GET /api/library lists it', list.status === 200 && list.body.some((i) => i.id === saved.body.id));
const badId = await json('/api/library/not-an-objectid', { token });
check('a malformed library id gives 404, not 500', badId.status === 404, `status ${badId.status}`);
const removed = await json(`/api/library/${saved.body.id}`, { method: 'DELETE', token });
check('DELETE /api/library/:id removes it', removed.status === 204);

// 7. settings
const settings = await json('/api/settings', { token });
check('GET /api/settings describes the providers', settings.status === 200 && Array.isArray(settings.body.providers), `active=${settings.body.active} canChange=${settings.body.canChange} providers=${settings.body.providers?.length}`);
check('settings tell the client whether it may change them', typeof settings.body.canChange === 'boolean');

// 8. multipart upload (this used to fail: the client sent Content-Type: application/json)
const notes = `# Database normalisation\n\n${'Normalisation removes redundancy. '.repeat(12)}\n`;
const form = new FormData();
form.append('file', new Blob([notes], { type: 'text/markdown' }), 'normalisation.md');
const uploadResponse = await fetch(`${BASE}/api/extract`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
const uploaded = await uploadResponse.json();
check('POST /api/extract accepts a real multipart upload', uploadResponse.status === 200 && uploaded.chars > 50, `status ${uploadResponse.status} chars=${uploaded.chars} ${uploaded.error || ''}`);

// 9. generation (DEMO_MODE=1 on this server) and export
const exam = await json('/api/exams/generate', {
  method: 'POST', token,
  body: { text: notes.repeat(3), title: 'Database', level: 'L4', totalMarks: 35, types: ['sequencing', 'matching', 'mcq', 'select_all', 'true_false', 'short_answer', 'essay'], essayCount: 1 },
});
check('POST /api/exams/generate returns an exam', exam.status === 200 && exam.body.questions?.length > 0, `${exam.body.questions?.length} questions, ${exam.body.totalMarks} marks`);

const notesDoc = await json('/api/notes/generate', { method: 'POST', token, body: { text: notes.repeat(3), title: 'Database' } });
check('POST /api/notes/generate returns study notes', notesDoc.status === 200 && notesDoc.body.sections?.length > 0, `${notesDoc.body.sections?.length} sections`);

const docx = await fetch(`${BASE}/api/export/exam-docx`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ exam: exam.body, meta: { module: 'Database', level: 'L4' } }),
});
const docxBytes = Buffer.from(await docx.arrayBuffer());
check('POST /api/export/exam-docx returns a Word file', docx.status === 200 && docxBytes.subarray(0, 2).toString() === 'PK', `${docxBytes.length} bytes, ${docx.headers.get('content-type')}`);

const csv = await fetch(`${BASE}/api/export/exam-csv`, {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ exam: exam.body }),
});
const csvText = await csv.text();
check('POST /api/export/exam-csv returns CSV', csv.status === 200 && csvText.length > 20, `${csvText.split('\n').length} lines`);

// 10. bad input must not crash the server
const noBody = await json('/api/auth/register', { method: 'POST', body: {} });
check('an empty register body gives 400', noBody.status === 400, noBody.body?.error);
const nonsense = await json('/api/exams/generate', { method: 'POST', token, body: { text: 'x'.repeat(200), types: ['telepathy'] } });
check('an unknown question type gives 400', nonsense.status === 400, nonsense.body?.error);
const stillAlive = await json('/api/health');
check('the server is still healthy afterwards', stillAlive.status === 200);

// Clean up after ourselves: remove the account this check created (and anything it saved).
let cleaned = false;
try {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017/examstudio', { serverSelectionTimeoutMS: 2000 });
  await client.connect();
  const db = client.db();
  const user = await db.collection('users').findOne({ email });
  if (user) {
    await db.collection('libraryitems').deleteMany({ userId: user._id });
    await db.collection('users').deleteOne({ _id: user._id });
    cleaned = true;
  }
  await client.close();
} catch {
  // No database (the app is using the file store), so there is nothing to clean up here.
}

console.log(cleaned ? 'the throwaway account was deleted again' : `note: remove the throwaway account ${email} if it was stored in a file`);
console.log(failures === 0 ? 'LIVE CHECK OK' : `LIVE CHECK FAILURES: ${failures}`);
process.exitCode = failures === 0 ? 0 : 1;
