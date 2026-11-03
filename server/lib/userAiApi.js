import { assertSafeBaseURL, safeFetch } from './ssrf.js';

const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

function providerError(status, text, provider) {
  const label = provider || 'Provider';
  if (status === 401 || status === 403) return fail('invalid_key', `${label} rejected the API key.`);
  if (status === 402 || /balance|credit|quota/i.test(text)) return fail('no_balance', `${label} has no balance or quota left.`);
  if (status === 404) return fail('model_not_found', `${label} did not recognise that model or address.`);
  if (status === 429) return fail('provider_rate_limited', `${label} is rate-limiting requests. Try again shortly.`);
  return fail('unreachable', `${label} returned HTTP ${status}.`);
}

export async function listProviderModelIds(cfg) {
  if (!cfg?.baseURL) throw fail('unreachable', 'Set a base URL first.');
  if (cfg.protocol === 'cli') throw fail('unreachable', 'Terminal providers do not list models.');
  const base = String(cfg.baseURL).replace(/\/+$/, '');
  const url = cfg.protocol === 'anthropic' ? `${base}/v1/models` : `${base}/models`;
  await assertSafeBaseURL(url);
  const headers = cfg.protocol === 'anthropic'
    ? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${cfg.apiKey}` };
  const { response, text } = await safeFetch(url, { method: 'GET', headers, timeoutMs: 20000 });
  if (!response.ok) throw providerError(response.status, text, cfg.label);
  let data;
  try { data = JSON.parse(text); } catch { throw fail('unreachable', `${cfg.label} returned a non-JSON model list.`); }
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return rows.map((m) => m.id || m.name || m.model).filter(Boolean).sort();
}

export async function testProviderConnection(cfg) {
  if (!cfg?.baseURL) throw fail('unreachable', 'Set a base URL first.');
  if (!cfg?.model) throw fail('model_not_found', 'Choose a model first.');
  if (!cfg?.apiKey && cfg.needsKey) throw fail('invalid_key', 'Paste an API key first.');
  const base = String(cfg.baseURL).replace(/\/+$/, '');
  const started = Date.now();
  if (cfg.protocol === 'anthropic') {
    const url = `${base}/v1/messages`;
    await assertSafeBaseURL(url);
    const { response, text } = await safeFetch(url, {
      method: 'POST', timeoutMs: 20000,
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: cfg.model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] }),
    });
    if (!response.ok) throw providerError(response.status, text, cfg.label);
    return { ms: Date.now() - started, sample: 'OK' };
  }
  const url = `${base}/chat/completions`;
  await assertSafeBaseURL(url);
  const { response, text } = await safeFetch(url, {
    method: 'POST', timeoutMs: 20000,
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model: cfg.model, max_tokens: 8, messages: [{ role: 'user', content: 'Reply OK' }] }),
  });
  if (!response.ok) throw providerError(response.status, text, cfg.label);
  let data = {};
  try { data = JSON.parse(text); } catch {}
  const sample = String(data?.choices?.[0]?.message?.content || 'OK').slice(0, 80);
  return { ms: Date.now() - started, sample };
}
