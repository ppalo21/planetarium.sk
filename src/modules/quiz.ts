import * as THREE from 'three';
import { ctx, ASSET } from '../core/context';
import { T, en } from '../core/i18n';
import { SND } from '../core/sound';
import { setHud } from '../core/ui3d';
import { textSprite, setSpriteH, disposeTree, loadTex, canvasTex } from '../core/util';
import { quizFinished } from '../core/app';
import { sunMaterial, SUN_U } from './sun';
import { gltfLoader } from './machines';

/**
 * Kvíz: 7 náhodných otázok zo zásoby v content/quiz.json.
 * Po odpovedi sa pred dieťaťom objaví „odhalenie“ – planéta, model, pokus alebo hviezdy – s krátkou zaujímavosťou.
 * Správna odpoveď = ohňostroj, zbierané hviezdičky hore ukazujú skóre.
 */
const COUNT = 7;
const POS = new THREE.Vector3(0, 0.02, -1.25);

function burstTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return canvasTex(c);
}
function starShape(filled: boolean) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 26 : 60, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath();
  if (filled) { g.fillStyle = '#ffc857'; g.shadowColor = '#ffb46b'; g.shadowBlur = 16; g.fill(); } else { g.strokeStyle = 'rgba(159,192,255,.6)'; g.lineWidth = 6; g.stroke(); }
  return canvasTex(c);
}

