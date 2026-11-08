// The AI fallback behind the module creator's "Learning outcomes" box.
// In DEMO_MODE the route returns a fixed sample so the UI path is exercised without a provider.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call, dropTestDatabase } from './helpers.js';

let api;
let token;

before(async () => {
  await dropTestDatabase();
  api = await bootApi();
  const res = await call(api.base, '/api/auth/register', {
    method: 'POST',
    body: { name: 'Outcome Tester', email: 'outcomes@local.test', password: 'Outcomes123' },
  });
  assert.equal(res.status, 201, 'test user must be created');
  token = res.body.token;
});

after(async () => {
  await api?.close();
  await dropTestDatabase();
});

describe('POST /api/modules/suggest-outcomes', () => {
  it('refuses anonymous callers, because it spends the owner\'s AI quota', async () => {
    const res = await call(api.base, '/api/modules/suggest-outcomes', {
      method: 'POST',
      body: { text: 'Normalisation removes redundancy from a relational database.' },
    });
    assert.equal(res.status, 401);
  });

  it('rejects text too short to hold an outcome', async () => {
    const res = await call(api.base, '/api/modules/suggest-outcomes', {
      method: 'POST',
      token,
      body: { text: 'too short' },
    });
    assert.equal(res.status, 400);
  });

  it('returns outcome lines for usable notes', async () => {
    const text = [
      'Unit 4: Database design',
      'Normalisation removes redundancy from a relational database.',
      'First normal form requires atomic values in every column.',
      'Indexes speed up reads but slow down writes.',
    ].join('\n');

    const res = await call(api.base, '/api/modules/suggest-outcomes', {
      method: 'POST',
      token,
      body: { text, title: 'Database Administration' },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.outcomes), 'outcomes must be an array');
    assert.ok(res.body.outcomes.length > 0, 'at least one outcome');
    assert.ok(res.body.outcomes.every((line) => typeof line === 'string' && line.trim().length > 0));
  });

  it('caps what it sends onwards at 8k characters instead of failing on a huge document', async () => {
    const res = await call(api.base, '/api/modules/suggest-outcomes', {
      method: 'POST',
      token,
      body: { text: 'Normalisation removes redundancy. '.repeat(20000) },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.outcomes.length > 0);
  });
});
