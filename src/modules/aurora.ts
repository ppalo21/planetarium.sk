import * as THREE from 'three';
import { ctx, D2R, ASSET } from '../core/context';
import { T, en } from '../core/i18n';
import { setHud } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree, canvasTex } from '../core/util';
import { sunMaterial, SUN_U } from './sun';
import { earthMaterial, starSky } from './space';
import { speak, stopVoice } from '../core/narration';
import { SET } from '../core/settings';

/**
 * Polárna žiara: slnečný vietor → magnetosféra → cesta k pólom → žiara zo Zeme → farby → nad Slovenskom.
 * Všetko sa počíta naživo (častice, siločiary dipólu, závesy žiary v shaderi), nič sa nesťahuje.
 */
const RE = 0.32;                     // polomer Zeme v scéne
const EARTH = new THREE.Vector3(0.35, 0.02, -1.7);
const R0 = 2.6 * RE;                 // vzdialenosť magnetopauzy na dennej strane (zmenšená kvôli prehľadnosti)
const NP = 1800;

const CURTAIN_VS = `uniform float uTime; uniform float uA0; uniform float uA1; uniform float uR; uniform float uH0; uniform float uHH; uniform float uSeed;
varying vec2 vUv;
void main(){
  vUv = uv; float u = uv.x, v = uv.y;
  float ang = mix(uA0, uA1, u) + 0.06*sin(u*9.0 + uTime*0.18 + uSeed);
  float r = uR + 7.0*sin(u*6.0 + uTime*0.12 + uSeed) + 3.0*sin(u*17.0 - uTime*0.3 + uSeed*2.0);
  vec3 p = vec3(sin(ang)*r, uH0 + v*uHH, -cos(ang)*r);
  gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
}`;
const CURTAIN_FS = `uniform float uTime; uniform float uRed; uniform float uGain; uniform float uSeed; varying vec2 vUv;
void main(){
  float u=vUv.x, v=vUv.y;
  // zvislé lúče, ktoré sa presúvajú pozdĺž závesu
  float rays = 0.55 + 0.25*sin(u*230.0 + 3.0*sin(u*31.0 + uTime*0.9 + uSeed) + uTime*1.3) + 0.2*sin(u*97.0 - uTime*0.7);
  float fold = 0.55 + 0.45*sin(u*13.0 - uTime*0.35 + uSeed);
  float edge = smoothstep(0.0,0.07,u)*smoothstep(1.0,0.93,u);
  float prof = smoothstep(0.0,0.05,v)*exp(-v*2.4) + 0.25*smoothstep(0.35,0.7,v)*exp(-(v-0.7)*(v-0.7)*14.0)*uRed;
  vec3 green = vec3(0.22,1.0,0.48), red = vec3(1.0,0.18,0.28), purple = vec3(0.85,0.3,0.95);
  vec3 col = mix(green, red, smoothstep(0.42,0.85,v));
  col = mix(purple, col, smoothstep(0.0,0.07,v));
  col = mix(col, red, uRed*0.85);
  float a = prof*rays*fold*edge*(1.0-smoothstep(0.88,1.0,v))*uGain;
  gl_FragColor = vec4(col*a*1.7, a);
}`;

