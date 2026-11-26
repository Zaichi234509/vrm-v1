import type { AIProviderSettings, AIStatus, ChatMessage, EngineBackend } from '../types';
import {
  HUTAO_SYSTEM_PROMPT,
  generateInstantHuTaoReply,
  parseEmotionAndCleanText,
} from './hutaoPersona';
import {
  FREE_API_PROVIDERS,
  callFreeCloudApi,
  loadProviderSettings,
  saveProviderSettings,
} from './freeApiProviders';

export interface WebLLMModelOption {
  id: string;
  label: string;
  sizeNote: string;
}

export const WEBLLM_MODELS: WebLLMModelOption[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 0.5B (Fastest)',
    sizeNote: '~350 MB · WebGPU',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    label: 'Llama 3.2 1B (Balanced)',
    sizeNote: '~650 MB · WebGPU',
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 1.5B (Richest)',
    sizeNote: '~980 MB · WebGPU',
  },
];

type StatusListener = (status: AIStatus) => void;

export class LocalAIEngine {
  private settings: AIProviderSettings = loadProviderSettings();
  private webllmEngine: import('@mlc-ai/web-llm').MLCEngineInterface | null = null;
  private loadedWebLLMModelId: string | null = null;
  private wasmWorker: Worker | null = null;
  private wasmReady = false;
  private initPromise: Promise<void> | null = null;

  private status: AIStatus = this.computeCloudStatus(this.settings);
  private listeners = new Set<StatusListener>();

  private computeCloudStatus(settings: AIProviderSettings): AIStatus {
    const meta =
      FREE_API_PROVIDERS.find((p) => p.id === settings.provider) ?? FREE_API_PROVIDERS[0];
    const modelId = settings.modelByProvider[settings.provider] || meta.models[0].id;
    const modelObj = meta.models.find((m) => m.id === modelId);
    const modelName = modelObj ? modelObj.label : modelId;

    if (settings.provider === 'webgpu') {
      return {
        state: 'idle',
        backend: 'webgpu-webllm',
        provider: 'webgpu',
        modelLabel: modelName,
        progress: 0,
        detail: 'Ready to load in-browser WebGPU/WASM AI',
      };
    }

    const needsKey = meta.authType === 'apiKey';
    const hasKey = Boolean(settings.apiKeys[settings.provider]?.trim());

    return {
      state: needsKey && !hasKey ? 'idle' : 'ready',
      backend: 'cloud-free-api',
      provider: settings.provider,
      modelLabel: `${meta.name}`,
      progress: 100,
      detail:
        needsKey && !hasKey
          ? `Paste your free ${meta.name} API key in API Settings`
          : `${modelName} · ${meta.badge}`,
    };
  }

  getSettings(): AIProviderSettings {
    return this.settings;
  }

  async updateSettings(next: AIProviderSettings): Promise<void> {
    this.settings = next;
    saveProviderSettings(next);

    if (next.provider === 'webgpu') {
      await this.initializeWebGPU(next.modelByProvider.webgpu);
    } else {
      this.updateStatus(this.computeCloudStatus(next));
    }
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): AIStatus {
    return this.status;
  }

