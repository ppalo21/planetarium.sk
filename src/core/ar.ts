import * as THREE from 'three';
import { ctx } from './context';

/**
 * Umiestňovanie v rozšírenej realite (Quest 3, len režim AR):
 * hit-test nájde skutočnú podlahu alebo stôl tam, kam sa návštevník pozerá,
 * zobrazí terčík a štipnutím sa tam objekt položí.
 * Vyžaduje nastavený priestor v Queste (Nastavenia → Fyzický priestor → Nastavenie priestoru).
 */
let hitSource: XRHitTestSource | null = null;
let reticle: THREE.Group;
let onPlace: ((p: THREE.Vector3) => void) | null = null;
let lastHit: THREE.Vector3 | null = null;
let wantHorizontal = true;

export function initAR() {
  reticle = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0.9, depthWrite: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.018, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
  reticle.add(ring, dot); reticle.visible = false; reticle.matrixAutoUpdate = false; ctx.scene.add(reticle);
}
export async function startARSession(session: XRSession) {
  hitSource = null;
  try {
    const viewer = await session.requestReferenceSpace('viewer');
    hitSource = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
  } catch { hitSource = null; }
  session.addEventListener('end', () => { hitSource?.cancel(); hitSource = null; stopPlacing(); });
}
export const arReady = () => ctx.isAR && !!hitSource;
/** Spustí umiestňovanie; cb dostane bod vo svetových súradniciach. */
export function startPlacing(cb: (p: THREE.Vector3) => void, horizontal = true) { onPlace = cb; wantHorizontal = horizontal; lastHit = null; }
export function stopPlacing() { onPlace = null; lastHit = null; if (reticle) reticle.visible = false; }
export const isPlacing = () => !!onPlace;
/** Volá sa pri štipnutí do prázdna; vráti true, ak sa niečo umiestnilo. */
export function tryPlace() {
  if (!onPlace || !lastHit) return false;
  const cb = onPlace, p = lastHit.clone(); stopPlacing(); cb(p); return true;
}
const m4 = new THREE.Matrix4(), up = new THREE.Vector3(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
export function updateAR(frame: XRFrame | undefined) {
  if (!onPlace || !hitSource || !frame) { if (reticle) reticle.visible = false; return; }
  const ref = ctx.renderer.xr.getReferenceSpace(); if (!ref) return;
  const res = frame.getHitTestResults(hitSource);
  let ok = false;
  for (const r of res) {
    const pose = r.getPose(ref); if (!pose) continue;
    m4.fromArray(pose.transform.matrix); m4.decompose(pos, q, sc);
    up.set(0, 1, 0).applyQuaternion(q);
    if (wantHorizontal && up.y < 0.85) continue;      // len vodorovné plochy: podlaha, stôl
    reticle.matrix.copy(m4); reticle.visible = true; lastHit = pos.clone(); ok = true; break;
  }
  if (!ok) { reticle.visible = false; lastHit = null; }
}
