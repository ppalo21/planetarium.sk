import * as THREE from 'three';
import { ctx, D2R } from '../core/context';
import { T, fmt, en } from '../core/i18n';
import { setHud } from '../core/ui3d';
import { textSprite, setSpriteH, disposeTree, starTex } from '../core/util';

/** Hĺbka oblohy: súhvezdie sa rozletí do skutočných vzdialeností hviezd. */
const YEAR = new Date().getFullYear();
const eq = (ra: number, de: number) => { const a = ra * D2R, d = de * D2R; return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)); };

export const depth: any = {
  stars: true,
  build() { this.root = new THREE.Group(); ctx.anchor.add(this.root); this.pivot = new THREE.Group(); this.root.add(this.pivot); this.ci = 0; this.phase = 0; this.tD = 0; this.tR = 0; this.yaw = 0; this.tgt = { d: 0, r: 0 }; },
  enter() { this.root.visible = true; this.load(this.ci); },
  exit() { this.root.visible = false; },
  load(ci: number) {
    const P: THREE.Group = this.pivot; while (P.children.length) { const o = P.children.pop()!; disposeTree(o); }
    this.ci = ci; const cd = ctx.content.constellations[ci]; const FLAT = 3.0, MAXM = 7.0, MIN = 0.45;
    const C = new THREE.Vector3(); cd.stars.forEach((s: any) => C.add(eq(s.ra, s.dec))); C.normalize();
    const NP = new THREE.Vector3(0, 0, 1), U = NP.clone().sub(C.clone().multiplyScalar(NP.dot(C))).normalize(), R = new THREE.Vector3().crossVectors(C, U).normalize();
    const maxLy = Math.max(...cd.stars.map((s: any) => s.ly)); this.K = MAXM / maxLy; this.FLAT = FLAT;
    this.centroid = new THREE.Vector3(); this.sts = []; this.by = {};
    cd.stars.forEach((a: any) => {
      const v = eq(a.ra, a.dec), s: any = { n: a.name, ly: a.ly, m: a.mag, c: a.color, neb: !!a.nebula };
      s.dir = new THREE.Vector3(v.dot(R), v.dot(U), -v.dot(C)).normalize();
      s.dTrue = Math.max(s.ly * this.K, MIN); s.clamped = s.ly * this.K < MIN;
      s.base = s.neb ? 0.05 : 0.03 * Math.pow(10, -0.12 * Math.max(s.m, 0));
      s.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(s.c, s.neb), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
      s.name = textSprite(s.neb ? (en() ? 'Orion Nebula' : 'Hmlovina M42') : s.n, s.neb ? '#ffc2da' : '#e9ecf7', 56);
      const y = YEAR - s.ly;
      const yt = en() ? (y > 0 ? `light from ${y}` : `light from ${1 - y} BC`) : (y > 0 ? `svetlo z roku ${y}` : `svetlo z roku ${1 - y} pred n. l.`);
      const dl = [fmt(s.ly) + ' ly', yt]; if (s.clamped) dl.push(en() ? '(actually closer)' : '(v skutočnosti bližšie)');
      s.dist = textSprite(dl, ['#ffb46b', '#c9cfe6', '#8a93b8'], 50);
      P.add(s.sprite, s.name, s.dist); s.pos = new THREE.Vector3(); this.by[s.n] = s; this.sts.push(s);
      this.centroid.add(s.dir.clone().multiplyScalar(s.dTrue));
    });
    this.centroid.divideScalar(this.sts.length); P.position.copy(this.centroid); this.earthRel = this.centroid.clone().negate();
    this.lines = cd.lines;
    this.lineGeo = new THREE.BufferGeometry(); this.lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cd.lines.length * 6), 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.55, depthWrite: false }); P.add(new THREE.LineSegments(this.lineGeo, this.lineMat));
    this.rayGeo = new THREE.BufferGeometry(); this.rayGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.sts.length * 6), 3));
    this.rayMat = new THREE.LineBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0, depthWrite: false }); P.add(new THREE.LineSegments(this.rayGeo, this.rayMat));
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: 0x4d8dff, transparent: true, opacity: 0 }));
    this.earthLbl = textSprite(en() ? 'Earth (you are here)' : 'Zem (tu stojíte)', '#9fc0ff', 56); P.add(this.earth, this.earthLbl);
    const RY = -0.9, pts = [0, RY, 0, 0, RY, -maxLy * this.K]; this.ticks = [];
    const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(s => s >= maxLy / 4) || 5000;
    for (let ly = 0; ly <= maxLy + 1e-6; ly += step) { const z = -ly * this.K; pts.push(0, RY - 0.05, z, 0, RY + 0.05, z); const l = textSprite(fmt(ly) + ' ly', '#8a93b8', 48); l.userData.z = z; l.userData.y = RY; this.ticks.push(l); P.add(l); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.rulerMat = new THREE.LineBasicMaterial({ color: 0x8a93b8, transparent: true, opacity: 0, depthWrite: false }); this.ruler = new THREE.LineSegments(rg, this.rulerMat); P.add(this.ruler);
    this.tD = 0; this.tR = 0; this.yaw = 0; this.setPhase(0);
  },
  setPhase(p: number) { this.phase = p; this.tgt.d = p > 0 ? 1 : 0; this.tgt.r = p === 2 ? 1 : 0; this.hud(); },
  hud() {
    const cs = ctx.content.constellations, cd = cs[this.ci], ph = cd.phases[this.phase], sc = fmt(Math.round(1 / this.K));
    setHud({ kicker: { sk: `Hĺbka oblohy   ${T(cd.name)}   ${this.phase + 1} / 3   (1 m = ${sc} ly)`, en: `Depth of the sky   ${T(cd.name)}   ${this.phase + 1} / 3   (1 m = ${sc} ly)` },
      title: ph.title, body: ph.text,
      rows: [cs.map((c: any, i: number) => ({ label: T(c.name), onClick: () => this.load(i), active: i === this.ci })),
        [{ label: '‹ ' + T(ctx.content.ui.prev), onClick: () => this.setPhase((this.phase + 2) % 3) }, { label: T(ctx.content.ui.next) + ' ›', onClick: () => this.setPhase((this.phase + 1) % 3), primary: true }]] });
  },
  onTap() { this.setPhase((this.phase + 1) % 3); },
  onDrag(dx: number, start: number) { if (this.phase > 0) this.yaw = start + dx * 3; },
  dragStart() { return this.yaw; },
  relabel() { if (this.built) this.load(this.ci); },
  update(dt: number) {
    const e = 1 - Math.exp(-dt * 2.2); this.tD += (this.tgt.d - this.tD) * e; this.tR += (this.tgt.r - this.tR) * e; if (this.phase === 0) this.yaw += (0 - this.yaw) * e;
    const P = this.pivot, off = new THREE.Vector3(); P.rotation.y = -Math.PI / 2 * this.tR + this.yaw; P.scale.setScalar(1 - 0.45 * this.tR);
    this.sts.forEach((s: any) => {
      const d = THREE.MathUtils.lerp(this.FLAT, s.dTrue, this.tD);
      s.pos.copy(s.dir).multiplyScalar(d).sub(this.centroid); s.sprite.position.copy(s.pos);
      const sz = s.base * d; s.sprite.scale.set(sz, sz, 1); const lh = 0.016 * d;
      setSpriteH(s.name, lh); s.name.position.copy(s.pos).add(off.set(0, -sz * 0.55 - lh * 0.5, 0));
      const dh = lh * 0.82 * s.dist.userData.lines; setSpriteH(s.dist, dh); s.dist.position.copy(s.name.position).add(off.set(0, -lh * 0.5 - dh * 0.5, 0)); s.dist.material.opacity = this.tD;
    });
    const lp = this.lineGeo.attributes.position.array;
    this.lines.forEach((l: string[], i: number) => { const a = this.by[l[0]].pos, b = this.by[l[1]].pos; lp.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); });
    this.lineGeo.attributes.position.needsUpdate = true; this.lineMat.opacity = 0.55 * (1 - 0.75 * this.tR);
    const vis = Math.min(1, Math.max(this.tR, Math.abs(this.yaw) * 2)) * this.tD, E = this.earthRel;
    const rp = this.rayGeo.attributes.position.array; this.sts.forEach((s: any, i: number) => rp.set([E.x, E.y, E.z, s.pos.x, s.pos.y, s.pos.z], i * 6));
    this.rayGeo.attributes.position.needsUpdate = true; this.rayMat.opacity = 0.28 * vis;
    this.earth.position.copy(E); this.earth.material.opacity = vis; this.earth.visible = vis > 0.02;
    this.earthLbl.position.copy(E).add(off.set(0, 0.13, 0)); setSpriteH(this.earthLbl, 0.06); this.earthLbl.material.opacity = vis;
    this.ruler.position.copy(E); this.rulerMat.opacity = 0.8 * vis;
    this.ticks.forEach((t: THREE.Sprite) => { t.position.set(E.x, E.y + t.userData.y - 0.12, E.z + t.userData.z); setSpriteH(t, 0.055); t.material.opacity = vis; });
  }
};
