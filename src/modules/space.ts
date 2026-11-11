import * as THREE from 'three';
import { ASSET } from '../core/context';
import { loadTex, canvasTex } from '../core/util';

/* Spoločné materiály pre vesmírne scény: planéty osvetlené skutočnou polohou Slnka,
   Zem s nočnými mestami, oblakmi, odleskom oceánov a atmosférou. */

const VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const PLANET_FS = `uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor; uniform vec3 uSun; uniform vec3 uAtmo; uniform float uAtmoStr; uniform float uAmb;
uniform float uRing; uniform sampler2D uRingMap; uniform vec3 uRingC; uniform vec3 uRingN; uniform vec2 uRingR;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N=normalize(vN), L=normalize(uSun-vW), V=normalize(cameraPosition-vW);
  vec3 base = uHasMap>0.5 ? texture2D(uMap,vUv).rgb : uColor;
  float d=dot(N,L);
  float sun = max(d,0.0)*smoothstep(-0.05,0.12,d);
  if (uRing > 0.5) {                                   // tieň prstencov na planéte
    float dn = dot(L, uRingN);
    if (abs(dn) > 1e-4) { float t = dot(uRingC - vW, uRingN) / dn;
      if (t > 0.0) { float r = length(vW + L * t - uRingC); float u = (r - uRingR.x) / (uRingR.y - uRingR.x);
        if (u > 0.0 && u < 1.0) sun *= 1.0 - 0.8 * texture2D(uRingMap, vec2(u, 0.5)).a; } }
  }
  vec3 col = base*(uAmb + 1.15*sun);
  float rim = pow(1.0-max(dot(N,V),0.0),3.0);
  col += uAtmo*rim*uAtmoStr*smoothstep(-0.25,0.35,d);
  gl_FragColor=vec4(col,1.0);
  #include <colorspace_fragment>
}`;

const EARTH_FS = `uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform sampler2D uSpec;
uniform float uHasNight; uniform float uHasClouds; uniform float uHasSpec; uniform vec3 uSun; uniform float uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N=normalize(vN), L=normalize(uSun-vW), V=normalize(cameraPosition-vW);
  float d=dot(N,L), day=smoothstep(-0.12,0.18,d), light=max(d,0.0);
  vec3 dcol=texture2D(uDay,vUv).rgb;
  vec3 ncol= uHasNight>0.5 ? texture2D(uNight,vUv).rgb*vec3(1.0,0.85,0.6)*1.6 : vec3(0.0);
  vec3 col=mix(ncol, dcol*(0.03+1.15*light), day);
  if(uHasSpec>0.5){ float s=texture2D(uSpec,vUv).r; vec3 H=normalize(L+V); col+=vec3(1.0,0.95,0.85)*pow(max(dot(N,H),0.0),45.0)*s*0.6*light; }
  if(uHasClouds>0.5){ float c=texture2D(uClouds,vUv+vec2(uTime*0.0015,0.0)).r; col=mix(col, vec3(1.0)*(0.04+1.05*light), c*0.9*mix(0.15,1.0,day)); }
  float rim=pow(1.0-max(dot(N,V),0.0),2.6);
  col+=vec3(0.32,0.58,1.0)*rim*(0.12+1.1*smoothstep(-0.3,0.5,d));
  gl_FragColor=vec4(col,1.0);
  #include <colorspace_fragment>
}`;

export function planetMaterial(color: string, atmo = '#000000', atmoStr = 0) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: PLANET_FS,
    uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSun: { value: new THREE.Vector3() }, uAtmo: { value: new THREE.Color(atmo) }, uAtmoStr: { value: atmoStr }, uAmb: { value: 0.015 },
      uRing: { value: 0 }, uRingMap: { value: null }, uRingC: { value: new THREE.Vector3() }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uRingR: { value: new THREE.Vector2(1, 2) } } });
}
export function earthMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: EARTH_FS,
    uniforms: { uDay: { value: null }, uNight: { value: null }, uClouds: { value: null }, uSpec: { value: null },
      uHasNight: { value: 0 }, uHasClouds: { value: 0 }, uHasSpec: { value: 0 }, uSun: { value: new THREE.Vector3() }, uTime: { value: 0 } } });
}
/* ---------- prstence Saturna: osvetlené Slnkom, s tieňom planéty; planéta má na sebe tieň prstencov ---------- */
const RING_VS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const RING_FS = `uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uSun; uniform vec3 uC; uniform float uR; uniform vec3 uN; varying vec2 vUv; varying vec3 vW;
void main(){
  vec4 t = uHasMap > 0.5 ? texture2D(uMap, vUv) : vec4(0.85, 0.78, 0.6, 0.7);
  vec3 L = normalize(uSun - vW), V = normalize(cameraPosition - vW);
  // tieň planéty: lúč od čiastočky prstenca k Slnku narazí na guľu planéty
  vec3 oc = vW - uC; float b = dot(oc, L), c = dot(oc, oc) - uR * uR, h = b * b - c;
  float shadow = (h > 0.0 && b < 0.0) ? 1.0 - smoothstep(0.0, uR * uR * 0.02, h) : 1.0;
  // prstence sú z ľadových zŕn: zo strany Slnka jasné, z opačnej presvitajú slabšie
  float sameSide = step(0.0, dot(uN, L) * dot(uN, V));
  float lit = (0.35 + 0.65 * pow(abs(dot(uN, L)), 0.4)) * mix(0.45, 1.0, sameSide);
  gl_FragColor = vec4(t.rgb * (0.04 + 1.4 * lit * shadow), t.a);
  #include <colorspace_fragment>
}`;
const RING_IN = 1.24, RING_OUT = 2.27;
/** Pridá planéte (guľa s polomerom r v miestnych jednotkách) prstence. Každú snímku treba zavolať updateRing. */
export function addRing(parent: THREE.Object3D, planet: THREE.Mesh, r: number) {
  const inner = r * RING_IN, outer = r * RING_OUT, rg = new THREE.RingGeometry(inner, outer, 192, 1), pos = rg.attributes.position, uv = rg.attributes.uv, v = new THREE.Vector3();
  for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k); uv.setXY(k, (v.length() - inner) / (outer - inner), 0.5); }
  const pm = planet.material as THREE.ShaderMaterial;
  const mat = new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uSun: pm.uniforms.uSun, uC: pm.uniforms.uRingC, uR: { value: 1 }, uN: pm.uniforms.uRingN } });
  loadTex(ASSET.planets + '2k_saturn_ring_alpha.png').then(t => { if (t) { mat.uniforms.uMap.value = t; mat.uniforms.uHasMap.value = 1; pm.uniforms.uRingMap.value = t; pm.uniforms.uRing.value = 1; } });
  const ring = new THREE.Mesh(rg, mat); ring.rotation.x = -Math.PI / 2; parent.add(ring);
  ring.userData = { planet, r };
  return ring;
}
const _s = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Aktualizuje polohu, veľkosť a sklon prstencov pre tiene (svetové súradnice). */
export function updateRing(ring: THREE.Mesh) {
  const { planet, r } = ring.userData, pu = (planet.material as THREE.ShaderMaterial).uniforms, ru = (ring.material as THREE.ShaderMaterial).uniforms;
  planet.matrixWorld.decompose(pu.uRingC.value, _q, _s); const R = r * _s.x;
  ru.uR.value = R; pu.uRingR.value.set(R * RING_IN, R * RING_OUT);
  ring.getWorldQuaternion(_q); pu.uRingN.value.set(0, 0, 1).applyQuaternion(_q).normalize();
}

