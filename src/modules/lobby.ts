import * as THREE from 'three';
import { ctx, D2R, ASSET, url } from '../core/context';
import { T } from '../core/i18n';
import { SET } from '../core/settings';
import { SND } from '../core/sound';
import { setHud, makeClickable } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree, canvasTex } from '../core/util';
import { toggleLang } from '../core/app';

/** Úvodná scéna s logom a „portálmi“ do jednotlivých zážitkov. */
const ITEMS = [
  { id: 'cosmos', label: { sk: 'Od Zeme po galaxie', en: 'Earth to galaxies' }, icon: 'galaxy' },
  { id: 'solar', label: { sk: 'Let Slnečnou sústavou', en: 'Solar System flight' }, tex: '2k_sun.jpg', c: '#ffb347' },
  { id: 'aurora', label: { sk: 'Polárna žiara', en: 'Aurora' }, icon: 'aurora' },
  { id: 'trips', label: { sk: 'Výlety v 360°', en: '360° trips' }, tex: '2k_mars.jpg', c: '#c1440e' },
  { id: 'depth', label: { sk: 'Hĺbka oblohy', en: 'Depth of the sky' }, icon: 'stars' },
  { id: 'planets', label: { sk: 'Planéty v ruke', en: 'Planets in hand' }, tex: '2k_jupiter.jpg', c: '#d8b48a' },
  { id: 'phases', label: { sk: 'Fázy Mesiaca', en: 'Moon phases' }, icon: 'phases' },
  { id: 'gravity', label: { sk: 'Gravitácia', en: 'Gravity' }, tex: '2k_moon.jpg', c: '#b8b8b8' },
  { id: 'machines', label: { sk: 'Stroje 1 : 1', en: 'Machines 1 : 1' }, icon: 'rover' },
  { id: 'quiz', label: { sk: 'Kvíz', en: 'Quiz' }, icon: 'quiz' }
];
let taps: number[] = [];
function logoTap() { // 5× rýchlo ťuknúť na logo = režim obsluhy
  const n = performance.now(); taps = taps.filter(x => n - x < 4000); taps.push(n);
  if (taps.length >= 5) { taps = []; SND.chime(); ctx.goTo('operator'); }
}
function iconTex(kind: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d')!;
  if (kind === 'galaxy') {   // špirálová galaxia
    g.fillStyle = '#02030a'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2600; i++) { const arm = i % 2 ? 0 : Math.PI, r = Math.random() ** 0.8 * 110, th = r * 0.045 + arm + (Math.random() - 0.5) * 0.7;
      const x = 128 + Math.cos(th) * r, y = 128 + Math.sin(th) * r * 0.75, c = r < 25 ? '255,220,160' : (Math.random() < 0.7 ? '170,195,255' : '255,150,200');
      g.fillStyle = `rgba(${c},${0.35 + Math.random() * 0.5})`; g.fillRect(x, y, 1.6, 1.6); g.fillRect(x + 256, y, 1.6, 1.6); }
  } else if (kind === 'aurora') {   // zelené závesy na nočnej oblohe
    g.fillStyle = '#040a14'; g.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 2) { const h = 60 + 40 * Math.sin(x * 0.03) + 25 * Math.sin(x * 0.11); const gr = g.createLinearGradient(0, 200 - h, 0, 200);
      gr.addColorStop(0, 'rgba(255,60,90,0)'); gr.addColorStop(0.5, 'rgba(60,255,140,0.5)'); gr.addColorStop(1, 'rgba(120,255,170,0.9)'); g.fillStyle = gr; g.fillRect(x, 200 - h, 2, h); }
  } else if (kind === 'phases') {   // polovica osvetlená, polovica v tieni
    g.fillStyle = '#0d0f18'; g.fillRect(0, 0, 512, 256);
    const gr = g.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, '#d9d6cf'); gr.addColorStop(0.45, '#bdb9b0'); gr.addColorStop(0.5, '#15171f'); gr.addColorStop(1, '#0d0f18');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(80,80,80,.35)'; g.beginPath(); g.arc(Math.random() * 230, Math.random() * 256, Math.random() * 10 + 2, 0, 7); g.fill(); }
  } else if (kind === 'stars') {
    g.fillStyle = '#0a1338'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 220; i++) { g.fillStyle = Math.random() < 0.15 ? '#ffb46b' : '#dfe8ff'; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 256, Math.random() * 1.8 + 0.4, 0, 7); g.fill(); }
  } else {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    if (kind === 'rover') { gr.addColorStop(0, '#d9a066'); gr.addColorStop(1, '#7a3f1c'); } else { gr.addColorStop(0, '#6a8cff'); gr.addColorStop(1, '#2b2f8a'); }
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256); g.fillStyle = 'rgba(255,255,255,.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const s = kind === 'rover' ? '1:1' : '?'; g.font = `700 ${kind === 'rover' ? 54 : 90}px Figtree, system-ui, sans-serif`;
    [64, 192, 320, 448].forEach(x => g.fillText(s, x, 132));
  }
  return canvasTex(c);
}

