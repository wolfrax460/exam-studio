// Talks to whichever AI provider is selected in Settings.
//
// Three protocols are supported behind one interface:
//   anthropic - the Anthropic Messages API (also served by DeepSeek)
//   openai    - the OpenAI-style /chat/completions API (NVIDIA, Ollama, OpenRouter, LM Studio, ...)
//   cli       - a terminal tool that is already signed in (Claude Code, Codex, OpenCode, Gemini CLI)
//
// Every structured call ends in a plain JSON object, so the rest of the server never has to
// know which protocol produced it.
import Anthropic from '@anthropic-ai/sdk';
import { httpError } from './errors.js';
import { resolve, activeProviderId, PROVIDERS } from './providers.js';
import { runCli, cliInstalled } from './cli.js';

// ---------------------------------------------------------------- helpers
const CONTROL_CHARS = /[\u0000-\u001f]/;

// A quote that closes a string is followed by structure. One that is followed by anything else
// is a quote the model forgot to escape, e.g. {"prompt":"What is a "database"?"}.
const CLOSES_STRING = /^\s*(.)/;

// A property name that lost its opening quote: ,options": [...] instead of ,"options": [...].
// Valid JSON outside a string never has a bare word followed by a quote and a colon (true, false
// and null are followed by a comma or a bracket), so this cannot damage good JSON.
const LOOSE_KEY = /^([A-Za-z_][A-Za-z0-9_]*)"(\s*:)/;

/**
 * Last-ditch salvage of a JSON object from a reply that is nearly, but not quite, valid.
 *
 * Small local models break JSON in four predictable ways: a raw newline inside a string, a quote
 * they forgot to escape, a trailing comma, and running out of output mid-object. None of these
 * mean the content is wrong, so the text is rebuilt character by character rather than thrown away.
 * Returns null when the result still is not JSON.
 */
export function repairJson(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  if (start < 0) return null;
  const body = raw.slice(start);

  let out = '';
  let inString = false;
  let escaped = false;
  const open = []; // closing brackets still owed

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];

    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') {
        const after = CLOSES_STRING.exec(body.slice(i + 1))?.[1];
        if (after === undefined || after === ',' || after === '}' || after === ']' || after === ':') {
          inString = false;
          out += ch;
        } else {
          out += '\\"';
        }
        continue;
      }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      if (CONTROL_CHARS.test(ch)) continue; // drop the remaining control characters
      out += ch;
      continue;
    }

    if (ch === '"') { inString = true; out += ch; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      const loose = LOOSE_KEY.exec(body.slice(i));
      if (loose) {
        out += `"${loose[1]}"${loose[2]}`; // put the missing opening quote back
        i += loose[0].length - 1;
        continue;
      }
    }
    if (ch === '{' || ch === '[') { open.push(ch === '{' ? '}' : ']'); out += ch; continue; }
    if (ch === '}' || ch === ']') {
      // A closing bracket that does not match what is open would break the parse: drop it.
      if (open[open.length - 1] !== ch) continue;
      open.pop();
      out += ch;
      continue;
    }
    if (ch === ',') {
      // A comma with only a closing bracket or nothing at all after it is a trailing comma.
      const after = CLOSES_STRING.exec(body.slice(i + 1))?.[1];
      if (after === undefined || after === '}' || after === ']') continue;
    }
    out += ch;
  }

  if (inString) out += '"'; // the reply stopped mid-string
  for (let i = open.length - 1; i >= 0; i--) out += open[i]; // the reply stopped mid-object

  try {
    const parsed = JSON.parse(out);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Pull the first JSON object out of a model reply, with or without a code fence.
export function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  try {
    const direct = JSON.parse(body);
    if (direct && typeof direct === 'object') return direct;
  } catch { /* not plain JSON, scan for the object below */ }

  const start = body.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          break; // nearly there, but malformed: fall through to the repair below
        }
      }
    }
  }
  // Not valid as written. Rebuild it, so one stray quote does not throw away a whole exam.
  return repairJson(body);
}

// The provider's own words, when it sent any. Without this a 429 says "busy or over its limit"
// even when the real reason is, say, that the account has no credit left.
function providerDetail(error) {
  const raw = String(error?.message || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof message === 'string' && message.trim()) return message.trim().replace(/\s+/g, ' ').slice(0, 200);
  } catch { /* not a JSON body */ }
  return raw.replace(/\s+/g, ' ').slice(0, 200);
}

