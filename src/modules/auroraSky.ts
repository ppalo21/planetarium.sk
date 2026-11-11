import * as THREE from 'three';
import { ctx, ASSET } from '../core/context';
import { loadTex } from '../core/util';

/* =====================================================================
   POLÁRNA ŽIARA ZO ZEME – fyzikálne verný model
   • Žiara sa počíta „lúčom“ cez atmosféru guľatej Zeme (výšky 85 – 380 km):
     zelená kyslíková čiara 557,7 nm s ostrým spodným okrajom okolo 100 km,
     červená kyslíková 630 nm vysoko nad 200 km, ružovofialový dusíkový okraj dole.
   • Závesy sú zvislé (pozdĺž magnetických siločiar), zvlnené, s lúčmi a pohybujúcimi sa záhybmi.
   • Keďže sa počíta so zakrivením Zeme, zo Slovenska (závesy 1 000+ km na severe) vidno
     sama od seba len horné, červené časti nízko nad obzorom – presne ako v skutočnosti.
   • Obloha sa vykresľuje do textúry (1024 × 384) a tá sa použije na oblohu aj na odraz v jazere.
   ===================================================================== */

const AURORA_FS = `precision highp float;
uniform float uTime; uniform float uGain; uniform float uRed; uniform float uN2; uniform float uLow;
uniform vec4 uC0; uniform vec4 uC1;           // vzdialenosti závesov na sever (km), 8 závesov
uniform vec4 uA0; uniform vec4 uA1;           // jas jednotlivých závesov
varying vec2 vUv;
const float RE = 6371.0;
float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float vn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float fbm(float x){ return 0.5 * vn(x) + 0.25 * vn(x * 2.03 + 17.0) + 0.125 * vn(x * 4.01 + 31.0) + 0.0625 * vn(x * 8.1 + 7.0); }
// zvlnená čiara závesu (km na sever) v mieste e km na východ
float lineN(float e, float c, float s, float t){
  return c + 38.0 * sin(e * 0.0042 + t * 0.045 + s) + 16.0 * sin(e * 0.011 - t * 0.07 + s * 2.1)
           + 6.0 * sin(e * 0.031 + t * 0.16 + s * 3.7) + 2.5 * sin(e * 0.09 - t * 0.35 + s);
}
// farba podľa výšky (km): zelená 557,7 nm od ~100 km, červená 630 nm nad 200 km, dusíkový okraj dole
vec3 heightColor(float h, float low){
  float above = smoothstep(low - 3.0, low + 4.0, h);
  float g = above * exp(-(h - low) / 34.0);
  float r = smoothstep(150.0, 230.0, h) * exp(-(h - 240.0) * (h - 240.0) / (2.0 * 80.0 * 80.0)) * uRed * (1.0 - smoothstep(330.0, 420.0, h));
  float p2 = exp(-(h - low) * (h - low) / 30.0) * uN2;
  return g * vec3(0.10, 1.0, 0.36) + r * vec3(1.0, 0.06, 0.10) * 0.5 + p2 * vec3(0.9, 0.25, 1.0) * 0.8;
}
// jeden záves = zvislá zvlnená plocha; nájde sa priesečník lúča s ňou a výška, v ktorej ju lúč pretína
vec3 curtain(vec3 d, float c, float s, float amp){
  if (amp < 0.001) return vec3(0.0);
  float dn = -d.z;                                     // zložka pohľadu na sever
  if (abs(dn) < 0.02) return vec3(0.0);
  float t = c / dn;
  for (int i = 0; i < 4; i++) t = mix(t, lineN(d.x * t, c, s, uTime) / dn, 0.7);
  if (t < 0.0) return vec3(0.0);
  float h = sqrt(RE * RE + t * t + 2.0 * RE * t * d.y) - RE;      // výška nad guľatou Zemou
  if (h < 80.0 || h > 430.0) return vec3(0.0);
  float e = d.x * t;
  float low = uLow + 7.0 * vn(e * 0.012 + s * 3.0 + uTime * 0.08);
  float rays = 0.3 + 0.7 * pow(fbm(e * 0.11 + uTime * 0.5 + s * 13.0 + 2.0 * sin(e * 0.008 + uTime * 0.1)), 2.0);
  rays *= 0.75 + 0.25 * vn(e * 0.9 + s * 5.0 - uTime * 1.7);                                     // jemné rýchle lúče
  float patches = 0.3 + 0.7 * smoothstep(0.2, 0.7, fbm(e * 0.0023 - uTime * 0.04 + s * 5.0));
  float path = 1.0 / max(abs(dn), 0.13);                                                         // záves videný šikmo je jasnejší
  float side = smoothstep(0.02, 0.2, abs(dn) / max(length(d.xz), 1e-3));                       // pohľad pozdĺž závesu
  // lúče sa smerom nahor rozplývajú
  float soft = mix(rays, 0.6, smoothstep(140.0, 300.0, h));
  return heightColor(h, low) * soft * patches * path * side * amp;
}
void main(){
  float az = vUv.x * 6.2831853, el = max(vUv.y, 0.0005) * 1.5707963;
  vec3 d = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));   // smer pohľadu (sever = −z, východ = +x)
  vec3 acc = vec3(0.0);
  acc += curtain(d, uC0.x, 1.3, uA0.x); acc += curtain(d, uC0.y, 4.7, uA0.y);
  acc += curtain(d, uC0.z, 8.1, uA0.z); acc += curtain(d, uC0.w, 2.9, uA0.w);
  acc += curtain(d, uC1.x, 6.3, uA1.x); acc += curtain(d, uC1.y, 9.4, uA1.y);
  acc += curtain(d, uC1.z, 3.8, uA1.z); acc += curtain(d, uC1.w, 7.2, uA1.w);
  acc *= uGain * 0.55;
  acc *= smoothstep(0.0, 0.04, vUv.y) * 0.75 + 0.25;                 // pri obzore žiaru tlmí hrubá vrstva vzduchu
  vec3 c = 1.0 - exp(-acc);                                          // jemné presvetlenie ako na fotke
  gl_FragColor = vec4(c, 1.0);
}`;

