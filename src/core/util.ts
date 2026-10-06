import * as THREE from 'three';
import { ctx } from './context';

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture | null>>();

/** Načíta obrázok ako textúru (sRGB, s mipmapami). Pri chybe vráti null. */
export function loadTex(src: string): Promise<THREE.Texture | null> {
  if (!cache.has(src)) cache.set(src, new Promise(res => loader.load(src, t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy());
    res(t);
  }, undefined, () => res(null))));
  return cache.get(src)!;
}
/** Uvoľní textúru z pamäte grafiky (napr. veľkú panorámu). */
export function freeTex(src: string, t?: THREE.Texture | null) { t?.dispose(); cache.delete(src); }

export function canvasTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; return t;
}
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function disposeTree(o: THREE.Object3D) {
  o.traverse((n: any) => {
    if (n.geometry) n.geometry.dispose();
    if (n.dispose && n.isMesh && n.text !== undefined) n.dispose(); // troika Text
    if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m: any) => { if (m.map?.isCanvasTexture) m.map.dispose(); m.dispose(); });
  });
}

/** Popisok v priestore, ktorý sa vždy otáča k divákovi (sprite z canvasu). */
export function textSprite(lines: string | string[], colors: string | string[], px: number, weight = 600): THREE.Sprite {
  const ls = Array.isArray(lines) ? lines : [lines];
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  const f = (i: number) => `${i === 0 ? weight : 400} ${i === 0 ? px : Math.round(px * 0.8)}px Figtree, system-ui, sans-serif`;
  let w = 0; ls.forEach((l, i) => { g.font = f(i); w = Math.max(w, g.measureText(l).width); });
  c.width = Math.ceil(w + px); c.height = Math.ceil(px * 1.3 * ls.length + px * 0.4);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = px * 0.25;
  ls.forEach((l, i) => { g.font = f(i); g.fillStyle = Array.isArray(colors) ? colors[i] : colors; g.fillText(l, c.width / 2, px * 0.85 + i * px * 1.3); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false }));
  s.userData.aspect = c.width / c.height; s.userData.lines = ls.length; return s;
}
export function setSpriteH(s: THREE.Sprite, h: number) { s.scale.set(h * s.userData.aspect, h, 1); }

export function gradTex(top: string, bottom: string) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, top); gr.addColorStop(0.5, top); gr.addColorStop(0.5, bottom); gr.addColorStop(1, bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256); return canvasTex(c);
}
const starCache: Record<string, THREE.Texture> = {};
export function starTex(color: string, soft: boolean) {
  const k = color + soft; if (starCache[k]) return starCache[k];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (soft) { gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00'); }
  else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, '#ffffff'); gr.addColorStop(0.32, color); gr.addColorStop(0.6, color + '44'); gr.addColorStop(1, color + '00'); }
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (starCache[k] = t);
}
/** Poloha hlavy diváka vo svete (vo VR aj na PC). */
export function camWorld() {
  const v = new THREE.Vector3();
  (ctx.renderer.xr.isPresenting ? ctx.renderer.xr.getCamera() : ctx.camera).getWorldPosition(v);
  return v;
}
/** Smer na guli z geografickej šírky a dĺžky (0° dĺžky v strede textúry). */
export function sphereDir(latDeg: number, lonDeg: number) {
  const la = latDeg * Math.PI / 180, ph = (lonDeg + 180) * Math.PI / 180;
  return new THREE.Vector3(-Math.cos(ph) * Math.cos(la), Math.sin(la), Math.sin(ph) * Math.cos(la));
}
