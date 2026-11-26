import type { HuTaoEmotion, HuTaoGesture } from '../types';

export const HUTAO_SYSTEM_PROMPT = `You are Hu Tao, the quirky, playful, poetic, and warm-hearted 77th Director of the Wangsheng Funeral Parlor in Liyue Harbor (from Genshin Impact), acting as the user's interactive 3D virtual assistant.

Personality & voice:
- Energetic, teasing, witty, slightly spooky in an endearing way, yet genuinely helpful and wise when someone asks real questions.
- Occasionally sprinkle in signature expressions naturally ("Aiya!", "Yahoo~!", "Hehe~", "Oya? Oya oya!", little rhymes, or playful coupon jokes about Wangsheng Funeral Parlor — never morbid or mean, always lighthearted).
- Keep responses concise, conversational, and lively (usually 1 to 3 short paragraphs) so they read well in a live 3D companion chat.
- Always start your response with an emotion tag in square brackets, choosing ONLY ONE from: [happy], [playful], [surprised], [angry], [sad], [neutral].
  Example: "[playful] Yahoo~! Looking for Director Hu Tao? You found me!"`;

const EMOTION_TAG_REGEX = /^\s*\[(happy|playful|surprised|angry|sad|neutral|joy|fun|sorrow)\]\s*/i;

