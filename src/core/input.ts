import * as THREE from 'three';
import { ctx, url } from './context';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { clickables, isVisible, hudButtons, setHudNear, hud } from './ui3d';
import { tryPlace, isPlacing, stopPlacing } from './ar';
import { SND, haptic } from './sound';
import { INPUT } from './i18n';

/** Ovládanie: lúč z ruky/ovládača, štipnutie/spúšť, ťahanie, dlhé podržanie; na PC myš. */
const raycaster = new THREE.Raycaster();
export const hovered = new Set<THREE.Object3D>();
export const ctrls: THREE.XRTargetRaySpace[] = [];
export const hands: THREE.XRHandSpace[] = [];
let onModeChange: () => void = () => {};

const targets: THREE.Object3D[] = [], hits: THREE.Intersection[] = [];
/** Najbližší klikateľný objekt v smere lúča (bez vytvárania nových polí v každej snímke). */
function cast() {
  targets.length = 0; hits.length = 0; raycaster.far = 60;
  for (const o of clickables) if (o.userData.click?.enabled !== false && isVisible(o)) targets.push(o);
  raycaster.intersectObjects(targets, false, hits);
  return hits[0] || null;
}
function pick(origin: THREE.Vector3, dir: THREE.Vector3) { raycaster.set(origin, dir); raycaster.camera = ctx.camera; return cast(); }
function setHovered(set: Set<THREE.Object3D>) {
  hovered.forEach(o => { if (!set.has(o)) { hovered.delete(o); o.userData.click?.onHover?.(false); } });
  set.forEach(o => { if (!hovered.has(o)) { hovered.add(o); SND.hover(); o.userData.click?.onHover?.(true); } });
}

export function initInput(modeChanged: () => void) {
  onModeChange = modeChanged;
  const { renderer, scene } = ctx;
  // realistické ruky (model z WebXR Input Profiles, uložený v appke → funguje offline)
  const handFactory = new XRHandModelFactory(null, (model: THREE.Object3D) => {
    model.traverse((o: any) => { if (o.isMesh) { o.material = new THREE.MeshStandardMaterial({ color: '#d9ab8f', roughness: 0.55, metalness: 0, transparent: true, opacity: 0.96 }); o.frustumCulled = false; } });
  });
  handFactory.setPath(url('hands/'));
  for (let i = 0; i < 2; i++) {
    // viditeľné ruky (kĺby prstov) – kreslia sa len vo VR, v AR vidno skutočné ruky
    const hand = renderer.xr.getHand(i); hand.add(handFactory.createHandModel(hand, 'mesh')); scene.add(hand); hands.push(hand);
    hand.userData.poke = { btn: null as THREE.Object3D | null, armed: false, cool: 0, prevZ: 1 };
    const c = renderer.xr.getController(i); scene.add(c); ctrls.push(c);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.55 }));
    line.scale.z = 0.4; c.add(line); c.userData.line = line;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb46b, depthTest: false }));
    dot.renderOrder = 30; dot.visible = false; scene.add(dot); c.userData.dot = dot;
    c.addEventListener('connected', (e: any) => { c.userData.src = e.data; });
    c.addEventListener('disconnected', () => { c.userData.src = null; });
    c.addEventListener('selectstart', () => {
      ctx.lastAct = performance.now();
      let h = c.userData.hit;
      // priame chytenie: ruka je pri objekte (netreba mieriť lúčom)
      if (!h) { const near = nearGrabbable(i); if (near) h = { object: near }; }
      if (h) {
        const ck = h.object.userData.click; haptic(c.userData.src, 0.6, 35); SND.click();
        if (ck.grab) { c.userData.grabbing = ck; c.userData.grabT = performance.now(); ck.grab.start(c); return; }
        ck.onClick?.(); return;
      }
      const m = ctx.modules[ctx.current];
      (m as any)?.onPinchStart?.(c);
      c.userData.hold = { t: performance.now(), p: c.position.clone(), moved: false, done: false, start: m?.dragStart ? m.dragStart() : 0 };
    });
    c.addEventListener('selectend', () => {
      ctx.lastAct = performance.now();
      if (c.userData.grabbing) {
        const ck = c.userData.grabbing; ck.grab.end(c); c.userData.grabbing = null;
        if (performance.now() - c.userData.grabT < 300) ck.onClick?.();   // krátke ťuknutie = kliknutie (napr. planéta priletí)
        return;
      }
      (ctx.modules[ctx.current] as any)?.onPinchEnd?.(c);
      const h = c.userData.hold; c.userData.hold = null; if (!h || h.done) return;
      if (!h.moved && performance.now() - h.t < 600) {
        if (isPlacing()) { if (!tryPlace()) { stopPlacing(); ctx.modules[ctx.current]?.hud?.(); } }   // bez terčíka: umiestňovanie sa zruší
        else ctx.modules[ctx.current]?.onTap?.();
      }
    });
  }
  initMouse();
}

const tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), right = new THREE.Vector3();
/** Objekt, ktorý sa dá chytiť a ruka (ovládač) je pri ňom do ~10 cm. */
function nearGrabbable(i: number): THREE.Object3D | null {
  const p = new THREE.Vector3();
  const tip = (hands[i] as any)?.joints?.['index-finger-tip'] as THREE.Object3D | undefined;
  if (tip && tip.visible) tip.getWorldPosition(p); else ctrls[i].getWorldPosition(p);
  let best: THREE.Object3D | null = null, bd = Infinity; const box = new THREE.Box3(), s = new THREE.Sphere();
  clickables.forEach(o => {
    if (!o.userData.click?.grab || o.userData.click.enabled === false || !isVisible(o)) return;
    box.setFromObject(o); if (box.isEmpty()) return; box.getBoundingSphere(s);
    const d = p.distanceTo(s.center) - s.radius;
    if (d < 0.1 && d < bd) { bd = d; best = o; }
  });
  return best;
}
function updateCtrl(c: THREE.XRTargetRaySpace, hs: Set<THREE.Object3D>, rayOff: boolean) {
  c.getWorldPosition(tmpV); c.getWorldQuaternion(tmpQ);
  tmpD.set(0, 0, -1).applyQuaternion(tmpQ);
  const h = c.userData.grabbing || rayOff ? null : pick(tmpV, tmpD); c.userData.hit = h;
  c.userData.line.visible = !rayOff;
  c.userData.line.scale.z = h ? h.distance : 0.4; c.userData.dot.visible = !!h; if (h) c.userData.dot.position.copy(h.point);
  if (h) hs.add(h.object);
  const ho = h ? h.object : null; if (ho && ho !== c.userData.lastHover) haptic(c.userData.src, 0.15, 12); c.userData.lastHover = ho;
  const hd = c.userData.hold; if (!hd) return;
  const d = c.position.clone().sub(hd.p); if (d.length() > 0.04) hd.moved = true;
  if (hd.moved) { right.set(1, 0, 0).applyQuaternion(ctx.anchor.quaternion); ctx.modules[ctx.current]?.onDrag?.(d.dot(right), hd.start); ctx.lastAct = performance.now(); }
  // dlhé podržanie jednou rukou = domov (pri geste dvoma rukami, napr. zoom, sa neuplatní)
  if (!hd.moved && !hd.done && performance.now() - hd.t > 1400 && !ctrls.some(o => o !== c && o.userData.hold)) { hd.done = true; ctx.goHome(); ctx.recenter(); }
}
/* ---------------- dotyk prstom (ťuknutie na tlačidlo ako na mobile) ---------------- */
const tip = new THREE.Vector3(), loc = new THREE.Vector3(), wsc = new THREE.Vector3();
let hudHiddenUntil = 0;
/** Vráti true, ak je prst blízko tabule (vtedy sa lúč z tejto ruky vypne). */
function updatePoke(hand: THREE.XRHandSpace, hs: Set<THREE.Object3D>): boolean {
  const j = (hand as any).joints?.['index-finger-tip'] as THREE.Object3D | undefined;
  const st = hand.userData.poke; if (!j || !j.visible || !hud.visible) { st.btn = null; st.prevZ = 1; return false; }
  j.getWorldPosition(tip); let near = false, best: THREE.Object3D | null = null, bestZ = 1;
  for (const b of hudButtons()) {
    const bg = b.userData.bg as THREE.Mesh; if (!isVisible(bg)) continue;
    loc.copy(tip); bg.worldToLocal(loc); bg.getWorldScale(wsc);
    const [w, h] = bg.userData.size, z = loc.z * wsc.z;      // vzdialenosť od roviny tlačidla v metroch
    if (Math.abs(loc.x) < w / 2 && Math.abs(loc.y) < h / 2 && z > -0.04 && z < 0.06) { near = true; if (z < bestZ) { bestZ = z; best = bg; } }
    else if (Math.abs(loc.x) < w && Math.abs(loc.y) < h * 2 && Math.abs(z) < 0.12) near = true;
  }
  if (best) hs.add(best);
  const now = performance.now();
  // stlačenie len vtedy, keď prst príde ZPREDU (nie zozadu či zboku, keď ruka len prechádza cez menu)
  const prev = st.btn === best ? st.prevZ : 1;
  if (best && bestZ < 0.004 && prev >= 0.004 && prev < 0.05 && st.armed && now > st.cool) {
    st.armed = false; st.cool = now + 400; ctx.lastAct = now; SND.click(); best.userData.click?.onClick?.();
  }
  if (best && bestZ > 0.015) st.armed = true;                     // znova pripravené až keď je prst pred tlačidlom
  if (!best) st.armed = false;
  st.btn = best; st.prevZ = best ? bestZ : 1;
  return near;
}

