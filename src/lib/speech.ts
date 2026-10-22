// Pronunciation through the system voices (macOS and Windows both ship German ones).

let voice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (voice) return voice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const german = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
  // Prefer the higher quality voices when the system offers them.
  voice =
    german.find((v) => /premium|enhanced|natural|neural/i.test(v.name)) ??
    german.find((v) => v.lang === 'de-DE') ??
    german[0] ??
    null;
  return voice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    voice = null;
    pickVoice();
  };
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text: string) {
  if (!canSpeak() || !text.trim()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\*/g, ''));
  u.lang = 'de-DE';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.92;
  synth.speak(u);
}
