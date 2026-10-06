import { ctx } from './context';
import { L, INPUT } from './i18n';

/**
 * Anonymná štatistika do Google Sheets (bez osobných údajov):
 * ktoré moduly, ako dlho, výsledok kvízu, jazyk, VR/AR, ruky/ovládače.
 * Adresa Apps Scriptu sa nastavuje v public/content/stats.json (prázdna = vypnuté).
 * Bez internetu sa záznamy ukladajú v okuliaroch a odošlú sa neskôr.
 */
const KEY_Q = 'vnd-q', KEY_DEV = 'vnd-dev';
let dev = '';
try { dev = localStorage.getItem(KEY_DEV) || ''; if (!dev) { dev = 'Q-' + Math.random().toString(36).slice(2, 7).toUpperCase(); localStorage.setItem(KEY_DEV, dev); } } catch { dev = 'Q-?'; }
let visitor = 0, modId = '', modStart = 0;

function queue(): any[] { try { return JSON.parse(localStorage.getItem(KEY_Q) || '[]'); } catch { return []; } }
function save(q: any[]) { try { localStorage.setItem(KEY_Q, JSON.stringify(q.slice(-2000))); } catch { /* */ } }
function enabled() { return !!ctx.content.stats?.url && ctx.renderer?.xr.isPresenting !== undefined; }

export function track(ev: string, data: Record<string, unknown> = {}) {
  if (!ctx.content.stats?.url) return;
  const q = queue();
  q.push({ t: new Date().toISOString(), dev, vis: visitor, ev, lang: L.lang, mode: ctx.isAR ? 'AR' : (ctx.renderer.xr.isPresenting ? 'VR' : 'PC'), input: INPUT.mode, ...data });
  save(q);
}
export function newVisitor() { visitor++; track('návštevník'); }
/** Volá sa pri každom prechode medzi modulmi – zapíše, ako dlho bol návštevník v predchádzajúcom. */
export function moduleChange(next: string) {
  const now = performance.now();
  if (modId && modStart && ctx.renderer.xr.isPresenting && !['operator', 'thanks'].includes(modId)) track('modul', { mod: modId, sec: Math.round((now - modStart) / 1000) });
  modId = next; modStart = now;
}
let sending = false;
export async function flush() {
  const url = ctx.content.stats?.url; if (!url || sending || !navigator.onLine) return;
  const q = queue(); if (!q.length) return;
  sending = true;
  try {
    // Apps Script neposiela CORS hlavičky – no-cors stačí, odpoveď nepotrebujeme
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(q) });
    save(queue().slice(q.length));
  } catch { /* skúsi sa neskôr */ }
  sending = false;
}
export function initStats() {
  if (!enabled()) return;
  setInterval(flush, 60000);
  addEventListener('online', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