/* ---------- svietiaci okraj atmosféry (tenká vrstva nad povrchom, viditeľná na okraji kotúča) ---------- */
const ATMO_FS = `uniform vec3 uSun; uniform vec3 uColor; uniform float uStr; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(uSun - vW);
  float a = max(0.0, -dot(N, V));                       // 0 na vonkajšom okraji vrstvy, rastie smerom ku kotúču planéty
  float glow = pow(smoothstep(0.0, 0.3, a), 1.6);
  float day = smoothstep(-0.35, 0.3, dot(N, L));
  gl_FragColor = vec4(uColor * glow * day * uStr, 1.0);
  #include <colorspace_fragment>
}`;
/** Atmosféra okolo planéty: sunU = uniform uSun z materiálu planéty (spoločná poloha Slnka). */
export function addAtmosphere(planet: THREE.Mesh, r: number, color: string, strength = 1, thickness = 1.045) {
  const sunU = (planet.material as THREE.ShaderMaterial).uniforms.uSun;
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * thickness, 64, 32), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSun: sunU, uColor: { value: new THREE.Color(color) }, uStr: { value: strength } } }));
  planet.add(m); return m;
}
/** Mäkká žiara okolo Slnka bez viditeľného okraja. */
let glow: THREE.Texture | null = null;
export function sunGlowTex() {
  if (glow) return glow;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  [[0, 0.75], [0.12, 0.5], [0.22, 0.24], [0.4, 0.09], [0.65, 0.025], [1, 0]].forEach(([p, a]) => gr.addColorStop(p, `rgba(255,${Math.round(232 - 60 * p)},${Math.round(175 - 110 * p)},${a})`));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256); return (glow = canvasTex(c));
}

/** Najlepšia dostupná textúra: najprv 4k (zo skriptu), inak 2k. */
export async function bestTex(name: string): Promise<THREE.Texture | null> {
  return (await loadTex(ASSET.planets + '4k_' + name)) || (await loadTex(ASSET.planets + '2k_' + name));
}
export async function setPlanetTex(mat: THREE.ShaderMaterial, name: string) {
  const t = await bestTex(name); if (t) { mat.uniforms.uMap.value = t; mat.uniforms.uHasMap.value = 1; }
}
export async function setEarthTex(mat: THREE.ShaderMaterial) {
  const u = mat.uniforms;
  const day = await bestTex('earth_daymap.jpg'); if (day) u.uDay.value = day;
  const n = await bestTex('earth_nightmap.jpg'); if (n) { u.uNight.value = n; u.uHasNight.value = 1; }
  const c = await bestTex('earth_clouds.jpg'); if (c) { c.wrapS = THREE.RepeatWrapping; u.uClouds.value = c; u.uHasClouds.value = 1; }
  const s = await bestTex('earth_specular_map.jpg'); if (s) { u.uSpec.value = s; u.uHasSpec.value = 1; }
}
/** Hviezdna obloha s Mliečnou cestou okolo diváka (Solar System Scope 8k → 4k, inak ESO panoráma). */
export function starSky(parent: THREE.Object3D) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x9a9a9a, depthWrite: false });
  const s = new THREE.Mesh(new THREE.SphereGeometry(4000, 64, 32), mat); s.geometry.scale(-1, 1, 1); s.renderOrder = -30; s.frustumCulled = false;
  (async () => { const t = (await loadTex(ASSET.planets + '4k_stars_milky_way.jpg')) || (await loadTex(ASSET.milky)); if (t) { mat.map = t; mat.needsUpdate = true; } })();
  parent.add(s); return s;
}
