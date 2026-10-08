import './style.css';
import { ctx, url } from './core/context';
import { initStats } from './core/stats';
import { initScene, initDom, startLoop, goTo, recenter, startVisitor, afterIntro } from './core/app';
import { look } from './core/input';
import { hudButtons } from './core/ui3d';
import { lobby } from './modules/lobby';
import { trips } from './modules/trips';
import { depth } from './modules/depth';
import { planets } from './modules/planets';
import { gravity } from './modules/gravity';
import { machines } from './modules/machines';
import { quiz } from './modules/quiz';
import { phases } from './modules/phases';
import { solar } from './modules/solar';
import { aurora } from './modules/aurora';
import { cosmos } from './modules/cosmos';
import { intro, thanks, operator } from './modules/visitor';
import { introVideo, credits, prepIntro, introOnce } from './modules/brand';

/** Obsah appky (texty, panorámy, planéty, kvíz…) je v public/content/*.json. */
const FILES = ['ui', 'trips', 'bodies', 'features', 'gravity', 'machines', 'quiz', 'constellations', 'stats', 'solar', 'aurora', 'cosmos', 'credits'];

async function loadFonts() {
  // písmo pre popisky na canvase (offline, bez Google Fonts)
  const faces = [['400', 'Figtree-Regular'], ['600', 'Figtree-SemiBold'], ['700', 'Figtree-Bold']].map(([w, f]) => new FontFace('Figtree', `url(${url('fonts/' + f + '.ttf')})`, { weight: w }));
  await Promise.all(faces.map(f => f.load().then(ff => document.fonts.add(ff)).catch(() => {})));
}

const boot = document.getElementById('boot')!;
function bootDone() { boot.classList.add('out'); setTimeout(() => boot.remove(), 600); }
function bootError(e: unknown) {
  console.error(e);
  boot.classList.remove('out'); boot.classList.add('err');
  document.getElementById('bootMsg')!.textContent = navigator.onLine === false
    ? 'Bez internetu sa appku nepodarilo načítať. Pripojte sa a skúste to znova. / No connection: please reconnect and try again.'
    : 'Appku sa nepodarilo načítať. Skúste to znova. / The app could not be loaded. Please try again.';
  (document.getElementById('bootRetry') as HTMLButtonElement).hidden = false;
}
async function getJson(f: string) {
  const r = await fetch(url(`content/${f}.json`)); if (!r.ok) throw new Error(`content/${f}.json: ${r.status}`);
  return r.json();
}

async function main() {
  const [content] = await Promise.all([
    Promise.all(FILES.map(getJson)).then(arr => Object.fromEntries(FILES.map((f, i) => [f, arr[i]]))),
    loadFonts()
  ]);
  ctx.content = content;
  ctx.modules = { lobby, cosmos, solar, aurora, trips, depth, planets, phases, gravity, machines, quiz, intro, thanks, operator, introVideo, credits };
  ctx.goTo = goTo; ctx.goHome = () => goTo('lobby'); ctx.recenter = recenter; ctx.startVisitor = startVisitor; ctx.afterIntro = afterIntro;
  initScene(); initDom(); startLoop(); initStats();
  // logo planetária: v okuliaroch sa prehrá po spustení VR (so zvukom), na počítači a v telefóne hneď (raz za návštevu)
  prepIntro();
  const vr = navigator.xr ? await navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : false;
  goTo(!vr && introOnce() ? 'introVideo' : 'lobby');
  document.getElementById('ui')!.hidden = false; bootDone();
  (window as any).VND = { goTo, ctx, look, hudButtons };   // pre ladenie v konzole
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|localhost/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
main().catch(bootError);