const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DIR_TO_UV = `
vec2 auroraUv(vec3 d){ float az = atan(d.x, -d.z); if (az < 0.0) az += 6.2831853; return vec2(az / 6.2831853, asin(clamp(d.y, 0.0, 1.0)) / 1.5707963); }`;

const DOME_VS = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const DOME_FS = `uniform sampler2D uMap; uniform float uFade; varying vec3 vDir;${DIR_TO_UV}
void main(){ vec3 d = normalize(vDir); if (d.y < 0.0) discard; vec3 c = texture2D(uMap, auroraUv(d)).rgb * uFade; gl_FragColor = vec4(c, 1.0); }`;

// voda: odraz polárnej žiary, mierne zvlnená hladina, viac odrazu pri šikmom pohľade
const LAKE_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LAKE_FS = `uniform sampler2D uMap; uniform float uTime; uniform vec3 uEye; uniform vec3 uTint; varying vec3 vW;${DIR_TO_UV}
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec3 v = normalize(vW - uEye);
  vec2 q = vW.xz * 0.35;
  vec3 n = normalize(vec3(0.012 * sin(q.x * 3.0 + uTime * 0.7) + 0.008 * sin(q.y * 5.0 - uTime), 1.0, 0.012 * sin(q.y * 2.7 - uTime * 0.6) + 0.008 * sin(q.x * 4.3 + uTime * 0.9)));
  vec3 r = reflect(v, n); r.y = abs(r.y);
  float fres = 0.25 + 0.65 * pow(1.0 - max(0.0, -v.y), 4.0);
  vec3 c = texture2D(uMap, auroraUv(r)).rgb * fres * 0.85;
  // odraz hviezd: drobné body
  vec2 sp = floor(auroraUv(r) * vec2(1400.0, 520.0)); float st = step(0.9965, h21(sp)) * 0.35 * fres;
  c += vec3(st) + uTint * 0.03;
  gl_FragColor = vec4(c, 1.0);
}`;

