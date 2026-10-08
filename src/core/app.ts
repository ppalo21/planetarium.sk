import * as THREE from 'three';
import { ctx, ASSET } from './context';
import { L, T, en } from './i18n';
import { SET } from './settings';
import { SND } from './sound';
import { initHud, hud, hudTick, hudCfg, buildHud, resetHudYaw } from './ui3d';
import { initInput, updateInput, hovered, look, clearCtrlVisuals } from './input';
import { textSprite, setSpriteH, disposeTree } from './util';
import { initAR, startARSession, updateAR, stopPlacing } from './ar';
import { track, newVisitor, moduleChange, flush } from './stats';
import { stopVoice } from './narration';
import { domCredits, prepIntro, introUrls } from '../modules/brand';

/* =====================================================================
   SCÉNA
   ===================================================================== */
export function initScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setFoveation(1);              // foveated rendering: okraje obrazu v nižšom rozlíšení = viac výkonu
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = SKY;
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 3e6);   // ďaleká hranica pre let Slnečnou sústavou
  camera.rotation.order = 'YXZ';
  const anchor = new THREE.Group(), floor = new THREE.Group(); scene.add(anchor, floor);
  anchor.position.set(0, 1.6, 0); camera.position.set(0, 1.6, 0);
  // fyzikálne svetlá (od three r155 sú intenzity v jednotkách × π)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334055, 0.75 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 1.0 * Math.PI); sun.position.set(-3, 4, 2); scene.add(sun);
  Object.assign(ctx, { renderer, scene, camera, anchor, floor });

  starBg = makeStars(); anchor.add(starBg);
  floorGrid = new THREE.PolarGridHelper(4, 16, 8, 64, 0x2b3a6b, 0x1b2648);
  (floorGrid.material as THREE.Material).transparent = true; (floorGrid.material as THREE.Material).opacity = 0.6; floor.add(floorGrid);

  initHud(); initAR();
  initInput(() => {
    const m = ctx.modules[ctx.current];
    if (ctx.current === 'intro') m.relabel?.();
    else if (m?.hud && ctx.current !== 'trips' && ctx.current !== 'machines') m.hud();
    else if (hudCfg()) buildHud();
  });
  addEventListener('resize', () => { if (renderer.xr.isPresenting) return; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
}
const SKY = new THREE.Color('#070d24');
let starBg: THREE.Points, floorGrid: THREE.PolarGridHelper;
function makeStars() {
  const n = 1800, p = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 60, s = Math.sqrt(1 - u * u);
    p.set([r * s * Math.cos(a), r * u, r * s * Math.sin(a)], i * 3);
    const b = 0.35 + Math.random() * 0.65; col.set([b, b, Math.min(1, b * 1.1)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
  m.renderOrder = -20; return m;
}
export function applyEnv() {
  const m = ctx.modules[ctx.current];
  starBg.visible = !ctx.isAR && !!m?.stars;
  floorGrid.visible = !ctx.isAR && !!m?.floor;
  ctx.scene.background = ctx.isAR ? null : (m?.bg ?? SKY);
}

/* =====================================================================
   NAVIGÁCIA A NÁVŠTEVNÍK
   ===================================================================== */
export function goTo(id: string, arg?: unknown) {
  if (ctx.current && ctx.current !== id && id !== 'operator') SND.whoosh();
  stopPlacing(); clearCtrlVisuals(); moduleChange(id); ctx.modules[ctx.current]?.exit();
  ctx.current = id; const m = ctx.modules[id];
  if (!m.built) { m.build(); m.built = true; }
  m.enter(arg); applyEnv(); ctx.lastAct = performance.now();
  const ui = document.getElementById('ui');
  if (ui && !ctx.renderer.xr.isPresenting) { ui.classList.toggle('min', id !== 'lobby'); domTexts(); }
}
let needAnchor = false, anchorFrames = 0;
export function recenter() { needAnchor = true; anchorFrames = 0; resetHudYaw(); if (!ctx.renderer.xr.isPresenting) { look.yaw = 0; look.pitch = -0.12; } }

export const VISIT = { start: 0, warned: false };
export function startVisitor() {
  VISIT.start = 0; VISIT.warned = false; recenter();
  const xr = ctx.renderer.xr.isPresenting;
  if (xr) { newVisitor(); flush(); }
  if (xr && SET.introVideo && !ctx.isAR) goTo('introVideo'); else afterIntro();
}
/** Po úvodnom videu: krátky návod pre návštevníka, potom ponuka zážitkov. */
export function afterIntro() {
  const xr = ctx.renderer.xr.isPresenting;
  if (SET.tutorial && xr) goTo('intro');
  else { goTo('lobby'); if (xr) VISIT.start = performance.now(); }
}
let timerSprite: THREE.Sprite | null = null, timerTxt = '';
function visitTick() {
  const show = ctx.renderer.xr.isPresenting && SET.limit > 0 && VISIT.start && !['introVideo', 'intro', 'thanks', 'operator'].includes(ctx.current);
  if (!show) { if (timerSprite) timerSprite.visible = false; return; }
  const left = Math.ceil(SET.limit - (performance.now() - VISIT.start) / 1000);
  if (left <= 30 && !VISIT.warned) { VISIT.warned = true; SND.chime(); }
  if (left <= 0) { SND.chime(); goTo('thanks'); return; }
  const txt = left <= 30 ? (en() ? `${left} s left` : `zostáva ${left} s`) : '';
  if (txt !== timerTxt) {
    timerTxt = txt; if (timerSprite) { hud.remove(timerSprite); disposeTree(timerSprite); timerSprite = null; }
    if (txt) { const s = textSprite(txt, '#ffb46b', 64); setSpriteH(s, 0.05); s.material.depthTest = false; s.renderOrder = 25; s.position.set(0.45, 0.5, 0.01); hud.add(s); timerSprite = s; }
  }
  if (timerSprite) timerSprite.visible = true;
}

/* =====================================================================
   SPUSTENIE VR / AR
   ===================================================================== */
async function startXR(mode: XRSessionMode) {
  SND.init();
  try {
    const ar = mode === 'immersive-ar';
    // AR na Queste 3: hit-test (podlaha, stôl) a depth-sensing (skutočné predmety a ruky zakryjú virtuálne)
    const opts: any = { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', ...(ar ? ['hit-test', 'depth-sensing'] : [])] };
    if (ar) opts.depthSensing = { usagePreference: ['gpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32', 'unsigned-short'] };
    const s = await navigator.xr!.requestSession(mode, opts);
    ctx.renderer.xr.setReferenceSpaceType('local-floor');
    await ctx.renderer.xr.setSession(s);
    ctx.isAR = mode === 'immersive-ar'; ctx.camera.position.set(0, 0, 0); ctx.camera.rotation.set(0, 0, 0);
    if (ctx.isAR) await startARSession(s);
    needAnchor = true; anchorFrames = 0; SND.ambient(true); startVisitor();
    // okuliare zložené z hlavy: zvuk a video počkajú (po 2 minútach sa appka vráti na začiatok pre ďalšieho návštevníka)
    s.addEventListener('visibilitychange', () => {
      const vis = s.visibilityState !== 'hidden'; SND.pause(!vis); if (!vis) stopVoice();
      ctx.modules[ctx.current]?.onVisibility?.(vis);
    });
    s.addEventListener('end', () => {
      ctx.isAR = false; ctx.anchor.position.set(0, 1.6, 0); ctx.anchor.rotation.set(0, 0, 0); ctx.floor.position.set(0, 0, 0); ctx.floor.rotation.set(0, 0, 0);
      ctx.camera.position.set(0, 1.6, 0); clearCtrlVisuals(); SND.pause(false); SND.ambient(false); stopVoice(); VISIT.start = 0; ctx.goHome(); flush();
    });
  } catch (err: any) { showMsg(T(ctx.content.ui.xrfail) + ' (' + err.name + ')'); }
}

/* =====================================================================
   DOM PANEL (na PC a pred spustením VR)
   ===================================================================== */
const $ = (id: string) => document.getElementById(id)!;
function showMsg(t: string) { $('msg').textContent = t; $('msg').hidden = !t; }
export function domTexts() {
  const UI = ctx.content.ui;
  document.documentElement.lang = L.lang;
  $('appTitle').textContent = T(UI.title); $('appSub').textContent = T(UI.sub);
  $('btnVR').textContent = T(UI.vr); $('btnAR').textContent = T(UI.ar); $('btnLang').textContent = T(UI.lang);
  $('btnOffline').textContent = T(UI.offline); $('btnMin').textContent = T($('ui').classList.contains('min') ? UI.max : UI.min);
  $('note').textContent = T(UI.note); $('dlabel').textContent = T(UI.dLabel); $('btnPrint').textContent = T(UI.dPrint);
  $('btnOper').textContent = en() ? 'Staff settings' : 'Nastavenia obsluhy';
  $('ver').textContent = (en() ? 'Version ' : 'Verzia ') + __APP_VERSION__;
  $('btnCredits').textContent = T(UI.credits);
  if (!navigator.xr) showMsg(T(UI.noxr));
}
export function setLang(l: 'sk' | 'en') { if (L.lang !== l) toggleLang(); else ctx.modules[ctx.current]?.hud?.(); }
export function toggleLang() {
  L.lang = en() ? 'sk' : 'en'; try { localStorage.setItem('vnd-lang', L.lang); } catch { /* */ }
  domTexts(); Object.values(ctx.modules).forEach(m => { if (m.built) m.relabel?.(); });
  if (!['trips', 'machines'].includes(ctx.current)) ctx.modules[ctx.current]?.hud?.();
}
export let lastScore: { s: number; n: number } | null = null;
export function quizFinished(s: number, n: number) { lastScore = { s, n }; track('kvíz', { score: s, of: n }); }

export function initDom() {
  const UI = ctx.content.ui;
  $('btnLang').onclick = toggleLang;
  $('btnOper').onclick = () => { SND.init(); goTo('operator'); };
  $('btnCredits').onclick = domCredits;
  $('btnMin').onclick = () => { $('ui').classList.toggle('min'); domTexts(); };
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) { $('btnVR').hidden = false; $('xrrow').hidden = false; } }).catch(() => {});
    navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (ok) { $('btnAR').hidden = false; $('xrrow').hidden = false; } }).catch(() => {});
  }
  $('btnVR').onclick = () => startXR('immersive-vr'); $('btnAR').onclick = () => startXR('immersive-ar');
  $('btnOffline').onclick = async () => {
    const btn = $('btnOffline') as HTMLButtonElement; if (btn.disabled) return;
    btn.disabled = true; showMsg(T(UI.offRun));
    const list = await offlineUrls(), missing: string[] = []; let ok = 0, done = 0, failed = 0;
    // súbory sa ukladajú priamo do pamäte, z ktorej číta offline režim (sw.js) – funguje aj pri prvom otvorení
    const cache = 'caches' in window ? await caches.open(CACHE).catch(() => null) : null;
    const one = async ({ u, optional }: { u: string; optional: boolean }) => {
      try {
        const hit = cache ? await cache.match(u) : null;
        // uložený súbor sa stiahne znova len vtedy, keď sa na serveri zmenil
        if (hit && !(await changed(u, hit))) { ok++; return; }
        const r = await fetch(u, { cache: 'reload' });
        if (r.status === 200) { if (cache) await cache.put(u, r.clone()); await r.arrayBuffer(); ok++; }
        else if (hit) ok++;
        else if (r.status === 404) { if (!optional) missing.push(u.replace(new URL('.', document.baseURI).href, '')); }
        else failed++;
      } catch { failed++; }                               // výpadok siete – pokračuje sa ďalej
      finally { showMsg(T(UI.offRun) + ` ${++done} / ${list.length}`); }
    };
    const todo = list.slice(), worker = async () => { while (todo.length) await one(todo.shift()!); };
    await Promise.all([worker(), worker(), worker()]);
    showMsg(T(UI.offOk) + ok + '. ' + (failed ? T(UI.offFail) + failed + '. ' : '') + (missing.length ? T(UI.offMissing) + missing.join(', ') : '') + (!failed && !missing.length ? T(UI.offReady) : ''));
    btn.disabled = false;
  };
  $('btnPrint').onclick = () => {
    $('dTitle').textContent = T(UI.dTitle); $('dText1').textContent = T(UI.dT1);
    $('dWho').textContent = ($('dname') as HTMLInputElement).value.trim() || '\u00a0';
    $('dText2').textContent = T(UI.dT2) + (lastScore ? `${lastScore.s} / ${lastScore.n}` : '');
    $('dDate').textContent = 'Žiar nad Hronom, ' + new Date().toLocaleDateString(en() ? 'en-GB' : 'sk-SK');
    window.print();
  };
  domTexts();
}

