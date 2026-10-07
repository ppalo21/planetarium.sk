import { L } from './i18n';
import { SET } from './settings';
import { url } from './context';

/**
 * Hlasový komentár: najprv sa skúsi nahrávka (public/audio/sk/… alebo en/…),
 * ak chýba, použije sa hlas prehliadača (ak ho zariadenie má), inak ostane len text.
 * Nahrávky stačí nahovoriť a nahrať pod názvami zo súboru NAHRAVKY.md.
 */
let audio: HTMLAudioElement | null = null;
let token = 0;

export function stopVoice() {
  token++;
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  try { speechSynthesis?.cancel(); } catch { /* */ }
}
export function speak(file: string | undefined, text: string) {
  stopVoice();
  if (!SET.voice) return;
  const my = ++token;
  const fallback = () => {
    if (my !== token) return;
    try {
      const synth = window.speechSynthesis; if (!synth) return;
      const want = L.lang === 'en' ? 'en' : 'sk';
      const v = synth.getVoices().find(x => x.lang.toLowerCase().startsWith(want));
      if (!v) return;                                   // bez slovenského hlasu radšej ticho než cudzí prízvuk
      const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = 0.95; synth.speak(u);
    } catch { /* */ }
  };
  if (!file) { fallback(); return; }
  const a = new Audio(url(`audio/${L.lang}/${file}`));
  audio = a; a.volume = 1;
  a.addEventListener('error', fallback, { once: true });
  a.play().catch(fallback);
}
