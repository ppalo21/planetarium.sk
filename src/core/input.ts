import * as THREE from 'three';
import { ctx } from './context';
import { clickables, isVisible } from './ui3d';
import { SND, haptic } from './sound';
import { INPUT } from './i18n';

/** Ovládanie: lúč z ruky/ovládača, štipnutie/spúšť, ťahanie, dlhé podržanie; na PC myš. */
const raycaster = new THREE.Raycaster();
export const hovered = new Set<THREE.Object3D>();
export const ctrls: THREE.XRTargetRaySpace[] = [];
let onModeChange: () => void = () => {};

function pick(origin: THREE.Vector3, dir: THREE.Vector3) {
  raycaster.set(origin, dir); raycaster.far = 60; raycaster.camera = ctx.camera;
  return raycaster.intersectObjects([...clickables].filter(isVisible), false)[0] || null;
}
function setHovered(set: Set<THREE.Object3D>) {
  hovered.forEach(o => { if (!set.has(o)) { hovered.delete(o); o.userData.click?.onHover?.(false); } });
  set.forEach(o => { if (!hovered.has(o)) { hovered.add(o); SND.hover(); o.userData.click?.onHover?.(true); } });
}

export function initInput(modeChanged: () => void) {
  onModeChange = modeChanged;
  const { renderer, scene } = ctx;
  for (let i = 0; i < 2; i++) {
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
      const h = c.userData.hit;
      if (h) {
        const ck = h.object.userData.click; haptic(c.userData.src, 0.6, 35); SND.click();
        if (ck.grab) { c.userData.grabbing = ck; ck.grab.start(c); return; }
        ck.onClick?.(); return;
      }
      const m = ctx.modules[ctx.current];
      c.userData.hold = { t: performance.now(), p: c.position.clone(), moved: false, done: false, start: m?.dragStart ? m.dragStart() : 0 };
    });
    c.addEventListener('selectend', () => {
      ctx.lastAct = performance.now();
      if (c.userData.grabbing) { c.userData.grabbing.grab.end(c); c.userData.grabbing = null; return; }
      const h = c.userData.hold; c.userData.hold = null; if (!h || h.done) return;
      if (!h.moved && performance.now() - h.t < 600) ctx.modules[ctx.current]?.onTap?.();
    });
  }
  initMouse();
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), right = new THREE.Vector3();
function updateCtrl(c: THREE.XRTargetRaySpace, hs: Set<THREE.Object3D>) {
  c.getWorldPosition(tmpV); c.getWorldQuaternion(tmpQ);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(tmpQ);
  const h = c.userData.grabbing ? null : pick(tmpV.clone(), dir); c.userData.hit = h;
  c.userData.line.scale.z = h ? h.distance : 0.4; c.userData.dot.visible = !!h; if (h) c.userData.dot.position.copy(h.point);
  if (h) hs.add(h.object);
  const ho = h ? h.object : null; if (ho && ho !== c.userData.lastHover) haptic(c.userData.src, 0.15, 12); c.userData.lastHover = ho;
  const hd = c.userData.hold; if (!hd) return;
  const d = c.position.clone().sub(hd.p); if (d.length() > 0.04) hd.moved = true;
  if (hd.moved) { right.set(1, 0, 0).applyQuaternion(ctx.anchor.quaternion); ctx.modules[ctx.current]?.onDrag?.(d.dot(right), hd.start); ctx.lastAct = performance.now(); }
  if (!hd.moved && !hd.done && performance.now() - hd.t > 1400) { hd.done = true; ctx.goHome(); ctx.recenter(); }
}
export function updateInput() {
  if (!ctx.renderer.xr.isPresenting) return;
  const hs = new Set<THREE.Object3D>(); ctrls.forEach(c => updateCtrl(c, hs)); setHovered(hs);
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
    raycaster.setFromCamera(mouse, ctx.camera); raycaster.far = 60;
    return raycaster.intersectObjects([...clickables].filter(isVisible), false)[0] || null;
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
