export type HuTaoEmotion =
  | 'neutral'
  | 'happy'
  | 'playful'
  | 'surprised'
  | 'angry'
  | 'sad';

export type HuTaoGesture =
  | 'idle'
  | 'wave'
  | 'nod'
  | 'spooky'
  | 'bow'
  | 'think'
  | 'jump'
  | 'twirl'
  | 'dance'
  | 'shrug';

export type CameraPreset = 'portrait' | 'upper' | 'full';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  emotion?: HuTaoEmotion;
  gesture?: HuTaoGesture;
  providerUsed?: string;
  timestamp: number;
  streaming?: boolean;
}

/**
 * Free AI API providers sourced from https://github.com/OuterSpacee/free-ai-apis
 */
export type AIProviderId =
  | 'pollinations' // Auth: None — Free cloud LLM API, zero key, zero signup
  | 'puter'        // Auth: None — Free Puter.js LLM API in browser
  | 'gemini'       // Auth: Free API Key — Google AI Studio (aistudio.google.com)
  | 'groq'         // Auth: Free API Key — Groq ultra-fast inference (console.groq.com)
  | 'cerebras'     // Auth: Free API Key — Cerebras 1M tokens/day free (cloud.cerebras.ai)
  | 'openrouter'   // Auth: Free API Key — OpenRouter `:free` models (openrouter.ai)
  | 'mistral'      // Auth: Free API Key — Mistral La Plateforme free tier (console.mistral.ai)
  | 'zhipu'        // Auth: Free API Key — Z.ai GLM-4.5-Flash free model (docs.z.ai)
  | 'ollama'       // Auth: None (Local) — Local Ollama / LM Studio server
  | 'webgpu';      // Auth: None (Browser) — In-browser WebGPU / WASM local LLM

export interface AIProviderSettings {
  provider: AIProviderId;
  modelByProvider: Record<AIProviderId, string>;
  apiKeys: Partial<Record<AIProviderId, string>>;
  ollamaBaseUrl: string;
}

export type EngineBackend =
  | 'cloud-free-api'
  | 'webgpu-webllm'
  | 'wasm-transformers'
  | 'built-in';

export interface AIStatus {
  state: 'idle' | 'loading' | 'ready' | 'error';
  backend: EngineBackend;
  provider: AIProviderId;
  modelLabel: string;
  progress: number; // 0 to 100
  detail: string;
}
