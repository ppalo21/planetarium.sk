/** Nastavenia obsluhy – ukladajú sa v prehliadači okuliarov. */
export interface Settings {
  mods: Record<string, boolean>;
  limit: number;      // sekundy na návštevníka, 0 = bez limitu
  tutorial: boolean;
  sound: boolean;
  voice: boolean;
}
const DEF: Settings = { mods: { solar: true, aurora: true, trips: true, depth: true, planets: true, phases: true, gravity: true, machines: true, quiz: true }, limit: 0, tutorial: true, sound: true, voice: true };

function load(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('vnd-set') || 'null');
    if (s) return { ...DEF, ...s, mods: { ...DEF.mods, ...(s.mods || {}) } };
  } catch { /* */ }
  return structuredClone(DEF);
}
export const SET = load();
export function saveSet() { try { localStorage.setItem('vnd-set', JSON.stringify(SET)); } catch { /* */ } }
