import * as THREE from 'three';
import { ctx, D2R, ASSET } from '../core/context';
import { T, en, fmt } from '../core/i18n';
import { setHud, setCaption } from '../core/ui3d';
import { loadTex, freeTex, textSprite, canvasTex } from '../core/util';
import { sunMaterial, SUN_U } from './sun';
import { planetMaterial, earthMaterial, starSky } from './space';
import { speak, stopVoice } from '../core/narration';
import { SET } from '../core/settings';

/**
 * Let Slnečnou sústavou v skutočnej mierke vzdialeností.
 * Základná mierka: Slnko má priemer 1 m → 1 AU = 107 m, Neptún 3,2 km.
 * Pri zastávkach sa celý vesmír rovnomerne „priblíži“ (všetko ostáva v správnom pomere),
 * návštevník stojí na mieste a pohybuje sa vesmír okolo neho (pohodlnejšie pre žalúdok).
 * Polohy planét na dráhach zodpovedajú približne dnešnému dátumu.
 */
const KM_PER_U = 1392680;                 // km na 1 jednotku (= priemer Slnka)
const AU_U = 149597870.7 / KM_PER_U;      // ≈ 107,4
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const tex = (lvl: string, name: string) => ASSET.planets + `${lvl}_${name}`;

function glowTex(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, inner); gr.addColorStop(0.25, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return canvasTex(c);
}

