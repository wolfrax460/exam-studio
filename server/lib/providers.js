// Every AI service the app can talk to. "anthropic" protocol = Anthropic Messages API (also served by DeepSeek).
// "openai" protocol = the OpenAI-style /chat/completions API that NVIDIA, Ollama, OpenRouter, LM Studio, vLLM,
// Groq, Together and most others offer.
import { getSettings } from './settings.js';
import { cliInstalled } from './cli.js';

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic (Claude)', protocol: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY', needsKey: true,
    model: 'claude-sonnet-5-5', baseURL: undefined, maxOut: 32000, chunk: 10000,
    help: 'Paid API from console.anthropic.com. Separate from a Claude.ai subscription.',
  },
  deepseek: {
    label: 'DeepSeek', protocol: 'anthropic', keyEnv: 'DEEPSEEK_API_KEY', needsKey: true,
    model: 'deepseek-flash', baseURL: 'https://api.deepseek.com/anthropic', maxOut: 32000, chunk: 10000,
    help: 'API key from platform.deepseek.com. Needs a topped-up balance.',
  },
  nvidia: {
    label: 'NVIDIA (build.nvidia.com)', protocol: 'openai', keyEnv: 'NVIDIA_API_KEY', needsKey: true,
    model: 'meta/llama-3.3-70b-instruct', baseURL: 'https://integrate.api.nvidia.com/v1', maxOut: 8192, chunk: 8000,
    help: 'Free API key (starts with nvapi-) from build.nvidia.com. Pick a model that supports function calling.',
  },
  ollama: {
    label: 'Ollama (on this computer)', protocol: 'openai', keyEnv: null, needsKey: false,
    model: 'llama3.1', baseURL: 'http://localhost:11434/v1', maxOut: 8192, chunk: 3500,
    help: 'Runs offline. Install Ollama, run "ollama pull llama3.1", then raise its context length to 16000 or more in the Ollama app settings, or long notes get cut.',
  },
  'ollama-cloud': {
    label: 'Ollama Cloud', protocol: 'openai', keyEnv: 'OLLAMA_API_KEY', needsKey: true,
    model: 'gpt-oss:120b', baseURL: 'https://ollama.com/v1', maxOut: 8192, chunk: 8000,
    help: 'API key from ollama.com. Use a model name from ollama.com/search?c=cloud.',
  },
  'cli-claude': {
    label: 'Claude Code (terminal)', protocol: 'cli', cli: 'claude', keyEnv: null, needsKey: false,
    model: '', baseURL: '', maxOut: 8192, chunk: 8000,
    help: 'Uses the Claude Code you already installed and signed in to, with no API key. Runs on this computer only. Leave the model empty for its default, or type an alias such as sonnet.',
  },
  'cli-codex': {
    label: 'Codex CLI (terminal)', protocol: 'cli', cli: 'codex', keyEnv: null, needsKey: false,
    model: '', baseURL: '', maxOut: 8192, chunk: 8000,
    help: 'Uses the Codex CLI you already installed and signed in to. Leave the model empty for its default.',
  },
  'cli-opencode': {
    label: 'OpenCode (terminal)', protocol: 'cli', cli: 'opencode', keyEnv: null, needsKey: false,
    model: '', baseURL: '', maxOut: 8192, chunk: 8000,
    help: 'Uses OpenCode with whatever provider you connected there (this covers many models, including local ones). Optional model as provider/model, for example deepseek/deepseek-chat.',
  },
  'cli-gemini': {
    label: 'Gemini CLI (terminal)', protocol: 'cli', cli: 'gemini', keyEnv: null, needsKey: false,
    model: '', baseURL: '', maxOut: 8192, chunk: 8000,
    help: 'Uses the Gemini CLI you already installed and signed in to. Not tested by the author. Leave the model empty for its default.',
  },
  custom: {
    label: 'Other (OpenAI-compatible)', protocol: 'openai', keyEnv: 'AI_API_KEY', needsKey: false,
    model: '', baseURL: '', maxOut: 8192, chunk: 8000,
    help: 'Any OpenAI-style service: OpenRouter, Groq, Together, LM Studio (http://localhost:1234/v1), vLLM, a company server. Enter its base URL and model.',
  },
};

export function activeProviderId() {
  const env = process.env;
  const saved = getSettings().provider;
  if (saved in PROVIDERS) return saved;
  const wanted = (env.AI_PROVIDER || '').toLowerCase();
  if (wanted in PROVIDERS) return wanted;
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  for (const id of ['deepseek', 'nvidia', 'ollama-cloud']) if (env[PROVIDERS[id].keyEnv]) return id;
  return 'anthropic';
}

// The full, resolved configuration for one provider (the active one by default).
export function resolve(id = activeProviderId()) {
  // An unknown id (for example one left in settings.json by an older version) must not crash.
  const chosen = PROVIDERS[id] ? id : activeProviderId();
  const base = PROVIDERS[chosen];
  const prof = getSettings().profiles?.[chosen] || {};
  const active = chosen === activeProviderId();
  const env = process.env;
  return {
    id: chosen,
    label: base.label,
    protocol: base.protocol,
    cli: base.cli,
    needsKey: base.needsKey,
    keyEnv: base.keyEnv,
    apiKey: prof.apiKey || (base.keyEnv && env[base.keyEnv]) || '',
    keySource: prof.apiKey ? 'settings' : base.keyEnv && env[base.keyEnv] ? 'env' : '',
    model: prof.model || (active && env.AI_MODEL) || (chosen === 'anthropic' && env.CLAUDE_MODEL) || base.model,
    baseURL: prof.baseURL || (active && env.AI_BASE_URL) || base.baseURL,
    maxOut: Number(prof.maxOutput) || (active && Number(env.AI_MAX_OUTPUT)) || base.maxOut,
    chunk: Number(prof.chunkChars) || (active && Number(env.AI_CHUNK_CHARS)) || base.chunk,
  };
}

// Everything the Settings screen needs to draw itself. Pass whether the caller is on the
// machine running the server: terminal tools can only be used from that machine.
export function providerCatalog({ requestIsLocal = false } = {}) {
  return Object.entries(PROVIDERS).map(([id, base]) => {
    const resolved = resolve(id);
    const isCli = base.protocol === 'cli';
    return {
      id,
      label: base.label,
      protocol: base.protocol,
      help: base.help,
      needsKey: Boolean(base.needsKey),
      hasKey: Boolean(resolved.apiKey),
      keySource: resolved.keySource,
      installed: isCli ? cliInstalled(base.cli) : undefined,
      allowed: isCli ? Boolean(requestIsLocal) : true,
      model: resolved.model,
      baseURL: resolved.baseURL,
      maxOutput: resolved.maxOut,
      chunkChars: resolved.chunk,
      defaults: { model: base.model, baseURL: base.baseURL, maxOutput: base.maxOut, chunkChars: base.chunk },
    };
  });
}

export const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(u || '');
