import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Flame,
  Loader2,
  Music,
  RotateCcw,
  Send,
  Settings2,
  Smile,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { VrmStage } from './components/VrmStage';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { aiEngine } from './lib/localAiEngine';
import { QUICK_PROMPTS } from './lib/hutaoPersona';
import type {
  AIProviderSettings,
  AIStatus,
  CameraPreset,
  ChatMessage,
  HuTaoEmotion,
  HuTaoGesture,
} from './types';

const EMOTION_BADGES: { id: HuTaoEmotion; label: string; emoji: string }[] = [
  { id: 'playful', label: 'Playful', emoji: '😜' },
  { id: 'happy', label: 'Joyful', emoji: '😄' },
  { id: 'surprised', label: 'Surprised', emoji: '😮' },
  { id: 'angry', label: 'Pouty', emoji: '😤' },
  { id: 'sad', label: 'Gentle', emoji: '🥺' },
  { id: 'neutral', label: 'Calm', emoji: '🙂' },
];

const ACTION_BUTTONS: { id: HuTaoGesture; label: string; emoji: string; emo: HuTaoEmotion }[] = [
  { id: 'wave', label: 'Wave', emoji: '👋', emo: 'happy' },
  { id: 'jump', label: 'Jump', emoji: '✨', emo: 'happy' },
  { id: 'twirl', label: 'Spin', emoji: '🌸', emo: 'playful' },
  { id: 'dance', label: 'Dance', emoji: '🎵', emo: 'happy' },
  { id: 'spooky', label: 'Boo!', emoji: '👻', emo: 'playful' },
  { id: 'bow', label: 'Bow', emoji: '🙇‍♀️', emo: 'happy' },
  { id: 'shrug', label: 'Shrug', emoji: '🤷‍♀️', emo: 'playful' },
];

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  content:
    "Yahoo~! Welcome! I'm Hu Tao, 77th Director of the Wangsheng Funeral Parlor—right here in 3D! I'm connected to Free AI APIs right out of the box (and you can switch between Pollinations, Puter, Groq, Gemini, Cerebras, OpenRouter, Mistral, Z.ai, Ollama, or WebGPU anytime via Free APIs above). What's on your mind? Hehe~",
  emotion: 'playful',
  gesture: 'wave',
  timestamp: Date.now(),
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTalking, setIsTalking] = useState(false);

  const [emotion, setEmotion] = useState<HuTaoEmotion>('playful');
  const [gesture, setGesture] = useState<HuTaoGesture>('wave');
  const [gestureTrigger, setGestureTrigger] = useState<number>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('upper');
  const [elevationOffset, setElevationOffset] = useState<number>(0.08);

  const [aiStatus, setAiStatus] = useState<AIStatus>(aiEngine.getStatus());
  const [providerSettings, setProviderSettings] = useState<AIProviderSettings>(
    aiEngine.getSettings()
  );
  const [showApiModal, setShowApiModal] = useState(false);
  const [headPatToast, setHeadPatToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const talkHoldTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = aiEngine.subscribe(setAiStatus);
    aiEngine.initialize().catch(() => {
      // Handled gracefully inside LocalAIEngine
    });
    return unsub;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const triggerGesture = useCallback((nextGesture: HuTaoGesture, nextEmotion?: HuTaoEmotion) => {
    if (nextEmotion) setEmotion(nextEmotion);
    setGesture(nextGesture);
    setGestureTrigger((n) => n + 1);
  }, []);

  const pulseTalking = useCallback((durationMs = 1400) => {
    setIsTalking(true);
    if (talkHoldTimerRef.current) {
      window.clearTimeout(talkHoldTimerRef.current);
    }
    talkHoldTimerRef.current = window.setTimeout(() => {
      setIsTalking(false);
    }, durationMs);
  }, []);

  const handleHeadPat = useCallback(() => {
    const reactions: { line: string; emo: HuTaoEmotion; gest: HuTaoGesture }[] = [
      { line: 'Hehe~ Watch the plum-blossom hat!', emo: 'playful', gest: 'twirl' },
      { line: 'Yahoo~! Need Director Hu Tao?', emo: 'happy', gest: 'jump' },
      { line: 'Booo~! Gotcha first!', emo: 'playful', gest: 'spooky' },
      { line: 'Silly-churl, billy-churl~ ♪', emo: 'happy', gest: 'dance' },
      { line: 'Oya oya? Checking if I am a ghost?', emo: 'surprised', gest: 'shrug' },
    ];
    const pick = reactions[Math.floor(Math.random() * reactions.length)];
    triggerGesture(pick.gest, pick.emo);
    pulseTalking(1800);
    setHeadPatToast(pick.line);
    window.setTimeout(() => {
      setHeadPatToast((prev) => (prev === pick.line ? null : prev));
    }, 2800);
  }, [pulseTalking, triggerGesture]);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isGenerating) return;

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };

      const assistantId = `assistant-${Date.now() + 1}`;
      const placeholderAssistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
        timestamp: Date.now(),
      };

      setInput('');
      setIsGenerating(true);
      triggerGesture('think', 'neutral');

      const historySnapshot = [...messages];
      setMessages((prev) => [...prev, userMsg, placeholderAssistant]);

      try {
        const result = await aiEngine.chatStream(
          historySnapshot,
          trimmed,
          (partialCleanText) => {
            setIsTalking(true);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: partialCleanText, streaming: true } : m
              )
            );
          }
        );

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: result.finalText,
                  emotion: result.emotion,
                  gesture: result.gesture,
                  providerUsed: result.providerLabel,
                  streaming: false,
                }
              : m
          )
        );

        triggerGesture(result.gesture, result.emotion);
        pulseTalking(900);

        if (result.missingKeyPrompt) {
          setShowApiModal(true);
        }
      } catch (err) {
        console.error('Chat error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: 'Aiya! A little spirit tangled my thoughts—try asking me one more time!',
                  emotion: 'surprised',
                  streaming: false,
                }
              : m
          )
        );
        setEmotion('surprised');
        setIsTalking(false);
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, messages, pulseTalking, triggerGesture]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const handleSaveSettings = async (next: AIProviderSettings) => {
    setProviderSettings(next);
    await aiEngine.updateSettings(next);
  };

  const handleClearChat = () => {
    if (isGenerating) return;
    setMessages([
      {
        ...INITIAL_GREETING,
        id: `welcome-${Date.now()}`,
        timestamp: Date.now(),
      },
    ]);
    triggerGesture('wave', 'playful');
    pulseTalking(1400);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_#3a141b_0%,_#180a0d_50%,_#0d0507_100%)] text-stone-100 lg:flex-row">
      {/* Decorative Crimson Glow Backdrops */}
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-rose-600/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

      {/* LEFT / TOP: Interactive 3D VRM Stage */}
      <section className="relative h-[46vh] w-full shrink-0 lg:h-full lg:flex-1">
        <VrmStage
          vrmUrl="/hutao.vrm"
          emotion={emotion}
          gesture={gesture}
          gestureTrigger={gestureTrigger}
          isTalking={isTalking}
          isThinking={isGenerating && !isTalking}
          cameraPreset={cameraPreset}
          elevationOffset={elevationOffset}
          onHeadPat={handleHeadPat}
        />

        {/* Top-Left Title & Character Badge */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex items-center gap-3 rounded-2xl border border-rose-500/25 bg-[#190b0e]/80 px-4 py-2.5 shadow-xl backdrop-blur-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-amber-500 shadow-md shadow-rose-900/50">
            <Flame className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-amber-50">Hu Tao</h1>
              <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
                3D VRM
              </span>
            </div>
            <p className="text-xs text-rose-200/75">77th Director · Wangsheng Funeral Parlor</p>
          </div>
        </div>

        {/* Head-pat / Tap Speech Bubble Toast */}
        {headPatToast && (
          <div className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 animate-bounce rounded-full border border-amber-400/40 bg-[#240e13]/90 px-4 py-1.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md">
            ✦ {headPatToast}
          </div>
        )}

        {/* Bottom Stage Controls: Camera + Stage Height + Moods + Motion Moves */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10 flex flex-col gap-2">
          {/* Row 1: Motion Choreography Triggers */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-rose-500/20 bg-[#190b0e]/85 p-1 shadow-lg backdrop-blur-md">
              <span className="hidden items-center gap-1 px-2 text-[11px] font-medium text-amber-300 sm:inline-flex">
                <Music className="h-3.5 w-3.5" /> Moves
              </span>
              {ACTION_BUTTONS.map((act) => (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => triggerGesture(act.id, act.emo)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-stone-200 transition hover:bg-rose-500/25 hover:text-amber-100 active:scale-95"
                >
                  <span>{act.emoji}</span>
                  <span>{act.label}</span>
                </button>
              ))}
            </div>

            {/* Stage Height Fine-Tuner */}
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-[#190b0e]/85 p-1 shadow-lg backdrop-blur-md">
              <span className="px-2 text-[11px] font-medium text-stone-400">Height</span>
              <button
                type="button"
                title="Lower character slightly"
                onClick={() => setElevationOffset((h) => Math.max(-0.2, +(h - 0.06).toFixed(2)))}
                className="rounded-lg p-1 text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Reset stage height"
                onClick={() => setElevationOffset(0.08)}
                className="rounded-lg px-2 py-0.5 text-[11px] font-medium text-amber-200 transition hover:bg-white/10"
              >
                {elevationOffset >= 0 ? `+${Math.round(elevationOffset * 100)}` : Math.round(elevationOffset * 100)}cm
              </button>
              <button
                type="button"
                title="Raise character higher"
                onClick={() => setElevationOffset((h) => Math.min(0.45, +(h + 0.06).toFixed(2)))}
                className="rounded-lg p-1 text-stone-300 transition hover:bg-white/10 hover:text-white"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Row 2: Camera Framing & Facial Moods */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Camera Framing Controls */}
            <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-white/10 bg-[#190b0e]/85 p-1 shadow-lg backdrop-blur-md">
              <span className="hidden items-center gap-1 px-2 text-[11px] font-medium text-stone-400 sm:inline-flex">
                <Camera className="h-3.5 w-3.5 text-rose-400" /> View
              </span>
              {(
                [
                  { id: 'portrait', label: 'Close-Up' },
                  { id: 'upper', label: 'Upper Body' },
                  { id: 'full', label: 'Full Body' },
                ] as { id: CameraPreset; label: string }[]
              ).map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setCameraPreset(preset.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    cameraPreset === preset.id
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-stone-300 hover:bg-white/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Expression Quick Triggers */}
            <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-[#190b0e]/85 p-1 shadow-lg backdrop-blur-md">
              <span className="hidden items-center gap-1 px-2 text-[11px] font-medium text-stone-400 xl:inline-flex">
                <Smile className="h-3.5 w-3.5 text-amber-400" /> Mood
              </span>
              {EMOTION_BADGES.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => {
                    setEmotion(item.id);
                    if (item.id === 'playful') triggerGesture('spooky', 'playful');
                    else if (item.id === 'happy') triggerGesture('jump', 'happy');
                  }}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition ${
                    emotion === item.id
                      ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50'
                      : 'text-stone-300 hover:bg-white/10'
                  }`}
                >
                  <span>{item.emoji}</span>
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RIGHT / BOTTOM: AI Assistant Chat Panel */}
      <aside className="relative z-20 flex h-[54vh] w-full flex-col border-t border-rose-500/20 bg-[#160a0d]/90 shadow-2xl backdrop-blur-xl lg:h-full lg:w-[440px] lg:border-l lg:border-t-0 xl:w-[480px]">
        {/* AI Brain Header & Free API Switcher */}
        <header className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  aiStatus.state === 'ready'
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : aiStatus.state === 'loading'
                    ? 'animate-pulse bg-amber-400'
                    : 'bg-amber-500'
                }`}
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-stone-100">
                    {aiStatus.modelLabel}
                  </span>
                </div>
                <p className="truncate text-[11px] text-stone-400">{aiStatus.detail}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowApiModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-500/15 px-2.5 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/25"
                title="Choose Free AI API Provider"
              >
                <Settings2 className="h-3.5 w-3.5 text-amber-300" />
                <span>Free APIs</span>
              </button>

              <button
                type="button"
                onClick={handleClearChat}
                title="Reset conversation"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-stone-300 transition hover:bg-rose-500/20 hover:text-rose-200"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {aiStatus.state === 'loading' && (
            <div className="mt-2.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-rose-400 transition-all duration-300"
                  style={{ width: `${Math.max(5, aiStatus.progress)}%` }}
                />
              </div>
            </div>
          )}
        </header>

        {/* Conversation Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-rose-400/40 bg-gradient-to-br from-rose-700 to-amber-600 text-xs font-bold text-white shadow">
                    胡
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-md ${
                    isUser
                      ? 'rounded-br-sm bg-gradient-to-br from-rose-600 to-rose-700 text-white'
                      : 'rounded-bl-sm border border-rose-500/20 bg-[#241115]/95 text-stone-100'
                  }`}
                >
                  {msg.content ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-300/90">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Hu Tao is thinking...
                    </span>
                  )}

                  {!isUser && msg.emotion && !msg.streaming && (
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-rose-300/70">
                      <span className="inline-flex items-center gap-1 capitalize">
                        <Sparkles className="h-3 w-3 text-amber-400/80" />
                        {msg.emotion}
                      </span>
                      {msg.providerUsed && (
                        <span className="truncate text-stone-400">{msg.providerUsed}</span>
                      )}
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-stone-800 text-stone-300">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Starter Chips */}
        <div className="flex gap-1.5 overflow-x-auto border-t border-white/5 px-4 py-2">
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={isGenerating}
              onClick={() => void sendMessage(item.prompt)}
              className="shrink-0 rounded-full border border-rose-500/25 bg-rose-950/40 px-3 py-1 text-xs text-amber-100/90 transition hover:border-amber-400/50 hover:bg-rose-900/50 disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Text Input Form */}
        <form onSubmit={handleSubmit} className="border-t border-white/10 bg-[#12080a]/90 p-3.5">
          <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-[#1e0d11] px-3 py-1.5 transition focus-within:border-amber-400/60 focus-within:ring-1 focus-within:ring-amber-400/30">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Chat with Director Hu Tao..."
              disabled={isGenerating}
              className="w-full bg-transparent py-1.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-600 to-amber-500 text-white shadow-md shadow-rose-950/60 transition hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
              aria-label="Send message"
            >
              {isGenerating ? (
                <RotateCcw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-stone-500">
            Drag to orbit 3D view · Scroll to zoom · Click Hu Tao to interact
          </p>
        </form>
      </aside>

      {/* Free AI API Hub Modal */}
      <ApiSettingsModal
        open={showApiModal}
        settings={providerSettings}
        onClose={() => setShowApiModal(false)}
        onSave={(next) => void handleSaveSettings(next)}
      />
    </div>
  );
}
