import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ctx } from '../core/context';
import { T, en } from '../core/i18n';
import { setHud, keepHud } from '../core/ui3d';
import { textSprite, setSpriteH, disposeTree } from '../core/util';
import { arReady, startPlacing, isPlacing } from '../core/ar';

/** Stroje v skutočnej veľkosti (3D modely NASA), vedľa silueta človeka. */
export const machines: any = {
  floor: true, stars: true,
  build() {
    this.root = new THREE.Group(); ctx.floor.add(this.root); this.i = 0; this.spin = true; this.model = null; this.yaw = 0;
    const h = 1.7, person = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.35, roughness: 1 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, h - 0.25, 24), mat); body.position.y = (h - 0.25) / 2; person.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat); head.position.y = h - 0.12; person.add(head);
    person.position.set(-1.9, 0, -2.6); this.person = person; this.root.add(person); this.personLabel();
  },
  personLabel() {
    if (this.personLbl) { this.person.remove(this.personLbl); disposeTree(this.personLbl); }
    const pl = textSprite(en() ? 'Person 1.7 m' : 'Človek 1,7 m', '#9fc0ff', 56); setSpriteH(pl, 0.07); pl.position.y = 1.82; this.person.add(pl); this.personLbl = pl;
  },
  async enter() { this.root.visible = true; this.root.position.set(0, 0, 0); await this.load(this.i); if (arReady()) this.place(); },
  exit() { this.root.visible = false; this.root.position.set(0, 0, 0); },
  /** AR: rover sa postaví na skutočnú podlahu tam, kam sa návštevník pozrie a štipne. */
  place() {
    startPlacing(p => { const l = ctx.floor.worldToLocal(p.clone()); this.root.position.set(l.x, l.y, l.z + 2.6); this.hud2(this.lastBody); });
    this.hud2(this.lastBody);
  },
  async load(i: number) {
    const list = ctx.content.machines, mc = list[i]; this.i = i; const tok = (this.tok = Math.random());
    if (this.model) { this.root.remove(this.model); disposeTree(this.model); this.model = null; }
    this.hud2(ctx.content.ui.loading);
    const gltf: any = await new Promise(res => new GLTFLoader().load(mc.file, res, undefined, () => res(null)));
    if (tok !== this.tok) return;
    if (!gltf) { this.hud2(ctx.content.ui.missing); return; }
    const obj = gltf.scene, size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(mc.length / Math.max(size.x, size.z));               // presná skutočná dĺžka v metroch
    const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -b2.min.y, -c.z);
    const holder = new THREE.Group(); holder.add(obj); holder.position.set(0, 0, -2.6); this.model = holder; this.root.add(holder);
    this.hud2(mc.info);
  },
  hud2(body: any) {
    const list = ctx.content.machines, mc = list[this.i];
    this.lastBody = body;
    const hint = isPlacing() ? T({ sk: 'Pozrite sa na podlahu, objaví sa oranžový terčík. Štipnite a rover sa postaví tam.', en: 'Look at the floor until an orange target appears, then pinch to place the rover there.' }) : null;
    setHud({ kicker: { sk: 'V skutočnej veľkosti', en: 'Life size' }, title: mc.name, body: hint ?? body, credit: mc.credit,
      rows: [[...(arReady() ? [{ label: en() ? 'Place' : 'Umiestniť', active: isPlacing(), onClick: () => this.place() }] : []),{ label: this.spin ? (en() ? 'Stop turning' : 'Zastaviť otáčanie') : (en() ? 'Turn' : 'Otáčať'), onClick: () => { this.spin = !this.spin; keepHud(); this.hud2(this.lastBody); } },
        ...(list.length > 1 ? [{ label: T(ctx.content.ui.next) + ' ›', onClick: () => this.load((this.i + 1) % list.length) }] : [])]] });
  },
  onDrag(dx: number, start: number) { this.spin = false; this.yaw = start + dx * 4; },
  dragStart() { return this.yaw; },
  relabel() { if (!this.built) return; this.personLabel(); if (ctx.current === 'machines') this.load(this.i); },
  update(dt: number) { if (this.spin) this.yaw += dt * 0.25; if (this.model) this.model.rotation.y = this.yaw; }
};