// A friendly message for whatever the provider threw.
export function explainProviderError(error, cfg) {
  const status = error?.status || error?.response?.status;
  // The built-in AI's real provider, endpoint and model are never shown to users.
  if (cfg?.id === 'nvidia') {
    return httpError(status || 502, 'Exam Studio AI is busy / unavailable.');
  }
  const raw = String(error?.message || 'unknown error');
  const label = cfg?.label || 'AI service';
  const detail = providerDetail(error);
  const because = detail && !/^HTTP \d+$/.test(detail) ? ` It said: ${detail}` : '';

  if (status === 401 || status === 403) return httpError(500, `${label} rejected the API key. Check it in Settings, or ${cfg?.keyEnv || 'the key'} in server/.env.`);
  if (status === 402 || (status === 400 && /credit|balance|quota/i.test(raw))) return httpError(402, `The ${label} account has no balance left. Top it up and try again.${because}`);
  if (status === 404) return httpError(502, `${label} did not recognise the model or address. Check the Model and Address in Settings.`);
  if (status === 429) return httpError(429, `${label} is at its limit for now. Wait a minute and try again, or pick another provider in Settings.${because}`);
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return httpError(504, `${label} took too long to answer.`);
  if (error?.code === 'ENOENT') return httpError(400, `${label} was not found on this computer. Install it and sign in once.`);
  if (error?.code === 'ECONNREFUSED') return httpError(502, `${label} is not answering at ${cfg?.baseURL || 'its address'}. Is it running?`);
  if (error?.status && error.status < 500) return error; // already an httpError we produced
  return httpError(502, `${label} failed: ${raw}`);
}

const withTimeout = (ms) => AbortSignal.timeout(ms);
const cutoff = (message) => {
  const error = httpError(502, message || 'The output was cut off. Try fewer questions or shorter notes.');
  error.cutoff = true;
  return error;
};

// ---------------------------------------------------------------- anthropic protocol
function anthropicClient(cfg) {
  if (!cfg.apiKey) {
    throw httpError(500, `${cfg.keyEnv || 'The API key'} is not set. Add it in Settings, or set DEMO_MODE=1 to try the app with sample output.`);
  }
  // DeepSeek and most Anthropic-compatible gateways expect "Authorization: Bearer";
  // api.anthropic.com itself expects x-api-key.
  const bearer = Boolean(cfg.baseURL && !/api\.anthropic\.com/i.test(cfg.baseURL));
  return new Anthropic({
    apiKey: cfg.apiKey,
    authToken: bearer ? cfg.apiKey : null,
    baseURL: cfg.baseURL || undefined,
    maxRetries: 2,
    timeout: 10 * 60 * 1000,
  });
}

async function anthropicStructured(cfg, { system, user, tool, maxTokens }) {
  const client = anthropicClient(cfg);
  const params = { model: cfg.model, max_tokens: maxTokens, system, tools: [tool], messages: [{ role: 'user', content: user }] };
  let lastError;
  for (const toolChoice of [{ type: 'tool', name: tool.name }, { type: 'any' }, undefined]) {
    let message;
    try {
      message = toolChoice
        ? await client.messages.stream({ ...params, tool_choice: toolChoice }).finalMessage()
        : await client.messages.stream({ ...params }).finalMessage();
    } catch (error) {
      lastError = error;
      const text = String(error?.message || '');
      if (error?.status === 400 && /tool|choice/i.test(text) && toolChoice !== undefined) continue;
      throw explainProviderError(error, cfg);
    }
    if (message.stop_reason === 'max_tokens') throw cutoff('The output was cut off. Try fewer questions or shorter notes.');
    const block = message.content.find((b) => b.type === 'tool_use');
    if (block?.input && typeof block.input === 'object') return block.input;
    const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    const parsed = extractJson(text);
    if (parsed) return parsed;
  }
  if (lastError) throw explainProviderError(lastError, cfg);
  throw httpError(502, 'The AI did not return a usable result. Try again.');
}

