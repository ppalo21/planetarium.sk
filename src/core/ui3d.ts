import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ctx, url, type Txt } from './context';
import { T, L, en } from './i18n';
import { SND } from './sound';

/* ---------------- klikateľné objekty ---------------- */
export interface Clickable {
  onClick?: () => void;
  onHover?: (v: boolean) => void;
  grab?: { start: (c: THREE.XRTargetRaySpace) => void; end: (c: THREE.XRTargetRaySpace) => void };
}
export const clickables = new Set<THREE.Object3D>();
export function makeClickable(o: THREE.Object3D, cfg: Clickable) { o.userData.click = cfg; clickables.add(o); }
export function isVisible(o: THREE.Object3D | null) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }

/* ---------------- ostré písmo (SDF, troika) ---------------- */
export const FONT = { regular: url('fonts/Figtree-Regular.ttf'), semibold: url('fonts/Figtree-SemiBold.ttf'), bold: url('fonts/Figtree-Bold.ttf') };
export function makeText(str: string, o: { size: number; color?: string | number; font?: string; maxWidth?: number; anchorX?: any; anchorY?: any; lineHeight?: number; order?: number }) {
  const t = new Text();
  t.text = str; t.fontSize = o.size; t.color = o.color ?? '#e9ecf7'; t.font = o.font ?? FONT.regular;
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  t.anchorX = o.anchorX ?? 'left'; t.anchorY = o.anchorY ?? 'top'; t.lineHeight = o.lineHeight ?? 1.25;
  t.material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  t.renderOrder = o.order ?? 22; t.sync(); return t;
}
function rrGeo(w: number, h: number, r: number) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return { fill: new THREE.ShapeGeometry(s, 8), line: new THREE.BufferGeometry().setFromPoints(s.getPoints(8)) };
}

/* ---------------- tlačidlo ---------------- */
export interface BtnCfg { label: string; onClick: () => void; primary?: boolean; active?: boolean; tone?: 'good' | 'bad' | null }
export function makeButton(b: BtnCfg, w: number, h: number) {
  const g = new THREE.Group(), geo = rrGeo(w, h, h * 0.3);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  const bg = new THREE.Mesh(geo.fill, mat); bg.renderOrder = 21; g.add(bg);
  const ol = new THREE.LineLoop(geo.line, new THREE.LineBasicMaterial({ transparent: true, depthTest: false })); ol.renderOrder = 21; g.add(ol);
  const fs = Math.min(h * 0.42, (w * 0.86) / Math.max(4, b.label.length * 0.52));
  const tx = makeText(b.label, { size: fs, font: FONT.semibold, anchorX: 'center', anchorY: 'middle', order: 23 }); tx.position.z = 0.001; g.add(tx);
  let hover = false;
  const paint = () => {
    let bgc = '#0c1434', fg = '#e9ecf7', bd = '#7f97c9';
    if (b.tone === 'good') { bgc = '#3fae6a'; fg = '#04210f'; bd = bgc; }
    else if (b.tone === 'bad') { bgc = '#c8504a'; fg = '#ffffff'; bd = bgc; }
    else if (b.active) { bgc = '#ffb46b'; fg = '#2a1300'; bd = bgc; }
    else if (b.primary) { bgc = '#9fc0ff'; fg = '#071033'; bd = bgc; }
    if (hover && !b.active && !b.tone) bgc = b.primary ? '#c4d8ff' : '#2a3a6e';
    mat.color.set(bgc); mat.opacity = 0.96; (ol.material as THREE.LineBasicMaterial).color.set(bd); tx.color = fg;
  };
  paint();
  makeClickable(bg, { onClick: b.onClick, onHover: v => { hover = v; paint(); } });
  g.userData.dispose = () => { clickables.delete(bg); geo.fill.dispose(); geo.line.dispose(); mat.dispose(); (ol.material as THREE.Material).dispose(); tx.dispose(); };
  g.userData.bg = bg;
  return g;
}

/* ---------------- informačná tabuľa (HUD) ---------------- */
export interface HudCfg { kicker?: Txt; title: Txt; body?: Txt; credit?: Txt | null; rows?: BtnCfg[][]; home?: boolean; autoHide?: boolean }
export const HUD_W = 1.3, HUD_H = 0.36;
export const hudYaw = new THREE.Group();
export const hud = new THREE.Group();
let panel: THREE.Group, tKicker: Text, tTitle: Text, tBody: Text, tCredit: Text;
let cfg: HudCfg | null = null, mode: 'full' | 'mini' = 'full', timer = 0, keep = false, yawTarget = 0;
let buttons: THREE.Group[] = [];
const AUTOHIDE = 9;

