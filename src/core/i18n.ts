import type { Txt } from './context';

export const L = { lang: 'sk' as 'sk' | 'en' };
try { if (localStorage.getItem('vnd-lang') === 'en') L.lang = 'en'; } catch { /* */ }

/** Spôsob ovládania: ruky alebo ovládače – podľa toho sa menia texty. */
export const INPUT = { mode: 'hands' as 'hands' | 'controllers' };

const CTRL_WORDS: Record<'sk' | 'en', [string, string][]> = {
  sk: [['štipnite a potiahnite rukou', 'držte spúšť a potiahnite'], ['Štipnite a potiahnite', 'Držte spúšť a potiahnite'], ['štipnite a potiahnite', 'držte spúšť a potiahnite'],
    ['štipnite prstami', 'stlačte spúšť'], ['dlhým štipnutím', 'dlhým podržaním spúšte'], ['Dlhé štipnutie', 'Dlhé podržanie spúšte'], ['dlhé štipnutie', 'dlhé podržanie spúšte'],
    ['Štipnutie', 'Stlačenie spúšte'], ['štipnite', 'stlačte spúšť'], ['štipni', 'stlač spúšť'], ['Namierte lúčom z ruky', 'Namierte lúčom z ovládača'], ['lúčom z ruky', 'lúčom z ovládača']],
  en: [['pinch and drag', 'hold the trigger and drag'], ['Pinch and drag', 'Hold the trigger and drag'], ['a long pinch', 'holding the trigger'], ['A long pinch', 'Holding the trigger'],
    ['Long pinch', 'Holding the trigger'], ['and pinch', 'and press the trigger'], ['pinch to', 'press the trigger to'], ['then pinch', 'then press the trigger'], ['pinch', 'press the trigger'], ['from your hand', 'from the controller']]
};

/** Preklad: vráti text v aktuálnom jazyku, pri ovládačoch upraví slovesá. */
export function T(x: Txt | null | undefined): string {
  if (x == null) return '';
  let s = typeof x === 'string' ? x : (x[L.lang] || x.sk);
  if (INPUT.mode === 'controllers') for (const [a, b] of CTRL_WORDS[L.lang]) s = s.split(a).join(b);
  return s;
}
export const en = () => L.lang === 'en';
export const fmt = (n: number) => n.toLocaleString(en() ? 'en-GB' : 'sk-SK');
export const dec = (n: number, d = 2) => n.toFixed(d).replace('.', en() ? '.' : ',');