async function anthropicText(cfg, { system, user, maxTokens }) {
  const client = anthropicClient(cfg);
  const message = await client.messages.create({
    model: cfg.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

// ---------------------------------------------------------------- openai protocol
const openaiHeaders = (cfg) => ({
  'content-type': 'application/json',
  ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
});

const baseUrl = (cfg) => String(cfg.baseURL || '').replace(/\/+$/, '');

async function openaiRequest(cfg, path, { method = 'GET', body, timeoutMs = 120_000 } = {}) {
  if (!baseUrl(cfg)) throw httpError(500, 'This provider needs an address (base URL). Set it in Settings.');
  const url = `${baseUrl(cfg)}${path}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: openaiHeaders(cfg),
      body: body ? JSON.stringify(body) : undefined,
      signal: withTimeout(timeoutMs),
    });
  } catch (error) {
    throw explainProviderError(error, cfg);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(text.slice(0, 400) || `HTTP ${response.status}`);
    error.status = response.status;
    throw explainProviderError(error, cfg);
  }
  // A 2xx is not a promise of JSON: proxies and gateways answer with an HTML page, and some
  // servers only speak SSE. Either way this must be a clean 502, not a server crash.
  const raw = await response.text().catch(() => '');
  if (!raw.trim()) throw httpError(502, `${cfg.label} sent an empty reply.`);
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(`Provider ${cfg.id} answered ${response.status} with a body that is not JSON (${String(response.headers.get('content-type') || 'no content type')}, ${raw.length} bytes).`);
    throw httpError(502, `${cfg.label} sent a reply that is not JSON. Check the address in Settings.`);
  }
}

async function openaiStructured(cfg, { system, user, tool, maxTokens }) {
  const base = {
    model: cfg.model,
    max_tokens: maxTokens,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  const tools = [{ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }];

  let data;
  let lastError;
  for (const attempt of [{ tools, tool_choice: { type: 'function', function: { name: tool.name } } }, { tools, tool_choice: 'auto' }, {}]) {
    try {
      data = await openaiRequest(cfg, '/chat/completions', { method: 'POST', body: { ...base, ...attempt } });
      break;
    } catch (error) {
      lastError = error;
      // Servers that do not understand tools answer 400/422: fall back to a plain reply.
      // (A 404 means the address is wrong, so retrying would not help.)
      if ([400, 422].includes(error.status) && attempt.tools) continue;
      throw error;
    }
  }
  if (!data) throw explainProviderError(lastError, cfg);

  const choice = data?.choices?.[0] || {};
  if (choice.finish_reason === 'length') throw cutoff();
  const message = choice.message || {};
  const call = (message.tool_calls || [])[0] || message.function_call;
  const args = call?.function?.arguments ?? call?.arguments;
  if (args) {
    const parsed = typeof args === 'string' ? extractJson(args) : args;
    if (parsed && typeof parsed === 'object') return parsed;
  }
  const parsed = extractJson(message.content);
  if (parsed) return parsed;
  throw httpError(502, 'The AI did not return a usable result. Try again.');
}

async function openaiText(cfg, { system, user, maxTokens }) {
  const data = await openaiRequest(cfg, '/chat/completions', {
    method: 'POST',
    timeoutMs: 60_000,
    body: {
      model: cfg.model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    },
  });
  return String(data?.choices?.[0]?.message?.content || '');
}

// ---------------------------------------------------------------- cli protocol
async function cliStructured(cfg, { system, user, tool }) {
  if (!cfg.cli) throw httpError(500, 'This terminal tool is not configured.');
  if (!cliInstalled(cfg.cli)) throw httpError(400, `${cfg.label} was not found on this computer. Install it and sign in once, then try again.`);
  const build = (retry) => [
    system,
    '',
    user,
    '',
    'Reply with ONE JSON object and nothing else. It must match this JSON schema exactly:',
    JSON.stringify(tool.input_schema),
    retry
      ? 'Your last answer could not be read as JSON. Answer again from scratch: no code fence, no commentary, no unescaped quotes or line breaks inside string values.'
      : '',
  ].join('\n');

  // A small model hands back something unreadable roughly one time in five. The content is
  // usually fine, so try once more before giving up on a paper that may have taken minutes.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const output = await runCli(cfg.cli, { model: cfg.model, prompt: build(attempt === 2) });
    const parsed = extractJson(output);
    if (parsed) return parsed;
  }
  throw httpError(502, `${cfg.label} did not return usable JSON, even after a second try. Try a larger model, or pick another provider.`);
}

// ---------------------------------------------------------------- public API
/**
 * Ask the selected AI for one structured result.
 * @returns {Promise<object>} the object the model returned (shape not yet validated)
 */
export async function callStructured({ system, user, tool, maxTokens, providerId }) {
  const cfg = resolve(providerId || activeProviderId());
  if (!cfg) throw httpError(500, 'The selected AI provider is not known. Pick one again in Settings.');
  // Respect the "Max output" setting unless the caller asks for something specific.
  const budget = maxTokens || cfg.maxOut || 8000;
  if (cfg.protocol === 'cli') return cliStructured(cfg, { system, user, tool });
  if (cfg.protocol === 'openai') return openaiStructured(cfg, { system, user, tool, maxTokens: budget });
  return anthropicStructured(cfg, { system, user, tool, maxTokens: budget });
}

/** A short free-text answer, used by "Test connection". */
export async function pingProvider(providerId) {
  const cfg = resolve(providerId || activeProviderId());
  if (!cfg) throw httpError(500, 'The selected AI provider is not known. Pick one again in Settings.');
  const system = 'You are a connection test. Answer with the single word OK and nothing else.';
  const user = 'Reply OK.';
  if (cfg.protocol === 'cli') {
    if (!cliInstalled(cfg.cli)) throw httpError(400, `${cfg.label} was not found on this computer. Install it and sign in once.`);
    const output = await runCli(cfg.cli, { model: cfg.model, prompt: `${system}\n${user}` });
    return { provider: cfg.label, model: cfg.id === 'nvidia' ? 'Exam Studio AI' : (cfg.model || 'tool default'), text: String(output).trim().slice(0, 80) };
  }
  const text = cfg.protocol === 'openai'
    ? await openaiText(cfg, { system, user, maxTokens: 32 })
    : await anthropicText(cfg, { system, user, maxTokens: 32 });
  return { provider: cfg.label, model: cfg.id === 'nvidia' ? 'Exam Studio AI' : cfg.model, text: String(text).trim().slice(0, 80) };
}

/** Model names offered by the provider, for the "List models" button. */
export async function listProviderModels(providerId, { requestIsLocal = false } = {}) {
  const cfg = resolve(providerId || activeProviderId());
  if (!cfg) throw httpError(500, 'The selected AI provider is not known. Pick one again in Settings.');
  // The built-in AI's real model list is admin-only.
  if (cfg.id === 'nvidia' && !requestIsLocal) return [];
  if (cfg.protocol === 'cli') return [];
  try {
    if (cfg.protocol === 'openai') {
      const data = await openaiRequest(cfg, '/models', { timeoutMs: 20_000 });
      const models = (data?.data || data?.models || []).map((m) => (typeof m === 'string' ? m : m?.id || m?.name)).filter(Boolean);
      return [...new Set(models)].sort();
    }
    const client = anthropicClient(cfg);
    const page = await client.models.list({ limit: 100 });
    return (page?.data || []).map((m) => m.id).filter(Boolean).sort();
  } catch (error) {
    throw explainProviderError(error, cfg);
  }
}

export async function providerReady(providerId) {
  const cfg = resolve(providerId || activeProviderId());
  if (!cfg) return { ok: false, reason: 'Unknown provider.' };
  if (cfg.protocol === 'cli') {
    const installed = cliInstalled(cfg.cli);
    return { ok: installed, reason: installed ? '' : `${cfg.label} was not found on this computer.` };
  }
  // Default AI: allow without user key if server has NVIDIA_API_KEY set
  const isDefaultAI = cfg.id === 'nvidia';
  if (isDefaultAI && !cfg.apiKey && !process.env.NVIDIA_API_KEY) {
    return { ok: false, reason: 'Exam Studio AI is unavailable.' };
  }
  if (cfg.needsKey && !cfg.apiKey && !isDefaultAI) return { ok: false, reason: `${cfg.keyEnv || 'The API key'} is not set.` };
  return { ok: true, reason: '' };
}

export { PROVIDERS };