// sneh a terén: osvetlený len hviezdami a polárnou žiarou zo severu
const SNOW_VS = `varying vec3 vN; varying vec3 vW; varying float vC;
attribute float shade;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vC = shade; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SNOW_FS = `uniform vec3 uAur; uniform vec3 uAurDir; varying vec3 vN; varying vec3 vW; varying float vC;
void main(){
  vec3 n = normalize(vN);
  vec3 star = vec3(0.012, 0.016, 0.028);
  float lit = 0.35 + 0.65 * max(0.0, dot(n, normalize(uAurDir)));
  vec3 c = vec3(0.86, 0.9, 1.0) * vC * (star + uAur * lit);
  float fog = smoothstep(150.0, 700.0, length(vW.xz));                // vzdialené kopce splývajú s oblohou
  c = mix(c, star * 0.6 + uAur * 0.05, fog);
  gl_FragColor = vec4(c, 1.0);
}`;

export type AuroraMode = 'sky' | 'colors' | 'slovakia';
/** Rozmiestnenie závesov (km na sever) a ich jas pre jednotlivé scény. */
const MODES: Record<AuroraMode, { c: number[]; a: number[]; red: number; n2: number; gain: number; low: number; light: number }> = {
  // silná žiara nad hlavou a na severe (Nórsko, Island)
  sky: { c: [-60, 15, 70, 140, 230, 330, 480, 650], a: [0.6, 1.0, 0.9, 1.0, 1.0, 1.0, 0.9, 0.8], red: 0.4, n2: 0.4, gain: 1.7, low: 100, light: 1.0 },
  // jeden výrazný záves bokom, aby bolo vidno farby podľa výšky
  colors: { c: [160, 520, 9999, 9999, 9999, 9999, 9999, 9999], a: [1.4, 0.5, 0, 0, 0, 0, 0, 0], red: 1.3, n2: 1.0, gain: 1.9, low: 100, light: 0.7 },
  // silná búrka, závesy ďaleko na severe – zo Slovenska vidno len horné červené časti
  slovakia: { c: [950, 1100, 1250, 1400, 1550, 1700, 1850, 2000], a: [0.8, 1.0, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5], red: 2.6, n2: 0.0, gain: 1.9, low: 105, light: 0.25 }
};

/** Pre popisky: smer (azimut, výška nad obzorom) k bodu v danej výške nad závesom vo vzdialenosti D km na sever. */
export function elevationOf(hKm: number, dKm: number) {
  const RE = 6371, a = dKm / RE, R = RE + hKm;
  const x = R * Math.sin(a), y = R * Math.cos(a) - RE;
  return Math.atan2(y, x);
}

export class AuroraSky {
  group = new THREE.Group();
  rt: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh; private qScene = new THREE.Scene(); private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private u: any; private domeU: any; private lakeU: any; private snowU: any;
  private lake: THREE.Mesh; private trees: THREE.InstancedMesh; private treeMat: THREE.MeshBasicMaterial;
  private frame = 0; mode: AuroraMode = 'sky'; private target = MODES.sky; private cur = structuredClone(MODES.sky);

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.rt = new THREE.WebGLRenderTarget(1024, 384, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    this.rt.texture.wrapS = THREE.RepeatWrapping;
    this.u = { uTime: { value: 0 }, uGain: { value: 1 }, uRed: { value: 0.3 }, uN2: { value: 0.3 }, uLow: { value: 100 },
      uC0: { value: new THREE.Vector4() }, uC1: { value: new THREE.Vector4() }, uA0: { value: new THREE.Vector4() }, uA1: { value: new THREE.Vector4() } };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: AURORA_FS, uniforms: this.u, depthTest: false, depthWrite: false }));
    this.quad.frustumCulled = false; this.qScene.add(this.quad);

    // nočná obloha: skutočná fotografia Mliečnej cesty (ESO/S. Brunier), stlmená
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x5a5a5a, depthWrite: false });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 64, 32), skyMat); sky.geometry.scale(-1, 1, 1); sky.renderOrder = -30; sky.rotation.set(0.9, 0.4, 0.3);
    loadTex(ASSET.milky).then(t => { if (t) { skyMat.map = t; skyMat.needsUpdate = true; } });
    this.group.add(sky);
    // obloha s polárnou žiarou
    this.domeU = { uMap: { value: this.rt.texture }, uFade: { value: 1 } };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1500, 96, 32, 0, Math.PI * 2, 0, Math.PI / 2 + 0.02),
      new THREE.ShaderMaterial({ vertexShader: DOME_VS, fragmentShader: DOME_FS, uniforms: this.domeU, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dome.renderOrder = -20; dome.frustumCulled = false; this.group.add(dome);

    // terén so snehom: rovina okolo, kopce smerom k obzoru, priehlbina pre jazero na severe
    const lakeAt = (x: number, z: number) => { const dx = x / 170, dz = (z + 150) / 125; return dx * dx + dz * dz; };
    const geo = new THREE.PlaneGeometry(1600, 1600, 200, 200); geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position as THREE.BufferAttribute, shade: number[] = [];
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), r = Math.hypot(x, z);
      let h = -1.6 + 0.4 * Math.sin(x * 0.05) * Math.sin(z * 0.043);
      h += Math.max(0, r - 60) * 0.03 * (0.6 + 0.4 * Math.sin(Math.atan2(x, z) * 3 + 1)) + Math.max(0, r - 250) * 0.1 * (0.5 + 0.5 * Math.sin(Math.atan2(x, z) * 5 + 2));
      const L = lakeAt(x, z); if (L < 1.25) h = Math.min(h, -1.6 - 0.8 * (1.25 - L));
      P.setY(i, h); shade.push(0.75 + 0.25 * Math.sin(x * 0.7) * Math.sin(z * 0.9));
    }
    geo.setAttribute('shade', new THREE.Float32BufferAttribute(shade, 1)); geo.computeVertexNormals();
    this.snowU = { uAur: { value: new THREE.Color(0.02, 0.09, 0.05) }, uAurDir: { value: new THREE.Vector3(0, 0.6, -1) } };
    const ground = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: SNOW_VS, fragmentShader: SNOW_FS, uniforms: this.snowU }));
    ground.frustumCulled = false; this.group.add(ground);

    // jazero (fjord) na severe so zrkadlením oblohy
    this.lakeU = { uMap: { value: this.rt.texture }, uTime: { value: 0 }, uEye: { value: new THREE.Vector3() }, uTint: { value: new THREE.Color(0.1, 0.3, 0.2) } };
    this.lake = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: LAKE_VS, fragmentShader: LAKE_FS, uniforms: this.lakeU }));
    this.lake.scale.set(205, 1, 150); this.lake.position.set(0, -1.62, -150); this.group.add(this.lake);

    // smrekový les – tmavé siluety proti žiariacej oblohe
    const cone = new THREE.ConeGeometry(1, 1, 7, 1); cone.translate(0, 0.5, 0);
    const cone2 = new THREE.ConeGeometry(0.75, 0.6, 7, 1); cone2.translate(0, 0.9, 0);
    const treeGeo = mergeCones(cone, cone2);
    this.treeMat = new THREE.MeshBasicMaterial({ color: 0x010201 });
    const M = 900; this.trees = new THREE.InstancedMesh(treeGeo, this.treeMat, M);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let k = 0;
    while (k < M) {
      const a = rnd() * Math.PI * 2, r = 22 + Math.pow(rnd(), 0.7) * 420, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      if (lakeAt(x, z) < 1.45) continue;                                         // nie do jazera
      if (Math.abs(a) < 0.35 && r < 60) continue;                                // voľný výhľad na sever
      const clump = 0.5 + 0.5 * Math.sin(a * 7 + 1) * Math.sin(r * 0.03);         // skupinky stromov
      if (rnd() > 0.35 + 0.65 * clump) continue;
      const hgt = 5 + rnd() * 9 + r * 0.01, wid = hgt * (0.22 + rnd() * 0.08);
      const hx = x, hz = z, gr = Math.hypot(hx, hz);
      const gy = -1.6 + Math.max(0, gr - 60) * 0.03 * (0.6 + 0.4 * Math.sin(Math.atan2(hx, hz) * 3 + 1)) + Math.max(0, gr - 250) * 0.1 * (0.5 + 0.5 * Math.sin(Math.atan2(hx, hz) * 5 + 2)) - 0.3;
      p.set(hx, gy, hz); s.set(wid, hgt, wid); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      this.trees.setMatrixAt(k++, m.compose(p, q, s));
    }
    this.trees.frustumCulled = false; this.group.add(this.trees);
    this.setMode('sky', true);
  }

  setMode(mode: AuroraMode, instant = false) {
    this.mode = mode; this.target = MODES[mode];
    if (instant) this.cur = structuredClone(this.target);
    this.lake.visible = mode !== 'slovakia';
  }

  /** Volá sa každú snímku pred vykreslením scény. */
  update(dt: number, t: number) {
    // plynulý prechod medzi scénami
    const k = Math.min(1, dt * 1.5), c = this.cur, T = this.target;
    for (let i = 0; i < 8; i++) { c.c[i] += (T.c[i] - c.c[i]) * k; c.a[i] += (T.a[i] - c.a[i]) * k; }
    c.red += (T.red - c.red) * k; c.n2 += (T.n2 - c.n2) * k; c.gain += (T.gain - c.gain) * k; c.low += (T.low - c.low) * k; c.light += (T.light - c.light) * k;
    const u = this.u, breathe = 0.85 + 0.15 * Math.sin(t * 0.37) + 0.08 * Math.sin(t * 1.3);
    u.uTime.value = t; u.uGain.value = c.gain * breathe; u.uRed.value = c.red; u.uN2.value = c.n2; u.uLow.value = c.low;
    u.uC0.value.set(c.c[0], c.c[1], c.c[2], c.c[3]); u.uC1.value.set(c.c[4], c.c[5], c.c[6], c.c[7]);
    u.uA0.value.set(c.a[0], c.a[1], c.a[2], c.a[3]); u.uA1.value.set(c.a[4], c.a[5], c.a[6], c.a[7]);
    // svetlo zo žiary dopadá na sneh (zelené, pri búrke nad Slovenskom slabé červenkasté)
    const red = Math.min(1, c.red / 2.6);
    this.snowU.uAur.value.setRGB(0.02 + 0.07 * red, 0.2 * (1 - red * 0.75), 0.09 * (1 - red * 0.6)).multiplyScalar(c.light * breathe);
    this.treeMat.color.setRGB(0.0025 + 0.002 * red, 0.004 * c.light, 0.003);
    this.lakeU.uTime.value = t; (ctx.renderer.xr.isPresenting ? ctx.renderer.xr.getCamera() : ctx.camera).getWorldPosition(this.lakeU.uEye.value);
    // obloha so žiarou sa prepočíta každú druhú snímku (šetrí výkon okuliarov)
    if (this.frame++ % 2 === 0) {
      const r = ctx.renderer, prev = r.getRenderTarget(), xr = r.xr.enabled;
      r.xr.enabled = false; r.setRenderTarget(this.rt); r.render(this.qScene, this.qCam); r.setRenderTarget(prev); r.xr.enabled = xr;
    }
  }
  dispose() { this.rt.dispose(); }
}

function mergeCones(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const A = a.toNonIndexed(), B = b.toNonIndexed(), pa = A.attributes.position.array as Float32Array, pb = B.attributes.position.array as Float32Array;
  const pos = new Float32Array(pa.length + pb.length); pos.set(pa, 0); pos.set(pb, pa.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); return g;
}
