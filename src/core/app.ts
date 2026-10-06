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
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.02, 200); camera.rotation.order = 'YXZ';
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
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
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
  ctx.scene.background = ctx.isAR ? null : SKY;
}

/* =====================================================================
   NAVIGÁCIA A NÁVŠTEVNÍK
   ===================================================================== */
export function goTo(id: string, arg?: unknown) {
  if (ctx.current && ctx.current !== id && id !== 'operator') SND.whoosh();
  stopPlacing(); moduleChange(id); ctx.modules[ctx.current]?.exit();
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
  if (ctx.renderer.xr.isPresenting) { newVisitor(); flush(); }
  if (SET.tutorial && ctx.renderer.xr.isPresenting) goTo('intro');
  else { goTo('lobby'); if (ctx.renderer.xr.isPresenting) VISIT.start = performance.now(); }
}
let timerSprite: THREE.Sprite | null = null, timerTxt = '';
function visitTick() {
  const show = ctx.renderer.xr.isPresenting && SET.limit > 0 && VISIT.start && !['intro', 'thanks', 'operator'].includes(ctx.current);
  if (!show) { if (timerSprite) timerSprite.visible = false; return; }
  const left = Math.ceil(SET.limit - (performance.now() - VISIT.start) / 1000);
  if (left <= 30 && !VISIT.warned) { VISIT.warned = true; SND.chime(); }
  if (left <= 0) { SND.chime(); goTo('thanks'); return; }
  const txt = left <= 30 ? (en() ? `${left} s left` : `zostáva ${left} s`) : '';
  if (txt !== timerTxt) {
    timerTxt = txt; if (timerSprite) { hud.remove(timerSprite); disposeTree(timerSprite); timerSprite = null; }
    if (txt) { const s = textSprite(txt, '#ffb46b', 64); setSpriteH(s, 0.05); s.material.depthTest = false; s.renderOrder = 25; s.position.set(0.5, 0.34, 0.01); hud.add(s); timerSprite = s; }
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
    s.addEventListener('end', () => {
      ctx.isAR = false; ctx.anchor.position.set(0, 1.6, 0); ctx.anchor.rotation.set(0, 0, 0); ctx.floor.position.set(0, 0, 0); ctx.floor.rotation.set(0, 0, 0);
      ctx.camera.position.set(0, 1.6, 0); clearCtrlVisuals(); SND.ambient(false); VISIT.start = 0; ctx.goHome(); flush();
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
  if (!navigator.xr) showMsg(T(UI.noxr));
}
export function setLang(l: 'sk' | 'en') { if (L.lang !== l) toggleLang(); else ctx.modules[ctx.current]?.hud?.(); }
export function toggleLang() {
  L.lang = en() ? 'sk' : 'en'; try { localStorage.setItem('vnd-lang', L.lang); } catch { /* */ }
  domTexts(); Object.values(ctx.modules).forEach(m => { if (m.built) m.relabel?.(); });
  if (!['trips', 'machines'].includes(ctx.current)) ctx.modules[ctx.current]?.hud?.();
}
export let lastScore: { s: number; n: number } | null = null;
export function quizFinished(s: number, n: number) { lastScore = { s, n }; $('dipl').hidden = false; track('kvíz', { score: s, of: n }); }

export function initDom() {
  const UI = ctx.content.ui;
  $('btnLang').onclick = toggleLang;
  $('btnOper').onclick = () => { SND.init(); goTo('operator'); };
  $('btnMin').onclick = () => { $('ui').classList.toggle('min'); domTexts(); };
  if (navigator.xr) {
    navigator.xr.isSessionSupported('immersive-vr').then(ok => { if (ok) { $('btnVR').hidden = false; $('xrrow').hidden = false; } }).catch(() => {});
    navigator.xr.isSessionSupported('immersive-ar').then(ok => { if (ok) { $('btnAR').hidden = false; $('xrrow').hidden = false; } }).catch(() => {});
  }
  $('btnVR').onclick = () => startXR('immersive-vr'); $('btnAR').onclick = () => startXR('immersive-ar');
  $('btnOffline').onclick = async () => {
    const c = ctx.content;
    const urls = new Set<string>([ASSET.milky, ...c.trips.map((t: any) => t.file), ...c.bodies.map((b: any) => ASSET.planets + b.tex),
      ASSET.planets + '2k_saturn_ring_alpha.png', ...c.machines.map((m: any) => m.file)]);
    showMsg(T(UI.offRun)); let ok = 0;
    for (const u of urls) { try { const r = await fetch(u); if (r.ok) { await r.arrayBuffer(); ok++; } } catch { /* */ } }
    showMsg(T(UI.offOk) + ok + ' / ' + urls.size);
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

/* =====================================================================
   HLAVNÁ SLUČKA
   ===================================================================== */
export function startLoop() {
  const clock = new THREE.Clock(), p3 = new THREE.Vector3(), q3 = new THREE.Quaternion(), s3 = new THREE.Vector3(), eul = new THREE.Euler();
  ctx.renderer.setAnimationLoop((_time: number, frame?: XRFrame) => {
    const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime, { renderer, camera, anchor, floor } = ctx;
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
      if (!['intro', 'operator'].includes(ctx.current) && (ctx.current !== 'lobby' || SET.tutorial) && performance.now() - ctx.lastAct > 120000) { ctx.lastAct = performance.now(); startVisitor(); }
      visitTick();
    } else camera.rotation.set(look.pitch, look.yaw, 0);
    ctx.modules[ctx.current]?.update?.(dt, t);
    hudTick(dt, hovered);
    renderer.render(ctx.scene, camera);
  });
}
