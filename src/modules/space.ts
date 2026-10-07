import * as THREE from 'three';
import { ASSET } from '../core/context';
import { loadTex } from '../core/util';

/* Spoločné materiály pre vesmírne scény: planéty osvetlené skutočnou polohou Slnka,
   Zem s nočnými mestami, oblakmi, odleskom oceánov a atmosférou. */

const VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const PLANET_FS = `uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uColor; uniform vec3 uSun; uniform vec3 uAtmo; uniform float uAtmoStr;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N=normalize(vN), L=normalize(uSun-vW), V=normalize(cameraPosition-vW);
  vec3 base = uHasMap>0.5 ? texture2D(uMap,vUv).rgb : uColor;
  float d=dot(N,L);
  vec3 col = base*(0.015 + 1.15*max(d,0.0)*smoothstep(-0.05,0.12,d));
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
    uniforms: { uMap: { value: null }, uHasMap: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSun: { value: new THREE.Vector3() }, uAtmo: { value: new THREE.Color(atmo) }, uAtmoStr: { value: atmoStr } } });
}
export function earthMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: EARTH_FS,
    uniforms: { uDay: { value: null }, uNight: { value: null }, uClouds: { value: null }, uSpec: { value: null },
      uHasNight: { value: 0 }, uHasClouds: { value: 0 }, uHasSpec: { value: 0 }, uSun: { value: new THREE.Vector3() }, uTime: { value: 0 } } });
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