export function initHud() {
  ctx.anchor.add(hudYaw); hudYaw.add(hud);
  hud.position.set(0, -0.56, -1.0); hud.rotation.x = -Math.atan(0.56 / 1.0);   // natočené kolmo k očiam
  panel = new THREE.Group(); panel.position.y = 0.13; hud.add(panel);
  const geo = rrGeo(HUD_W, HUD_H, 0.035);
  const bg = new THREE.Mesh(geo.fill, new THREE.MeshBasicMaterial({ color: '#080e28', transparent: true, opacity: 0.93, depthTest: false, depthWrite: false })); bg.renderOrder = 20; panel.add(bg);
  const ol = new THREE.LineLoop(geo.line, new THREE.LineBasicMaterial({ color: '#2b3a6b', transparent: true, depthTest: false })); ol.renderOrder = 20; panel.add(ol);
  const x0 = -HUD_W / 2 + 0.045, top = HUD_H / 2 - 0.03;
  tKicker = makeText('', { size: 0.022, color: '#8a93b8', font: FONT.semibold }); tKicker.position.set(x0, top, 0.001);
  tTitle = makeText('', { size: 0.042, color: '#ffb46b', font: FONT.bold }); tTitle.position.set(x0, top - 0.04, 0.001);
  tBody = makeText('', { size: 0.029, maxWidth: HUD_W - 0.09, lineHeight: 1.3 }); tBody.position.set(x0, top - 0.1, 0.001);
  (tBody as any).clipRect = [-0.01, -(HUD_H - 0.14), HUD_W, 0.01];
  tCredit = makeText('', { size: 0.017, color: '#8a93b8' }); tCredit.position.set(x0, -HUD_H / 2 + 0.035, 0.001);
  panel.add(tKicker, tTitle, tBody, tCredit);
}
function autoOK() { return !!cfg && cfg.autoHide !== false && !['lobby', 'quiz', 'intro', 'thanks', 'operator'].includes(ctx.current); }

export function setHud(c: HudCfg) { cfg = c; if (!keep) mode = 'full'; keep = false; timer = 0; buildHud(); }
/** Ďalšie setHud nezmení zbalenie tabule (napr. pri prepnutí prepínača). */
export function keepHud() { keep = true; }
export function hudCfg() { return cfg; }
export function setHudMode(m: 'full' | 'mini') { mode = m; timer = 0; buildHud(); }
export function buildHud() {
  if (!cfg) return;
  buttons.forEach(b => { hud.remove(b); b.userData.dispose(); }); buttons = [];
  const gap = 0.014, h = 0.072;
  const wrap = (fn: () => void) => () => { timer = 0; ctx.lastAct = performance.now(); fn(); };
  let rows: BtnCfg[][];
  const mini = mode === 'mini' && autoOK();
  panel.visible = !mini;
  if (mini) {
    const last = cfg.rows?.length ? cfg.rows[cfg.rows.length - 1] : [];
    rows = [[{ label: 'Info', onClick: () => setHudMode('full') }, ...last, ...(cfg.home !== false ? [{ label: T({ sk: 'Domov', en: 'Home' }), onClick: ctx.goHome }] : [])]];
  } else {
    tKicker.text = T(cfg.kicker); const title = T(cfg.title);
    tTitle.text = title; tTitle.fontSize = Math.min(0.042, (HUD_W - 0.09) / Math.max(1, title.length * 0.5));
    tBody.text = T(cfg.body); tCredit.text = cfg.credit ? '© ' + T(cfg.credit) : '';
    [tKicker, tTitle, tBody, tCredit].forEach(t => t.sync());
    rows = (cfg.rows || []).map(r => r.slice());
    const extra: BtnCfg[] = [];
    if (autoOK()) extra.push({ label: en() ? 'Hide ↓' : 'Skryť ↓', onClick: () => setHudMode('mini') });
    if (cfg.home !== false && ctx.current !== 'lobby') extra.push({ label: T({ sk: 'Domov', en: 'Home' }), onClick: ctx.goHome });
    if (extra.length) rows.push(extra);
  }
  rows.forEach((row, ri) => {
    const n = row.length, w = Math.min(n > 3 ? (HUD_W - gap * (n - 1)) / n : 0.34, (HUD_W - gap * (n - 1)) / n), total = n * w + (n - 1) * gap;
    row.forEach((b, i) => {
      const m = makeButton({ ...b, onClick: wrap(b.onClick) }, w, h);
      m.position.set(-total / 2 + w / 2 + i * (w + gap), (mini ? -0.02 : -0.115) - ri * (h + 0.016), 0.002);
      m.userData.bg.userData.isHud = true; hud.add(m); buttons.push(m);
    });
  });
}
export function hudTick(dt: number, hovered: Set<THREE.Object3D>) {
  // automatické zbalenie tabule
  if (mode === 'full' && autoOK()) {
    let looking = false; hovered.forEach(o => { if (o.userData.isHud) looking = true; });
    if (looking) timer = 0; else { timer += dt; if (timer > AUTOHIDE) setHudMode('mini'); }
  }
  // menu pomaly nasleduje pohľad, keď sa otočíte o viac ako 40°
  const q = new THREE.Quaternion();
  (ctx.renderer.xr.isPresenting ? ctx.renderer.xr.getCamera() : ctx.camera).getWorldQuaternion(q);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const head = e.y - ctx.anchor.rotation.y, wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(wrapA(head - yawTarget)) > 40 * Math.PI / 180) yawTarget = head;
  hudYaw.rotation.y += wrapA(yawTarget - hudYaw.rotation.y) * Math.min(1, dt * 3);
}
export function resetHudYaw() { yawTarget = 0; hudYaw.rotation.y = 0; }
export { L, SND };
