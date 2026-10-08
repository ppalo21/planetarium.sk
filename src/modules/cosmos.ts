import * as THREE from 'three';
import { ctx, D2R, ASSET, url } from '../core/context';
import { T, en, fmt } from '../core/i18n';
import { setHud, setCaption, keepHud, makeClickable } from '../core/ui3d';
import { loadTex, freeTex, textSprite, canvasTex, camWorld } from '../core/util';
import { sunMaterial, SUN_U } from './sun';
import { planetMaterial, earthMaterial } from './space';

/**
 * „Od Zeme po galaxie“ – plynulý logaritmický zoom od Zeme až po vesmír plný galaxií.
 *
 * Všetky polohy sa počítajú v metroch (double v JS) a do scény sa prevádzajú až pri kreslení:
 *   poloha v scéne = (P − F) / S,   F = bod, na ktorý sa pozeráme, S = metrov na 1 meter scény, z = log10(S).
 * Vďaka tomu je presné aj priblíženie na Zem aj pohľad na celú Galaxiu (rozdiel 17 rádov).
 * Hviezdy: katalóg HYG (skutočné 3D polohy ~10 000 hviezd). Galaxie: procedurálne, podľa skutočných rozmerov a polôh;
 * vzdialené galaxie tvoria ilustračnú kozmickú sieť so štyrmi skutočnými kopami (Panna, Pec, Perzeus, Vlasy Bereniky).
 */
const AU = 1.495978707e11, PC = 3.0856775814913673e16, LY = 9.4607304725808e15, KM = 1e3;
const D = 1.6;                       // vzdialenosť stredu pohľadu pred návštevníkom (m)
const TILT = 0.36;                   // pohľad mierne zhora
const Z_MIN = 6.9, Z_MAX = 24.6;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/* ---------- súradnice: rovník → ekliptika → scéna (y = sever ekliptiky) ---------- */
const EPS = 23.4392911 * D2R;
function eqDir(raDeg: number, decDeg: number) {
  const a = raDeg * D2R, d = decDeg * D2R, x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  const ye = y * Math.cos(EPS) + z * Math.sin(EPS), ze = -y * Math.sin(EPS) + z * Math.cos(EPS);
  return new THREE.Vector3(x, ze, -ye);
}
// galaktická sústava: X → stred Galaxie, Z → severný galaktický pól, Y = Z × X
const GX = eqDir(266.405, -28.936);
const GZ = (() => { const z = eqDir(192.859, 27.128); return z.sub(GX.clone().multiplyScalar(GX.dot(z))).normalize(); })();
const GY = new THREE.Vector3().crossVectors(GZ, GX).normalize();
const GC_PC = GX.clone().multiplyScalar(8178);                     // stred Galaxie (pc, od Slnka)
// natočenie, pri ktorom leží galaktická rovina vodorovne a stred Galaxie je pred nami
const Q_GAL = (() => {
  const B = new THREE.Matrix4().makeBasis(GX, GY, GZ), A = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(A.multiply(B.transpose()));
})();
const M31_PC = eqDir(10.6847, 41.269).multiplyScalar(765e3);           // galaxia v Andromede (pc, od Slnka)
// natočenie pre Miestnu skupinu: Mliečna cesta vľavo, Andromeda vpravo v rovnakej výške, disk našej Galaxie takmer vodorovne
const Q_LG = (() => {
  const X = M31_PC.clone().sub(GC_PC).normalize(), Y = GZ.clone().addScaledVector(X, -GZ.dot(X)).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z).transpose());
})();
const Q_ID = new THREE.Quaternion();
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();   // pomocné vektory (bez vytvárania nových v každej snímke)

/* ---------- textúry ---------- */
function softDot() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return canvasTex(c);
}
function glowTex(inner: string, outer: string) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, inner); gr.addColorStop(0.22, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return canvasTex(c);
}
/** B−V index → farba hviezdy */
function bvColor(bv: number): [number, number, number] {
  bv = Math.max(-0.4, Math.min(2.0, bv));
  const t = (bv + 0.4) / 2.4;
  const r = t < 0.25 ? 0.62 + t * 1.5 : 1.0, g = t < 0.35 ? 0.72 + t * 0.8 : 1.0 - (t - 0.35) * 0.55, b = t < 0.3 ? 1.0 : Math.max(0.35, 1.0 - (t - 0.3) * 1.1);
  return [r, g, b];
}

/* ---------- shadery bodových oblakov ---------- */
const STAR_VS = `attribute float absmag; attribute vec3 col;
uniform vec3 uF; uniform float uInvS; uniform vec3 uCam; uniform float uFade; uniform float uPx;
varying vec3 vCol; varying float vA;
void main(){
  vec3 l = (position - uF) * uInvS; vec3 d = l - uCam; float L = length(d);
  float dpc = max(L / uInvS, 1e-6);
  float m = absmag + 5.0 * log(dpc / 10.0) / log(10.0);           // zdanlivá jasnosť z miesta diváka
  if (L > 1500.0) l = uCam + d / L * 1500.0;                       // vzdialené hviezdy na oblohe
  vCol = col; vA = clamp((7.2 - m) / 2.6, 0.0, 1.0) * uFade;
  vec4 mv = modelViewMatrix * vec4(l, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = vA > 0.003 ? clamp(2.0 + (5.5 - m) * 0.95, 1.2, 11.0) * uPx : 0.0;
}`;
const GAL_VS = `attribute vec3 col; attribute float size; attribute float grp; attribute float mag; attribute vec2 shape;
uniform vec3 uF; uniform float uInvS; uniform vec3 uFade; uniform float uProj; uniform vec2 uFloor; uniform vec3 uMinPx;
varying vec3 vCol; varying float vA; varying vec3 vShape;
void main(){
  float f = grp < 0.5 ? uFade.x : (grp < 1.5 ? uFade.y : uFade.z);
  vec3 l = (position - uF) * uInvS;
  vec4 mv = modelViewMatrix * vec4(l, 1.0);
  float depth = max(-mv.z, 1e-4);
  float px = size * uInvS * uProj / depth;                             // skutočná veľkosť na obrazovke
  float fl = grp < 0.5 ? uFloor.x : (grp < 1.5 ? uFloor.y : mix(0.3, 1.0, mag));
  float a = f * max(clamp(px * px / 2.0, 0.0, 1.0), fl);              // menšie ako 1 px: slabšie, ale nezmiznú
  a *= smoothstep(0.05, 0.6, depth);                                  // nič „do tváre“
  float mn = grp < 0.5 ? uMinPx.x : (grp < 1.5 ? uMinPx.y : mix(1.8, 7.5, mag) * uMinPx.z);   // vzdialené galaxie: jasnejšie sú väčšie
  vCol = col; vA = a; vShape = vec3(cos(shape.x), sin(shape.x), shape.y);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = a > 0.002 ? clamp(px, mn, grp < 0.5 ? 14.0 : 30.0) : 0.0;
}`;
const DOT_FS = `uniform sampler2D uMap; varying vec3 vCol; varying float vA;
void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * a, a); }`;
// galaxia ako mäkká škvrna: okrúhla alebo sploštená a natočená (disk videný šikmo)
const GAL_FS = `varying vec3 vCol; varying float vA; varying vec3 vShape;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  p = vec2(vShape.x * p.x + vShape.y * p.y, (vShape.x * p.y - vShape.y * p.x) / vShape.z);
  float r2 = dot(p, p) * 4.0; if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.5) * vA; if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, a);
}`;

