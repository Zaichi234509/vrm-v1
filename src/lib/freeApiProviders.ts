import type { AIProviderId, AIProviderSettings } from '../types';
import { HUTAO_SYSTEM_PROMPT } from './hutaoPersona';

export interface ProviderMetadata {
  id: AIProviderId;
  name: string;
  badge: string;
  authType: 'none' | 'apiKey' | 'local';
  freeTierSummary: string;
  keyPortalUrl?: string;
  keyPlaceholder?: string;
  models: { id: string; label: string }[];
}

/**
 * Curated Free LLM APIs directly from https://github.com/OuterSpacee/free-ai-apis
 */
export const FREE_API_PROVIDERS: ProviderMetadata[] = [
  {
    id: 'pollinations',
    name: 'Pollinations Free Cloud AI',
    badge: 'No Key · Instant',
    authType: 'none',
    freeTierSummary: 'Free OpenAI-compatible text endpoint — no signup, no API key, zero download.',
    models: [
      { id: 'openai', label: 'GPT-4o Mini / Fast (Default)' },
      { id: 'mistral', label: 'Mistral Small' },
      { id: 'llama', label: 'Llama 3.3 70B' },
      { id: 'qwen-coder', label: 'Qwen 2.5' },
    ],
  },
  {
    id: 'puter',
    name: 'Puter.js Browser Cloud AI',
    badge: 'No API Key',
    authType: 'none',
    freeTierSummary: 'Listed in free-ai-apis (`Auth: None`) — cloud GPT/Claude/Gemini directly in browser via Puter.js.',
    keyPortalUrl: 'https://developer.puter.com/tutorials/free-llm-api/',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    badge: 'Free Key · Ultra Fast',
    authType: 'apiKey',
    freeTierSummary: 'Free plan (no credit card): ~30 req/min, 1,000+ req/day with instant LPU speed.',
    keyPortalUrl: 'https://console.groq.com/keys',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google AI Studio (Gemini)',
    badge: 'Free Key · Generous',
    authType: 'apiKey',
    freeTierSummary: 'Free Gemini API key from Google AI Studio — no credit card required.',
    keyPortalUrl: 'https://aistudio.google.com/app/apikey',
    keyPlaceholder: 'AIzaSy...',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    ],
  },
  {
    id: 'cerebras',
    name: 'Cerebras Inference',
    badge: 'Free Key · 1M tok/day',
    authType: 'apiKey',
    freeTierSummary: 'Free tier: 1,000,000 tokens/day per model, wafer-scale instant speed.',
    keyPortalUrl: 'https://cloud.cerebras.ai/',
    keyPlaceholder: 'csk-...',
    models: [
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
      { id: 'llama3.1-8b', label: 'Llama 3.1 8B' },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (:free Models)',
    badge: 'Free Key · 100+ Models',
    authType: 'apiKey',
    freeTierSummary: 'Access `:free` community models (DeepSeek, Llama, Gemma, Qwen) with a $0 OpenRouter key.',
    keyPortalUrl: 'https://openrouter.ai/settings/keys',
    keyPlaceholder: 'sk-or-v1-...',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (:free)' },
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (:free)' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (:free)' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (:free)' },
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral AI (La Plateforme)',
    badge: 'Free Key · Daily Quota',
    authType: 'apiKey',
    freeTierSummary: 'Experimentation plan on Mistral La Plateforme includes a free token quota.',
    keyPortalUrl: 'https://console.mistral.ai/api-keys/',
    keyPlaceholder: 'Mistral API key...',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small Latest' },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo' },
    ],
  },
  {
    id: 'zhipu',
    name: 'Z.ai (Zhipu GLM Flash)',
    badge: 'Free Key · Free Flash',
    authType: 'apiKey',
    freeTierSummary: 'GLM-4.5-Flash is 100% free via Z.ai OpenAI-compatible API.',
    keyPortalUrl: 'https://docs.z.ai/',
    keyPlaceholder: 'Z.ai API key...',
    models: [
      { id: 'glm-4.5-flash', label: 'GLM-4.5-Flash (Free)' },
      { id: 'glm-4-flash', label: 'GLM-4-Flash (Free)' },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama / LM Studio (Local Server)',
    badge: 'No Key · Localhost',
    authType: 'local',
    freeTierSummary: 'Connect to your own local Ollama (`localhost:11434`) or LM Studio OpenAI endpoint.',
    keyPortalUrl: 'https://ollama.com/',
    models: [
      { id: 'llama3.2', label: 'llama3.2' },
      { id: 'qwen2.5', label: 'qwen2.5' },
      { id: 'gemma3', label: 'gemma3' },
    ],
  },
  {
    id: 'webgpu',
    name: 'In-Browser WebGPU / WASM',
    badge: 'Offline · Zero Server',
    authType: 'local',
    freeTierSummary: 'Downloads compact weights once and runs 100% offline inside your browser GPU/CPU.',
    models: [
      { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 0.5B (~350 MB)' },
      { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B (~650 MB)' },
      { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', label: 'Qwen 2.5 1.5B (~980 MB)' },
    ],
  },
];

const STORAGE_KEY = 'hutao_vrm_ai_settings_v2';

export function getDefaultProviderSettings(): AIProviderSettings {
  const modelByProvider = {} as Record<AIProviderId, string>;
  for (const p of FREE_API_PROVIDERS) {
    modelByProvider[p.id] = p.models[0].id;
  }
  return {
    provider: 'pollinations',
    modelByProvider,
    apiKeys: {},
    ollamaBaseUrl: 'http://localhost:11434/v1',
  };
}

export function loadProviderSettings(): AIProviderSettings {
  const defaults = getDefaultProviderSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AIProviderSettings>;
    return {
      provider: parsed.provider ?? defaults.provider,
      modelByProvider: { ...defaults.modelByProvider, ...(parsed.modelByProvider ?? {}) },
      apiKeys: { ...(parsed.apiKeys ?? {}) },
      ollamaBaseUrl: parsed.ollamaBaseUrl || defaults.ollamaBaseUrl,
    };
  } catch {
    return defaults;
  }
}

export function saveProviderSettings(settings: AIProviderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

export interface SimpleMsg {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Parse OpenAI-compatible Server-Sent Events (SSE) stream and invoke `onDelta` with accumulated text.
 */
async function consumeOpenAISSE(
  response: Response,
  onAccumulated: (acc: string) => void
): Promise<string> {
  if (!response.body) {
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    onAccumulated(content);
    return content;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content ?? '';
        if (typeof delta === 'string' && delta.length > 0) {
          accumulated += delta;
          onAccumulated(accumulated);
        }
      } catch {
        // Ignore partial or keepalive SSE comments
      }
    }
  }

  return accumulated;
}

/**
 * Stream chat completion from any OpenAI-compatible Free API endpoint
 */
async function streamOpenAICompatible(opts: {
  url: string;
  apiKey?: string;
  model: string;
  history: SimpleMsg[];
  userPrompt: string;
  extraHeaders?: Record<string, string>;
  onUpdate: (rawAcc: string) => void;
}): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.extraHeaders ?? {}),
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey.trim()}`;
  }

  const messages = [
    { role: 'system', content: HUTAO_SYSTEM_PROMPT },
    ...opts.history,
    { role: 'user', content: opts.userPrompt },
  ];

  const res = await fetch(opts.url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: 0.8,
      max_tokens: 320,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`API HTTP ${res.status}: ${errBody.slice(0, 180) || res.statusText}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    return consumeOpenAISSE(res, opts.onUpdate);
  }

  // Handle non-SSE JSON or plain text fallback (e.g. certain Pollinations responses)
  const rawText = await res.text();
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.choices?.[0]?.message?.content ?? rawText;
    opts.onUpdate(msg);
    return msg;
  } catch {
    opts.onUpdate(rawText);
    return rawText;
  }
}

