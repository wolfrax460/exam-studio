import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeBaseURL } from '../lib/ssrf.js';

describe('AI provider URL SSRF protection', () => {
  it('rejects plain http to loopback', async () => {
    await assert.rejects(() => assertSafeBaseURL('http://127.0.0.1:8080/v1'), /https|private|reserved/i);
  });
  it('rejects the cloud metadata address', async () => {
    await assert.rejects(() => assertSafeBaseURL('http://169.254.169.254/latest/meta-data'), /https|private|reserved/i);
  });
  it('rejects a private literal address even over https', async () => {
    await assert.rejects(() => assertSafeBaseURL('https://192.168.1.10/v1'), /private|reserved/i);
  });
  it('rejects a hostname that resolves to loopback', async () => {
    await assert.rejects(() => assertSafeBaseURL('https://localhost/v1'), /private|reserved/i);
  });
});