export const solar: any = {
  stars: false,
  build() {
    const root = this.root = new THREE.Group(); ctx.anchor.add(root);
    this.sky = starSky(root);
    const U = this.U = new THREE.Group(); root.add(U);
    const data = ctx.content.solar; this.steps = data.steps; this.b = {};
    const days = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const dot = glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    for (const [id, d] of Object.entries<any>(data.bodies)) {
      const b: any = { id, d, holder: new THREE.Group(), pos: new THREE.Vector3() };
      if (id !== 'sun') {
        const ang = (d.L0 + 360 * days / d.P) * D2R;
        b.pos.set(Math.cos(ang) * d.a * AU_U, 0, -Math.sin(ang) * d.a * AU_U);
        // dráha
        const pts: THREE.Vector3[] = []; for (let k = 0; k <= 360; k++) { const a = k * D2R; pts.push(new THREE.Vector3(Math.cos(a) * d.a * AU_U, 0, -Math.sin(a) * d.a * AU_U)); }
        const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x4a62a8, transparent: true, opacity: 0.35, depthWrite: false }));
        orbit.frustumCulled = false; U.add(orbit);
      }
      b.r = id === 'sun' ? 0.5 : d.r / KM_PER_U;
      b.holder.position.copy(b.pos); U.add(b.holder);
      const tilt = new THREE.Group(); tilt.rotation.z = (d.tilt || 0) * D2R; b.holder.add(tilt); b.tilt = tilt;
      if (id === 'sun') {
        b.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 96, 48), sunMaterial());
        const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,225,160,0.55)', 'rgba(255,150,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        halo.scale.set(2.6, 2.6, 1); b.holder.add(halo);
      } else if (id === 'earth') {
        b.mat = earthMaterial(); b.mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 128, 64), b.mat);
        // Mesiac
        const mAng = (218.316 + 13.176396 * days) * D2R, md = 384400 / KM_PER_U;
        b.moonMat = planetMaterial('#b8b8b8');
        const moon = new THREE.Mesh(new THREE.SphereGeometry(1737.4 / KM_PER_U, 64, 32), b.moonMat);
        moon.position.set(Math.cos(mAng) * md, 0, -Math.sin(mAng) * md); b.holder.add(moon); b.moon = moon;
        loadTex(tex('2k', 'moon.jpg')).then(t => { if (t) { b.moonMat.uniforms.uMap.value = t; b.moonMat.uniforms.uHasMap.value = 1; } });
      } else {
        b.mat = planetMaterial(d.color, d.atmo || '#000000', d.atmoStr || 0);
        b.mesh = new THREE.Mesh(new THREE.SphereGeometry(b.r, 96, 48), b.mat);
        loadTex(tex('2k', d.tex)).then(t => { if (t) { b.mat.uniforms.uMap.value = t; b.mat.uniforms.uHasMap.value = 1; } });
        if (d.ring) {
          const inner = b.r * 1.24, outer = b.r * 2.27, rg = new THREE.RingGeometry(inner, outer, 192, 1), pos = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
          for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k); uv.setXY(k, (v.length() - inner) / (outer - inner), 0.5); }
          const rm = new THREE.MeshBasicMaterial({ color: 0xd9c79a, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
          loadTex(tex('2k', 'saturn_ring_alpha.png')).then(t => { if (t) { rm.map = t; rm.color.set('#e8e0cc'); rm.opacity = 1; rm.needsUpdate = true; } });
          const ring = new THREE.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
        }
      }
      tilt.add(b.mesh);
      // značka a meno, keď je teleso priďaleko na to, aby bolo vidno
      b.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: id === 'sun' ? 0xffe2a0 : 0xbfd2ff, transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }));
      b.marker.scale.set(id === 'sun' ? 0.035 : 0.012, id === 'sun' ? 0.035 : 0.012, 1); b.holder.add(b.marker);
      b.label = textSprite(T(d.name), '#dfe8ff', 56); b.label.material.sizeAttenuation = false; b.label.material.depthTest = false; b.label.renderOrder = 12;
      b.label.scale.set(0.028 * b.label.userData.aspect, 0.028, 1); b.label.center.set(0.5, -0.6); b.holder.add(b.label);
      this.b[id] = b;
    }
    this.earthTex('2k');
    this.si = 0; this.flight = null; this.hi = null;
    this.view = this.computeView(0); this.applyView(this.view);
  },
  earthTex(lvl: string) {
    const u = this.b.earth.mat.uniforms;
    const set = (name: string, key: string, flag?: string) => loadTex(tex(lvl, name)).then(t => {
      if (!t) return; if (name.includes('clouds')) t.wrapS = THREE.RepeatWrapping; u[key].value = t; if (flag) u[flag].value = 1; });
    set('earth_daymap.jpg', 'uDay'); set('earth_nightmap.jpg', 'uNight', 'uHasNight'); set('earth_clouds.jpg', 'uClouds', 'uHasClouds'); set('earth_specular_map.jpg', 'uSpec', 'uHasSpec');
  },
  /** Pri príchode k planéte sa načíta 4k textúra, predchádzajúca sa uvoľní (šetrí pamäť okuliarov). */
  async hiRes(id: string) {
    if (this.hi === id) return;
    const prev = this.hi; this.hi = id;
    if (prev && prev !== 'sun') {
      const p = this.b[prev];
      if (prev === 'earth') { ['earth_daymap.jpg', 'earth_nightmap.jpg', 'earth_clouds.jpg'].forEach(n => freeTex(tex('4k', n))); this.earthTex('2k'); }
      else { freeTex(tex('4k', p.d.tex)); const t = await loadTex(tex('2k', p.d.tex)); if (t) p.mat.uniforms.uMap.value = t; }
    }
    if (id === 'sun') return;
    if (id === 'earth') { this.earthTex('4k'); return; }
    const b = this.b[id], t = await loadTex(tex('4k', b.d.tex));
    if (t && this.hi === id) b.mat.uniforms.uMap.value = t;
  },
  computeView(i: number) {
    const st = this.steps[i], b = this.b[st.target];
    let Z: number, d: number, sunDir: THREE.Vector3;
    if (st.view === 'real') { Z = 1; d = 0.45; sunDir = new THREE.Vector3(Math.sin(-20 * D2R), 0, -Math.cos(20 * D2R)); }
    else if (st.view === 'back') { Z = 1; d = 0.35; sunDir = new THREE.Vector3(0.12, 0, -1).normalize(); }
    else if (b.id === 'sun') { Z = 0.75 / 0.5; d = 2.4; sunDir = new THREE.Vector3(0, 0, 1); }
    else { Z = 0.24 / b.r; d = 0.95; sunDir = new THREE.Vector3(-Math.sin(55 * D2R), 0, Math.cos(55 * D2R)); }   // Slnko vľavo za vami: planéta je pekne osvetlená
    const toSun = b.pos.clone().negate(); const yaw = b.id === 'sun' ? 0 : Math.atan2(sunDir.x, sunDir.z) - Math.atan2(toSun.x, toSun.z);
    return { Z, d, yaw, P: b.pos.clone() };
  },
  applyView(v: any) {
    const U = this.U; U.scale.setScalar(v.Z); U.rotation.set(0, v.yaw, 0);
    const p = v.P.clone().multiplyScalar(v.Z).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.yaw);
    U.position.set(-p.x, -p.y - 0.05, -v.d - p.z);
  },
  go(i: number) {
    const n = this.steps.length; i = ((i % n) + n) % n; if (i === this.si && this.flight) return;
    const from = this.view, to = this.computeView(i);
    const dist = from.P.distanceTo(to.P);
    const dur = dist < 1e-6 ? 2.5 : THREE.MathUtils.clamp(3.5 + 2.2 * Math.log10(1 + dist), 4, 11);
    // uprostred letu sa vesmír „oddiali“, aby bolo vidieť, akú veľkú vzdialenosť prelietame
    const zMid = dist > 0 ? 18 / dist : Math.min(from.Z, to.Z);
    const bump = Math.max(0, Math.min(Math.log(from.Z), Math.log(to.Z)) - Math.log(zMid));
    this.flight = { from, to, t: 0, dur, bump };
    this.si = i; this.hud(); this.say();
  },
  say() { const st = this.steps[this.si]; speak(st.audio, T(st.text)); },
  enter() { this.root.visible = true; ctx.scene.background = null; this.hud(); this.say(); this.hiRes(this.steps[this.si].target); },
  exit() { this.root.visible = false; stopVoice(); },
  hud() {
    const st = this.steps[this.si], b = this.b[st.target], n = this.steps.length;
    const au = b.d.a || 0, km = au * 149.6;
    const kick = au ? (en() ? `${this.si + 1} / ${n}   ${fmt(Math.round(km * 10) / 10)} million km from the Sun` : `${this.si + 1} / ${n}   ${fmt(Math.round(km * 10) / 10)} mil. km od Slnka`) : `${this.si + 1} / ${n}`;
    setHud({ kicker: kick, title: st.title, body: st.text, credit: { sk: 'Textúry: Solar System Scope (CC BY 4.0)', en: 'Textures: Solar System Scope (CC BY 4.0)' }, sticky: true,
      actions: [{ label: SET.voice ? (en() ? 'Voice: on' : 'Hlas: zap') : (en() ? 'Voice: off' : 'Hlas: vyp'), active: SET.voice, onClick: () => { SET.voice = !SET.voice; if (!SET.voice) stopVoice(); else this.say(); this.hud(); } }],
      prev: () => this.go(this.si - 1), next: () => this.go(this.si + 1) });
  },
  onTap() { this.go(this.si + 1); },
  relabel() {
    if (!this.built) return;
    for (const b of Object.values<any>(this.b)) { b.holder.remove(b.label); b.label.material.map.dispose(); const l = textSprite(T(b.d.name), '#dfe8ff', 56); l.material.sizeAttenuation = false; l.material.depthTest = false; l.renderOrder = 12; l.scale.set(0.028 * l.userData.aspect, 0.028, 1); l.center.set(0.5, -0.6); b.holder.add(l); b.label = l; }
    if (ctx.current === 'solar') this.hud();
  },
  update(dt: number, t: number) {
    SUN_U.uTime.value += dt; SUN_U.uHa.value = 0;
    const f = this.flight;
    if (f) {
      f.t += dt; const k = Math.min(1, f.t / f.dur), e = ease(k);
      const lz = THREE.MathUtils.lerp(Math.log(f.from.Z), Math.log(f.to.Z), e) - f.bump * Math.sin(Math.PI * e);
      this.view = { Z: Math.exp(lz), d: THREE.MathUtils.lerp(f.from.d, f.to.d, e), yaw: lerpAngle(f.from.yaw, f.to.yaw, e), P: f.from.P.clone().lerp(f.to.P, e) };
      if (k >= 1) { this.view = f.to; this.flight = null; this.hiRes(this.steps[this.si].target); }
    }
    this.applyView(this.view);
    this.U.updateMatrixWorld(true);
    const sunW = this.U.localToWorld(new THREE.Vector3()), cam = ctx.camera.getWorldPosition(new THREE.Vector3());
    const camW = ctx.renderer.xr.isPresenting ? ctx.renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : cam;
    for (const b of Object.values<any>(this.b)) {
      if (b.mat?.uniforms?.uSun) b.mat.uniforms.uSun.value.copy(sunW);
      if (b.moonMat) b.moonMat.uniforms.uSun.value.copy(sunW);
      if (b.mat?.uniforms?.uTime) b.mat.uniforms.uTime.value = t;
      if (b.id !== 'sun') b.mesh.rotation.y += dt * 0.08;
      // zdanlivá veľkosť: značka a meno len pri malých/vzdialených telesách
      const w = b.holder.getWorldPosition(new THREE.Vector3()), dist = w.distanceTo(camW), ang = (b.r * this.view.Z) / Math.max(dist, 1e-4);
      const show = ang < 0.012; b.marker.visible = show && dist < 1.5e6; b.label.visible = (show || ang < 0.05) && dist < 1.5e6 && dist > 0.15;
      // značky majú stálu veľkosť na obrazovke – vyrovnáme zväčšenie celého vesmíru
      const k = 1 / this.view.Z, ms = b.id === 'sun' ? 0.035 : 0.012;
      b.marker.scale.set(ms * k, ms * k, 1); b.label.scale.set(0.028 * b.label.userData.aspect * k, 0.028 * k, 1);
    }
    this.sky.position.set(0, 0, 0);
  }
};
