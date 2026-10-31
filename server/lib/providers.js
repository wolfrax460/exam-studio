// Every AI service the app can talk to. "anthropic" protocol = Anthropic Messages API (also served by DeepSeek).
// "openai" protocol = the OpenAI-style /chat/completions API that NVIDIA, Ollama, OpenRouter, LM Studio, vLLM,
// Groq, Together and most others offer.
import { getSettings } from './settings.js';
import { cliInstalled } from './cli.js';
import * as admin from './adminStore.js';

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
    label: 'Exam Studio AI', protocol: 'openai', keyEnv: 'NVIDIA_API_KEY', needsKey: true,
    model: 'nvidia/nemotron-3.5-super-v1-120b-a12b', baseURL: 'https://integrate.api.nvidia.com/v1', maxOut: 8192, chunk: 8000,
    help: 'The default AI for Exam Studio. Managed by the administrator.',
    defaultAI: true,
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
  // Default AI: use built-in NVIDIA model when no user key is set
  const defaultProvider = env.DEFAULT_AI_PROVIDER ? env.DEFAULT_AI_PROVIDER.toLowerCase() : null;
  if (defaultProvider && defaultProvider in PROVIDERS) return defaultProvider;
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
  // Admin-configured default AI (Exam Studio AI) overrides env/settings when present.
  const adminCfg = chosen === 'nvidia' ? admin.getCachedAIConfig() : null;
  const adminKey = chosen === 'nvidia' ? admin.getCachedAIKey() : null;
  return {
    id: chosen,
    label: base.label,
    protocol: base.protocol,
    cli: base.cli,
    needsKey: base.needsKey,
    keyEnv: base.keyEnv,
      // The raw API key is never sent to the browser; only whether one is set.
      keySource: adminCfg?.hasKey ? 'admin' : (prof.apiKey ? 'settings' : base.keyEnv && env[base.keyEnv] ? 'env' : ''),
    model: (adminCfg?.model) || prof.model || (active && env.AI_MODEL) || (chosen === 'anthropic' && env.CLAUDE_MODEL) || base.model,
    baseURL: (adminCfg?.baseUrl) || prof.baseURL || (active && env.AI_BASE_URL) || base.baseURL,
    maxOut: Number(adminCfg?.maxTokens?.notes || adminCfg?.maxTokens?.default) || Number(prof.maxOutput) || (active && Number(env.AI_MAX_OUTPUT)) || base.maxOut,
    chunk: Number(prof.chunkChars) || (active && Number(env.AI_CHUNK_CHARS)) || base.chunk,
    apiKey: adminKey || prof.apiKey || (base.keyEnv && env[base.keyEnv]) || '',
  };
}

// Everything the Settings screen needs to draw itself. Pass whether the caller is on the
// machine running the server: terminal tools can only be used from that machine.
export function providerCatalog({ requestIsLocal = false } = {}) {
  const isAdmin = Boolean(requestIsLocal);
  const entries = Object.entries(PROVIDERS).map(([id, base]) => {
    const resolved = resolve(id);
    const isCli = base.protocol === 'cli';
    const isDefaultAI = id === 'nvidia';
    const displayLabel = isDefaultAI ? 'Exam Studio AI' : base.label;
    // Normal users never see the real provider, endpoint or model for the default AI.
    const hideDetails = isDefaultAI && !isAdmin;
    return {
      id,
      label: displayLabel,
      protocol: base.protocol,
      help: base.help,
      needsKey: hideDetails ? false : Boolean(base.needsKey),
      hasKey: hideDetails ? false : Boolean(resolved.apiKey),
      keySource: hideDetails ? null : resolved.keySource,
      installed: isCli ? cliInstalled(base.cli) : undefined,
      allowed: isCli ? Boolean(requestIsLocal) : true,
      model: hideDetails ? null : resolved.model,
      baseURL: hideDetails ? null : resolved.baseURL,
      maxOutput: hideDetails ? null : resolved.maxOut,
      chunkChars: hideDetails ? null : resolved.chunk,
      defaults: hideDetails ? {} : { model: base.model, baseURL: base.baseURL, maxOutput: base.maxOut, chunkChars: base.chunk },
      // Only admins may edit the default AI's real settings.
      readOnly: hideDetails,
    };
  });
  // Exam Studio AI always comes first.
  const defaultIdx = entries.findIndex((p) => p.id === 'nvidia');
  if (defaultIdx > 0) {
    const [item] = entries.splice(defaultIdx, 1);
    entries.unshift(item);
  }
  return entries;
}

export const isLocalUrl = (u) => /^https?:\/\/(localhost|127\.|\[::1\]|0\.0\.0\.0)/i.test(u || '');
