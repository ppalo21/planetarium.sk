import * as THREE from 'three';
import { ctx, D2R, ASSET } from '../core/context';
import { T, fmt, en } from '../core/i18n';
import { setHud, keepHud, makeClickable } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree, camWorld, sphereDir } from '../core/util';
import { sunMaterial, buildSunExtras, SUN_U } from './sun';
import { arReady, startPlacing, isPlacing } from '../core/ar';

/** Planéty v ruke: chytiť, priblížiť, otáčať; popisy miest na povrchu sa ukazujú len na strane k divákovi. */
export const planets: any = {
  stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.anchor.add(r); this.real = false; this.sel = null; this.ha = false; this.items = [];
    ctx.content.bodies.forEach((b: any) => {
      const mat: THREE.Material = b.sun ? sunMaterial() : new THREE.MeshStandardMaterial({ color: new THREE.Color(b.c), roughness: 1, metalness: 0 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
      if (!b.sun) loadTex(ASSET.planets + b.tex).then(t => { if (t) { const m = mat as THREE.MeshStandardMaterial; m.map = t; m.color.set('#ffffff'); m.needsUpdate = true; } });
      else buildSunExtras(mesh);
      if (b.id === 'uranus') mesh.rotation.z = 98 * D2R;
      const holder = new THREE.Group(), sg = new THREE.Group(); sg.add(mesh); holder.add(sg); r.add(holder);
      if (b.ring) {
        const inner = 1.24, outer = 2.27, rg = new THREE.RingGeometry(inner, outer, 96, 1), pos = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5); }
        const rm = new THREE.MeshBasicMaterial({ color: 0xd9c79a, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthWrite: false });
        loadTex(ASSET.planets + b.ring).then(t => { if (t) { rm.map = t; rm.color.set('#ffffff'); rm.opacity = 1; rm.needsUpdate = true; } });
        const ring = new THREE.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2 + 27 * D2R; sg.add(ring);
      }
      const lab = textSprite(T(b.name), '#e9ecf7', 56); holder.add(lab);
      const it: any = { b, holder, sg, mesh, lab, slot: new THREE.Vector3(), size: 0.07, grabbed: null, marks: [] };
      this.buildMarks(it);
      makeClickable(mesh, { onClick: () => this.select(it), onHover: v => { it.hover = v; }, grab: { start: c => this.grab(it, c), end: () => this.release(it) } });
      this.items.push(it);
    });
    this.layout();
  },
  buildMarks(it: any) {
    it.marks.forEach((m: any) => { it.mesh.remove(m.g); disposeTree(m.g); }); it.marks = [];
    const F = ctx.content.features;
    (F.places[it.b.id] || []).forEach((fe: any) => {
      const n = sphereDir(fe.lat, fe.lon + (F.lonOffset[it.b.id] || 0)), g = new THREE.Group();
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20), new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, depthWrite: false }));
      dot.position.copy(n).multiplyScalar(1.004); dot.lookAt(n.clone().multiplyScalar(2)); g.add(dot);
      const tip = n.clone().multiplyScalar(1.28);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([n.clone().multiplyScalar(1.004), tip]), new THREE.LineBasicMaterial({ color: 0xffb46b, transparent: true, depthWrite: false })); g.add(line);
      const lab = textSprite([T(fe.n), T(fe.f)], ['#ffffff', '#ffd9b0'], 52); lab.material.depthTest = false; lab.renderOrder = 15;
      setSpriteH(lab, 0.2); lab.position.copy(tip).add(n.clone().multiplyScalar(0.06)); g.add(lab);
      g.visible = false; it.mesh.add(g); it.marks.push({ g, n, dot, line, lab });
    });
  },
  layout() {
    const its = this.items;
    if (!this.real) { const n = its.length; its.forEach((it: any, i: number) => { const a = (-60 + 120 * i / (n - 1)) * D2R, R = 1.15; it.slot.set(Math.sin(a) * R, -0.22, -Math.cos(a) * R); it.size = 0.065; }); }
    else {
      const k = 0.2 / (139820 / 2); let x = 0; const xs: number[] = [], pl = its.filter((it: any) => !it.b.sun);
      pl.forEach((it: any, i: number) => { const rad = it.b.d / 2 * k, ext = it.b.ring ? rad * 2.3 : rad; if (i > 0) x += ext; xs.push(x); x += ext + 0.06; });
      const off = x / 2; pl.forEach((it: any, i: number) => { it.slot.set(xs[i] - off + 0.03, -0.15, -1.7); it.size = Math.max(it.b.d / 2 * k, 0.004); });
      const sun = its.find((it: any) => it.b.sun); sun.size = sun.b.d / 2 * k; sun.slot.set(0, 0.4, -1.7 - sun.size - 2.0);
    }
  },
  select(it: any) {
    if (!ctx.renderer.xr.isPresenting) { this.items.forEach((o: any) => { if (o !== it) o.inspect = false; }); it.inspect = !it.inspect; } // na PC: priblížiť pred oči
    this.sel = it; this.hud();
  },
  grab(it: any, c: THREE.Object3D) { this.items.forEach((o: any) => (o.inspect = false)); this.sel = it; this.hud(); it.grabbed = c; c.attach(it.holder); it.holder.position.set(0, 0, -0.24); it.holder.rotation.set(0, 0, 0); it.holdScale = 0.1; },
  release(it: any) { it.grabbed = null; this.root.attach(it.holder); it.holder.rotation.set(0, 0, 0); },
  enter() { this.root.visible = true; this.root.position.set(0, 0, 0); this.hud(); },
  /** AR: planéty sa položia na skutočný stôl (alebo podlahu). */
  place() {
    startPlacing(p => { const l = ctx.anchor.worldToLocal(p.clone()); this.real = false; this.layout(); this.root.position.set(l.x, l.y + 0.3, l.z + 1.15); keepHud(); this.hud(); });
    this.hud();
  },
  exit() { this.items.forEach((it: any) => { if (it.grabbed) this.release(it); it.inspect = false; }); this.root.visible = false; this.root.position.set(0, 0, 0); },
  hud() {
    const s = this.sel; let title: any, body: any;
    if (!s) {
      title = { sk: 'Planéty v ruke', en: 'Planets in hand' };
      body = { sk: 'Ukážte na planétu a štipnite: chytíte ju a môžete si ju priblížiť. Prepnite na skutočné pomery veľkostí a uvidíte, aké veľké je Slnko.', en: 'Point at a planet and pinch to grab it and bring it close. Switch to true sizes to see how big the Sun is.' };
    } else {
      const b = s.b; title = b.name;
      const parts = [(en() ? 'Diameter ' : 'Priemer ') + fmt(b.d) + ' km'];
      if (b.day) parts.push((en() ? 'Rotation ' : 'Otočka ') + T(b.day)); if (b.year) parts.push((en() ? 'Year ' : 'Rok ') + T(b.year));
      body = parts.join(',  ') + '. ' + T(b.fact);
      if (b.sun) body = this.ha
        ? T({ sk: 'H-alfa filter: vidíte chromosféru, tmavé vlákna a protuberancie, oblúky žeravej plazmy vysoko nad povrchom. Tak Slnko pozorujeme aj na hvezdárni.', en: 'H-alpha filter: the chromosphere, dark filaments and prominences, arches of glowing plasma high above the surface. This is how observatories watch the Sun.' })
        : T({ sk: 'Biele svetlo: fotosféra s teplotou asi 5 500 °C. Zrnitý povrch je granulácia, bunky horúcej plazmy veľké asi 1 000 km. Tmavé miesta sú slnečné škvrny.', en: 'White light: the photosphere at about 5,500 °C. The grainy surface is granulation, cells of hot plasma about 1,000 km across. Dark patches are sunspots.' });
      if (ctx.content.features.places[b.id]) body += T({ sk: ' Otáčajte ňou v ruke a objavte zaujímavé miesta.', en: ' Turn it in your hand to discover famous places.' });
    }
    const rows: any[] = [[
      { label: en() ? 'Same size' : 'Rovnaká veľkosť', active: !this.real, onClick: () => { this.real = false; this.layout(); keepHud(); this.hud(); } },
      { label: en() ? 'True sizes' : 'Skutočné pomery', active: this.real, onClick: () => { this.real = true; this.layout(); keepHud(); this.hud(); } }]];
    if (arReady()) rows[0].push({ label: en() ? 'Put on a table' : 'Položiť na stôl', active: isPlacing(), onClick: () => this.place() });
    if (isPlacing()) body = T({ sk: 'Pozrite sa na stôl alebo podlahu, objaví sa oranžový terčík. Štipnite a planéty sa tam položia.', en: 'Look at a table or the floor until an orange target appears, then pinch to put the planets there.' });
    if (s?.b.sun) rows.push([
      { label: en() ? 'White light' : 'Biele svetlo', active: !this.ha, onClick: () => { this.ha = false; this.hud(); } },
      { label: en() ? 'H-alpha filter' : 'H-alfa filter', active: !!this.ha, onClick: () => { this.ha = true; this.hud(); } }]);
    setHud({ kicker: { sk: 'Planéty v ruke', en: 'Planets in hand' }, title, body, credit: { sk: 'Textúry: Solar System Scope (CC BY 4.0)', en: 'Textures: Solar System Scope (CC BY 4.0)' }, rows });
  },
  relabel() {
    this.items.forEach((it: any) => { it.holder.remove(it.lab); disposeTree(it.lab); it.lab = textSprite(T(it.b.name), '#e9ecf7', 56); it.holder.add(it.lab); this.buildMarks(it); });
    if (ctx.current === 'planets') this.hud();
  },
  update(dt: number) {
    const e = Math.min(1, dt * 4);
    SUN_U.uTime.value += dt; SUN_U.uHa.value += ((this.ha ? 1 : 0) - SUN_U.uHa.value) * Math.min(1, dt * 2.5);
    const cam = camWorld(), c = new THREE.Vector3(), p = new THREE.Vector3(), v = new THREE.Vector3();
    this.items.forEach((it: any) => {
      const close = !!(it.grabbed || it.inspect);
      if (!it.grabbed) it.mesh.rotation.y += dt * (it.b.sun ? 0.05 : (it.inspect ? 0.35 : 0.3));
      if (it.marks.length) {
        it.mesh.getWorldPosition(c); v.copy(cam).sub(c).normalize();
        it.marks.forEach((m: any) => {
          if (!close) { m.g.visible = false; return; }
          p.copy(m.n); it.mesh.localToWorld(p); p.sub(c).normalize();
          const o = Math.max(0, Math.min(1, (p.dot(v) - 0.25) / 0.25));
          m.g.visible = o > 0.01; m.lab.material.opacity = o; m.dot.material.opacity = o; m.line.material.opacity = o * 0.9;
        });
      }
      if (it.grabbed) { it.sg.scale.setScalar(it.holdScale); it.lab.visible = false; return; }
      if (it.inspect) { it.holder.position.lerp(new THREE.Vector3(0, -0.05, -0.55), e); const cs = it.sg.scale.x; it.sg.scale.setScalar(cs + (0.11 - cs) * e); it.lab.visible = false; return; }
      it.holder.position.lerp(it.slot, e);
      const tgt = it.size * (it.hover ? 1.12 : 1), cs = it.sg.scale.x; it.sg.scale.setScalar(cs + (tgt - cs) * e);
      const sz = it.sg.scale.x; it.lab.visible = !(this.real && it.b.sun);
      setSpriteH(it.lab, 0.045); it.lab.position.set(0, -Math.max(sz, 0.02) - 0.045, 0);
    });
  }
};