/** Názov pamäte musí byť rovnaký ako v public/sw.js. */
const CACHE = 'vesmir-na-dosah-v2';
const stamp = (r: Response) => r.headers.get('last-modified') || (r.headers.get('etag') || '').replace(/^W\//, '').replace(/-gzip/, '');
/** Zmenil sa súbor na serveri oproti uloženej verzii? (bez internetu: nie) */
async function changed(u: string, hit: Response) {
  if (/\/js\/[^/]+-[\w-]{8}\.\w+$/.test(u)) return false;   // súbory zostavenej appky majú v názve odtlačok obsahu
  try { const h = await fetch(u, { method: 'HEAD', cache: 'no-store' }); return h.ok && !!stamp(h) && stamp(h) !== stamp(hit); } catch { return false; }
}
/** Všetko, čo appka potrebuje bez internetu: stránka, skripty, písma, textúry, panorámy, modely, hlas, úvodné video. */
async function offlineUrls(): Promise<{ u: string; optional: boolean }[]> {
  const c = ctx.content, P = ASSET.planets, need = new Set<string>(['./', 'index.html', 'manifest.json', 'logo-white.png', 'logo-navy.png', 'icon-192.png', 'icon-512.png']), opt = new Set<string>();
  // čo si stránka už načítala (skripty s premenlivým názvom, štýly, písma, dekodér modelov)
  for (const e of performance.getEntriesByType('resource')) { try { const u = new URL(e.name); if (u.origin === location.origin) opt.add(u.href); } catch { /* */ } }
  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel=stylesheet]').forEach(e => need.add((e as any).src || (e as any).href));
  ['Regular', 'SemiBold', 'Bold'].forEach(f => need.add(`fonts/Figtree-${f}.ttf`));
  ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'].forEach(f => need.add('draco/' + f));
  ['left.glb', 'right.glb'].forEach(f => need.add('hands/' + f));
  ['stars.bin', 'star-names.json'].forEach(f => need.add('data/' + f));
  Object.keys(c).forEach(f => need.add(`content/${f}.json`));
  need.add(ASSET.milky); c.trips.forEach((t: any) => (t.optional ? opt : need).add(t.file)); c.machines.forEach((m: any) => need.add(m.file));
  c.bodies.forEach((b: any) => { need.add(P + b.tex); if (b.ring) need.add(P + b.ring); });
  ['earth_nightmap.jpg', 'earth_clouds.jpg', 'earth_specular_map.jpg'].forEach(f => need.add(P + '2k_' + f));
  // nepovinné: textúry 4k, hlasový komentár, úvodné video
  ['mercury.jpg', 'venus_atmosphere.jpg', 'earth_daymap.jpg', 'earth_nightmap.jpg', 'earth_clouds.jpg', 'moon.jpg', 'mars.jpg', 'jupiter.jpg', 'saturn.jpg', 'stars_milky_way.jpg'].forEach(f => opt.add(P + '4k_' + f));
  JSON.stringify(c, (k, v) => { if (k === 'audio' && typeof v === 'string') { opt.add('audio/sk/' + v); opt.add('audio/en/' + v); } return v; });
  if (await prepIntro()) introUrls().forEach(u => opt.add(u));
  const abs = (u: string) => new URL(u, document.baseURI).href, out = new Map<string, boolean>();
  opt.forEach(u => out.set(abs(u), true)); need.forEach(u => out.set(abs(u), false));
  return [...out].map(([u, optional]) => ({ u, optional }));
}