export const aurora: any = {
  stars: false,
  build() {
    const root = this.root = new THREE.Group(); ctx.anchor.add(root);
    this.sky = starSky(root);
    this.steps = ctx.content.aurora.steps; this.si = 0; this.t = 0;
    /* ---------- vesmírna scéna: Slnko, Zem, vietor, magnetosféra ---------- */
    const sp = this.space = new THREE.Group(); root.add(sp);
    const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 64, 32), sunMaterial()); sun.position.set(-7, 0.3, -3.2); sp.add(sun); this.sun = sun;
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, 'rgba(255,225,160,0.7)'); gr.addColorStop(1, 'rgba(255,150,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(3, 3, 1); sun.add(halo);
    this.emat = earthMaterial();
    const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 96, 48), this.emat); earth.position.copy(EARTH); earth.rotation.z = 0.15; sp.add(earth); this.earth = earth;
    const set = (n: string, k: string, f?: string) => loadTex(ASSET.planets + '2k_' + n).then(t => { if (t) { if (n.includes('clouds')) t.wrapS = THREE.RepeatWrapping; this.emat.uniforms[k].value = t; if (f) this.emat.uniforms[f].value = 1; } });
    set('earth_daymap.jpg', 'uDay'); set('earth_nightmap.jpg', 'uNight', 'uHasNight'); set('earth_clouds.jpg', 'uClouds', 'uHasClouds'); set('earth_specular_map.jpg', 'uSpec', 'uHasSpec');
    // slnečný vietor
    const pos = new Float32Array(NP * 3), col = new Float32Array(NP * 3);
    this.pv = []; for (let i = 0; i < NP; i++) { this.pv.push(this.spawn({}, true)); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dc = document.createElement('canvas'); dc.width = dc.height = 64; const dg = dc.getContext('2d')!;
    const dgr = dg.createRadialGradient(32, 32, 0, 32, 32, 32); dgr.addColorStop(0, 'rgba(255,255,255,1)'); dgr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); dgr.addColorStop(1, 'rgba(255,255,255,0)'); dg.fillStyle = dgr; dg.fillRect(0, 0, 64, 64);
    this.parts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.022, map: canvasTex(dc), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.parts.frustumCulled = false; sp.add(this.parts);
    // siločiary magnetického poľa (dipól, stlačený na dennej strane, natiahnutý do chvosta na nočnej)
    this.field = new THREE.Group(); this.field.position.copy(EARTH); sp.add(this.field);
    const fm = new THREE.LineBasicMaterial({ color: 0x6fd3ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let az = 0; az < 12; az++) for (const Lv of [1.7, 2.4, 3.4]) {
      const phi = az / 12 * Math.PI * 2, pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 120; k++) {
        const lat = -Math.acos(Math.sqrt(1 / Lv)) + 2 * Math.acos(Math.sqrt(1 / Lv)) * k / 120;
        const r = Lv * RE * Math.cos(lat) ** 2; let x = r * Math.cos(lat) * Math.cos(phi), z = r * Math.cos(lat) * Math.sin(phi); const y = r * Math.sin(lat);
        if (x < 0) x *= 0.72; else x *= 1 + 0.9 * (r / RE - 1) * (Lv / 3.4);   // Slnko je v smere −x
        pts.push(new THREE.Vector3(x, y, z));
      }
      fm.userData.n = (fm.userData.n || 0) + 1;
      this.field.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fm));
    }
    // prstence polárnej žiary okolo pólov
    this.ovals = new THREE.Group(); this.ovals.position.copy(EARTH); this.ovals.rotation.z = 0.15; sp.add(this.ovals);
    for (const s of [1, -1]) {
      const lat = 67 * D2R, rr = RE * 1.012 * Math.cos(lat), y = s * RE * 1.012 * Math.sin(lat);
      const gm = new THREE.Mesh(new THREE.TorusGeometry(rr, RE * 0.035, 12, 96), new THREE.MeshBasicMaterial({ color: 0x4dff8a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      gm.rotation.x = Math.PI / 2; gm.position.y = y; this.ovals.add(gm);
      const rm = new THREE.Mesh(new THREE.TorusGeometry(rr * 0.98, RE * 0.025, 12, 96), new THREE.MeshBasicMaterial({ color: 0xff4060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      rm.rotation.x = Math.PI / 2; rm.position.y = y + s * RE * 0.06; this.ovals.add(rm);
    }
    this.spaceLabels = new THREE.Group(); sp.add(this.spaceLabels);
    /* ---------- pozemská scéna: noc, kopce, závesy žiary ---------- */
    const gnd = this.ground = new THREE.Group(); root.add(gnd);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(400, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x05070d })); floor.position.y = -1.6; gnd.add(floor);
    // silueta kopcov
    const hp: number[] = [], seg = 240;
    for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2, h = 6 + 5 * Math.sin(a * 3 + 1) + 3 * Math.sin(a * 7) + 2 * Math.sin(a * 13 + 2); hp.push(Math.sin(a) * 300, h, -Math.cos(a) * 300); }
    const hg = new THREE.BufferGeometry(), hv: number[] = [];
    for (let k = 0; k < seg; k++) { const i = k * 3, j = (k + 1) * 3; hv.push(hp[i], -1.6, hp[i + 2], hp[j], -1.6, hp[j + 2], hp[j], hp[j + 1], hp[j + 2], hp[i], -1.6, hp[i + 2], hp[j], hp[j + 1], hp[j + 2], hp[i], hp[i + 1], hp[i + 2]); }
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hv, 3));
    gnd.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x03050a, side: THREE.DoubleSide })));
    this.curtains = [];
    const mk = (a0: number, a1: number, R: number, H0: number, HH: number, seed: number) => {
      const u = { uTime: { value: 0 }, uA0: { value: a0 * D2R }, uA1: { value: a1 * D2R }, uR: { value: R }, uH0: { value: H0 }, uHH: { value: HH }, uSeed: { value: seed }, uRed: { value: 0 }, uGain: { value: 1 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 320, 24), new THREE.ShaderMaterial({ uniforms: u, vertexShader: CURTAIN_VS, fragmentShader: CURTAIN_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      m.frustumCulled = false; gnd.add(m); this.curtains.push({ m, u, base: { R, H0, HH } }); return m;
    };
    mk(-70, 40, 90, 22, 55, 0.0); mk(-30, 75, 130, 30, 70, 2.3); mk(-85, -5, 60, 18, 45, 4.1); mk(10, 95, 70, 20, 50, 6.7);
    this.groundLabels = new THREE.Group(); gnd.add(this.groundLabels);
  },
  spawn(p: any, randomX = false) {
    p.x = randomX ? -6.5 + Math.random() * 8.5 : -6.5 - Math.random() * 0.5;
    const rr = Math.sqrt(Math.random()) * 1.6, a = Math.random() * Math.PI * 2;
    p.y = EARTH.y + Math.sin(a) * rr; p.z = EARTH.z + Math.cos(a) * rr; p.v = 1.4 + Math.random() * 0.8; p.cap = -1; p.k = Math.random();
    return p;
  },
  labels(group: THREE.Group, items: [string | any, number, number, number, string][], h: number) {
    while (group.children.length) disposeTree(group.children.pop()!);
    items.forEach(([txt, x, y, z, color]) => { const s = textSprite(T(txt), color, 56); setSpriteH(s, h); s.position.set(x, y, z); group.add(s); });
  },
  scene() { return this.steps[this.si].scene; },
  setStep(i: number) {
    const n = this.steps.length; this.si = ((i % n) + n) % n; this.t = 0;
    const sc = this.scene(), ground = ['sky', 'colors', 'slovakia'].includes(sc);
    this.space.visible = !ground; this.ground.visible = ground;
    this.field.visible = sc === 'field' || sc === 'poles'; this.ovals.visible = sc === 'poles';
    this.labels(this.spaceLabels, sc === 'wind' ? [[{ sk: 'Slnko', en: 'Sun' }, -7, -0.35, -3.2, '#ffd9a0'], [{ sk: 'slnečný vietor →', en: 'solar wind →' }, -3.3, 0.55, -2.3, '#ffe9b0'], [{ sk: 'Zem', en: 'Earth' }, EARTH.x, EARTH.y - RE - 0.08, EARTH.z, '#bcd6ff']]
      : sc === 'field' ? [[{ sk: 'magnetosféra', en: 'magnetosphere' }, EARTH.x, EARTH.y + 1.05, EARTH.z, '#8fe3ff'], [{ sk: 'chvost magnetosféry', en: 'magnetotail' }, EARTH.x + 2.1, EARTH.y + 0.25, EARTH.z, '#8fe3ff']]
      : sc === 'poles' ? [[{ sk: 'polárna žiara na severe', en: 'northern aurora' }, EARTH.x, EARTH.y + RE + 0.12, EARTH.z, '#7dffa8'], [{ sk: 'a na juhu', en: 'and southern aurora' }, EARTH.x, EARTH.y - RE - 0.12, EARTH.z, '#7dffa8']] : [], 0.06);
    const sk = sc === 'slovakia';
    this.curtains.forEach((c: any, k: number) => {
      c.m.visible = !sk || k === 0;
      c.u.uRed.value = sk ? 1 : 0; c.u.uGain.value = sk ? 0.85 : 1;
      c.u.uR.value = sk ? 220 : c.base.R; c.u.uH0.value = sk ? -2 : c.base.H0; c.u.uHH.value = sk ? 30 : c.base.HH;
      if (sk) { c.u.uA0.value = -55 * D2R; c.u.uA1.value = 55 * D2R; } else if (k === 0) { c.u.uA0.value = -70 * D2R; c.u.uA1.value = 40 * D2R; }
    });
    this.labels(this.groundLabels, sc === 'colors' ? [
      [{ sk: 'červená: kyslík, nad 250 km', en: 'red: oxygen, above 250 km' }, -38, 62, -75, '#ff8a9a'],
      [{ sk: 'zelená: kyslík, 100 – 250 km', en: 'green: oxygen, 100 – 250 km' }, -38, 38, -75, '#8affb0'],
      [{ sk: 'fialový okraj: dusík, okolo 100 km', en: 'purple edge: nitrogen, about 100 km' }, -38, 22, -75, '#e2a0ff']]
      : sk ? [[{ sk: 'SEVER', en: 'NORTH' }, 0, 3, -120, '#9fb2d8']] : sc === 'sky' ? [[{ sk: 'pozrite sa nahor ↑', en: 'look up ↑' }, 0, 6, -30, '#9fb2d8']] : [], sc === 'colors' ? 4.2 : 3.5);
    this.hud(); speak(this.steps[this.si].audio, T(this.steps[this.si].text));
  },
  enter() { this.root.visible = true; this.setStep(this.si); },
  exit() { this.root.visible = false; stopVoice(); },
  hud() {
    const st = this.steps[this.si], n = this.steps.length;
    setHud({ kicker: { sk: `Polárna žiara   ${this.si + 1} / ${n}`, en: `Aurora   ${this.si + 1} / ${n}` }, title: st.title, body: st.text, sticky: true,
      credit: { sk: 'Textúry Zeme: Solar System Scope (CC BY 4.0)', en: 'Earth textures: Solar System Scope (CC BY 4.0)' },
      actions: [{ label: SET.voice ? (en() ? 'Voice: on' : 'Hlas: zap') : (en() ? 'Voice: off' : 'Hlas: vyp'), active: SET.voice, onClick: () => { SET.voice = !SET.voice; if (!SET.voice) stopVoice(); else speak(st.audio, T(st.text)); this.hud(); } }],
      prev: () => this.setStep(this.si - 1), next: () => this.setStep(this.si + 1) });
  },
  onTap() { this.setStep(this.si + 1); },
  relabel() { if (this.built && ctx.current === 'aurora') this.setStep(this.si); },
  update(dt: number, t: number) {
    this.t += dt; SUN_U.uTime.value += dt; SUN_U.uHa.value = 0;
    this.curtains.forEach((c: any) => { c.u.uTime.value = t; });
    if (!this.space.visible) return;
    this.emat.uniforms.uSun.value.copy(this.sun.getWorldPosition(new THREE.Vector3())); this.emat.uniforms.uTime.value = t;
    this.earth.rotation.y += dt * 0.05;
    const sc = this.scene(), shield = sc !== 'wind', poles = sc === 'poles';
    const P = this.parts.geometry.attributes.position.array as Float32Array, C = this.parts.geometry.attributes.color.array as Float32Array;
    const ovalPulse = 0.6 + 0.4 * Math.sin(t * 3); this.ovals.children.forEach((m: any, k: number) => { m.material.opacity = (k % 2 ? 0.3 : 0.75) * ovalPulse; });
    this.pv.forEach((p: any, i: number) => {
      if (p.cap >= 0) {                                       // zachytená častica letí po siločiare k pólu
        p.cap += dt * 0.6; const s = Math.min(1, p.cap);
        const a = p.c0, b = p.c1, c = p.c2, u = 1 - s;
        p.x = u * u * a.x + 2 * u * s * b.x + s * s * c.x; p.y = u * u * a.y + 2 * u * s * b.y + s * s * c.y; p.z = u * u * a.z + 2 * u * s * b.z + s * s * c.z;
        if (s >= 1) this.spawn(p);
        C[i * 3] = 0.4; C[i * 3 + 1] = 1.0; C[i * 3 + 2] = 0.55;
      } else {
        p.x += p.v * dt;
        const dx = p.x - EARTH.x, dy = p.y - EARTH.y, dz = p.z - EARTH.z, rp = Math.hypot(dy, dz);
        if (shield) {
          const xb = -R0 + rp * rp / (2.4 * R0);              // tvar magnetopauzy (paraboloid)
          if (dx > xb && dx < 3.5) {
            if (poles && p.k < 0.06 && dx < -R0 * 0.6) {     // pár častíc prenikne a letí k pólom
              const north = dy >= 0 ? 1 : -1, lon = Math.random() * Math.PI * 2, lat = 67 * D2R, rr = RE * 1.03;
              p.c0 = new THREE.Vector3(p.x, p.y, p.z);
              p.c1 = new THREE.Vector3(EARTH.x - R0 * 0.3, EARTH.y + north * R0 * 1.1, EARTH.z + (Math.random() - 0.5) * 0.3);
              p.c2 = new THREE.Vector3(EARTH.x + Math.cos(lon) * rr * Math.cos(lat), EARTH.y + north * rr * Math.sin(lat), EARTH.z + Math.sin(lon) * rr * Math.cos(lat));
              p.cap = 0;
            } else {
              const need = Math.sqrt(Math.max(0, (dx + R0) * 2.4 * R0)) + 0.002, s = rp > 1e-4 ? need / rp : 1;
              if (rp > 1e-4) { p.y = EARTH.y + dy * s; p.z = EARTH.z + dz * s; } else { p.y += need; }
            }
          }
        } else if (dx * dx + dy * dy + dz * dz < RE * RE) { p.x = EARTH.x + RE * 1.01; }   // bez štítu prejde okolo
        if (p.x > EARTH.x + 4) this.spawn(p);
        C[i * 3] = 1.0; C[i * 3 + 1] = 0.9; C[i * 3 + 2] = 0.6;
      }
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
    });
    this.parts.geometry.attributes.position.needsUpdate = true; this.parts.geometry.attributes.color.needsUpdate = true;
    this.field.children.forEach((l: any) => { l.material.opacity = 0.35 + 0.2 * Math.sin(t * 1.5); });
  }
};