/* ---------- procedurálne galaxie ---------- */
type Buf = { p: number[]; c: number[]; s: number[]; g: number[]; m: number[]; sh: number[] };
const rnd = (() => { let s = 1234567; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function push(b: Buf, P: THREE.Vector3, c: number[], size: number, grp: number, mag = 0, rot = 0, ratio = 1) { b.p.push(P.x, P.y, P.z); b.c.push(c[0], c[1], c[2]); b.s.push(size); b.g.push(grp); b.m.push(mag); b.sh.push(rot, ratio); }

/** Mliečna cesta: priečka, výduť, 4 špirálové ramená (Slnko medzi ramenom Strelca a Persea), oblasti H II. */
function milkyWay(b: Buf) {
  const k = Math.tan(12 * D2R), U = GX.clone().negate(), V = GY, W = GZ;
  const at = (u: number, v: number, w: number) => GC_PC.clone().addScaledVector(U, u).addScaledVector(V, v).addScaledVector(W, w);
  const armTheta = (r: number, i: number) => Math.log(r / 6600) / k - i * Math.PI / 2;
  for (let n = 0; n < 70000; n++) {            // ramená
    const i = rnd() < 0.62 ? (rnd() < 0.5 ? 1 : 3) : (rnd() < 0.5 ? 0 : 2);
    const r = 2800 + -Math.log(1 - rnd() * 0.97) * 4300; if (r > 17000) continue;
    const th = armTheta(r, i) + gauss() * (0.06 + 160 / r), rr = r + gauss() * (220 + r * 0.03);
    const hot = rnd();
    const c = hot < 0.55 ? [0.62, 0.74, 1.0] : hot < 0.9 ? [0.92, 0.94, 1.0] : [1.0, 0.86, 0.7];
    push(b, at(rr * Math.cos(th), rr * Math.sin(th), gauss() * 110), c.map(x => x * 0.55), 120, 0);
  }
  for (let n = 0; n < 1800; n++) {             // oblasti H II (ružové hmloviny v ramenách)
    const i = Math.floor(rnd() * 4), r = 3500 + rnd() * 11000, th = armTheta(r, i) + gauss() * 0.04;
    push(b, at(r * Math.cos(th), r * Math.sin(th), gauss() * 60), [1.0, 0.42, 0.62], 240, 0);
  }
  for (let n = 0; n < 28000; n++) {            // disk medzi ramenami
    const r = -Math.log(1 - rnd() * 0.985) * 3600, th = rnd() * Math.PI * 2;
    push(b, at(r * Math.cos(th), r * Math.sin(th), gauss() * 170), [0.42, 0.4, 0.36], 150, 0);
  }
  const ba = 27 * D2R;                          // priečka a výduť
  for (let n = 0; n < 26000; n++) {
    const bar = rnd() < 0.55;
    let x = gauss() * (bar ? 1900 : 900), y = gauss() * (bar ? 650 : 900); const z = gauss() * (bar ? 380 : 650);
    const xr = x * Math.cos(ba) - y * Math.sin(ba), yr = x * Math.sin(ba) + y * Math.cos(ba); x = xr; y = yr;
    push(b, at(x, y, z), [0.5, 0.42, 0.29], 170, 0);
  }
  // hviezdy okolo Slnka (Orionovo rameno), aby bolo vidieť, kde sme
  for (let n = 0; n < 2500; n++) { const th = 0.12 * gauss(), r = 8178 + gauss() * 450 + 600 * th; push(b, at(r * Math.cos(th), r * Math.sin(th) + gauss() * 300, gauss() * 90), [0.5, 0.58, 0.75], 110, 0); }
}
/** Iná galaxia: disk so špirálou alebo nepravidelný oblak. */
function otherGalaxy(b: Buf, center: THREE.Vector3, normal: THREE.Vector3, R: number, n: number, kind: 'spiral' | 'irr', tint = 1) {
  const w = normal.clone().normalize(), u = new THREE.Vector3(0, 1, 0).cross(w); if (u.lengthSq() < 1e-6) u.set(1, 0, 0); u.normalize(); const v = new THREE.Vector3().crossVectors(w, u);
  const k = Math.tan(14 * D2R), sz = R / 70;
  for (let i = 0; i < n; i++) {
    let x: number, y: number, z: number, c: number[];
    if (kind === 'irr') { x = gauss() * R * 0.45; y = gauss() * R * 0.22; z = gauss() * R * 0.15; c = rnd() < 0.7 ? [0.7, 0.78, 1] : [1, 0.5, 0.7]; }
    else if (rnd() < 0.22) { x = gauss() * R * 0.09; y = gauss() * R * 0.09; z = gauss() * R * 0.06; c = [1.0, 0.85, 0.6]; }
    else { const r = R * (0.08 + -Math.log(1 - rnd() * 0.97) * 0.28), arm = rnd() < 0.5 ? 0 : Math.PI, th = Math.log(r / (R * 0.3)) / k + arm + gauss() * 0.25;
      x = r * Math.cos(th); y = r * Math.sin(th); z = gauss() * R * 0.015; c = rnd() < 0.6 ? [0.7, 0.8, 1] : [0.95, 0.92, 0.88]; }
    push(b, center.clone().addScaledVector(u, x).addScaledVector(v, y).addScaledVector(w, z), c.map(q => q * 0.6 * tint), sz, 1);
  }
}
/** Skutočné kopy galaxií v našom okolí (poloha na oblohe, vzdialenosť v Mpc, polomer v Mpc, počet bodov). */
const CLUSTERS = [
  { id: 'virgo', ra: 187.71, dec: 12.39, mpc: 16.5, sig: 1.5, n: 520, name: { sk: 'Kopa galaxií v Panne', en: 'Virgo Cluster' } },
  { id: 'fornax', ra: 54.62, dec: -35.45, mpc: 19, sig: 0.9, n: 200, name: { sk: 'Kopa galaxií v Peci', en: 'Fornax Cluster' } },
  { id: 'perseus', ra: 49.95, dec: 41.51, mpc: 73, sig: 1.8, n: 520, name: { sk: 'Kopa galaxií v Perzeovi', en: 'Perseus Cluster' } },
  { id: 'coma', ra: 194.95, dec: 27.98, mpc: 99, sig: 2.2, n: 700, name: { sk: 'Kopa galaxií vo Vlasoch Bereniky', en: 'Coma Cluster' } }
];
const FIELD_R = 9e8;   // vzdialené galaxie do 900 Mpc (v parsekoch)
/**
 * Desaťtisíce vzdialených galaxií usporiadaných do „kozmickej siete“: kopy, vlákna medzi nimi a prázdnoty.
 * Štyri najbližšie veľké kopy sú na skutočných miestach, zvyšok siete je náhodný (ilustračný).
 */
function galaxyField(b: Buf) {
  const rndDir = () => new THREE.Vector3(gauss(), gauss(), gauss()).normalize();
  const one = (P: THREE.Vector3, cluster: boolean) => {
    const r = P.length(); if (r < 2.5e6) return;                                   // Miestnu skupinu kreslíme zvlášť
    const L = rnd() ** 3, mag = THREE.MathUtils.clamp(0.12 + 0.95 * L - 0.45 * r / FIELD_R + (cluster ? 0.08 : 0), 0, 1);
    const ell = cluster && rnd() < 0.6;                                             // v kopách prevládajú žltkasté eliptické galaxie
    const c = ell ? [1.0, 0.84, 0.6] : (rnd() < 0.65 ? [0.72, 0.82, 1.0] : [0.96, 0.95, 1.0]), k = 0.75 + rnd() * 0.6;
    push(b, P, c.map(x => x * k), 15000 + rnd() * 30000, 2, mag, rnd() * Math.PI, ell ? 0.7 + rnd() * 0.3 : 0.28 + rnd() * 0.72);
  };
  const nodes: { p: THREE.Vector3; sig: number; w: number }[] = [];
  for (const c of CLUSTERS) { const p = eqDir(c.ra, c.dec).multiplyScalar(c.mpc * 1e6); nodes.push({ p, sig: c.sig * 1e6, w: 0 }); for (let i = 0; i < c.n; i++) one(p.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(c.sig * 1e6)), true); }
  for (let i = 0; i < 340; i++) nodes.push({ p: rndDir().multiplyScalar(FIELD_R * Math.cbrt(rnd())), sig: (2.5 + rnd() * 5) * 1e6, w: 0.3 + rnd() ** 2 * 2 });
  const wSum = nodes.reduce((a, n) => a + n.w, 0);
  const pick = () => { let x = rnd() * wSum; for (const n of nodes) { x -= n.w; if (x <= 0) return n; } return nodes[nodes.length - 1]; };
  // vlákna: každý uzol je spojený s dvoma najbližšími
  const links: [THREE.Vector3, THREE.Vector3][] = [];
  nodes.forEach((n, i) => { nodes.map((m, j) => ({ j, d: i === j ? Infinity : n.p.distanceToSquared(m.p) })).sort((x, y) => x.d - y.d).slice(0, 2).forEach(x => { if (x.d < (2.6e8) ** 2) links.push([n.p, nodes[x.j].p]); }); });
  for (let i = 0; i < 17000; i++) { const n = pick(); one(n.p.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(n.sig)), true); }
  for (let i = 0; i < 19000; i++) { const [p, q] = links[Math.floor(rnd() * links.length)]; one(p.clone().lerp(q, rnd()).add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(4e6)), false); }
  for (let i = 0; i < 9000; i++) one(rndDir().multiplyScalar(FIELD_R * Math.cbrt(rnd())), false);
}