export const quiz: any = {
  stars: true,
  build() {
    this.root = new THREE.Group(); ctx.anchor.add(this.root);
    const q = textSprite('?', '#ffb46b', 200, 700); setSpriteH(q, 0.45); q.position.set(0, 0.2, -2.2); this.root.add(q); this.qs = q;
    this.rev = new THREE.Group(); this.rev.position.copy(POS); this.root.add(this.rev);
    this.starRow = new THREE.Group(); this.starRow.position.set(0, 0.42, -1.6); this.root.add(this.starRow);
    this.texOn = starShape(true); this.texOff = starShape(false);
    // ohňostroj
    const n = 260, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fw = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.03, map: burstTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fw.frustumCulled = false; this.fw.visible = false; this.fw.position.copy(POS); this.root.add(this.fw); this.fwv = new Float32Array(n * 3);
  },
  enter() {
    this.root.visible = true; this.score = 0; this.answered = null; this.i = 0; this.results = [];
    const all = ctx.content.quiz.map((_: any, k: number) => k);
    for (let k = all.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [all[k], all[j]] = [all[j], all[k]]; }
    this.order = all.slice(0, Math.min(COUNT, all.length));
    this.clearReveal(); this.drawStars(); this.qs.visible = true; this.hud();
  },
  exit() { this.root.visible = false; this.clearReveal(); },
  cur() { return ctx.content.quiz[this.order[this.i]]; },
  drawStars() {
    while (this.starRow.children.length) { const o = this.starRow.children.pop(); o.material.dispose(); }
    const n = this.order.length;
    for (let k = 0; k < n; k++) {
      const done = this.results?.[k];
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: done ? this.texOn : this.texOff, transparent: true, depthWrite: false, opacity: done === false ? 0.35 : 1 }));
      s.scale.set(0.07, 0.07, 1); s.position.x = (k - (n - 1) / 2) * 0.085; this.starRow.add(s);
    }
  },
  answer(k: number) {
    if (this.answered != null) return;
    const q = this.cur(), ok = k === q.a; this.answered = k;
    this.results = this.results || []; this.results[this.i] = ok;
    if (ok) { this.score++; SND.good(); this.firework(); } else SND.bad();
    this.drawStars(); this.qs.visible = false; this.showReveal(q.reveal); this.hud();
  },
  next() {
    this.i++; this.answered = null; this.clearReveal(); this.qs.visible = true;
    if (this.i >= this.order.length) { quizFinished(this.score, this.order.length); if (this.score === this.order.length) this.firework(); }
    this.hud();
  },
  /* ---------- odhalenia po odpovedi ---------- */
  clearReveal() { while (this.rev.children.length) { const o = this.rev.children.pop(); disposeTree(o); } this.anim = null; },
  label(txt: string, x: number, y: number, h = 0.04, color = '#e9ecf7') { const s = textSprite(txt, color, 56); setSpriteH(s, h); s.position.set(x, y, 0); this.rev.add(s); return s; },
  async showReveal(r: any) {
    this.clearReveal(); if (!r) return;
    const R = this.rev, tok = (this.revTok = Math.random());
    if (r.type === 'planet') {
      const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff }); const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 64, 32), mat); R.add(p);
      loadTex(ASSET.planets + '2k_' + r.tex).then(t => { if (t) { mat.map = t; mat.needsUpdate = true; } });
      const items: any[] = [p];
      if (r.compare) {   // Zem v správnom pomere vedľa
        const em = new THREE.MeshStandardMaterial({ roughness: 1 }); const e = new THREE.Mesh(new THREE.SphereGeometry(0.2 * 12742 / 139820, 32, 16), em);
        e.position.set(-0.34, 0, 0.05); R.add(e); loadTex(ASSET.planets + '2k_earth_daymap.jpg').then(t => { if (t) { em.map = t; em.needsUpdate = true; } });
        this.label(en() ? 'Earth' : 'Zem', -0.34, -0.06, 0.035);
      }
      if (r.moons) for (let k = 0; k < r.moons; k++) {
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.012 - k * 0.003, 1), new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 1 })); R.add(m); items.push(m); m.userData.orb = { r: 0.28 + k * 0.08, s: 1.2 - k * 0.5 };
      }
      if (r.aurora) for (const s of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2 * Math.cos(1.17), 0.008, 8, 64), new THREE.MeshBasicMaterial({ color: 0x4dff8a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = Math.PI / 2; ring.position.y = s * 0.2 * Math.sin(1.17) * 1.02; p.add(ring);
      }
      this.anim = (dt: number, t: number) => { p.rotation.y += dt * 0.4; items.forEach((m: any) => { const o = m.userData.orb; if (o) m.position.set(Math.cos(t * o.s) * o.r, 0.02, Math.sin(t * o.s) * o.r); }); };
    } else if (r.type === 'light') {   // svetelný impulz zo Slnka k Zemi s odpočtom času
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 24), sunMaterial()); sun.position.x = -0.5; R.add(sun);
      const em = new THREE.MeshStandardMaterial({ roughness: 1 }); const e = new THREE.Mesh(new THREE.SphereGeometry(0.035, 32, 16), em); e.position.x = 0.5; R.add(e);
      loadTex(ASSET.planets + '2k_earth_daymap.jpg').then(t => { if (t) { em.map = t; em.needsUpdate = true; } });
      const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex(), color: 0xfff0b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pulse.scale.set(0.06, 0.06, 1); R.add(pulse);
      let lab = this.label('0 s', 0, 0.12, 0.05, '#ffd9a0'), last = '';
      this.anim = (dt: number, t: number) => {
        SUN_U.uTime.value += dt; const k = (t % 4) / 3.2, f = Math.min(1, k); pulse.position.x = -0.39 + 0.85 * f; pulse.visible = k <= 1;
        const s = Math.round(500 * f), txt = `${Math.floor(s / 60)} min ${s % 60} s`;
        if (txt !== last) { last = txt; R.remove(lab); disposeTree(lab); lab = this.label(txt, 0, 0.12, 0.05, '#ffd9a0'); }
      };
    } else if (r.type === 'gravity') {   // skok na Zemi a na Mesiaci
      const mk = (x: number, color: number, name: string) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 12), new THREE.MeshStandardMaterial({ color })); b.position.x = x; R.add(b);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0x334466 })); base.position.set(x, -0.2, 0); R.add(base);
        this.label(name, x, -0.25, 0.035); return b;
      };
      const be = mk(-0.22, 0x3b7bd6, en() ? 'Earth' : 'Zem'), bm = mk(0.22, 0xb8b8b8, en() ? 'Moon' : 'Mesiac');
      this.anim = (_dt: number, t: number) => { // rovnaký odraz: na Mesiaci 6× vyššie a 2,5× pomalšie
        const pe = (t % 1.0) / 1.0, pm = (t % 2.45) / 2.45;
        be.position.y = -0.17 + 0.06 * 4 * pe * (1 - pe); bm.position.y = -0.17 + 0.36 * 4 * pm * (1 - pm);
      };
    } else if (r.type === 'stars') {   // hviezdy Oriónu v rôznych vzdialenostiach
      const st: [string, number, string][] = [['Bellatrix', 250, '#d6e4ff'], ['Betelgeuse', 550, '#ffb46b'], ['Rigel', 860, '#cfe0ff'], ['Alnilam', 2000, '#cddcff']];
      st.forEach(([n, ly, c], k) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex(), color: new THREE.Color(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const z = -ly / 2000 * 1.2; s.position.set(-0.3 + k * 0.2, 0.02, z); s.scale.set(0.07, 0.07, 1); R.add(s);
        const l = textSprite([n, ly.toLocaleString(en() ? 'en-GB' : 'sk-SK') + ' ly'], ['#e9ecf7', '#ffb46b'], 52); setSpriteH(l, 0.07); l.position.set(-0.3 + k * 0.2, -0.07, z); R.add(l);
      });
    } else if (r.type === 'model') {
      let gl: any = await new Promise(res => gltfLoader().load(r.file, res, undefined, () => res(null)));
      if (!gl && r.alt) gl = await new Promise(res => gltfLoader().load(r.alt, res, undefined, () => res(null)));
      if (!gl || tok !== this.revTok) return;
      const o = gl.scene, b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const k = 0.42 / Math.max(s.x, s.y, s.z); o.scale.setScalar(k); o.position.set(-c.x * k, -c.y * k, -c.z * k);
      const h = new THREE.Group(); h.add(o); R.add(h);
      this.anim = (dt: number) => { h.rotation.y += dt * 0.5; };
    }
  },
  firework() {
    const P = this.fw.geometry.attributes.position.array as Float32Array, C = this.fw.geometry.attributes.color.array as Float32Array, V = this.fwv;
    const pal = [[1, 0.78, 0.34], [0.62, 0.75, 1], [0.45, 1, 0.6], [1, 0.45, 0.6], [1, 1, 1]];
    for (let k = 0; k < P.length / 3; k++) {
      P[k * 3] = 0; P[k * 3 + 1] = 0.1; P[k * 3 + 2] = 0;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, sp = 0.4 + Math.random() * 0.6, sq = Math.sqrt(1 - u * u);
      V[k * 3] = Math.cos(a) * sq * sp; V[k * 3 + 1] = u * sp + 0.4; V[k * 3 + 2] = Math.sin(a) * sq * sp * 0.6;
      const c = pal[k % pal.length]; C[k * 3] = c[0]; C[k * 3 + 1] = c[1]; C[k * 3 + 2] = c[2];
    }
    this.fw.geometry.attributes.color.needsUpdate = true; this.fw.visible = true; this.fwT = 0;
  },
  hud() {
    const Q = this.order.map((k: number) => ctx.content.quiz[k]), UI = ctx.content.ui;
    if (this.i >= Q.length) {
      const s = this.score, n = Q.length;
      setHud({ kicker: { sk: 'Kvíz', en: 'Quiz' }, title: { sk: `Výsledok: ${s} z ${n} hviezdičiek`, en: `Score: ${s} of ${n} stars` },
        body: s === n ? { sk: 'Perfektné! Ste skutočný astronóm. O diplom požiadajte obsluhu.', en: 'Perfect! You are a real astronomer. Ask the staff for your certificate.' }
          : { sk: 'Výborne! O diplom požiadajte obsluhu. Chcete to skúsiť znova? Otázky budú iné.', en: 'Well done! Ask the staff for your certificate. Try again? The questions will be different.' },
        rows: [[{ label: T(UI.again), onClick: () => this.enter(), primary: true }]] });
      return;
    }
    const q = this.cur(), a = this.answered;
    const opt = (k: number) => ({ label: T(q.o[k]), onClick: () => this.answer(k), tone: a == null ? null : (k === q.a ? 'good' : (k === a ? 'bad' : null)) as any });
    const rows: any[] = [[opt(0), opt(1)], [opt(2), opt(3)]];
    if (a != null) rows.push([{ label: T(UI.next) + ' ›', onClick: () => this.next(), primary: true }, { label: T(UI.home), onClick: ctx.goHome }]);
    setHud({ kicker: { sk: `Kvíz   otázka ${this.i + 1} z ${Q.length}`, en: `Quiz   question ${this.i + 1} of ${Q.length}` }, title: q.q,
      body: a == null ? { sk: 'Ukážte na odpoveď a štipnite.', en: 'Point at an answer and pinch.' }
        : { sk: (a === q.a ? 'Správne! ' : 'Tentoraz nie. ') + T(q.e), en: (a === q.a ? 'Correct! ' : 'Not this time. ') + T(q.e) },
      rows, home: a == null });
  },
  relabel() { if (ctx.current === 'quiz') this.hud(); },
  update(dt: number, t: number) {
    this.qs.position.y = 0.2 + Math.sin(t * 1.2) * 0.03;
    this.anim?.(dt, t);
    if (this.fw.visible) {
      this.fwT += dt; const P = this.fw.geometry.attributes.position.array as Float32Array, V = this.fwv;
      for (let k = 0; k < P.length; k += 3) { V[k + 1] -= 0.9 * dt; P[k] += V[k] * dt; P[k + 1] += V[k + 1] * dt; P[k + 2] += V[k + 2] * dt; }
      this.fw.geometry.attributes.position.needsUpdate = true; (this.fw.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - this.fwT / 1.8);
      if (this.fwT > 1.8) this.fw.visible = false;
    }
  }
};
