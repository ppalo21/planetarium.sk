import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ctx, url } from '../core/context';
import { T, en } from '../core/i18n';
import { setHud, keepHud, makeClickable, clickables } from '../core/ui3d';
import { textSprite, setSpriteH, disposeTree, camWorld } from '../core/util';
import { arReady, startPlacing, isPlacing } from '../core/ar';

/** Modely NASA sú často komprimované (Draco) – dekodér je priamo v appke (public/draco), funguje offline. */
let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    const draco = new DRACOLoader(); draco.setDecoderPath(url('draco/'));
    loader = new GLTFLoader(); loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}
const MINI = 0.32;   // najväčší rozmer modelu „do ruky“ v metroch

/**
 * Stroje NASA v skutočnej veľkosti alebo ako model do ruky.
 * Model do ruky: chytiť, otáčať, položiť na stôl (AR), zväčšiť roztiahnutím rúk;
 * popisy dielov sa ukazujú len na strane otočenej k divákovi.
 */
export const machines: any = {
  floor: true, stars: true,
  build() {
    this.root = new THREE.Group(); ctx.floor.add(this.root); this.i = 0; this.spin = true; this.model = null; this.yaw = 0; this.mini = false; this.zoomF = 1;
    const h = 1.7, person = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.35, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, h - 0.25, 24), mat); body.position.y = (h - 0.25) / 2; person.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat); head.position.y = h - 0.12; person.add(head);
    person.position.set(-1.9, 0, -2.6); this.person = person; this.root.add(person); this.personLabel(); this.dist = 2.6;
  },
  personLabel() {
    if (this.personLbl) { this.person.remove(this.personLbl); disposeTree(this.personLbl); }
    const pl = textSprite(en() ? 'Person 1.7 m' : 'Človek 1,7 m', '#9fc0ff', 56); setSpriteH(pl, 0.07); pl.position.y = 1.82; this.person.add(pl); this.personLbl = pl;
  },
  async enter() { this.root.visible = true; this.root.position.set(0, 0, 0); this.mini = false; await this.load(this.i); if (arReady()) this.place(); },
  exit() { if (this.grabbedBy) this.release(); this.root.visible = false; this.root.position.set(0, 0, 0); },

  /** AR: 1:1 na podlahu, model do ruky na stôl. */
  place() {
    startPlacing(p => { const l = ctx.floor.worldToLocal(p.clone()); this.root.position.set(l.x, l.y, l.z + this.dist); this.hud2(this.lastBody); });
    this.hud2(this.lastBody);
  },
  async load(i: number) {
    const list = ctx.content.machines, mc = list[i]; this.i = i; const tok = (this.tok = Math.random());
    if (this.grabbedBy) this.release();
    if (this.model) { this.root.remove(this.model); clickables.delete(this.proxy); disposeTree(this.model); this.model = null; }
    this.zoomF = 1; this.hud2(ctx.content.ui.loading);
    const gltf: any = await new Promise(res => gltfLoader().load(mc.file, res, undefined, (e) => { console.warn('Model sa nenačítal:', mc.file, e); res(null); }));
    if (tok !== this.tok) return;
    if (!gltf) { this.hud2(ctx.content.ui.missing); return; }
    const obj: THREE.Object3D = gltf.scene; let size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    // vesmírne stroje (ďalekohľady) položíme najdlhšou osou vodorovne, ako ich poznáme z fotiek na obežnej dráhe
    if (mc.float && size.y > Math.max(size.x, size.z)) { obj.rotation.x = Math.PI / 2; obj.updateMatrixWorld(true); size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); }
    // skutočná veľkosť v metroch: podľa dĺžky (vodorovne), výšky alebo najväčšieho rozmeru
    const ref = mc.scaleBy === 'height' ? size.y : mc.scaleBy === 'max' ? Math.max(size.x, size.y, size.z) : Math.max(size.x, size.z);
    obj.scale.multiplyScalar(mc.size / ref); obj.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3()), s2 = b2.getSize(new THREE.Vector3());
    obj.position.set(-c.x, -b2.min.y, -c.z); obj.updateMatrixWorld(true);
    this.size = s2.clone(); this.maxDim = Math.max(s2.x, s2.y, s2.z);
    const holder = new THREE.Group(); holder.add(obj);
    // neviditeľný „úchop“ okolo celého modelu – naň sa mieri lúčom a chytá
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(s2.x, s2.y, s2.z), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    proxy.position.y = s2.y / 2; holder.add(proxy); this.proxy = proxy;
    makeClickable(proxy, { onClick: () => { this.spin = !this.spin; }, onHover: v => { this.hover = v; }, grab: { start: cc => this.grab(cc), end: () => this.release() } });
    proxy.userData.click.enabled = false;
    this.model = holder; this.root.add(holder);
    this.buildParts(mc, obj, holder);
    this.layoutView();
    this.hud2(mc.info);
  },
  /** Body na modeli: podľa názvu dielu v 3D súbore, kľúčových slov alebo relatívnej polohy (prichytenej k povrchu). */
  buildParts(mc: any, obj: THREE.Object3D, holder: THREE.Group) {
    this.parts = [];
    holder.updateMatrixWorld(true);
    const s = this.size, center = new THREE.Vector3(0, s.y / 2, 0);
    const local = (w: THREE.Vector3) => holder.worldToLocal(w.clone());
    const nodeCenter = (o: THREE.Object3D) => local(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()));
    let verts: THREE.Vector3[] | null = null;
    const snap = (p: THREE.Vector3) => {   // najbližší bod povrchu modelu
      if (!verts) {
        verts = []; const v = new THREE.Vector3();
        obj.traverse((m: any) => { if (!m.isMesh) return; const pos = m.geometry.attributes.position; const st = Math.max(1, Math.floor(pos.count / 4000));
          for (let k = 0; k < pos.count; k += st) { v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld); verts!.push(local(v)); } });
      }
      let best = p, bd = Infinity; for (const q of verts) { const d = q.distanceToSquared(p); if (d < bd) { bd = d; best = q; } } return best.clone();
    };
    (mc.parts || []).forEach((pt: any) => {
      let p: THREE.Vector3 | null = null;
      if (pt.node) { const o = obj.getObjectByName(pt.node); if (o) p = nodeCenter(o); }
      if (!p && pt.keys) { obj.traverse(o => { if (!p && pt.keys.some((k: string) => o.name.toLowerCase().includes(k))) p = nodeCenter(o); }); }
      if (!p && pt.at) p = snap(new THREE.Vector3((pt.at[0] - 0.5) * s.x, pt.at[1] * s.y, (pt.at[2] - 0.5) * s.z));
      if (!p) return;
      const n = p.clone().sub(center); if (n.lengthSq() < 1e-6) n.set(0, 1, 0); n.normalize();
      const g = new THREE.Group(); holder.add(g);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, depthTest: false })); dot.renderOrder = 14; g.add(dot);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]), new THREE.LineBasicMaterial({ color: 0xffb46b, transparent: true, depthTest: false })); line.renderOrder = 14; g.add(line);
      const lab = textSprite([T(pt.n), T(pt.f)], ['#ffffff', '#ffd9b0'], 52); lab.material.depthTest = false; lab.renderOrder = 15; g.add(lab);
      this.parts.push({ g, p, n, dot, line, lab });
    });
  },
  /** Prepnutie medzi skutočnou veľkosťou a modelom do ruky. */
  layoutView() {
    const m = this.model; if (!m) return;
    this.proxy.userData.click.enabled = this.mini;
    if (this.mini) {
      const head = camWorld(), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.anchor.quaternion);
      const p = head.clone().addScaledVector(fwd, 0.6); p.y -= 0.12;
      m.position.copy(this.root.worldToLocal(p)); m.scale.setScalar(MINI / this.maxDim * this.zoomF); this.spin = true;
      this.person.visible = false;
    } else {
      const radius = Math.hypot(this.size.x, this.size.z) / 2, mc = ctx.content.machines[this.i];
      this.dist = Math.max(2.6, radius + 1.2);
      m.scale.setScalar(1); m.rotation.set(0, this.yaw, 0);
      m.position.set(0, mc.float ? Math.max(0.3, 1.7 - this.size.y / 2) : 0, -this.dist);
      this.person.position.set(-Math.min(radius + 0.5, 4), 0, -Math.min(this.dist, 2.6 + radius * 0.3)); this.person.visible = true;
    }
  },
  setMini(v: boolean) { if (this.grabbedBy) this.release(); this.mini = v; this.zoomF = 1; this.layoutView(); this.hud2(ctx.content.machines[this.i].info); },
  zoom(f: number) { this.zoomF = THREE.MathUtils.clamp(this.zoomF * f, 0.4, 4); },
  grab(c: THREE.Object3D) { if (!this.mini) return; this.grabbedBy = c; this.spin = false; c.attach(this.model); },
  release() { const c = this.grabbedBy; this.grabbedBy = null; this.zoomPinch = null; if (c && this.model) this.root.attach(this.model); },
  /** Druhá ruka štipne do vzduchu, kým prvá drží model → roztiahnutím rúk sa model zväčší. */
  onPinchStart(c: THREE.Object3D) {
    if (!this.grabbedBy || c === this.grabbedBy) return;
    const a = this.grabbedBy.getWorldPosition(new THREE.Vector3()), b = c.getWorldPosition(new THREE.Vector3());
    this.zoomPinch = { c, d0: Math.max(0.05, a.distanceTo(b)), z0: this.zoomF };
  },
  onPinchEnd(c: THREE.Object3D) { if (this.zoomPinch?.c === c) this.zoomPinch = null; },
  hud() { this.hud2(this.lastBody); },
  hud2(body: any) {
    const list = ctx.content.machines, mc = list[this.i]; this.lastBody = body;
    let text: any = body;
    if (isPlacing()) text = { sk: 'Pozrite sa na podlahu, objaví sa oranžový terčík. Štipnite a stroj sa postaví tam. Bez terčíka štipnite kdekoľvek a ostane tu.', en: 'Look at the floor until an orange target appears, then pinch to place it there. Without a target, pinch anywhere to keep it here.' };
    else if (this.mini && body === mc.info) text = { sk: 'Chyťte model rukou (alebo lúčom a štipnutím), otáčajte ním a ukážu sa popisy dielov. Pustite ho a ostane, kde ste ho nechali, aj na stole. Druhou rukou štipnite do vzduchu a roztiahnite ruky: model sa zväčší.', en: 'Grab the model with your hand (or point and pinch) and turn it to see the parts. Let go and it stays where you left it, even on a table. Pinch the air with your other hand and spread your hands to enlarge it.' };
    setHud({ kicker: { sk: `${this.mini ? 'Model do ruky' : 'V skutočnej veľkosti'}   ${this.i + 1} / ${list.length}`, en: `${this.mini ? 'Model in hand' : 'Life size'}   ${this.i + 1} / ${list.length}` },
      title: mc.name, body: text, credit: mc.credit,
      actions: [{ label: this.mini ? (en() ? 'Life size' : 'Skutočná veľkosť') : (en() ? 'Model in hand' : 'Model do ruky'), onClick: () => this.setMini(!this.mini) }],
      prev: list.length > 1 ? () => this.load((this.i - 1 + list.length) % list.length) : undefined,
      next: list.length > 1 ? () => this.load((this.i + 1) % list.length) : undefined });
  },
  onDrag(dx: number, start: number) { if (this.grabbedBy) return; this.spin = false; this.yaw = start + dx * 4; },
  dragStart() { return this.yaw; },
  relabel() { if (!this.built) return; this.personLabel(); if (ctx.current === 'machines') this.load(this.i); },
  update(dt: number) {
    const m = this.model; if (!m) return;
    if (this.spin && !this.grabbedBy) this.yaw += dt * 0.25;
    if (!this.grabbedBy) m.rotation.y = this.yaw;
    // zväčšovanie dvoma rukami
    if (this.zoomPinch && this.grabbedBy) {
      const a = this.grabbedBy.getWorldPosition(new THREE.Vector3()), b = this.zoomPinch.c.getWorldPosition(new THREE.Vector3());
      this.zoomF = THREE.MathUtils.clamp(this.zoomPinch.z0 * a.distanceTo(b) / this.zoomPinch.d0, 0.4, 4);
    }
    const target = this.mini ? MINI / this.maxDim * this.zoomF : 1;
    m.scale.setScalar(m.scale.x + (target - m.scale.x) * Math.min(1, dt * 8));
    // popisy dielov: veľkosť v metroch nezávisle od zväčšenia, viditeľné len na strane k divákovi
    const ws = m.getWorldScale(new THREE.Vector3()).x, cam = camWorld(), cW = m.localToWorld(new THREE.Vector3(0, this.size.y / 2, 0));
    const toCam = cam.clone().sub(cW).normalize(), nW = new THREE.Vector3(), q = m.getWorldQuaternion(new THREE.Quaternion());
    const labH = this.mini ? 0.022 : 0.11, off = this.mini ? 0.06 : 0.35, dotR = this.mini ? 0.004 : 0.03;
    // len diely na strane k divákovi a najviac 5 naraz, aby sa popisy neprekrývali
    const vis = (this.parts || []).map((pt: any) => { nW.copy(pt.n).applyQuaternion(q); return { pt, d: nW.dot(toCam) }; })
      .sort((a: any, b: any) => b.d - a.d);
    const shown: THREE.Vector3[] = [], minAng = (this.mini ? 11 : 7) * Math.PI / 180;
    vis.forEach(({ pt, d }: any) => {
      // popis, ktorý by z pohľadu diváka zakryl už zobrazený, sa vynechá
      const dir = m.localToWorld(pt.p.clone().addScaledVector(pt.n, off / ws)).sub(cam).normalize();
      const free = shown.length < 5 && shown.every(s => s.angleTo(dir) > minAng);
      const o = free ? THREE.MathUtils.clamp((d - 0.05) / 0.3, 0, 1) : 0;
      pt.g.visible = o > 0.02;
      if (!pt.g.visible) return;
      shown.push(dir);
      pt.dot.position.copy(pt.p); pt.dot.scale.setScalar(dotR / ws);
      const tip = pt.p.clone().addScaledVector(pt.n, off / ws);
      pt.line.position.copy(pt.p); pt.line.scale.setScalar(off / ws); pt.line.lookAt(m.localToWorld(tip.clone()));
      pt.lab.position.copy(tip).addScaledVector(pt.n, (labH * 0.8) / ws); setSpriteH(pt.lab, (labH * pt.lab.userData.lines) / ws);
      pt.lab.material.opacity = o; pt.dot.material.opacity = o; pt.line.material.opacity = o * 0.9;
    });
  }
};