  private updateStatus(partial: Partial<AIStatus>) {
    this.status = { ...this.status, ...partial };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  static async hasWebGPU(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return false;
    }
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } })
        .gpu;
      const adapter = await gpu?.requestAdapter();
      return Boolean(adapter);
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    if (this.settings.provider === 'webgpu') {
      await this.initializeWebGPU(this.settings.modelByProvider.webgpu);
    } else {
      this.updateStatus(this.computeCloudStatus(this.settings));
    }
  }

  async initializeWebGPU(preferredWebLLMModelId = WEBLLM_MODELS[0].id): Promise<void> {
    if (
      this.status.state === 'ready' &&
      this.status.provider === 'webgpu' &&
      (this.loadedWebLLMModelId === preferredWebLLMModelId || this.wasmReady)
    ) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitializeWebGPU(preferredWebLLMModelId).finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async _doInitializeWebGPU(modelId: string): Promise<void> {
    const modelOption = WEBLLM_MODELS.find((m) => m.id === modelId) ?? WEBLLM_MODELS[0];
    const webgpuAvailable = await LocalAIEngine.hasWebGPU();

    if (webgpuAvailable) {
      try {
        if (this.webllmEngine && this.loadedWebLLMModelId !== modelOption.id) {
          await this.webllmEngine.unload().catch(() => {});
          this.webllmEngine = null;
        }

        this.updateStatus({
          state: 'loading',
          backend: 'webgpu-webllm',
          provider: 'webgpu',
          modelLabel: modelOption.label,
          progress: 2,
          detail: 'Starting WebGPU AI engine...',
        });

        const webllm = await import('@mlc-ai/web-llm');
        const engine = await webllm.CreateMLCEngine(modelOption.id, {
          initProgressCallback: (report) => {
            const pct = Math.min(99, Math.max(3, Math.round((report.progress ?? 0) * 100)));
            this.updateStatus({
              state: 'loading',
              backend: 'webgpu-webllm',
              provider: 'webgpu',
              modelLabel: modelOption.label,
              progress: pct,
              detail: report.text || `Loading ${modelOption.label} (${pct}%)`,
            });
          },
        });

        this.webllmEngine = engine;
        this.loadedWebLLMModelId = modelOption.id;
        this.updateStatus({
          state: 'ready',
          backend: 'webgpu-webllm',
          provider: 'webgpu',
          modelLabel: modelOption.label,
          progress: 100,
          detail: `${modelOption.label} · Running locally on WebGPU`,
        });
        return;
      } catch (err) {
        console.warn('WebLLM initialization failed, falling back to WASM Transformers.js:', err);
      }
    }

    // Fallback to CPU/WASM Web Worker
    try {
      await this.initWasmWorker();
    } catch (err) {
      console.warn('WASM AI worker failed:', err);
      this.updateStatus({
        state: 'ready',
        backend: 'built-in',
        provider: 'webgpu',
        modelLabel: 'Hu Tao Instant Persona',
        progress: 100,
        detail: 'Running built-in persona (WebGPU/WASM unavailable)',
      });
    }
  }

  private initWasmWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.updateStatus({
        state: 'loading',
        backend: 'wasm-transformers',
        provider: 'webgpu',
        modelLabel: 'SmolLM2 360M (WASM CPU)',
        progress: 4,
        detail: 'WebGPU unavailable — loading CPU/WASM model...',
      });

      if (!this.wasmWorker) {
        this.wasmWorker = new Worker(new URL('./wasmAiWorker.ts', import.meta.url), {
          type: 'module',
        });
      }

      const worker = this.wasmWorker;

      const handleMessage = (e: MessageEvent) => {
        const data = e.data;
        if (data.type === 'progress') {
          this.updateStatus({
            state: 'loading',
            backend: 'wasm-transformers',
            provider: 'webgpu',
            modelLabel: 'SmolLM2 360M (WASM CPU)',
            progress: data.progress,
            detail: data.detail,
          });
        } else if (data.type === 'ready') {
          worker.removeEventListener('message', handleMessage);
          this.wasmReady = true;
          this.updateStatus({
            state: 'ready',
            backend: 'wasm-transformers',
            provider: 'webgpu',
            modelLabel: 'SmolLM2 360M (WASM CPU)',
            progress: 100,
            detail: 'SmolLM2 360M running locally on CPU/WASM',
          });
          resolve();
        } else if (data.type === 'error' && !data.id) {
          worker.removeEventListener('message', handleMessage);
          reject(new Error(data.error || 'WASM Worker initialization error'));
        }
      };

      worker.addEventListener('message', handleMessage);
      worker.postMessage({ type: 'init' });
    });
  }

  async chatStream(
    history: ChatMessage[],
    userPrompt: string,
    onChunk: (partialCleanText: string, backend: EngineBackend) => void
  ): Promise<{
    finalText: string;
    emotion: ReturnType<typeof parseEmotionAndCleanText>['emotion'];
    gesture: ReturnType<typeof parseEmotionAndCleanText>['gesture'];
    backend: EngineBackend;
    providerLabel: string;
    missingKeyPrompt?: string;
  }> {
    const recentHistory = history
      .filter((m) => !m.streaming && m.content.trim().length > 0)
      .slice(-8)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const providerMeta =
      FREE_API_PROVIDERS.find((p) => p.id === this.settings.provider) ?? FREE_API_PROVIDERS[0];

    // PATH A: Cloud / Local Server Free AI APIs (Pollinations, Puter, Groq, Gemini, Cerebras, OpenRouter, Mistral, Z.ai, Ollama)
    if (this.settings.provider !== 'webgpu') {
      try {
        const rawOutput = await callFreeCloudApi(
          this.settings,
          recentHistory,
          userPrompt,
          (rawAcc) => {
            const parsed = parseEmotionAndCleanText(rawAcc);
            onChunk(parsed.cleanText, 'cloud-free-api');
          }
        );

        const finalParsed = parseEmotionAndCleanText(rawOutput);
        if (finalParsed.cleanText.trim().length > 0) {
          return {
            finalText: finalParsed.cleanText,
            emotion: finalParsed.emotion,
            gesture: finalParsed.gesture,
            backend: 'cloud-free-api',
            providerLabel: providerMeta.name,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith('MISSING_KEY:')) {
          const hint = msg.replace('MISSING_KEY:', '');
          return {
            finalText: `Aiya! You selected **${providerMeta.name}**, which needs a free API key (${hint}). Click **Free APIs** at the top right to paste your key—or switch back to **Pollinations Free Cloud AI** for zero-key instant chat!`,
            emotion: 'surprised',
            gesture: 'think',
            backend: 'cloud-free-api',
            providerLabel: providerMeta.name,
            missingKeyPrompt: hint,
          };
        }

        console.warn(`${providerMeta.name} error, trying automatic Pollinations backup:`, err);

        // If a non-Pollinations free API errored (e.g., CORS or rate-limit), try zero-key Pollinations automatically
        if (this.settings.provider !== 'pollinations') {
          try {
            const backupRaw = await callFreeCloudApi(
              { ...this.settings, provider: 'pollinations' },
              recentHistory,
              userPrompt,
              (rawAcc) => {
                const parsed = parseEmotionAndCleanText(rawAcc);
                onChunk(parsed.cleanText, 'cloud-free-api');
              }
            );
            const parsedBackup = parseEmotionAndCleanText(backupRaw);
            if (parsedBackup.cleanText.trim().length > 0) {
              return {
                finalText: parsedBackup.cleanText,
                emotion: parsedBackup.emotion,
                gesture: parsedBackup.gesture,
                backend: 'cloud-free-api',
                providerLabel: 'Pollinations Free Cloud (Auto-Fallback)',
              };
            }
          } catch {
            // proceed to instant offline persona below
          }
        }
      }
    } else {
      // PATH B: In-Browser WebGPU / WASM AI
      if (this.status.state === 'idle') {
        void this.initializeWebGPU(this.settings.modelByProvider.webgpu).catch(() => {});
      }

      const llmMessages = [
        { role: 'system' as const, content: HUTAO_SYSTEM_PROMPT },
        ...recentHistory,
        { role: 'user' as const, content: userPrompt },
      ];

      if (this.webllmEngine && this.status.backend === 'webgpu-webllm') {
        try {
          const chunks = await this.webllmEngine.chat.completions.create({
            messages: llmMessages,
            temperature: 0.78,
            top_p: 0.9,
            max_tokens: 240,
            stream: true,
          });

          let rawAccumulated = '';
          for await (const chunk of chunks) {
            const delta = chunk.choices[0]?.delta?.content ?? '';
            if (delta) {
              rawAccumulated += delta;
              const parsed = parseEmotionAndCleanText(rawAccumulated);
              onChunk(parsed.cleanText, 'webgpu-webllm');
            }
          }

          const finalParsed = parseEmotionAndCleanText(rawAccumulated);
          return {
            finalText:
              finalParsed.cleanText || 'Hehe~ Cat got my tongue for a second! Ask me again!',
            emotion: finalParsed.emotion,
            gesture: finalParsed.gesture,
            backend: 'webgpu-webllm',
            providerLabel: 'WebGPU Local AI',
          };
        } catch (err) {
          console.warn('WebLLM generation error, falling back:', err);
        }
      }

      if (this.wasmWorker && this.wasmReady) {
        try {
          const rawReply = await new Promise<string>((resolve, reject) => {
            const reqId = Math.random().toString(36).slice(2);
            const worker = this.wasmWorker!;
            const onMsg = (e: MessageEvent) => {
              if (e.data?.id !== reqId) return;
              worker.removeEventListener('message', onMsg);
              if (e.data.type === 'result') {
                resolve(e.data.text);
              } else {
                reject(new Error(e.data.error || 'WASM inference failed'));
              }
            };
            worker.addEventListener('message', onMsg);
            worker.postMessage({
              type: 'generate',
              id: reqId,
              messages: llmMessages,
            });
          });

          const parsed = parseEmotionAndCleanText(rawReply);
          const text = parsed.cleanText || generateInstantHuTaoReply(userPrompt).text;
          await this.typewriterStream(text, (partial) => onChunk(partial, 'wasm-transformers'));
          return {
            finalText: text,
            emotion: parsed.emotion,
            gesture: parsed.gesture,
            backend: 'wasm-transformers',
            providerLabel: 'WASM Local AI',
          };
        } catch (err) {
          console.warn('WASM generation failed:', err);
        }
      }
    }

    // PATH C: Built-in Instant Persona Responder (guaranteed fallback if offline)
    const instant = generateInstantHuTaoReply(userPrompt);
    await this.typewriterStream(instant.text, (partial) => onChunk(partial, 'built-in'));
    return {
      finalText: instant.text,
      emotion: instant.emotion,
      gesture: instant.gesture,
      backend: 'built-in',
      providerLabel: 'Built-in Offline Persona',
    };
  }

  private async typewriterStream(text: string, onUpdate: (partial: string) => void): Promise<void> {
    const words = text.split(' ');
    let acc = '';
    for (let i = 0; i < words.length; i++) {
      acc += (i === 0 ? '' : ' ') + words[i];
      onUpdate(acc);
      await new Promise((r) => setTimeout(r, 22));
    }
  }
}

export const aiEngine = new LocalAIEngine();
