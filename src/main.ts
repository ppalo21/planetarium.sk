import './style.css';
import { ctx, url } from './core/context';
import { initStats } from './core/stats';
import { initScene, initDom, startLoop, goTo, recenter, startVisitor } from './core/app';
import { look } from './core/input';
import { lobby } from './modules/lobby';
import { trips } from './modules/trips';
import { depth } from './modules/depth';
import { planets } from './modules/planets';
import { gravity } from './modules/gravity';
import { machines } from './modules/machines';
import { quiz } from './modules/quiz';
import { phases } from './modules/phases';
import { intro, thanks, operator } from './modules/visitor';

/** Obsah appky (texty, panorámy, planéty, kvíz…) je v public/content/*.json. */
const FILES = ['ui', 'trips', 'bodies', 'features', 'gravity', 'machines', 'quiz', 'constellations', 'stats'];

async function loadFonts() {
  // písmo pre popisky na canvase (offline, bez Google Fonts)
  const faces = [['400', 'Figtree-Regular'], ['600', 'Figtree-SemiBold'], ['700', 'Figtree-Bold']].map(([w, f]) => new FontFace('Figtree', `url(${url('fonts/' + f + '.ttf')})`, { weight: w }));
  await Promise.all(faces.map(f => f.load().then(ff => document.fonts.add(ff)).catch(() => {})));
}

async function main() {
  const [content] = await Promise.all([
    Promise.all(FILES.map(f => fetch(url(`content/${f}.json`)).then(r => r.json()))).then(arr => Object.fromEntries(FILES.map((f, i) => [f, arr[i]]))),
    loadFonts()
  ]);
  ctx.content = content;
  ctx.modules = { lobby, trips, depth, planets, phases, gravity, machines, quiz, intro, thanks, operator };
  ctx.goTo = goTo; ctx.goHome = () => goTo('lobby'); ctx.recenter = recenter; ctx.startVisitor = startVisitor;
  initScene(); initDom(); startLoop(); initStats();
  goTo('lobby');
  (window as any).VND = { goTo, ctx, look };   // pre ladenie v konzole
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|localhost/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