export const lobby: any = {
  stars: true, root: new THREE.Group(), portals: [],
  build() {
    const r = this.root; ctx.anchor.add(r);
    loadTex(url('logo-white.png')).then(t => {
      if (!t) return; const img = t.image as HTMLImageElement, a = img.width / img.height, w = 2.6;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w / a), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
      p.position.set(0, 1.95, -6.0); p.lookAt(0, 0, 0); r.add(p); makeClickable(p, { onClick: logoTap });
    });
    loadTex(ASSET.milky).then(t => {
      if (!t) return;
      const s = new THREE.Mesh(new THREE.SphereGeometry(55, 64, 32), new THREE.MeshBasicMaterial({ map: t, color: 0x777777, depthWrite: false }));
      s.geometry.scale(-1, 1, 1); s.renderOrder = -15; r.add(s); this.milky = s;
    });
    ITEMS.forEach(it => {
      const g = new THREE.Group(); r.add(g);
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(it.c || '#334477'), roughness: 0.9, metalness: 0 });
      if (it.icon) { mat.map = iconTex(it.icon); mat.color.set('#ffffff'); mat.emissive = new THREE.Color('#ffffff'); mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.55; }
      if (it.tex) loadTex(ASSET.planets + it.tex).then(t => { if (t) { mat.map = t; mat.color.set('#ffffff'); mat.needsUpdate = true; } });
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.15, 48, 24), mat); g.add(s);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.195, 64), new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      g.add(halo);
      const lab = textSprite(T(it.label), '#e9ecf7', 60); setSpriteH(lab, 0.065); lab.position.y = -0.25; g.add(lab);
      g.userData = { s, halo, lab, it, hover: false };
      makeClickable(s, { onClick: () => ctx.goTo(it.id), onHover: v => { g.userData.hover = v; } });
      this.portals.push(g);
    });
  },
  layout() {
    const on = this.portals.filter((p: any) => SET.mods[p.userData.it.id]);
    this.portals.forEach((p: any) => { p.visible = on.includes(p); });
    // viac ako 6 zážitkov: dva rady nad sebou, aby sa guľe a mená neprekrývali
    const rows = on.length > 6 ? [on.slice(0, Math.ceil(on.length / 2)), on.slice(Math.ceil(on.length / 2))] : [on];
    rows.forEach((row: any[], ri: number) => {
      const n = row.length, span = Math.min(100, 22 * (n - 1)), y = rows.length > 1 ? (ri === 0 ? 0.16 : -0.34) : -0.02;
      row.forEach((g, i) => { const ang = (n > 1 ? -span / 2 + span * i / (n - 1) : 0) * D2R, R = 1.9; g.position.set(Math.sin(ang) * R, y, -Math.cos(ang) * R); g.userData.y0 = y; });
    });
  },
  relabel() {
    this.portals.forEach(p => { p.remove(p.userData.lab); disposeTree(p.userData.lab); const l = textSprite(T(p.userData.it.label), '#e9ecf7', 60); setSpriteH(l, 0.065); l.position.y = -0.25; p.add(l); p.userData.lab = l; });
  },
  enter() { this.root.visible = true; this.layout(); this.hud!(); },
  hud() {
    setHud({ kicker: 'KHaP MH', title: ctx.content.ui.title,
      body: { sk: 'Vyberte si zážitok: ukážte lúčom na guľu a štipnite prstami. Domov sa vrátite tlačidlom Domov alebo dlhým štipnutím.', en: 'Choose an experience: point at a sphere and pinch. Return with the Home button or a long pinch.' },
      actions: [{ label: T(ctx.content.ui.lang), onClick: toggleLang }, { label: T(ctx.content.ui.recenter), onClick: ctx.recenter },
        { label: T(ctx.content.ui.credits), onClick: () => ctx.goTo('credits') }] });
  },
  exit() { this.root.visible = false; },
  update(dt, t) {
    const head = ctx.anchor.localToWorld(new THREE.Vector3());
    this.portals.forEach((p, i) => {
      const u = p.userData; u.s.rotation.y += dt * 0.25;
      const k = u.hover ? 1.3 : 1; p.scale.lerp(new THREE.Vector3(k, k, k), Math.min(1, dt * 10));
      u.halo.material.opacity += ((u.hover ? 0.9 : 0) - u.halo.material.opacity) * Math.min(1, dt * 10);
      u.halo.lookAt(head); p.position.y = (u.y0 ?? -0.02) + Math.sin(t * 0.9 + i) * 0.012;
    });
    if (this.milky) this.milky.visible = !ctx.isAR;
  }
};
