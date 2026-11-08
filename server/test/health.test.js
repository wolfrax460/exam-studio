// Health check endpoint tests. The endpoint now reports the full health shape the app and its
// admin/deployment tooling expect (status, service, ok, version, provider, storage, ...), while
// keeping the required public health fields (status: 'ok', service: 'exam-studio-api').
// See TEST 04 backward-compatibility audit.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bootApi, call } from './helpers.js';

describe('GET /api/health', () => {
  it('returns HTTP 200 with the required public fields', async () => {
    const api = await bootApi();
    try {
      const { status, body } = await call(api.base, '/api/health');
      assert.equal(status, 200);
      assert.equal(body.status, 'ok');
      assert.equal(body.service, 'exam-studio-api');
    } finally {
      await api.close();
    }
  });

  it('does not require a token', async () => {
    const api = await bootApi();
    try {
      const { status } = await call(api.base, '/api/health');
      assert.equal(status, 200);
    } finally {
      await api.close();
    }
  });

  it('keeps the original fields that the client, desktop and live-check tooling read', async () => {
    const api = await bootApi();
    try {
      const { status, body } = await call(api.base, '/api/health');
      assert.equal(status, 200);
      assert.equal(body.ok, true);
      assert.ok(body.version);
      assert.ok(typeof body.demo === 'boolean');
      assert.ok(typeof body.provider === 'string');
      assert.ok(typeof body.providerId === 'string');
      assert.ok(body.model !== undefined || body.model === null);
      assert.ok(typeof body.defaultAI === 'boolean');
      assert.ok(body.storage?.backend);
      assert.ok(typeof body.storage?.connected === 'boolean');
      assert.equal(body.authRequired, true);
      assert.ok(body.sessionDays);
      assert.equal(typeof body.user, 'object');
    } finally {
      await api.close();
    }
  });

  it('never leaks an authenticated user on an anonymous request', async () => {
    const api = await bootApi();
    try {
      const { body } = await call(api.base, '/api/health');
      assert.equal(body.user, null);
    } finally {
      await api.close();
    }
  });
});
