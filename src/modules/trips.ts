import * as THREE from 'three';
import { ctx, D2R } from '../core/context';
import { setHud } from '../core/ui3d';
import { T } from '../core/i18n';
import { loadTex, freeTex, disposeTree, gradTex } from '../core/util';

/** 360° výlety: panorámy z NASA a ESO (aj čiastočné pásy, zvislý rozsah sa dopočíta). */
export const trips: any = {
  build() { this.root = new THREE.Group(); ctx.anchor.add(this.root); this.i = 0; this.checked = false; this.list = ctx.content.trips; },
  async enter() {
    this.root.visible = true;
    if (!this.checked) { this.checked = true; const opt = ctx.content.trips.find((x: any) => x.optional); if (opt && !(await loadTex(opt.file))) this.list = ctx.content.trips.filter((x: any) => !x.optional); }
    this.show(this.i);
  },
  exit() { this.root.visible = false; this.clear(); },
  clear() {
    while (this.root.children.length) { const o = this.root.children.pop(); disposeTree(o); }
    if (this.curTex) freeTex(this.curFile, this.curTex); this.curTex = null;   // panoráma zaberá veľa pamäte
  },
  async show(i: number) {
    const n = this.list.length; this.i = ((i % n) + n) % n; const tr = this.list[this.i]; const token = (this.token = Math.random());
    this.clear();
    const fill = new THREE.Mesh(new THREE.SphereGeometry(44, 48, 24), new THREE.MeshBasicMaterial({ map: gradTex(tr.sky, tr.ground), side: THREE.BackSide, depthWrite: false }));
    fill.renderOrder = -12; this.root.add(fill);
    this.hud2(tr, ctx.content.ui.loading);
    const t = await loadTex(tr.file);
    if (token !== this.token || ctx.current !== 'trips') return;
    if (!t) { this.hud2(tr, ctx.content.ui.missing); return; }
    this.curTex = t; this.curFile = tr.file;
    const img = t.image as HTMLImageElement, hf = (tr.hfov || 360) * D2R, vf = Math.min(Math.PI, hf * img.height / img.width);
    const geo = new THREE.SphereGeometry(40, 96, 48, Math.PI - hf / 2, hf, Math.PI / 2 - vf / 2, vf); geo.scale(-1, 1, 1);
    const s = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, depthWrite: false }));
    s.rotation.y = -Math.PI / 2 + (tr.yaw || 0) * D2R; s.renderOrder = -11; this.root.add(s);
    this.hud2(tr, tr.info);
  },
  hud2(tr: any, body: any) {
    setHud({ kicker: { sk: `Výlety v 360°   ${this.i + 1} / ${this.list.length}`, en: `360° trips   ${this.i + 1} / ${this.list.length}` },
      title: tr.name, body, credit: body === tr.info ? tr.credit : null,
      rows: [[{ label: '‹ ' + T(ctx.content.ui.prev), onClick: () => this.show(this.i - 1) },
              { label: T(ctx.content.ui.next) + ' ›', onClick: () => this.show(this.i + 1), primary: true }]] });
  },
  onTap() { this.show(this.i + 1); },
  relabel() { if (ctx.current === 'trips') this.show(this.i); }
};
