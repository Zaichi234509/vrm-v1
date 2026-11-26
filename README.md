# Hu Tao — 3D VRM AI Virtual Assistant

An interactive 3D web virtual assistant featuring **Hu Tao** (77th Director of Wangsheng Funeral Parlor), powered by your uploaded `.vrm` model (`2420468417666751926.vrm`) and a built-in **Free AI API Hub** curated from [`OuterSpacee/free-ai-apis`](https://github.com/OuterSpacee/free-ai-apis).

## Supported Free AI APIs ($0 / No Credit Card)

Click **Free APIs** in the top-right of the chat panel to switch between:

1. **Pollinations Free Cloud AI** (`Auth: None` — default, works immediately with zero API key & zero model download)
2. **Puter.js Browser Cloud AI** (`Auth: None` — `@heyputer/puter.js` for GPT-4o Mini, Claude 3.5 Haiku, Gemini 2.0 Flash)
3. **Groq Cloud** (`Free Key` — ultra-fast Llama 3.3 70B & 8B)
4. **Google AI Studio / Gemini** (`Free Key` — Gemini 2.5 Flash & 2.0 Flash)
5. **Cerebras Inference** (`Free Key` — 1M free tokens/day on Llama 3.3 70B)
6. **OpenRouter (`:free` models)** (`Free Key` — DeepSeek V3, Llama 3.3 70B, Gemma 3 27B, Qwen 2.5 72B)
7. **Mistral AI (La Plateforme)** (`Free Key` — Mistral Small & Nemo)
8. **Z.ai (Zhipu GLM)** (`Free Key` — free `glm-4.5-flash`)
9. **Ollama / LM Studio** (`Local` — connect to `http://localhost:11434/v1`)
10. **In-Browser WebGPU / WASM** (`Offline` — `@mlc-ai/web-llm` & `@huggingface/transformers`)

## Running Locally

```bash
npm install --ignore-scripts
npm run dev
```
