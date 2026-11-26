/// <reference types="vite/client" />
import { TextGenerationPipeline, pipeline, env } from '@huggingface/transformers';

// Ensure browser cache is used and local model check is disabled
env.allowLocalModels = false;
env.useBrowserCache = true;

const WASM_MODEL_ID = 'HuggingFaceTB/SmolLM2-360M-Instruct';

let generator: TextGenerationPipeline | null = null;

async function ensurePipeline(postProgress: (progress: number, detail: string) => void) {
  if (generator) return generator;

  postProgress(5, 'Initializing CPU/WASM AI runtime...');

  const pipe = await pipeline('text-generation', WASM_MODEL_ID, {
    dtype: 'q4',
    device: 'wasm',
    progress_callback: (info: Record<string, unknown>) => {
      if (typeof info.progress === 'number') {
        const pct = Math.min(99, Math.max(5, Math.round(info.progress)));
        const file = typeof info.file === 'string' ? info.file.split('/').pop() : 'weights';
        postProgress(pct, `Downloading ${file} (${pct}%)...`);
      }
    },
  });

  generator = pipe as TextGenerationPipeline;
  postProgress(100, 'SmolLM2-360M (WASM) ready!');
  return generator;
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, messages } = event.data;

  if (type === 'init') {
    try {
      await ensurePipeline((progress, detail) => {
        self.postMessage({ type: 'progress', progress, detail });
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (type === 'generate') {
    try {
      const pipe = await ensurePipeline((progress, detail) => {
        self.postMessage({ type: 'progress', progress, detail });
      });

      const output = await pipe(messages, {
        max_new_tokens: 180,
        temperature: 0.75,
        top_p: 0.9,
        do_sample: true,
      });

      let replyText = '';
      const first = Array.isArray(output) ? output[0] : output;
      if (first && typeof first === 'object' && 'generated_text' in first) {
        const gen = (first as { generated_text: unknown }).generated_text;
        if (Array.isArray(gen)) {
          const lastMsg = gen[gen.length - 1];
          replyText = typeof lastMsg?.content === 'string' ? lastMsg.content : String(lastMsg ?? '');
        } else if (typeof gen === 'string') {
          replyText = gen;
        }
      }

      self.postMessage({ type: 'result', id, text: replyText });
    } catch (err) {
      self.postMessage({
        type: 'error',
        id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
};