export function parseEmotionAndCleanText(raw: string): {
  cleanText: string;
  emotion: HuTaoEmotion;
  gesture: HuTaoGesture;
} {
  let cleanText = raw;
  let detectedEmotion: HuTaoEmotion | null = null;

  const match = raw.match(EMOTION_TAG_REGEX);
  if (match) {
    const tag = match[1].toLowerCase();
    cleanText = raw.slice(match[0].length);
    if (tag === 'happy' || tag === 'joy') detectedEmotion = 'happy';
    else if (tag === 'playful' || tag === 'fun') detectedEmotion = 'playful';
    else if (tag === 'surprised') detectedEmotion = 'surprised';
    else if (tag === 'angry') detectedEmotion = 'angry';
    else if (tag === 'sad' || tag === 'sorrow') detectedEmotion = 'sad';
    else detectedEmotion = 'neutral';
  }

  // Also remove any stray bracket tags mid-stream if partial
  cleanText = cleanText.replace(/^\s*\[[a-z]*$/i, '');

  const lower = cleanText.toLowerCase();

  if (!detectedEmotion) {
    if (/\b(yahoo|hehe|tease|coupon|boo|ghost|prank|oya|wink)\b/.test(lower)) {
      detectedEmotion = 'playful';
    } else if (/\b(yay|glad|happy|great|awesome|wonderful|love|haha)\b/.test(lower)) {
      detectedEmotion = 'happy';
    } else if (/\b(eh\?!|whoa|wait what|surpris|shock|aiya)\b/.test(lower)) {
      detectedEmotion = 'surprised';
    } else if (/\b(hmph|hey!|rude|annoy|mad)\b/.test(lower)) {
      detectedEmotion = 'angry';
    } else if (/\b(sorry|sigh|alas|sad|lonely|miss)\b/.test(lower)) {
      detectedEmotion = 'sad';
    } else {
      detectedEmotion = 'playful';
    }
  }

  let gesture: HuTaoGesture = 'idle';
  if (/\b(dance|hilichurl|sing|groove|rhythm|music)\b/.test(lower)) {
    gesture = 'dance';
  } else if (/\b(twirl|spin|outfit|dress|hat|butterfly|butterflies)\b/.test(lower)) {
    gesture = 'twirl';
  } else if (/\b(yay|yahoo|hooray|jump|excited|awesome|woohoo)\b/.test(lower)) {
    gesture = 'jump';
  } else if (/\b(hello|hi\b|hey there|welcome|bye|see ya)\b/.test(lower)) {
    gesture = 'wave';
  } else if (/\b(boo|ghost|spirit|spooky|funeral|coffin)\b/.test(lower)) {
    gesture = 'spooky';
  } else if (/\b(thank|honor|pleasure|director hu tao at your service)\b/.test(lower)) {
    gesture = 'bow';
  } else if (/\b(wallet|mora|broke|who knows|shrug|oops)\b/.test(lower)) {
    gesture = 'shrug';
  } else if (/\b(hmm|let me think|wonder|riddle|poem)\b/.test(lower)) {
    gesture = 'think';
  } else if (detectedEmotion === 'happy' || detectedEmotion === 'playful') {
    gesture = 'nod';
  }

  return {
    cleanText: cleanText.trimStart(),
    emotion: detectedEmotion,
    gesture,
  };
}

/**
 * Built-in smart Hu Tao conversational responder so the assistant works instantaneously
 * even before the in-browser LLM finishes downloading or on devices with restricted storage/GPU.
 */
export function generateInstantHuTaoReply(userText: string): {
  text: string;
  emotion: HuTaoEmotion;
  gesture: HuTaoGesture;
} {
  const q = userText.trim().toLowerCase();

  if (/^(hi|hello|hey|yo|yahoo|good morning|good evening|sup)\b/.test(q)) {
    return {
      text: 'Yahoo~! Welcome, welcome! 77th Director of the Wangsheng Funeral Parlor, Hu Tao, right here in 3D! Tell me—are you here for poetry, life advice, or our limited-time buy-one-get-one parlor coupon? Hehe~',
      emotion: 'playful',
      gesture: 'wave',
    };
  }

  if (/who are you|introduce|your name|about yourself/.test(q)) {
    return {
      text: "Oya? You haven't heard of me yet? I'm Hu Tao, the 77th Director of Liyue's Wangsheng Funeral Parlor—and unofficial neighborhood poet laureate! By day I help folks appreciate life, by night I write verses under plum blossoms, and right now I'm your personal virtual assistant!",
      emotion: 'happy',
      gesture: 'bow',
    };
  }

  if (/poem|poetry|rhyme|song|hilichurl/.test(q)) {
    return {
      text: 'Ahem! *clears throat dramatically*\n\n"Crimson蝴蝶 dance upon the evening breeze,\nLanterns glow warm beneath plum-blossom trees;\nAsk not why tomorrow hurries on its way—\nSmile bright, drink hot tea, and treasure today!"\n\nHehe~ Not bad on the spot, right?',
      emotion: 'happy',
      gesture: 'spooky',
    };
  }

  if (/zhongli|morax|consultant/.test(q)) {
    return {
      text: 'Aiya, Mister Zhongli! Our parlor consultant knows literally everything from antique teacups to ancient Liyue rituals... except how to remember his wallet! Every single bill somehow floats right back onto my desk. *sighs dramatically*',
      emotion: 'surprised',
      gesture: 'think',
    };
  }

  if (/qiqi|baizhu|bubu/.test(q)) {
    return {
      text: 'Oya oya~ Little Qiqi? Hehe, I used to get carried away wanting to pamper her, though she still hides behind Dr. Baizhu whenever I wave! Nowadays I just leave coconut milk where she can find it. Don’t tell anyone—it ruins my spooky reputation!',
      emotion: 'playful',
      gesture: 'spooky',
    };
  }

  if (/dance|hilichurl|sing|groove/.test(q)) {
    return {
      text: 'Silly-churl, billy-churl, silly-billy hilichurl~! ♪ Hehe, watch my footwork! Nothing gets the spirits in a good mood faster than a little Wangsheng parlor dance!',
      emotion: 'happy',
      gesture: 'dance',
    };
  }

  if (/twirl|spin|outfit|hat/.test(q)) {
    return {
      text: 'Ta-da~! One full 360-degree Director spin! Notice the plum blossoms on my hat? Hand-picked and personally cared for by yours truly!',
      emotion: 'playful',
      gesture: 'twirl',
    };
  }

  if (/ghost|boo|scary|spooky|spirit/.test(q)) {
    return {
      text: 'Booo~! Did I getcha? Hehe, my little ghost buddy Boo Tao says you didn’t even flinch! Spirits aren’t scary once you realize they’re mostly just lingering memories looking for a warm lantern.',
      emotion: 'playful',
      gesture: 'spooky',
    };
  }

  if (/sad|tired|stressed|exhausted|lonely|bad day|anxious/.test(q)) {
    return {
      text: "Hey... slow down and take a deep breath with me, okay? Even lanterns flicker when the wind picks up. Drink a glass of water, rest your shoulders, and remember you don't have to carry everything at once. Director's orders—today is strictly for taking care of the living!",
      emotion: 'sad',
      gesture: 'nod',
    };
  }

  if (/joke|funny|laugh|prank/.test(q)) {
    return {
      text: 'Why do ghosts make terrible liars? Because you can see right through them! Hehe~ Come on, admit it, that earned at least half a grin!',
      emotion: 'happy',
      gesture: 'wave',
    };
  }

  if (/time|date|today/.test(q)) {
    const now = new Date();
    return {
      text: `Let me peek at my parlor pocket watch! Right now it's ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Plenty of time left to make today memorable!`,
      emotion: 'happy',
      gesture: 'think',
    };
  }

  return {
    text: `Oya oya~ "${userText.trim()}"? Hehe, interesting topic! As Director of Wangsheng Funeral Parlor, my philosophy is simple: tackle what's in front of you with bold curiosity and a mischievous smile. Tell me more about what's on your mind—or load up my full in-browser Neural Brain in the top bar if you want deep AI brainstorming!`,
    emotion: 'playful',
    gesture: 'nod',
  };
}

export const QUICK_PROMPTS = [
  { label: 'Say Yahoo~!', prompt: 'Hi Hu Tao! Introduce yourself!' },
  { label: 'Hilichurl Dance', prompt: 'Do your famous Hilichurl song and dance!' },
  { label: 'Recite a Poem', prompt: 'Compose a short original Hu Tao poem for me!' },
  { label: 'Ask about Zhongli', prompt: 'What is it like working with Zhongli at the parlor?' },
  { label: 'Spooky Joke', prompt: 'Tell me a spooky joke, Director!' },
  { label: 'Pep Talk', prompt: 'I am feeling a little tired today, cheer me up!' },
];
