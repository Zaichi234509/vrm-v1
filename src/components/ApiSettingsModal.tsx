import { useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound, Server, ShieldCheck, Sparkles, X } from 'lucide-react';
import { FREE_API_PROVIDERS } from '../lib/freeApiProviders';
import type { AIProviderId, AIProviderSettings } from '../types';

interface ApiSettingsModalProps {
  open: boolean;
  settings: AIProviderSettings;
  onClose: () => void;
  onSave: (next: AIProviderSettings) => void;
}

export function ApiSettingsModal({ open, settings, onClose, onSave }: ApiSettingsModalProps) {
  const [draft, setDraft] = useState<AIProviderSettings>(settings);

  useEffect(() => {
    if (open) {
      setDraft(settings);
    }
  }, [open, settings]);

  if (!open) return null;

  const activeMeta =
    FREE_API_PROVIDERS.find((p) => p.id === draft.provider) ?? FREE_API_PROVIDERS[0];
  const currentModel = draft.modelByProvider[draft.provider] ?? activeMeta.models[0].id;
  const currentKey = draft.apiKeys[draft.provider] ?? '';

  const selectProvider = (id: AIProviderId) => {
    setDraft((prev) => ({ ...prev, provider: id }));
  };

  const setModel = (modelId: string) => {
    setDraft((prev) => ({
      ...prev,
      modelByProvider: {
        ...prev.modelByProvider,
        [prev.provider]: modelId,
      },
    }));
  };

  const setApiKey = (val: string) => {
    setDraft((prev) => ({
      ...prev,
      apiKeys: {
        ...prev.apiKeys,
        [prev.provider]: val,
      },
    }));
  };

  const handleApply = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-rose-500/30 bg-[#180b0e] text-stone-100 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-amber-500 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-amber-50">Free AI API Hub</h2>
              <p className="text-xs text-stone-400">
                Powered by providers from{' '}
                <a
                  href="https://github.com/OuterSpacee/free-ai-apis"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-300 underline decoration-amber-400/40 hover:text-amber-200"
                >
                  OuterSpacee/free-ai-apis
                </a>{' '}
                ($0 / no credit card)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-white/10 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-12">
          {/* Provider List */}
          <div className="border-b border-white/10 p-3 md:col-span-5 md:border-b-0 md:border-r">
            <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Choose Free Provider
            </p>
            <div className="space-y-1">
              {FREE_API_PROVIDERS.map((p) => {
                const selected = draft.provider === p.id;
                const hasSavedKey = Boolean(draft.apiKeys[p.id]?.trim());
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectProvider(p.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition ${
                      selected
                        ? 'bg-rose-600/25 text-amber-100 ring-1 ring-rose-500/50'
                        : 'text-stone-300 hover:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="truncate text-xs font-semibold">{p.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.2 text-[10px] ${
                            p.authType === 'none'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : p.authType === 'local'
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {p.badge}
                        </span>
                        {p.authType === 'apiKey' && hasSavedKey && (
                          <span className="text-[10px] text-emerald-400">● Key set</span>
                        )}
                      </div>
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-amber-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Provider Configuration */}
          <div className="flex flex-col justify-between p-5 md:col-span-7">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">{activeMeta.name}</h3>
                  {activeMeta.keyPortalUrl && (
                    <a
                      href={activeMeta.keyPortalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition"
                    >
                      <span>{activeMeta.authType === 'apiKey' ? 'Get Free Key' : 'Docs'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-stone-300">
                  {activeMeta.freeTierSummary}
                </p>
              </div>

              {/* Model Picker / Custom Model ID */}
              <div>
                <label className="block text-xs font-medium text-stone-300">Model</label>
                <select
                  value={
                    activeMeta.models.some((m) => m.id === currentModel) ? currentModel : '__custom'
                  }
                  onChange={(e) => {
                    if (e.target.value !== '__custom') setModel(e.target.value);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#231015] px-3 py-2 text-xs text-stone-100 focus:border-amber-400 focus:outline-none"
                >
                  {activeMeta.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.id})
                    </option>
                  ))}
                </select>

                {activeMeta.id !== 'webgpu' && (
                  <input
                    type="text"
                    value={currentModel}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="Or type any model ID supported by this provider..."
                    className="mt-2 w-full rounded-xl border border-white/10 bg-[#14080b] px-3 py-1.5 text-xs text-stone-200 placeholder-stone-500 focus:border-amber-400/60 focus:outline-none"
                  />
                )}
              </div>

              {/* API Key Input for apiKey providers */}
              {activeMeta.authType === 'apiKey' && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-amber-200">
                    <KeyRound className="h-3.5 w-3.5" />
                    Free API Key
                  </label>
                  <input
                    type="password"
                    value={currentKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={activeMeta.keyPlaceholder || 'Paste your free API key...'}
                    className="mt-1.5 w-full rounded-xl border border-rose-500/30 bg-[#14080b] px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:border-amber-400 focus:outline-none"
                  />
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-stone-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    Stored only in your browser&apos;s localStorage — never sent anywhere except{' '}
                    {activeMeta.name}.
                  </p>
                </div>
              )}

              {/* Zero-Auth badge */}
              {activeMeta.authType === 'none' && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 p-3 text-xs text-emerald-200">
                  <strong>Zero setup required!</strong> No API key or credit card needed—just save
                  and start chatting with Hu Tao right away.
                </div>
              )}

              {/* Ollama Base URL */}
              {activeMeta.id === 'ollama' && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-sky-200">
                    <Server className="h-3.5 w-3.5" />
                    Local OpenAI-Compatible Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={draft.ollamaBaseUrl}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, ollamaBaseUrl: e.target.value }))
                    }
                    placeholder="http://localhost:11434/v1"
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-[#14080b] px-3 py-2 text-xs text-stone-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="mt-6 flex items-center justify-end gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-medium text-stone-300 hover:bg-white/5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-rose-950/60 hover:brightness-110 transition"
              >
                Use {activeMeta.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
