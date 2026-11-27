import { FormEvent, TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronDown,
  ChevronUp,
  Flame,
  Loader2,
  Maximize2,
  MessageSquare,
  Minimize2,
  Music,
  Send,
  Settings2,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { VrmStage } from './components/VrmStage';
import { ApiSettingsModal } from './components/ApiSettingsModal';
import { useMediaQuery } from './hooks/useMediaQuery';
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

type MobileSheetMode = 'peek' | 'split' | 'full';

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

/** Mobile portrait sheet snap ratios (stage / chat) — animated via flex-grow */
const SHEET_RATIOS: Record<MobileSheetMode, { stage: number; chat: number }> = {
  peek: { stage: 80, chat: 20 },
  split: { stage: 46, chat: 54 },
  full: { stage: 24, chat: 76 },
};

const INITIAL_GREETING: ChatMessage = {
  id: 'welcome-msg',
  role: 'assistant',
  content:
    "Yahoo~! Welcome to my parlor! I'm Hu Tao, 77th Director of the Wangsheng Funeral Parlor—live in 3D inside my own study! I'm connected to Free AI APIs right out of the box (switch between Pollinations, Puter, Groq, Gemini, Cerebras, OpenRouter, Mistral, Z.ai, Ollama, or WebGPU anytime via Free APIs above). So—what's on your mind? Hehe~",
  emotion: 'playful',
  gesture: 'wave',
  timestamp: Date.now(),
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function App() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isShortLandscape = useMediaQuery('(max-width: 1023px) and (max-height: 520px)');
  const isRowLayout = isDesktop || isShortLandscape;

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTalking, setIsTalking] = useState(false);

  const [emotion, setEmotion] = useState<HuTaoEmotion>('playful');
  const [gesture, setGesture] = useState<HuTaoGesture>('wave');
  const [gestureTrigger, setGestureTrigger] = useState<number>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('upper');
  const [elevationOffset, setElevationOffset] = useState<number>(0.08);

  // Mobile responsive UI state (`mobile-responsiveness` skill: drawer & touch swipe sheet)
  const [mobileSheetMode, setMobileSheetMode] = useState<MobileSheetMode>('split');
  const [showMobileStageMenu, setShowMobileStageMenu] = useState(false);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [touchEndY, setTouchEndY] = useState<number | null>(null);

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

      // If user sends a message while in minimal stage-peek mode on mobile, expand to split view so they see Hu Tao + reply!
      if (!isDesktop && mobileSheetMode === 'peek') {
        setMobileSheetMode('split');
      }

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
    [isDesktop, isGenerating, messages, mobileSheetMode, pulseTalking, triggerGesture]
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

  // Touch swipe gesture on mobile chat sheet handle (`mobile-responsiveness` Touch Interactions pattern)
  const minSwipeDistance = 42;
  const onSheetTouchStart = (e: TouchEvent) => {
    setTouchEndY(null);
    setTouchStartY(e.targetTouches[0].clientY);
  };
  const onSheetTouchMove = (e: TouchEvent) => {
    setTouchEndY(e.targetTouches[0].clientY);
  };
  const onSheetTouchEnd = () => {
    if (touchStartY === null || touchEndY === null) return;
    const distance = touchStartY - touchEndY; // positive = swipe UP, negative = swipe DOWN
    if (distance > minSwipeDistance) {
      setMobileSheetMode((prev) => (prev === 'peek' ? 'split' : 'full'));
    } else if (distance < -minSwipeDistance) {
      setMobileSheetMode((prev) => (prev === 'full' ? 'split' : 'peek'));
    }
    setTouchStartY(null);
    setTouchEndY(null);
  };

  const cycleMobileSheetMode = () => {
    setMobileSheetMode((prev) =>
      prev === 'split' ? 'full' : prev === 'full' ? 'peek' : 'split'
    );
  };

  const statusDotClass =
    aiStatus.state === 'ready'
      ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]'
      : aiStatus.state === 'loading'
      ? 'animate-pulse bg-amber-400'
      : 'bg-rose-400';

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="app-shell-bg relative flex h-[100dvh] w-full flex-col overflow-hidden text-stone-100">
      {/* ======================= Global Platform Header ======================= */}
      <header className="safe-top-bar relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] bg-[#14090d]/85 pb-2 pl-3 pr-3 backdrop-blur-xl sm:pb-2.5 sm:pl-4 sm:pr-4">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-rose-600 to-amber-500 shadow-[0_8px_22px_-8px_rgba(244,63,94,0.8)] ring-1 ring-white/25 sm:h-10 sm:w-10">
            <div className="pointer-events-none absolute -inset-1 rounded-[20px] bg-gradient-to-br from-rose-500/45 to-amber-400/30 blur-[7px]" />
            <Flame className="relative h-4 w-4 text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)] sm:h-[18px] sm:w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className="font-display truncate font-bold tracking-tight text-white"
                style={{ fontSize: 'var(--font-size-title)' }}
              >
                Hu Tao
              </h1>
              <span className="hidden shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300 sm:inline-block">
                3D Companion
              </span>
            </div>
            <p className="hidden truncate text-[11px] text-rose-200/60 md:block">
              Wangsheng Funeral Parlor · 77th Director
            </p>
          </div>
        </div>

        {/* Live AI status chip (desktop) */}
        <div className="glass hidden min-w-0 items-center gap-2 rounded-full px-3.5 py-1.5 lg:flex xl:mx-auto">
          <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClass}`} />
          <span className="truncate text-xs font-medium text-stone-200">
            {aiStatus.modelLabel}
          </span>
          <span className="hidden max-w-[240px] truncate text-[11px] text-stone-500 xl:inline">
            · {aiStatus.detail}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <span className={`h-2 w-2 rounded-full lg:hidden ${statusDotClass}`} />
          <button
            type="button"
            onClick={() => setShowApiModal(true)}
            className="flex min-h-[36px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_24px_-10px_rgba(244,63,94,0.9)] transition hover:brightness-110 active:scale-95"
            title="Choose Free AI API Provider"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden min-[400px]:inline">Free APIs</span>
            <span className="min-[400px]:hidden">APIs</span>
          </button>
        </div>
      </header>

      {/* ======================= Stage + Chat Body ======================= */}
      <main className={`relative flex min-h-0 flex-1 ${isRowLayout ? 'flex-row' : 'flex-col'}`}>
        {/* LEFT / TOP: Interactive 3D VRM Stage inside Hu Tao's Room */}
        <section
          style={
            isRowLayout
              ? undefined
              : { flexGrow: SHEET_RATIOS[mobileSheetMode].stage, flexBasis: 0 }
          }
          className={`relative flex min-h-0 shrink-0 flex-col transition-[flex-grow] duration-300 ease-out ${
            isRowLayout ? (isDesktop ? 'min-w-0 flex-1' : 'w-1/2') : 'w-full'
          }`}
        >
          <div className="relative min-h-0 flex-1">
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
          </div>

          {/* Top-Right: Mobile Stage Controls (drawer toggle + full-stage toggle) */}
          <div className="safe-top pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-end gap-2 pt-2.5">
            {!isRowLayout && (
              <div className="pointer-events-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowMobileStageMenu((v) => !v)}
                  aria-expanded={showMobileStageMenu}
                  aria-label="Toggle stage camera, mood, and height controls"
                  className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-medium shadow-lg backdrop-blur-md transition active:scale-95 ${
                    showMobileStageMenu
                      ? 'border border-amber-400/50 bg-rose-950/90 text-amber-200'
                      : 'glass text-stone-200'
                  }`}
                >
                  {showMobileStageMenu ? (
                    <X className="h-4 w-4 text-amber-300" />
                  ) : (
                    <SlidersHorizontal className="h-4 w-4 text-amber-300" />
                  )}
                  <span className="hidden sm:inline">Stage</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setMobileSheetMode((prev) => (prev === 'peek' ? 'split' : 'peek'))
                  }
                  aria-label={mobileSheetMode === 'peek' ? 'Show chat split view' : 'Expand 3D stage'}
                  title={mobileSheetMode === 'peek' ? 'Show chat' : 'Expand 3D stage'}
                  className="glass flex h-10 w-10 items-center justify-center rounded-xl text-stone-200 shadow-lg transition active:scale-95"
                >
                  {mobileSheetMode === 'peek' ? (
                    <Minimize2 className="h-4 w-4 text-amber-300" />
                  ) : (
                    <Maximize2 className="h-4 w-4 text-rose-300" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Mobile Collapsible Stage Drawer (Camera + Mood + Height) */}
          {!isRowLayout && showMobileStageMenu && (
            <>
              <div
                className="fixed inset-0 z-20 bg-black/35"
                onClick={() => setShowMobileStageMenu(false)}
              />
              <div className="glass safe-x absolute left-0 right-0 top-16 z-30 mx-3 rounded-2xl p-3.5">
                <div className="space-y-3">
                  {/* Camera Presets */}
                  <div>
                    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      <Camera className="h-3.5 w-3.5 text-rose-400" /> Camera Framing
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
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
                          className={`min-h-[38px] rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
                            cameraPreset === preset.id
                              ? 'bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-md shadow-rose-950/60'
                              : 'border border-white/10 bg-white/5 text-stone-300 active:bg-white/10'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Facial Moods */}
                  <div>
                    <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                      <Smile className="h-3.5 w-3.5 text-amber-400" /> Expression Mood
                    </span>
                    <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
                      {EMOTION_BADGES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setEmotion(item.id);
                            if (item.id === 'playful') triggerGesture('spooky', 'playful');
                            else if (item.id === 'happy') triggerGesture('jump', 'happy');
                          }}
                          className={`flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                            emotion === item.id
                              ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50'
                              : 'border border-white/10 bg-white/5 text-stone-300'
                          }`}
                        >
                          <span>{item.emoji}</span>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stage Height Fine-Tuner */}
                  <div className="flex items-center justify-between border-t border-white/10 pt-2.5">
                    <span className="text-xs font-medium text-stone-300">Stage Height Offset</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setElevationOffset((h) => Math.max(-0.2, +(h - 0.06).toFixed(2)))
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-stone-200 active:bg-white/15"
                        aria-label="Lower character"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setElevationOffset(0.08)}
                        className="min-h-[36px] rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200"
                      >
                        {elevationOffset >= 0
                          ? `+${Math.round(elevationOffset * 100)}`
                          : Math.round(elevationOffset * 100)}
                        cm
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setElevationOffset((h) => Math.min(0.45, +(h + 0.06).toFixed(2)))
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-stone-200 active:bg-white/15"
                        aria-label="Raise character"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Head-pat / Tap Speech Bubble Toast */}
          {headPatToast && (
            <div className="glass pointer-events-none absolute left-1/2 top-16 z-20 flex max-w-[88vw] -translate-x-1/2 animate-bounce items-center gap-1.5 truncate rounded-full px-4 py-1.5 text-xs font-medium text-amber-200 sm:top-20">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              {headPatToast}
            </div>
          )}

          {/* Bottom Stage Controls: single swipeable Moves rail on mobile; full studio HUD rows on desktop */}
          {mobileSheetMode !== 'full' && (
            <div className="safe-x pointer-events-none absolute bottom-2.5 left-0 right-0 z-10 flex flex-col gap-2 sm:bottom-3">
              {/* Row 1: Motion Choreography Triggers */}
              <div className="flex items-center justify-between gap-2">
                <div className="glass no-scrollbar pointer-events-auto flex items-center gap-0.5 overflow-x-auto rounded-2xl p-1">
                  <span className="mr-0.5 hidden shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600/25 to-amber-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-amber-200 sm:inline-flex">
                    <Music className="h-3.5 w-3.5" /> Moves
                  </span>
                  {ACTION_BUTTONS.map((act) => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => triggerGesture(act.id, act.emo)}
                      className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-medium text-stone-200 transition hover:bg-rose-500/25 hover:text-amber-100 active:scale-95 sm:min-h-[32px]"
                    >
                      <span>{act.emoji}</span>
                      <span>{act.label}</span>
                    </button>
                  ))}
                </div>

                {/* Desktop Stage Height Fine-Tuner */}
                <div className="glass pointer-events-auto hidden items-center gap-1 rounded-2xl p-1 lg:flex">
                  <span className="px-2 text-[11px] font-medium text-stone-400">Height</span>
                  <button
                    type="button"
                    title="Lower character slightly"
                    onClick={() =>
                      setElevationOffset((h) => Math.max(-0.2, +(h - 0.06).toFixed(2)))
                    }
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
                    {elevationOffset >= 0
                      ? `+${Math.round(elevationOffset * 100)}`
                      : Math.round(elevationOffset * 100)}
                    cm
                  </button>
                  <button
                    type="button"
                    title="Raise character higher"
                    onClick={() =>
                      setElevationOffset((h) => Math.min(0.45, +(h + 0.06).toFixed(2)))
                    }
                    className="rounded-lg p-1 text-stone-300 transition hover:bg-white/10 hover:text-white"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Row 2 (Desktop / Landscape only): Camera Framing & Facial Moods */}
              {isRowLayout && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl p-1">
                    <span className="hidden items-center gap-1 px-2.5 text-[11px] font-medium text-stone-400 sm:inline-flex">
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
                        className={`rounded-xl px-2.5 py-1 text-xs font-medium transition ${
                          cameraPreset === preset.id
                            ? 'bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-md shadow-rose-950/60'
                            : 'text-stone-300 hover:bg-white/10'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="glass no-scrollbar pointer-events-auto flex items-center gap-0.5 overflow-x-auto rounded-2xl p-1">
                    <span className="hidden items-center gap-1 px-2.5 text-[11px] font-medium text-stone-400 xl:inline-flex">
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
                        className={`flex items-center gap-1 rounded-xl px-2 py-1 text-xs transition ${
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
              )}
            </div>
          )}
        </section>

        {/* RIGHT / BOTTOM: Responsive AI Assistant Chat Sheet / Sidebar */}
        <aside
          style={
            isRowLayout
              ? undefined
              : { flexGrow: SHEET_RATIOS[mobileSheetMode].chat, flexBasis: 0 }
          }
          className={`relative z-20 flex min-h-0 shrink-0 flex-col border-rose-500/20 bg-[#170b10]/95 shadow-2xl backdrop-blur-xl transition-[flex-grow] duration-300 ease-out ${
            isRowLayout
              ? isDesktop
                ? 'w-[430px] min-w-[430px] border-l xl:w-[460px] xl:min-w-[460px]'
                : 'w-1/2 border-l'
              : 'w-full rounded-t-3xl border-t'
          }`}
        >
          {/* Mobile Swipeable Bottom-Sheet Handle (`mobile-responsiveness` Touch Interactions) */}
          {!isRowLayout && (
            <div
              onTouchStart={onSheetTouchStart}
              onTouchMove={onSheetTouchMove}
              onTouchEnd={onSheetTouchEnd}
              onClick={cycleMobileSheetMode}
              role="button"
              tabIndex={0}
              aria-label="Drag or tap to resize chat panel"
              className="flex cursor-pointer select-none flex-col items-center justify-center pt-2 pb-1 active:opacity-80"
            >
              <div className="h-1.5 w-11 rounded-full bg-rose-300/30" />
            </div>
          )}

          {/* Conversation Header */}
          <header className="border-b border-white/[0.07] px-3.5 py-2.5 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="relative shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-amber-500 font-display text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(244,63,94,0.8)] ring-1 ring-white/20">
                    胡
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#170b10] ${statusDotClass}`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-display truncate text-sm font-semibold text-white">
                      Conversation
                    </h2>
                    <span className="hidden max-w-[180px] truncate text-[11px] text-stone-500 sm:inline">
                      · {aiStatus.modelLabel}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-stone-400">
                    {aiStatus.state === 'loading'
                      ? 'Waking up her AI brain…'
                      : aiStatus.detail}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {/* Mobile Sheet Expand / Collapse Quick Button */}
                {!isRowLayout && (
                  <button
                    type="button"
                    onClick={() =>
                      setMobileSheetMode((prev) => (prev === 'full' ? 'split' : 'full'))
                    }
                    aria-label={mobileSheetMode === 'full' ? 'Restore split view' : 'Expand chat'}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-stone-300 transition active:bg-white/15"
                  >
                    {mobileSheetMode === 'full' ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearChat}
                  title="Reset conversation"
                  aria-label="Reset conversation"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-stone-300 transition hover:bg-rose-500/20 hover:text-rose-200 active:scale-95"
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

          {/* Peek Mode Compact Preview vs Full Scrollable Conversation */}
          {!isRowLayout && mobileSheetMode === 'peek' ? (
            <button
              type="button"
              onClick={() => setMobileSheetMode('split')}
              className="safe-bottom safe-x flex flex-1 items-center justify-between gap-3 px-4 py-2 text-left"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="relative shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-600 to-amber-600 font-display text-xs font-bold text-white ring-1 ring-white/20">
                    胡
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[#170b10] ${statusDotClass}`}
                  />
                </div>
                <p className="truncate text-xs text-stone-300">
                  {latestAssistantMsg?.content || 'Tap to chat with Director Hu Tao…'}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-rose-600 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_rgba(244,63,94,0.9)]">
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </span>
            </button>
          ) : (
            <>
              {/* Conversation Messages */}
              <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 py-3.5 sm:px-4 sm:py-4">
                {messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`msg-in flex items-end gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-600 to-amber-500 font-display text-xs font-bold text-white shadow-lg shadow-rose-950/50 ring-1 ring-white/15">
                          胡
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed sm:max-w-[80%] sm:text-sm ${
                          isUser
                            ? 'rounded-br-md bg-gradient-to-br from-rose-600 to-rose-700 text-white shadow-[0_12px_30px_-12px_rgba(244,63,94,0.65)]'
                            : 'rounded-bl-md border border-rose-500/20 bg-[#221017]/92 text-stone-100 shadow-lg backdrop-blur-md'
                        }`}
                      >
                        {msg.content ? (
                          <p className="whitespace-pre-wrap break-words">
                            {msg.content}
                            {msg.streaming && <span className="stream-caret" aria-hidden />}
                          </p>
                        ) : (
                          <span className="flex items-center gap-1.5 py-0.5 pl-1">
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="typing-dot" />
                            <span className="ml-1.5 text-xs text-amber-300/80">
                              Hu Tao is thinking
                            </span>
                          </span>
                        )}

                        {!isUser && !msg.streaming && (msg.emotion || msg.providerUsed) && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5 text-[10px] text-rose-300/70">
                            <span className="inline-flex items-center gap-1 capitalize">
                              <Sparkles className="h-3 w-3 text-amber-400/80" />
                              {msg.emotion}
                            </span>
                            <span className="flex items-center gap-2">
                              {msg.providerUsed && (
                                <span className="max-w-[130px] truncate text-stone-500">
                                  {msg.providerUsed}
                                </span>
                              )}
                              <span className="text-stone-500">
                                {formatTime(msg.timestamp)}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-stone-800/90 text-stone-300">
                          <User className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Starter Chips */}
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.06] px-3.5 py-2.5 sm:px-4">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400/70" />
                {QUICK_PROMPTS.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => void sendMessage(item.prompt)}
                    className="min-h-[32px] shrink-0 rounded-full border border-rose-500/25 bg-rose-950/40 px-3 py-1 text-xs text-amber-100/90 transition hover:border-amber-400/50 hover:bg-rose-900/50 active:scale-95 disabled:opacity-40"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Text Input Form (`text-base` on mobile prevents iOS Safari auto-zoom; `safe-bottom` clears home indicator!) */}
              <form
                onSubmit={handleSubmit}
                className="safe-bottom safe-x border-t border-white/[0.07] bg-[#12080b]/95 pb-2 pt-2.5 sm:p-4"
              >
                <div className="flex items-center gap-2 rounded-2xl border border-rose-500/25 bg-[#1e0d12]/90 px-2.5 py-1.5 transition focus-within:border-amber-400/60 focus-within:shadow-[0_0_0_3px_rgba(251,191,36,0.12)] sm:px-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-amber-400/60" />
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Hu Tao anything…"
                    disabled={isGenerating}
                    enterKeyHint="send"
                    className="w-full bg-transparent py-1.5 text-base text-stone-100 placeholder-stone-500 focus:outline-none disabled:opacity-60 sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isGenerating}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-[0_10px_26px_-10px_rgba(244,63,94,0.9)] transition hover:brightness-110 active:scale-95 disabled:opacity-35 disabled:hover:brightness-100 sm:h-9 sm:w-9"
                    aria-label="Send message"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 hidden items-center justify-center gap-1.5 text-center text-[10px] text-stone-500 sm:flex">
                  <span>Drag to orbit her room</span>
                  <span>·</span>
                  <span>Pinch/Scroll to zoom</span>
                  <span>·</span>
                  <span>Tap Hu Tao to play</span>
                </p>
              </form>
            </>
          )}
        </aside>
      </main>

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