/**
 * Google AI Studio (Gemini) Free Tier REST Streaming
 */
async function streamGeminiFreeApi(opts: {
  apiKey: string;
  model: string;
  history: SimpleMsg[];
  userPrompt: string;
  onUpdate: (rawAcc: string) => void;
}): Promise<string> {
  const contents = [
    ...opts.history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    {
      role: 'user',
      parts: [{ text: opts.userPrompt }],
    },
  ];

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    opts.model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(opts.apiKey.trim())}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: HUTAO_SYSTEM_PROMPT }],
      },
      contents,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 320,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 180) || res.statusText}`);
  }

  if (!res.body) {
    const json = await res.json();
    const txt = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    opts.onUpdate(txt);
    return txt;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const parsed = JSON.parse(payload);
        const parts = parsed?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p?.text === 'string') {
              accumulated += p.text;
              opts.onUpdate(accumulated);
            }
          }
        }
      } catch {
        // ignore partial line
      }
    }
  }

  return accumulated;
}

/**
 * Puter.js Free Browser LLM API (`@heyputer/puter.js` from OuterSpacee/free-ai-apis)
 */
async function streamPuterFreeApi(opts: {
  model: string;
  history: SimpleMsg[];
  userPrompt: string;
  onUpdate: (rawAcc: string) => void;
}): Promise<string> {
  const mod = await import('@heyputer/puter.js');
  const puter = mod.puter ?? mod.default;

  const messages = [
    { role: 'system', content: HUTAO_SYSTEM_PROMPT },
    ...opts.history,
    { role: 'user', content: opts.userPrompt },
  ];

  const stream = await puter.ai.chat(messages, {
    model: opts.model,
    stream: true,
    temperature: 0.8,
  });

  let accumulated = '';
  for await (const part of stream as AsyncIterable<{ text?: string }>) {
    if (part?.text) {
      accumulated += part.text;
      opts.onUpdate(accumulated);
    }
  }
  return accumulated;
}

/**
 * Unified dispatcher for Free Cloud & Local Server APIs
 */
export async function callFreeCloudApi(
  settings: AIProviderSettings,
  history: SimpleMsg[],
  userPrompt: string,
  onRawUpdate: (rawAcc: string) => void
): Promise<string> {
  const provider = settings.provider;
  const model = settings.modelByProvider[provider];
  const key = settings.apiKeys[provider]?.trim() ?? '';

  switch (provider) {
    case 'pollinations': {
      return streamOpenAICompatible({
        url: 'https://text.pollinations.ai/openai',
        model: model || 'openai',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'puter': {
      return streamPuterFreeApi({
        model: model || 'gpt-4o-mini',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'groq': {
      if (!key) throw new Error('MISSING_KEY:Groq API key required (free at console.groq.com/keys)');
      return streamOpenAICompatible({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        apiKey: key,
        model: model || 'llama-3.3-70b-versatile',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'gemini': {
      if (!key)
        throw new Error(
          'MISSING_KEY:Gemini API key required (free at aistudio.google.com/app/apikey)'
        );
      return streamGeminiFreeApi({
        apiKey: key,
        model: model || 'gemini-2.5-flash',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'cerebras': {
      if (!key)
        throw new Error('MISSING_KEY:Cerebras API key required (free at cloud.cerebras.ai)');
      return streamOpenAICompatible({
        url: 'https://api.cerebras.ai/v1/chat/completions',
        apiKey: key,
        model: model || 'llama-3.3-70b',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'openrouter': {
      if (!key)
        throw new Error(
          'MISSING_KEY:OpenRouter API key required (free at openrouter.ai/settings/keys)'
        );
      return streamOpenAICompatible({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: key,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        extraHeaders: {
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Hu Tao 3D VRM Assistant',
        },
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'mistral': {
      if (!key)
        throw new Error(
          'MISSING_KEY:Mistral API key required (free tier at console.mistral.ai/api-keys)'
        );
      return streamOpenAICompatible({
        url: 'https://api.mistral.ai/v1/chat/completions',
        apiKey: key,
        model: model || 'mistral-small-latest',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'zhipu': {
      if (!key) throw new Error('MISSING_KEY:Z.ai API key required (free GLM-4.5-Flash at z.ai)');
      return streamOpenAICompatible({
        url: 'https://api.z.ai/api/paas/v4/chat/completions',
        apiKey: key,
        model: model || 'glm-4.5-flash',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    case 'ollama': {
      const base = (settings.ollamaBaseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
      return streamOpenAICompatible({
        url: `${base}/chat/completions`,
        model: model || 'llama3.2',
        history,
        userPrompt,
        onUpdate: onRawUpdate,
      });
    }

    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}