export const cosmos: any = {
  stars: false, bg: new THREE.Color(0x000000),
  build() {
    const root = this.root = new THREE.Group(); ctx.anchor.add(root);
    this.view = new THREE.Group(); this.view.position.set(0, 0.06, -D); this.view.rotation.x = TILT; root.add(this.view);
    this.yawG = new THREE.Group(); this.view.add(this.yawG);
    this.content = new THREE.Group(); this.yawG.add(this.content);
    this.dot = softDot();
    this.F = [0, 0, 0]; this.z = 7.15; this.zT = 7.15; this.yaw = 0.5; this.days = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000; this.speed = 0;
    this.objs = []; this.pinches = new Map();
    this.buildSky(); this.buildSolar(); this.buildStars(); this.buildGalaxies(); this.buildRing();
    this.focusId = 'earth'; this.pi = 0; this.flight = null; this.caption = '';
    // na počítači: koliesko myši = zoom
    ctx.renderer.domElement.addEventListener('wheel', (e: WheelEvent) => { if (ctx.current !== 'cosmos') return; e.preventDefault(); this.flight = null; this.zT = THREE.MathUtils.clamp(this.zT + e.deltaY * 0.0016, Z_MIN, Z_MAX); }, { passive: false });
  },

  /* ---------- obloha (ESO panoráma v galaktických súradniciach) ---------- */
  buildSky() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x8a8a8a, depthWrite: false, depthTest: false });   // nepriehľadná, kreslí sa prvá
    const s = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), mat); s.geometry.scale(-1, 1, 1); s.renderOrder = -40; s.frustumCulled = false;
    s.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(GX.clone().negate(), GZ, GY));
    loadTex(ASSET.milky).then(t => { if (t) { mat.map = t; mat.needsUpdate = true; } });
    this.content.add(s); this.sky = s;
  },

  /* ---------- Slnečná sústava ---------- */
  buildSolar() {
    const B = ctx.content.solar.bodies;
    // Slnko
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), sunMaterial());
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,225,160,0.6)', 'rgba(255,150,60,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.content.add(sun, halo); this.sunHalo = halo;
    this.addObj({ id: 'sun', name: B.sun.name, kind: 'sun', r: 696340 * KM, pos: () => [0, 0, 0], mesh: sun, zL: [9.0, 18.4], color: '#ffe08a', focusZ: 9.25 });
    // planéty
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const d = B[id]; let mat: THREE.ShaderMaterial;
      if (id === 'earth') { mat = earthMaterial(); this.earthMat = mat; this.earthTex('2k'); }
      else { mat = planetMaterial(d.color, d.atmo || '#000000', d.atmoStr || 0); loadTex(ASSET.planets + '2k_' + d.tex).then(t => { if (t) { mat.uniforms.uMap.value = t; mat.uniforms.uHasMap.value = 1; } }); }
      const holder = new THREE.Group(), tilt = new THREE.Group(); tilt.rotation.z = (d.tilt || 0) * D2R; holder.add(tilt);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), mat); tilt.add(mesh);
      if (d.ring) {
        const inner = 1.24, outer = 2.27, rg = new THREE.RingGeometry(inner, outer, 192, 1), pos = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
        for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k); uv.setXY(k, (v.length() - inner) / (outer - inner), 0.5); }
        const rm = new THREE.MeshBasicMaterial({ color: 0xd9c79a, side: THREE.DoubleSide, transparent: true, opacity: 0.8, depthWrite: false });
        loadTex(ASSET.planets + '2k_saturn_ring_alpha.png').then(t => { if (t) { rm.map = t; rm.color.set('#e8e0cc'); rm.opacity = 1; rm.needsUpdate = true; } });
        const ring = new THREE.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2; tilt.add(ring);
      }
      this.content.add(holder);
      const a = d.a * AU, P = d.P, L0 = d.L0;
      this.addObj({ id, name: d.name, kind: 'planet', r: d.r * KM, mesh: holder, spin: mesh, mat, tex: d.tex, zL: [6.5, 13.7], color: '#bcd2ff',
        pos: () => { const L = (L0 + 360 * this.days / P) * D2R; return [Math.cos(L) * a, 0, -Math.sin(L) * a]; } });
    }
    // Mesiac
    const mm = planetMaterial('#b8b8b8'); loadTex(ASSET.planets + '2k_moon.jpg').then(t => { if (t) { mm.uniforms.uMap.value = t; mm.uniforms.uHasMap.value = 1; } });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mm); this.content.add(moon);
    this.addObj({ id: 'moon', name: ctx.content.bodies.find((b: any) => b.id === 'moon')?.name ?? { sk: 'Mesiac', en: 'Moon' }, kind: 'planet', r: 1737.4 * KM, mesh: moon, mat: mm, zL: [7.4, 9.9], color: '#d8d8d8',
      pos: () => { const e = this.byId.earth.pos(), m = (218.316 + 13.176396 * this.days) * D2R, r = 384400 * KM; return [e[0] + Math.cos(m) * r, 0, e[2] - Math.sin(m) * r]; } });
    // dráhy, pás asteroidov, Kuiperov pás, Oortov oblak (v jednotkách AU)
    const ss = this.ss = new THREE.Group(); this.content.add(ss);
    this.orbits = [];
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
      const a = B[id].a, pts: THREE.Vector3[] = []; for (let k = 0; k <= 1024; k++) { const t = k / 1024 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * a, 0, -Math.sin(t) * a)); }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: id === 'earth' ? 0x5f8fff : 0x4a5f9e, transparent: true, opacity: 0.5, depthWrite: false }));
      l.frustumCulled = false; l.userData.a = a; ss.add(l); this.orbits.push(l);
    }
    const belt = (n: number, f: (i: number) => THREE.Vector3, color: number, size: number) => {
      const p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = f(i); p.set([v.x, v.y, v.z], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, map: this.dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false; ss.add(pts); return pts;
    };
    const ring = (r0: number, r1: number, h: number) => () => { const r = r0 + rnd() * (r1 - r0), t = rnd() * Math.PI * 2; return new THREE.Vector3(Math.cos(t) * r, gauss() * h * r, Math.sin(t) * r); };
    this.asteroids = belt(3000, ring(2.15, 3.3, 0.03), 0xb8aa98, 2.2);
    this.kuiper = belt(4000, ring(30, 50, 0.06), 0x9fb6d8, 2.2);
    this.oort = belt(7000, () => new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(2000 * Math.pow(50, rnd())), 0xa9c4ff, 1.8);
    // Mesačná dráha
    const mp: THREE.Vector3[] = []; for (let k = 0; k <= 128; k++) { const t = k / 128 * Math.PI * 2; mp.push(new THREE.Vector3(Math.cos(t), 0, -Math.sin(t))); }
    this.moonOrbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mp), new THREE.LineBasicMaterial({ color: 0x8a8fa8, transparent: true, opacity: 0.45, depthWrite: false }));
    this.moonOrbit.frustumCulled = false; this.content.add(this.moonOrbit);
    // popisky oblastí
    this.addObj({ id: 'belt', name: { sk: 'Pás asteroidov', en: 'Asteroid belt' }, kind: 'region', r: 0, pos: () => [2.7 * AU * Math.cos(0.6), 0, -2.7 * AU * Math.sin(0.6)], zL: [11.0, 12.7], color: '#c9bba8' });
    this.addObj({ id: 'kb', name: { sk: 'Kuiperov pás', en: 'Kuiper belt' }, kind: 'region', r: 0, pos: () => [42 * AU * Math.cos(2.2), 0, -42 * AU * Math.sin(2.2)], zL: [12.4, 14.3], color: '#a9c2e6' });
    this.addObj({ id: 'pluto', name: { sk: 'Pluto', en: 'Pluto' }, kind: 'region', r: 1188 * KM, pos: () => { const L = (238.9 + 360 * this.days / 90560) * D2R, a = 39.5 * AU; return [Math.cos(L) * a, 0.12 * a * Math.sin(L), -Math.sin(L) * a]; }, zL: [12.2, 13.8], color: '#c8b8a8', marker: true });
    this.addObj({ id: 'oort', name: { sk: 'Oortov oblak', en: 'Oort cloud' }, kind: 'region', r: 0, pos: () => [0, 22000 * AU, -30000 * AU], zL: [15.0, 17.3], color: '#b5ccff' });
  },
  earthTex(lvl: string) {
    const u = this.earthMat.uniforms;
    const set = (name: string, key: string, flag?: string) => loadTex(ASSET.planets + `${lvl}_${name}`).then(t => {
      if (!t) return; if (name.includes('clouds')) t.wrapS = THREE.RepeatWrapping; u[key].value = t; if (flag) u[flag].value = 1; });
    set('earth_daymap.jpg', 'uDay'); set('earth_nightmap.jpg', 'uNight', 'uHasNight'); set('earth_clouds.jpg', 'uClouds', 'uHasClouds'); set('earth_specular_map.jpg', 'uSpec', 'uHasSpec');
  },

  /* ---------- hviezdy z katalógu HYG ---------- */
  async buildStars() {
    const mat = this.starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uF: { value: new THREE.Vector3() }, uInvS: { value: 1 }, uCam: { value: new THREE.Vector3() }, uFade: { value: 1 }, uPx: { value: 1 }, uMap: { value: this.dot } } });
    try {
      const buf = await (await fetch(url('data/stars.bin'))).arrayBuffer(), f = new Float32Array(buf), n = f.length / 5;
      const p = new Float32Array(n * 3), m = new Float32Array(n), c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { p.set([f[i * 5], f[i * 5 + 1], f[i * 5 + 2]], i * 3); m[i] = f[i * 5 + 3]; c.set(bvColor(f[i * 5 + 4]), i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('absmag', new THREE.BufferAttribute(m, 1)); g.setAttribute('col', new THREE.BufferAttribute(c, 3));
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; this.content.add(pts);
      const names = await (await fetch(url('data/star-names.json'))).json();
      names.forEach((s: any, i: number) => {
        const P = [s.p[0] * PC, s.p[1] * PC, s.p[2] * PC];
        this.addObj({ id: 'star' + i, name: s.n, kind: 'star', r: 0, pos: () => P, zL: [s.ly < 30 ? 16.2 : 16.9, 19.2], color: '#ffe6b8', ly: s.ly });
      });
    } catch { /* bez katalógu ostane obloha z panorámy */ }
  },

  /* ---------- Mliečna cesta, Miestna skupina, vzdialené galaxie ---------- */
  buildGalaxies() {
    const b: Buf = { p: [], c: [], s: [], g: [], m: [], sh: [] };
    milkyWay(b);
    const at = (ra: number, dec: number, kpc: number) => eqDir(ra, dec).multiplyScalar(kpc * 1000);
    const M31 = M31_PC, M33 = at(23.4621, 30.66, 840), LMC = at(80.894, -69.756, 49.97), SMC = at(13.187, -72.83, 62.4);
    otherGalaxy(b, M31, new THREE.Vector3(0.3, 0.25, 1), 23000, 26000, 'spiral', 1.1);
    otherGalaxy(b, M33, new THREE.Vector3(-0.4, 0.8, 0.3), 9000, 8000, 'spiral', 0.9);
    otherGalaxy(b, LMC, new THREE.Vector3(0.2, 1, 0.1), 5000, 4500, 'irr');
    otherGalaxy(b, SMC, new THREE.Vector3(0.6, 0.4, 0.5), 3000, 2500, 'irr');
    galaxyField(b);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('col', new THREE.Float32BufferAttribute(b.c, 3));
    g.setAttribute('size', new THREE.Float32BufferAttribute(b.s, 1)); g.setAttribute('grp', new THREE.Float32BufferAttribute(b.g, 1));
    g.setAttribute('mag', new THREE.Float32BufferAttribute(b.m, 1)); g.setAttribute('shape', new THREE.Float32BufferAttribute(b.sh, 2));
    this.galMat = new THREE.ShaderMaterial({ vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uF: { value: new THREE.Vector3() }, uInvS: { value: 1 }, uFade: { value: new THREE.Vector3() }, uProj: { value: 750 }, uFloor: { value: new THREE.Vector2(0.22, 0.4) }, uMinPx: { value: new THREE.Vector3(1.0, 1.3, 1.0) } } });
    const pts = new THREE.Points(g, this.galMat); pts.frustumCulled = false; this.content.add(pts);
    const P = (v: THREE.Vector3) => () => [v.x * PC, v.y * PC, v.z * PC];
    const F = ctx.content.cosmos.facts;
    this.addObj({ id: 'gc', name: { sk: 'Stred Galaxie', en: 'Galactic centre' }, kind: 'gal', r: 0, pos: P(GC_PC), zL: [19.4, 21.4], color: '#ffd9a0', fact: F.gc, focusZ: 20.54 });
    this.addObj({ id: 'sunmw', name: { sk: 'Slnko (tu sme)', en: 'Sun (we are here)' }, kind: 'gal', r: 0, pos: () => [0, 0, 0], zL: [18.4, 21.9], color: '#ffe08a', fact: F.sunmw, focusZ: 17.0, marker: true });
    this.addObj({ id: 'mw', name: { sk: 'Mliečna cesta', en: 'Milky Way' }, kind: 'gal', r: 0, pos: P(GC_PC.clone().addScaledVector(GZ, 9000)), zL: [21.4, 23.0], color: '#cfd9ff', focusZ: 20.54 });
    this.addObj({ id: 'm31', name: { sk: 'Galaxia v Andromede', en: 'Andromeda Galaxy' }, kind: 'gal', r: 0, pos: P(M31), zL: [20.6, 23.0], color: '#cfd9ff', fact: F.m31, focusZ: 20.9 });
    this.addObj({ id: 'm33', name: { sk: 'Galaxia v Trojuholníku', en: 'Triangulum Galaxy' }, kind: 'gal', r: 0, pos: P(M33), zL: [21.4, 22.8], color: '#cfd9ff', fact: F.m33, focusZ: 20.5 });
    this.addObj({ id: 'lmc', name: { sk: 'Veľký Magellanov oblak', en: 'Large Magellanic Cloud' }, kind: 'gal', r: 0, pos: P(LMC), zL: [20.3, 21.9], color: '#cfd9ff', fact: F.lmc, focusZ: 19.9 });
    this.addObj({ id: 'smc', name: { sk: 'Malý Magellanov oblak', en: 'Small Magellanic Cloud' }, kind: 'gal', r: 0, pos: P(SMC), zL: [20.5, 21.9], color: '#cfd9ff', fact: F.smc, focusZ: 19.7 });
    const LG = GC_PC.clone().add(M31).multiplyScalar(0.5);
    this.lgPos = [LG.x * PC, LG.y * PC, LG.z * PC];
    this.addObj({ id: 'here', name: { sk: 'Miestna skupina (tu sme)', en: 'Local Group (we are here)' }, kind: 'gal', r: 0, pos: () => this.lgPos, zL: [22.9, 24.7], color: '#ffe08a', fact: F.lg, focusZ: 22.12, marker: true });
    for (const c of CLUSTERS) this.addObj({ id: c.id, name: c.name, kind: 'gal', r: 0, pos: P(eqDir(c.ra, c.dec).multiplyScalar(c.mpc * 1e6)), zL: [c.mpc < 30 ? 22.5 : 23.1, 24.7], color: '#ffd9a0', fact: F[c.id], focusZ: c.mpc < 30 ? 22.9 : 23.3 });
  },

  /* ---------- mierka: kruh so vzdialenosťou ---------- */
  buildRing() {
    const pts: THREE.Vector3[] = []; for (let k = 0; k <= 160; k++) { const t = k / 160 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t), 0, Math.sin(t))); }
    this.ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.35, dashSize: 0.02, gapSize: 0.02, depthWrite: false }));
    this.ring.computeLineDistances(); this.ring.frustumCulled = false; this.yawG.add(this.ring); this.ringTxt = '';
  },
  ringUpdate() {
    const S = 10 ** this.z, want = 0.55 * S;
    const units: [number, any][] = this.z < 10.3 ? [[KM, { sk: 'km', en: 'km' }]] : this.z < 15.6 ? [[AU, { sk: 'AU', en: 'AU' }]] : [[LY, { sk: 'svetelných rokov', en: 'light years' }]];
    const [u, uName] = units[0]; let v = want / u; const e = Math.floor(Math.log10(v)), m = v / 10 ** e; v = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * 10 ** e;
    const R = v * u / S; this.ring.scale.setScalar(R); this.ring.position.set(0, 0, 0);
    let label = v >= 1 ? fmt(v) : v.toString();
    if (u === LY && v === 1) label = en() ? '1 light year' : '1 svetelný rok';
    else if (u === LY) label += ' ' + (en() ? 'light years' : (v >= 2 && v <= 4 ? 'svetelné roky' : 'svetelných rokov'));
    else label += ' ' + T(uName);
    if (label !== this.ringTxt) {
      this.ringTxt = label; if (this.ringLbl) { this.yawG.remove(this.ringLbl); this.ringLbl.material.map.dispose(); this.ringLbl.material.dispose(); }
      const s = this.ringLbl = textSprite(label, '#9fc0ff', 48); s.material.sizeAttenuation = false; s.material.depthTest = false; s.renderOrder = 12;
      s.scale.set(0.022 * s.userData.aspect, 0.022, 1); this.yawG.add(s);
    }
    this.ringLbl.position.set(0, 0.01, R);
  },

  /* ---------- objekty s popiskom ---------- */
  addObj(o: any) {
    this.byId = this.byId || {};
    o.label = this.mkLabel(o);
    if (o.kind !== 'region' || o.marker) {
      o.dotS = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dot, color: new THREE.Color(o.color), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, blending: THREE.AdditiveBlending }));
      o.dotS.renderOrder = 11; this.content.add(o.dotS);
      makeClickable(o.dotS, { onClick: () => this.focusOn(o.id) });
    }
    this.objs.push(o); this.byId[o.id] = o;
  },
  mkLabel(o: any) {
    const s = textSprite(T(o.name), o.color, 52); s.material.sizeAttenuation = false; s.material.depthTest = false; s.renderOrder = 12;
    s.scale.set(0.024 * s.userData.aspect, 0.024, 1); s.center.set(0.5, 1.6); this.content.add(s);
    makeClickable(s, { onClick: () => this.focusOn(o.id) }); return s;
  },

  /* ---------- pohyb kamery ---------- */
  focusPos(id: string): number[] { if (id === 'lg') return this.lgPos; if (id === 'gc') return this.byId.gc.pos(); return this.byId[id].pos(); },
  zFor(o: any) {
    if (o.focusZ) return o.focusZ;
    if (o.kind === 'planet') return Math.log10(o.r / 0.42);
    if (o.kind === 'star') return 16.3;
    if (o.id === 'pluto') return 12.3;
    return this.z;
  },
  flyTo(focus: string, z1: number) {
    const F0 = this.F.slice(), z0 = this.z, F1 = this.focusPos(focus);
    const dist = Math.hypot(F1[0] - F0[0], F1[1] - F0[1], F1[2] - F0[2]);
    const zMid = dist > 0 ? Math.log10(dist / 1.1) : Math.min(z0, z1), bump = Math.max(0, zMid - Math.max(z0, z1));
    const dur = THREE.MathUtils.clamp(2.2 + 0.28 * (Math.abs(z1 - z0) + 2 * bump), 2.2, 8);
    this.flight = { F0, z0, z1, focus, t: 0, dur, bump };
    this.focusId = focus; this.zT = z1;
  },
  focusOn(id: string) {
    const o = this.byId[id]; if (!o) return;
    this.flyTo(id === 'mw' ? 'gc' : id, this.zFor(o)); this.objCaption(o);
  },
  objCaption(o: any) {
    let body: any = o.fact;
    if (o.kind === 'planet') { const b = ctx.content.bodies.find((x: any) => x.id === o.id); if (b) body = { sk: `Priemer ${fmt(b.d)} km. ${T(b.fact)}`, en: `Diameter ${fmt(b.d)} km. ${T(b.fact)}` }; }
    if (o.kind === 'star') body = { sk: `Hviezda vo vzdialenosti ${fmt(o.ly)} svetelných rokov. Jej svetlo k nám letí ${fmt(Math.round(o.ly))} rokov.`, en: `A star ${fmt(o.ly)} light years away. Its light takes ${fmt(Math.round(o.ly))} years to reach us.` };
    if (o.id === 'sun') { const b = ctx.content.bodies.find((x: any) => x.id === 'sun'); body = b ? { sk: `Naša hviezda, priemer 1,39 milióna km. ${T(b.fact)}`, en: `Our star, 1.39 million km across. ${T(b.fact)}` } : undefined; }
    this.caption = 'obj:' + o.id;
    this.hud({ title: o.name, body: body ?? { sk: '', en: '' } });
  },
  go(i: number) {
    const P = ctx.content.cosmos.presets, n = P.length; this.pi = ((i % n) + n) % n; const p = P[this.pi];
    this.flyTo(p.focus, p.z);
    if (p.focus === 'lg') this.yawTo = 0.2;          // Mliečna cesta vľavo a trochu bližšie, Andromeda vpravo
    else if (p.focus === 'gc') this.yawTo = 0.35; this.caption = 'p' + this.pi; this.hud({ title: p.title, body: p.text });
  },
  nearestPreset() { const P = ctx.content.cosmos.presets; let bi = 0, bd = 1e9; P.forEach((p: any, i: number) => { const d = Math.abs(p.z - this.z); if (d < bd) { bd = d; bi = i; } }); return bi; },

  /* ---------- ovládanie ---------- */
  onPinchStart(c: THREE.Object3D) {
    this.pinches.set(c, true);
    if (this.pinches.size >= 2) {
      const [a, b] = [...this.pinches.keys()];
      this.gesture = { a, b, d0: Math.max(0.03, a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()))), z0: this.z };
      this.flight = null;
    }
  },
  onPinchEnd(c: THREE.Object3D) {
    this.pinches.delete(c);
    // po zoome dvoma rukami sa otáčanie zvyšnou rukou nespustí, kým ju návštevník nepustí (inak by pohľad poskočil)
    if (this.gesture && (this.gesture.a === c || this.gesture.b === c)) { this.gesture = null; this.dragLock = true; }
    if (!this.pinches.size) this.dragLock = false;
  },
  onDrag(dx: number, start: number) { if (!this.gesture && !this.dragLock) { this.yawTo = null; this.yaw = start + dx * 3; } },
  dragStart() { return this.yaw; },
  onTap() { /* ťuknutie do prázdna nič nerobí – objekty sa vyberajú ťuknutím na ne */ },
  zoomStep(d: number) { this.flight = null; this.zT = THREE.MathUtils.clamp(this.zT + d, Z_MIN, Z_MAX); },
  timeLabel() { return [en() ? 'Time: stopped' : 'Čas: stojí', en() ? 'Time: real' : 'Čas: skutočný', en() ? 'Time: 1 day/s' : 'Čas: 1 deň/s', en() ? 'Time: 1 month/s' : 'Čas: 1 mesiac/s', en() ? 'Time: 1 year/s' : 'Čas: 1 rok/s'][this.speed]; },

  enter() {
    this.root.visible = true;
    this.speed = 0; this.days = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000;
    const p = ctx.content.cosmos.presets[0]; this.focusId = p.focus; this.F = this.focusPos(p.focus); this.z = this.zT = p.z; this.pi = 0; this.flight = null;
    this.caption = 'p0'; this.hud({ title: p.title, body: p.text });
  },
  exit() { this.root.visible = false; this.pinches.clear(); this.gesture = null; this.dragLock = false; this.hiRes(null); },
  hud(c?: any) {
    if (c) this.cap = c;
    setHud({ kicker: this.kicker(), title: this.cap.title, body: this.cap.body,
      credit: { sk: 'Hviezdy: katalóg HYG (CC BY-SA 4.0) · Textúry: Solar System Scope (CC BY 4.0) · Obloha: ESO/S. Brunier', en: 'Stars: HYG catalogue (CC BY-SA 4.0) · Textures: Solar System Scope (CC BY 4.0) · Sky: ESO/S. Brunier' },
      actions: [{ label: '−', onClick: () => this.zoomStep(0.8) }, { label: '+', onClick: () => this.zoomStep(-0.8) },
        { label: this.timeLabel(), active: this.speed > 0, onClick: () => { this.speed = (this.speed + 1) % 5; keepHud(); this.hud(); } }],
      prev: () => this.go(this.caption.startsWith('p') ? this.pi - 1 : this.nearestPreset() - 1),
      next: () => this.go(this.caption.startsWith('p') ? this.pi + 1 : this.nearestPreset() + 1) });
  },
  kicker() {
    const ly = (10 ** this.z) / LY;
    const sc = this.z < 10.3 ? `${fmt(Math.round(10 ** this.z / KM))} km` : this.z < 15.6 ? `${fmt(+(10 ** this.z / AU).toPrecision(2))} AU` : `${fmt(+ly.toPrecision(2))} ${en() ? 'ly' : 'sv. r.'}`;
    return { sk: `Od Zeme po galaxie   ·   1 m = ${sc}`, en: `From Earth to the galaxies   ·   1 m = ${sc}` };
  },
  relabel() {
    if (!this.built) return;
    for (const o of this.objs) { this.content.remove(o.label); o.label.material.map.dispose(); o.label.material.dispose(); o.label = this.mkLabel(o); }
    this.ringTxt = ''; if (ctx.current === 'cosmos') this.hud();
  },
  /** Zaostrená planéta dostane 4k textúru (ak je stiahnutá), predchádzajúca sa vráti na 2k. */
  async hiRes(id: string | null) {
    if (this.hi === id) return; const prev = this.hi; this.hi = id;
    if (prev) {
      const p = this.byId[prev];
      if (prev === 'earth') { ['earth_daymap.jpg', 'earth_nightmap.jpg', 'earth_clouds.jpg'].forEach(n => freeTex(ASSET.planets + '4k_' + n)); this.earthTex('2k'); }
      else if (p?.tex) { freeTex(ASSET.planets + '4k_' + p.tex); const t = await loadTex(ASSET.planets + '2k_' + p.tex); if (t) p.mat.uniforms.uMap.value = t; }
      else if (prev === 'moon') { freeTex(ASSET.planets + '4k_moon.jpg'); const t = await loadTex(ASSET.planets + '2k_moon.jpg'); if (t) p.mat.uniforms.uMap.value = t; }
    }
    if (!id) return;
    if (id === 'earth') { this.earthTex('4k'); return; }
    const o = this.byId[id], name = id === 'moon' ? 'moon.jpg' : o?.tex; if (!name) return;
    const t = await loadTex(ASSET.planets + '4k_' + name); if (t && this.hi === id) o.mat.uniforms.uMap.value = t;
  },

  update(dt: number, t: number) {
    SUN_U.uTime.value += dt; SUN_U.uHa.value = 0;
    const SP = [0, 1, 86400, 30 * 86400, 365.25 * 86400][this.speed]; this.days += dt * SP / 86400;
    // let / zoom
    const f = this.flight;
    if (f) {
      f.t += dt; const k = Math.min(1, f.t / f.dur), e = ease(k), F1 = this.focusPos(f.focus);
      for (let i = 0; i < 3; i++) this.F[i] = f.F0[i] + (F1[i] - f.F0[i]) * e;
      this.z = f.z0 + (f.z1 - f.z0) * e + f.bump * Math.sin(Math.PI * e); this.zT = this.z;
      if (k >= 1) { this.flight = null; this.zT = f.z1; const o = this.byId[f.focus]; this.hiRes(o && (o.kind === 'planet') ? f.focus : null); }
    } else {
      this.F = this.focusPos(this.focusId).slice();                          // sledovanie pohybujúcej sa planéty
      if (this.gesture) {
        const d = Math.max(0.03, this.gesture.a.getWorldPosition(V1).distanceTo(this.gesture.b.getWorldPosition(V2)));
        this.zT = this.z = THREE.MathUtils.clamp(this.gesture.z0 - 4 * Math.log10(d / this.gesture.d0), Z_MIN, Z_MAX);
      } else this.z += (this.zT - this.z) * Math.min(1, dt * 4);
      // pri voľnom zoome sa popis prepne na úroveň, na ktorej sme
      if (!this.caption.startsWith('obj')) { const pi = this.nearestPreset(); if ('p' + pi !== this.caption) { this.pi = pi; this.caption = 'p' + pi; const p = ctx.content.cosmos.presets[pi]; this.cap = { title: p.title, body: p.text }; setCaption({ title: p.title, body: p.text }); } }
    }
    const z = this.z, S = 10 ** z, inv = 1 / S, F = this.F;
    // natočenie: pri galaxiách leží galaktická rovina vodorovne, pri Miestnej skupine sú obe veľké galaxie vedľa seba
    this.content.quaternion.copy(Q_ID).slerp(Q_GAL, sstep(18.6, 19.9, z)).slerp(Q_LG, sstep(21.0, 21.8, z));
    if (this.yawTo != null) { const dy = Math.atan2(Math.sin(this.yawTo - this.yaw), Math.cos(this.yawTo - this.yaw)); this.yaw += dy * Math.min(1, dt * 1.5); if (Math.abs(dy) < 0.002) this.yawTo = null; }
    this.yawG.rotation.y = this.yaw;
    if (Math.abs(z - (this.kz ?? 0)) > 0.02) { this.kz = z; setCaption({ kicker: this.kicker() }); }
    // obloha, hviezdy, galaxie
    const sf = 1 - sstep(17.4, 18.5, z); (this.sky.material as THREE.MeshBasicMaterial).color.setScalar(0.54 * sf); this.sky.visible = sf > 0.01 && !ctx.isAR;   // v AR ostáva vidieť miestnosť
    this.content.updateMatrixWorld(true);
    const camL = this.content.worldToLocal(camWorld());
    this.sky.position.copy(camL);
    const Fpc = V1.set(F[0] / PC, F[1] / PC, F[2] / PC);
    if (this.starMat) { const u = this.starMat.uniforms; u.uF.value.copy(Fpc); u.uInvS.value = PC * inv; u.uCam.value.copy(camL); u.uFade.value = 1 - sstep(19.2, 20.1, z); u.uPx.value = ctx.renderer.xr.isPresenting ? 1.0 : 1.15; }
    const gu = this.galMat.uniforms; gu.uF.value.copy(Fpc); gu.uInvS.value = PC * inv;
    // Mliečna cesta · susedné galaxie · vzdialené galaxie (tie sú v pozadí už pri pohľade na našu Galaxiu)
    gu.uFade.value.set(sstep(18.5, 19.6, z), sstep(19.8, 20.5, z), 0.55 * sstep(19.6, 20.4, z) + 0.45 * sstep(21.6, 23.0, z));
    gu.uProj.value = ctx.renderer.xr.isPresenting ? 760 : ctx.renderer.domElement.height / (2 * Math.tan(ctx.camera.fov * D2R / 2));
    // Slnečná sústava: dráhy a pásy (jednotky AU)
    this.ss.position.set(-F[0] * inv, -F[1] * inv, -F[2] * inv); this.ss.scale.setScalar(AU * inv);
    const fo = 1 - sstep(13.4, 14.4, z);
    this.orbits.forEach((l: any) => { const r = l.userData.a * AU * inv; const near = 1 - sstep(1500, 6000, r);   // pri pohľade zblízka na planétu dráhy zmiznú (boli by to len čiary cez celú oblohu)
      l.visible = fo * near > 0.01 && r > 0.03; (l.material as THREE.LineBasicMaterial).opacity = 0.5 * fo * near * sstep(0.03, 0.15, r); });
    (this.asteroids.material as THREE.PointsMaterial).opacity = sstep(10.5, 11.2, z) * (1 - sstep(12.8, 13.6, z)) * 0.9; this.asteroids.visible = (this.asteroids.material as any).opacity > 0.01;
    (this.kuiper.material as THREE.PointsMaterial).opacity = sstep(11.6, 12.3, z) * (1 - sstep(14.2, 15.0, z)) * 0.9; this.kuiper.visible = (this.kuiper.material as any).opacity > 0.01;
    (this.oort.material as THREE.PointsMaterial).opacity = sstep(13.8, 14.8, z) * (1 - sstep(17.2, 18.0, z)) * 0.55; this.oort.visible = (this.oort.material as any).opacity > 0.01;
    const E = this.byId.earth.pos();
    this.moonOrbit.position.set((E[0] - F[0]) * inv, (E[1] - F[1]) * inv, (E[2] - F[2]) * inv); this.moonOrbit.scale.setScalar(384400 * KM * inv);
    (this.moonOrbit.material as THREE.LineBasicMaterial).opacity = 0.45 * sstep(7.3, 7.9, z) * (1 - sstep(9.6, 10.2, z)); this.moonOrbit.visible = z > 7.3 && z < 10.2;
    // jednotlivé objekty
    const sunW = V2.set(-F[0] * inv, -F[1] * inv, -F[2] * inv); this.content.localToWorld(sunW);
    const tmp = V3;
    for (const o of this.objs) {
      const P = o.pos(); tmp.set((P[0] - F[0]) * inv, (P[1] - F[1]) * inv, (P[2] - F[2]) * inv);
      const dist = tmp.distanceTo(camL), rS = o.r * inv, ang = rS / Math.max(dist, 1e-6), inRange = z > o.zL[0] && z < o.zL[1];
      if (o.mesh) {
        o.mesh.visible = ang > 0.0006 && dist < 2.5e6; o.mesh.position.copy(tmp); o.mesh.scale.setScalar(rS);
        if (o.spin) o.spin.rotation.y += dt * 0.1;
        if (o.mat?.uniforms?.uSun) { o.mat.uniforms.uSun.value.copy(sunW); if (o.mat.uniforms.uTime) o.mat.uniforms.uTime.value = t; }
      }
      if (o.id === 'sun') { this.sunHalo.position.copy(tmp); this.sunHalo.scale.setScalar(rS * 7); this.sunHalo.visible = o.mesh.visible; }
      if (o.dotS) {
        const showDot = (o.kind === 'star' || o.kind === 'gal') ? inRange : (inRange && ang < 0.004);
        o.dotS.visible = showDot && dist < (o.kind === 'planet' || o.kind === 'sun' ? 600 : 2.5e6); o.dotS.position.copy(tmp);
        const ds = o.kind === 'sun' ? 0.022 : o.kind === 'star' ? 0.012 : o.kind === 'gal' ? 0.016 : 0.01; o.dotS.scale.set(ds, ds, 1);
      }
      const far = o.kind === 'planet' || o.kind === 'sun' ? 600 : 2.5e6;        // vzdialené planéty sa pri pohľade zblízka nepopisujú
      const lbl = inRange && dist < far && dist > 0.12 && ang < 0.2;
      o.label.visible = lbl; o.label.position.copy(tmp);
      if (lbl) { const a = Math.min(sstep(o.zL[0], o.zL[0] + 0.3, z), 1 - sstep(o.zL[1] - 0.3, o.zL[1], z)); o.label.material.opacity = a; }
    }
    this.ringUpdate();
  }
};