/* =====================================================================
   HLAVNÁ SLUČKA
   ===================================================================== */
export function startLoop() {
  const timer = new THREE.Timer(), p3 = new THREE.Vector3(), q3 = new THREE.Quaternion(), s3 = new THREE.Vector3(), eul = new THREE.Euler();
  ctx.renderer.setAnimationLoop((time: number, frame?: XRFrame) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1), t = timer.getElapsed(), { renderer, camera, anchor, floor } = ctx;
    if (renderer.xr.isPresenting) {
      updateInput(); updateAR(frame);
      if (needAnchor && ++anchorFrames > 3) {
        renderer.xr.getCamera().matrixWorld.decompose(p3, q3, s3);
        if (p3.lengthSq() > 1e-4) {
          eul.setFromQuaternion(q3, 'YXZ');
          anchor.position.copy(p3); anchor.rotation.set(0, eul.y, 0);
          floor.position.set(p3.x, 0, p3.z); floor.rotation.set(0, eul.y, 0); needAnchor = false;
        }
      }
      // po 2 minútach nečinnosti začne appka odznova pre ďalšieho návštevníka
      if (!['introVideo', 'intro', 'operator'].includes(ctx.current) && (ctx.current !== 'lobby' || SET.tutorial) && performance.now() - ctx.lastAct > 120000) { ctx.lastAct = performance.now(); startVisitor(); }
      visitTick();
    } else camera.rotation.set(look.pitch, look.yaw, 0);
    ctx.modules[ctx.current]?.update?.(dt, t);
    hudTick(dt, hovered);
    renderer.render(ctx.scene, camera);
  });
}
