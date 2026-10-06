import * as THREE from 'three';
import { ctx, ASSET } from '../core/context';
import { T, en, dec } from '../core/i18n';
import { setHud, keepHud } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree } from '../core/util';
import { arReady, startPlacing, isPlacing } from '../core/ar';

/** Gravitácia: loptičky padajú naraz na Mesiaci, Marse, Zemi a Jupiteri. */
export const gravity: any = {
  floor: true, stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.floor.add(r); this.cols = [];
    const { worlds, dropHeight: H } = ctx.content.gravity; this.H = H; const n = worlds.length, sp = 0.55;
    worlds.forEach((w: any, i: number) => {
      const g = new THREE.Group(); g.position.set((i - (n - 1) / 2) * sp, 0, -1.4); r.add(g);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 40), new THREE.MeshStandardMaterial({ color: new THREE.Color(w.c), roughness: 0.9 })); base.position.y = 0.015; g.add(base);
      loadTex(ASSET.planets + '2k_' + w.id + (w.id === 'earth' ? '_daymap' : '') + '.jpg').then(t => { if (t) { base.material.map = t; base.material.color.set('#ffffff'); base.material.needsUpdate = true; } });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, H + 0.1, 8), new THREE.MeshBasicMaterial({ color: 0x445588 })); pole.position.set(-0.2, (H + 0.1) / 2, 0); g.add(pole);
      for (let k = 0; k <= 3; k++) { const tk = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.003, 0.003), new THREE.MeshBasicMaterial({ color: 0x8a93b8 })); tk.position.set(-0.2, k * 0.5, 0); g.add(tk); }
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055, 32, 16), new THREE.MeshStandardMaterial({ color: new THREE.Color(w.c).lerp(new THREE.Color('#ffffff'), 0.25), roughness: 0.5 })); g.add(ball);
      const col = { w, g, ball, y: H, v: 0, state: 'ready', time: null as number | null, lab: null as THREE.Sprite | null }; this.cols.push(col); this.label(col);
    });
  },
  label(col: any) {
    if (col.lab) { col.g.remove(col.lab); disposeTree(col.lab); }
    const l2 = col.time != null ? (en() ? 'landed in ' : 'dopad za ') + dec(col.time) + ' s' : 'g = ' + dec(col.w.g) + ' m/s²';
    const lines = [T(col.w.name), l2], colors = ['#e9ecf7', col.time != null ? '#ffb46b' : '#c9cfe6'];
    if (this.mass) {   // váha: koľko by ukázala osobná váha na tomto svete
      const kg = Math.round(this.mass * col.w.g / 9.81);
      lines.push((en() ? 'scale shows ' : 'váha ukáže ') + kg + ' kg'); colors.push('#9fe0a8');
    }
    col.lab = textSprite(lines, colors, 60); setSpriteH(col.lab, 0.055 * lines.length); col.lab.position.set(0, this.H + 0.22, 0); col.g.add(col.lab);
  },
  setMass(m: number) { this.mass = this.mass === m ? 0 : m; this.cols.forEach((c: any) => this.label(c)); keepHud(); this.hud(); },
  reset() { this.cols.forEach((c: any) => { c.y = this.H; c.v = 0; c.state = 'ready'; c.time = null; c.ball.position.set(0, c.y, 0); this.label(c); }); this.running = false; this.hud(); },
  drop() { keepHud(); if (this.running) { this.reset(); return; } this.running = true; this.cols.forEach((c: any) => { c.state = 'fall'; }); this.hud(); },
  hud() {
    setHud({ kicker: { sk: 'Gravitácia', en: 'Gravity' }, title: { sk: 'Na ktorom svete dopadne loptička prvá?', en: 'On which world does the ball land first?' },
      body: isPlacing() ? { sk: 'Pozrite sa na podlahu, objaví sa oranžový terčík. Štipnite a pokus sa postaví tam.', en: 'Look at the floor until an orange target appears, then pinch to set up the experiment there.' } : { sk: `Všetky loptičky padajú z výšky ${dec(this.H, 1)} m. Na Mesiaci je gravitácia asi 6-krát slabšia ako na Zemi, na Jupiteri 2,5-krát silnejšia. Vyberte svoju hmotnosť a uvidíte, čo by ukázala osobná váha.`, en: `All balls fall from ${this.H} m. Gravity on the Moon is about 6 times weaker than on Earth, on Jupiter 2.5 times stronger. Pick your weight to see what a bathroom scale would show.` },
      rows: [[20, 30, 40, 60, 80].map(m => ({ label: m + ' kg', active: this.mass === m, onClick: () => this.setMass(m) })),
        [...(arReady() ? [{ label: en() ? 'Place' : 'Umiestniť', active: isPlacing(), onClick: () => this.place() }] : []), { label: this.running ? T(ctx.content.ui.again) : (en() ? 'Drop the balls' : 'Pustiť loptičky'), onClick: () => this.drop(), primary: true }]] });
  },
  onTap() { if (!isPlacing()) this.drop(); },
  enter() { this.root.visible = true; this.root.position.set(0, 0, 0); this.reset(); if (arReady()) this.place(); },
  exit() { this.root.visible = false; this.root.position.set(0, 0, 0); },
  place() { startPlacing(p => { const l = ctx.floor.worldToLocal(p.clone()); this.root.position.set(l.x, l.y, l.z + 1.4); keepHud(); this.hud(); }); this.hud(); },
  relabel() { if (this.built) { this.cols.forEach((c: any) => this.label(c)); if (ctx.current === 'gravity') this.hud(); } },
  update(dt: number) {
    if (!this.running) return; const R = 0.055;
    this.cols.forEach((c: any) => {
      if (c.state === 'rest') return;
      c.v -= c.w.g * dt; c.y += c.v * dt;
      if (c.y <= R) { c.y = R; if (c.time == null) { c.time = Math.sqrt(2 * (this.H - R) / c.w.g); this.label(c); } if (Math.abs(c.v) < 0.3) { c.v = 0; c.state = 'rest'; } else c.v = -c.v * 0.5; }
      c.ball.position.y = c.y;
    });
  }
};