export function updateInput() {
  if (!ctx.renderer.xr.isPresenting) return;
  const hs = new Set<THREE.Object3D>();
  const handMode = INPUT.mode === 'hands';
  setHudNear(handMode);
  // keď niečo držíte v ruke, menu zmizne, aby sa ho ruka pri prenášaní omylom nedotkla
  const holding = ctrls.some(c => c.userData.grabbing);
  if (holding) hudHiddenUntil = performance.now() + 600;
  hud.visible = performance.now() > hudHiddenUntil;
  hands.forEach(h => { h.visible = handMode && !ctx.isAR; });
  ctrls.forEach((c, i) => { const near = handMode ? updatePoke(hands[i], hs) : false; updateCtrl(c, hs, near); });
  setHovered(hs);
  // ruky alebo ovládače?
  const ss = ctx.renderer.xr.getSession();
  if (ss) {
    let h = 0, g = 0; for (const s of ss.inputSources) { if (s.hand) h++; else if (s.gamepad) g++; }
    const nm = h ? 'hands' : (g ? 'controllers' : INPUT.mode);
    if (nm !== INPUT.mode) { INPUT.mode = nm; onModeChange(); }
  }
}
export function clearCtrlVisuals() { ctrls.forEach(c => { c.userData.dot.visible = false; c.userData.hit = null; }); }

/* ---------------- myš (náhľad na PC) ---------------- */
export const look = { yaw: 0, pitch: -0.12 };
function initMouse() {
  const el = ctx.renderer.domElement, mouse = new THREE.Vector2();
  let down: any = null;
  const ray = (e: PointerEvent) => {
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouse, ctx.camera);
    return cast();
  };
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, drag: false }; el.setPointerCapture(e.pointerId); ctx.lastAct = performance.now(); });
  el.addEventListener('pointermove', e => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 5) down.drag = true;
      if (down.drag) { look.yaw = down.yaw + dx * 0.004; look.pitch = Math.max(-1.3, Math.min(1.3, down.pitch + dy * 0.004)); }
    } else { const h = ray(e); setHovered(new Set(h ? [h.object] : [])); el.style.cursor = h ? 'pointer' : 'default'; }
  });
  el.addEventListener('pointerup', e => {
    if (down && !down.drag) {
      SND.init(); const h = ray(e);
      if (h) { SND.click(); h.object.userData.click.onClick?.(); } else ctx.modules[ctx.current]?.onTap?.();
    }
    down = null;
  });
}
export { hovered as hoveredSet };
