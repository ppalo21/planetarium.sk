import * as THREE from 'three';
import { Text, preloadFont } from 'troika-three-text';
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
/** Písma sa načítajú postupne ešte pred vytvorením tabule (súbežné načítanie troika niekedy zasekne). */
export async function preloadFonts() {
  const chars = 'aáäbcčdďeéfghiíjklĺľmnňoóôpqrŕsštťuúvwxyýzžAÁÄBCČDĎEÉFGHIÍJKLĹĽMNŇOÓÔPQRŔSŠTŤUÚVWXYÝZŽ0123456789 .,:;!?()-–/×°‹›↓…';
  const one = (f: string) => new Promise<void>(res => { preloadFont({ font: f, characters: chars }, () => res()); setTimeout(res, 6000); }); // poistka: appka sa spustí aj keby sa písmo zdržalo
  for (const f of [FONT.regular, FONT.semibold, FONT.bold]) await one(f);
}
export function makeText(str: string, o: { size: number; color?: string | number; font?: string; maxWidth?: number; anchorX?: any; anchorY?: any; lineHeight?: number; order?: number }) {
  const t = new Text();
  t.text = str; (t as any).gpuAccelerateSDF = false; t.fontSize = o.size; t.color = o.color ?? '#e9ecf7'; t.font = o.font ?? FONT.regular;
  if (o.maxWidth) t.maxWidth = o.maxWidth;
  t.anchorX = o.anchorX ?? 'left'; t.anchorY = o.anchorY ?? 'top'; t.lineHeight = o.lineHeight ?? 1.25;
  t.material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false });
  t.renderOrder = o.order ?? 22; if (str) t.sync(); return t;
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
  const fs = b.label.length <= 2 ? h * 0.55 : Math.min(h * 0.42, (w * 0.86) / Math.max(4, b.label.length * 0.52));
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
  g.userData.bg = bg; bg.userData.size = [w, h];
  return g;
}

/* ---------------- ovládací panel: lišta tlačidiel + krátky popis nad ňou ----------------
   Lišta je vždy dole a má najviac pár veľkých tlačidiel: ‹  [voľby modulu]  Domov  ›
   Popis (nadpis + 1–3 vety) sa ukáže pri zmene a po pár sekundách sám zmizne; tlačidlo Info ho vráti. */
export interface HudCfg {
  kicker?: Txt; title: Txt; body?: Txt; credit?: Txt | null;
  /** voľby modulu v lište (najviac 2–3) */
  actions?: BtnCfg[];
  prev?: () => void; next?: () => void;
  /** viac riadkov tlačidiel (kvíz, obsluha) – popis vtedy nezmizne */
  rows?: BtnCfg[][];
  home?: boolean;
  /** popis nikdy nezmizne */
  sticky?: boolean;
}
export const HUD_W = 1.2, HUD_H = 0.34;
const BTN_H = 0.075, GAP = 0.016;
export const hudYaw = new THREE.Group();
export const hud = new THREE.Group();
let panel: THREE.Group, tKicker: Text, tTitle: Text, tBody: Text, tCredit: Text, panelBg: THREE.Mesh, panelOl: THREE.LineLoop;
let cfg: HudCfg | null = null, captionOn = true, timer = 0, keep = false, yawTarget = 0, barTop = BTN_H / 2;
let buttons: THREE.Group[] = [];
const CAPTION_S = 8;

export function initHud() {
  ctx.anchor.add(hudYaw); hudYaw.add(hud);
  near = true; setHudNear(false);
  panel = new THREE.Group(); hud.add(panel);
  const geo = rrGeo(HUD_W, HUD_H, 0.035);
  const bg = panelBg = new THREE.Mesh(geo.fill, new THREE.MeshBasicMaterial({ color: '#080e28', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false })); bg.renderOrder = 20; panel.add(bg);
  const ol = panelOl = new THREE.LineLoop(geo.line, new THREE.LineBasicMaterial({ color: '#2b3a6b', transparent: true, depthTest: false })); ol.renderOrder = 20; panel.add(ol);
  tKicker = makeText('', { size: 0.021, color: '#8a93b8', font: FONT.semibold });
  tTitle = makeText('', { size: 0.04, color: '#ffb46b', font: FONT.bold });
  tBody = makeText('', { size: 0.028, maxWidth: HUD_W - 0.09, lineHeight: 1.3 });
  tCredit = makeText('', { size: 0.016, color: '#8a93b8' });
  panel.add(tKicker, tTitle, tBody, tCredit);
}
function stickyNow() { return !cfg || cfg.sticky || !!cfg.rows || ['lobby', 'intro', 'thanks', 'operator'].includes(ctx.current); }

export function setHud(c: HudCfg) { cfg = c; if (!keep) captionOn = true; keep = false; timer = 0; buildHud(); }
/** Ďalšie setHud nechá popis tak, ako je (skrytý zostane skrytý) – pri prepínačoch. */
export function keepHud() { keep = true; }
export function hudCfg() { return cfg; }
/** Zmení len text popisu (bez prestavby tlačidiel) – pre priebežne sa meniace údaje. */
export function setCaption(c: { kicker?: Txt; title?: Txt; body?: Txt }) {
  if (!cfg) return; Object.assign(cfg, c);
  if (c.kicker !== undefined) { tKicker.text = T(c.kicker); tKicker.sync(); }
  if (c.title !== undefined) { const s = T(c.title); tTitle.text = s; tTitle.fontSize = Math.min(0.04, (HUD_W - 0.09) / Math.max(1, s.length * 0.5)); tTitle.sync(); }
  if (c.body !== undefined) { tBody.text = T(c.body); tBody.sync(() => relayout()); }
}
function toggleCaption() { captionOn = !captionOn; timer = 0; buildHud(); }

