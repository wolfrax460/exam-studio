import { bootApi, call, makeUser, dropTestDatabase } from './test/helpers.js';
(async () => {
  const api = await bootApi({ DEMO_MODE: '1', TAKE_LIMIT_PER_HOUR: '10000' });
  await dropTestDatabase();
  const owner = await makeUser(api.base);
  const ownerToken = owner.token;
  const res = await call(api.base, '/api/library', { method: 'POST', token: ownerToken, body: { kind: 'exam', data: { title: 'Marking Test Exam', moduleCode: 'MARK101', moduleName: 'Marking Module', level: 'L4', duration: '3 hours' }, title: 'Marking Test Exam' } });
  console.log('library', res.status);
  const pubRes = await call(api.base, `/api/exams/${res.body.id}/publish`, { method: 'POST', token: ownerToken, body: { durationMinutes: 60, maxAttempts: 3, requireName: false } });
  console.log('publish', pubRes.status);
  const shareCode = pubRes.body.publication.shareCode;
  console.log('shareCode', shareCode);
  for (let i = 0; i < 30; i++) {
    const r = await call(api.base, `/api/take/${shareCode}/start`, { method: 'POST', body: { participantName: 'Diag' } });
    console.log('start', i, '=>', r.status, r.body && r.body.error ? r.body.error : 'ok');
  }
  await api.close();
})();