export function buildHud() {
  if (!cfg) return;
  buttons.forEach(b => { hud.remove(b); b.userData.dispose(); }); buttons = [];
  const wrap = (fn: () => void) => () => { timer = 0; ctx.lastAct = performance.now(); fn(); };
  const home = cfg.home !== false && ctx.current !== 'lobby';
  let rows: BtnCfg[][];
  if (cfg.rows) {
    rows = cfg.rows.map(r => r.slice());
    if (home) rows.push([{ label: T({ sk: 'Domov', en: 'Home' }), onClick: ctx.goHome }]);
  } else {
    const bar: BtnCfg[] = [];
    if (!stickyNow()) bar.push({ label: 'Info', onClick: toggleCaption, active: captionOn });
    if (cfg.prev) bar.push({ label: '‹', onClick: cfg.prev });
    bar.push(...(cfg.actions || []));
    if (home) bar.push({ label: T({ sk: 'Domov', en: 'Home' }), onClick: ctx.goHome });
    if (cfg.next) bar.push({ label: '›', onClick: cfg.next, primary: true });
    rows = [bar];
  }
  // riadky odspodu nahor: posledný riadok je pri y = 0
  rows.forEach((row, ri) => {
    const fromBottom = rows.length - 1 - ri;
    const widths = row.map(b => (b.label.length <= 1 ? 0.11 : b.label === 'Info' ? 0.16 : Math.min(0.34, Math.max(0.2, 0.035 + b.label.length * 0.017))));
    const sum = widths.reduce((a, b) => a + b, 0) + GAP * (row.length - 1), k = sum > HUD_W ? HUD_W / sum : 1;
    let x = -sum * k / 2;
    row.forEach((b, i) => {
      const w = widths[i] * k, m = makeButton({ ...b, onClick: wrap(b.onClick) }, w, BTN_H);
      m.position.set(x + w / 2, fromBottom * (BTN_H + GAP), 0.002); x += w + GAP * k;
      m.userData.bg.userData.isHud = true; hud.add(m); buttons.push(m);
    });
  });
  barTop = (rows.length - 1) * (BTN_H + GAP) + BTN_H / 2;
  panel.visible = captionOn || stickyNow();
  if (panel.visible) {
    tKicker.text = T(cfg.kicker); const title = T(cfg.title);
    tTitle.text = title; tTitle.fontSize = Math.min(0.04, (HUD_W - 0.09) / Math.max(1, title.length * 0.5));
    tBody.text = T(cfg.body); tCredit.text = cfg.credit ? '© ' + T(cfg.credit) : '';
    [tKicker, tTitle, tCredit].forEach(t => t.sync());
    tBody.sync(() => relayout());
  }
}
/** Popis nad lištou: výška podľa dĺžky textu. */
function relayout() {
  if (!panel.visible) return;
  const info = (tBody as any).textRenderInfo; if (!info) return;
  const bodyH = Math.min(info.blockBounds[3] - info.blockBounds[1], HUD_H - 0.12);
  const h = Math.max(0.12, 0.1 + (tBody.text ? bodyH + 0.015 : 0) + (tCredit.text ? 0.03 : 0));
  const geo = rrGeo(HUD_W, h, 0.03);
  panelBg.geometry.dispose(); panelBg.geometry = geo.fill; panelOl.geometry.dispose(); panelOl.geometry = geo.line;
  panel.position.y = barTop + 0.025 + h / 2;
  const top = h / 2 - 0.025, x0 = -HUD_W / 2 + 0.045;
  tKicker.position.set(x0, top, 0.001); tTitle.position.set(x0, top - 0.032, 0.001); tBody.position.set(x0, top - 0.088, 0.001);
  tCredit.position.set(x0, -h / 2 + 0.03, 0.001);
}
export function hudTick(dt: number, hovered: Set<THREE.Object3D>) {
  // popis po pár sekundách sám zmizne (ostane len lišta tlačidiel)
  if (captionOn && !stickyNow() && panel.visible) {
    let looking = false; hovered.forEach(o => { if (o.userData.isHud) looking = true; });
    if (looking) timer = 0; else { timer += dt; if (timer > CAPTION_S) { captionOn = false; buildHud(); } }
  }
  // lišta pomaly nasleduje pohľad, keď sa otočíte o viac ako 40°
  const q = new THREE.Quaternion();
  (ctx.renderer.xr.isPresenting ? ctx.renderer.xr.getCamera() : ctx.camera).getWorldQuaternion(q);
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const head = e.y - ctx.anchor.rotation.y, wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.abs(wrapA(head - yawTarget)) > 40 * Math.PI / 180) yawTarget = head;
  hudYaw.rotation.y += wrapA(yawTarget - hudYaw.rotation.y) * Math.min(1, dt * 3);
}
export function resetHudYaw() { yawTarget = 0; hudYaw.rotation.y = 0; }
/** Pri rukách je lišta blízko a nízko (na dosah prsta), pri ovládačoch ďalej (lúč). Vždy pod obsahom. */
let near = false;
export function setHudNear(v: boolean) {
  if (v === near) return; near = v;
  if (v) { hud.position.set(0, -0.4, -0.42); hud.rotation.x = -Math.atan(0.4 / 0.42); hud.scale.setScalar(0.5); }
  else { hud.position.set(0, -0.62, -1.0); hud.rotation.x = -Math.atan(0.62 / 1.0); hud.scale.setScalar(1); }
}
export function hudButtons() { return buttons; }
export { L, SND };
