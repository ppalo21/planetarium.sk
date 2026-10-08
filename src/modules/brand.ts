import * as THREE from 'three';
import { Text } from 'troika-three-text';
import { ctx, url, ASSET } from '../core/context';
import { T, en } from '../core/i18n';
import { SET } from '../core/settings';
import { SND } from '../core/sound';
import { setHud, makeText, FONT } from '../core/ui3d';
import { loadTex } from '../core/util';

/* =====================================================================
   INTRO VIDEO – logo planetária pri spustení
   Súbor: public/intro/intro.mp4 (H.264), náhradne public/intro/intro.webm.
   Video je „dvojposchodové“: hore obraz, dole maska priehľadnosti (biela = vidieť, čierna = priehľadné).
   Vďaka tomu sa logo a zábery vznášajú priamo medzi hviezdami appky, bez obdĺžnika okolo.
   Obyčajné video (bez masky) funguje tiež – zobrazí sa s mäkkými okrajmi.
   Ak súbor chýba, appka úvod jednoducho preskočí.
   ===================================================================== */
const INTRO_FILES: [string, string][] = [['intro/intro.mp4', 'video/mp4'], ['intro/intro.webm', 'video/webm']];
let video: HTMLVideoElement | null = null, ready: Promise<boolean> | null = null;

/** Jedno video pre celú appku. Vráti true, ak sa súbor našiel a dá sa prehrať. */
export function prepIntro(): Promise<boolean> {
  if (ready) return ready;
  const v = video = document.createElement('video');
  v.playsInline = true; v.preload = 'metadata'; v.crossOrigin = 'anonymous';
  ready = new Promise<boolean>(res => {
    const t = setTimeout(() => res(false), 8000), end = (ok: boolean) => { clearTimeout(t); res(ok); };
    v.addEventListener('loadedmetadata', () => end(v.videoWidth > 0), { once: true });
    INTRO_FILES.forEach(([f, type], i) => {
      const s = document.createElement('source'); s.src = url(f); s.type = type;
      if (i === INTRO_FILES.length - 1) s.addEventListener('error', () => end(false));
      v.append(s);
    });
    v.load();
  });
  return ready;
}
export const introUrls = () => INTRO_FILES.map(f => f[0]);

const INTRO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const INTRO_FS = `uniform sampler2D uMap; uniform float uStacked; uniform float uFade; varying vec2 vUv;
void main(){
  vec4 c; float a;
  if (uStacked > 0.5) {
    c = texture2D(uMap, vec2(vUv.x, 0.5 + vUv.y * 0.5));                       // horná polovica: obraz
    a = pow(texture2D(uMap, vec2(vUv.x, vUv.y * 0.5)).g, 0.4545);              // dolná polovica: maska
  } else {
    c = texture2D(uMap, vUv);
    vec2 d = abs(vUv - 0.5) * 2.0; a = (1.0 - smoothstep(0.8, 1.0, d.x)) * (1.0 - smoothstep(0.75, 1.0, d.y));   // mäkké okraje
  }
  a *= smoothstep(0.012, 0.08, max(c.r, max(c.g, c.b)));                     // tmavý závoj okolo loga zmizne
  gl_FragColor = vec4(c.rgb, a * uFade);
  #include <colorspace_fragment>
}`;

export const introVideo: any = {
  stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.anchor.add(r);
    // rovnaké pozadie ako v ponuke: hviezdy + Mliečna cesta
    loadTex(ASSET.milky).then(t => {
      if (!t) return;
      const s = new THREE.Mesh(new THREE.SphereGeometry(55, 64, 32), new THREE.MeshBasicMaterial({ map: t, color: 0x777777, depthWrite: false }));
      s.geometry.scale(-1, 1, 1); s.renderOrder = -15; r.add(s); this.milky = s;
    });
    // mierne zakrivená plocha 5,4 m široká vo vzdialenosti 3,4 m – obraz sa vznáša medzi hviezdami (okraje sú priehľadné)
    const W = 5.4, R = 3.4, ang = W / R;
    const geo = new THREE.CylinderGeometry(R, R, 1, 64, 1, true, Math.PI - ang / 2, ang); geo.scale(-1, 1, 1);
    this.W = W;
    this.mat = new THREE.ShaderMaterial({ vertexShader: INTRO_VS, fragmentShader: INTRO_FS, transparent: true, depthWrite: false,
      uniforms: { uMap: { value: null }, uStacked: { value: 0 }, uFade: { value: 0 } } });
    this.screen = new THREE.Mesh(geo, this.mat); this.screen.visible = false;
    this.screen.position.set(0, 0.1, 0); this.screen.scale.y = W * 9 / 16; r.add(this.screen);
  },
  async enter() {
    this.root.visible = true; this.finished = false; this.fade = 0; this.out = 0;
    if (this.milky) this.milky.visible = !ctx.isAR;
    setHud({ title: '', sticky: true, bare: true, home: false, actions: [{ label: en() ? 'Skip ›' : 'Preskočiť ›', onClick: () => this.done() }] });
    if (!(await prepIntro()) || ctx.current !== 'introVideo') { this.done(); return; }
    const v = video!, u = this.mat.uniforms;
    if (!u.uMap.value) {
      const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace; u.uMap.value = tex;
      v.addEventListener('ended', () => { if (ctx.current === 'introVideo') this.out = 0.001; });
      v.addEventListener('error', () => this.done());
    }
    // obraz s maskou pod sebou je vyšší ako široký → zobrazí sa len horná polovica
    const stacked = v.videoHeight > v.videoWidth * 0.75;
    u.uStacked.value = stacked ? 1 : 0;
    this.screen.scale.y = this.W * (stacked ? v.videoHeight / 2 : v.videoHeight) / v.videoWidth;
    this.screen.visible = true;
    v.loop = false; v.muted = !SET.sound; v.volume = 1;
    try { v.currentTime = 0; } catch { /* */ }
    SND.ambient(false);
    v.play().catch(() => { v.muted = true; v.play().catch(() => this.done()); });
  },
  /** koniec videa alebo preskočenie: pokračuje sa úvodom pre návštevníka alebo ponukou */
  done() {
    if (this.finished) return; this.finished = true;
    try { video?.pause(); } catch { /* */ }
    if (ctx.current !== 'introVideo') return;
    if (ctx.renderer.xr.isPresenting) SND.ambient(true);
    ctx.afterIntro();
  },
  onTap() { this.done(); },
  onVisibility(v: boolean) { if (this.finished || !video) return; if (v) video.play().catch(() => this.done()); else video.pause(); },
  exit() { this.root.visible = false; this.screen.visible = false; this.finished = true; try { video?.pause(); } catch { /* */ } },
  update(dt: number) {
    if (this.finished) return;
    this.fade = Math.min(1, this.fade + dt * 1.5);
    if (this.out) { this.out += dt * 2; if (this.out >= 1) { this.done(); return; } }
    const u = this.mat.uniforms; u.uFade.value = this.fade * (1 - Math.min(1, this.out));
    // poistka pre okuliare: obraz videa sa obnoví v každej snímke, aj keby prehliadač vo VR neohlásil novú snímku videa
    if (u.uMap.value && video && video.readyState >= 2 && ctx.renderer.xr.isPresenting) u.uMap.value.needsUpdate = true;
  }
};

/** Na počítači a v telefóne: úvod sa raz za návštevu stránky prehrá v 3D scéne (rovnako ako v okuliaroch). */
export function introOnce(): boolean {
  let seen = false; try { seen = !!sessionStorage.getItem('vnd-intro'); sessionStorage.setItem('vnd-intro', '1'); } catch { /* */ }
  return !seen;
}

/* =====================================================================
   CREDITS – zdroje, licencie, poďakovanie (content/credits.json)
   ===================================================================== */
/** Text titulkov + farby: nadpisy sekcií modré, položky biele. */
function creditsText() {
  const c = ctx.content.credits, ranges: Record<number, number> = {}; let s = '';
  for (const sec of c.sections) {
    ranges[s.length] = 0x9fc0ff; s += T(sec.h).toUpperCase() + '\n';
    ranges[s.length] = 0xe9ecf7; for (const it of sec.items) s += T(it) + '\n'; s += '\n';
  }
  ranges[s.length] = 0x8a93b8; s += (en() ? 'Version ' : 'Verzia ') + __APP_VERSION__;
  return { text: s, ranges };
}
const WIN = { top: 0.4, bottom: -0.66 };   // okno, v ktorom je text vidieť (pod logom, nad lištou)
export const credits: any = {
  stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.anchor.add(r);
    this.board = new THREE.Group(); this.board.position.set(0, 0.22, -1.7); r.add(this.board);
    loadTex(url('logo-white.png')).then(t => { if (!t) return; const img = t.image as HTMLImageElement, w = 0.5;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, w * img.height / img.width), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); p.position.y = 0.62; this.board.add(p); });
    this.scroll = new THREE.Group(); this.board.add(this.scroll);
    this.make();
  },
  make() {
    while (this.scroll.children.length) { const o = this.scroll.children.pop() as Text; o.dispose(); }
    const c = ctx.content.credits, ct = creditsText();
    const head = makeText(T(c.title), { size: 0.085, color: '#ffb46b', font: FONT.bold, anchorX: 'center', order: 5 });
    const sub = makeText(T(c.intro), { size: 0.038, color: '#8a93b8', anchorX: 'center', maxWidth: 1.75, lineHeight: 1.35, order: 5 }); sub.position.y = -0.12;
    const body = makeText(ct.text, { size: 0.042, color: '#e9ecf7', anchorX: 'center', maxWidth: 1.75, lineHeight: 1.5, order: 5 }); body.position.y = -0.36;
    (body as any).colorRanges = ct.ranges;
    [head, sub, body].forEach((t: any) => { t.textAlign = 'center'; t.sync(); this.scroll.add(t); });
    this.body = body;
  },
  enter() {
    this.root.visible = true; this.y = WIN.bottom; this.paused = false; this.hud();
  },
  hud() {
    setHud({ kicker: 'KHaP MH', title: { sk: 'Zdroje a poďakovanie', en: 'Sources and credits' }, sticky: true,
      body: { sk: 'Ďakujeme všetkým, ktorí svoje snímky, modely a údaje dávajú k dispozícii zadarmo.', en: 'Thank you to everyone who shares their images, models and data freely.' },
      actions: [{ label: this.paused ? (en() ? 'Continue' : 'Pokračovať') : (en() ? 'Pause' : 'Pauza'), active: this.paused, onClick: () => this.toggle() },
        { label: en() ? 'From the top' : 'Od začiatku', onClick: () => { this.y = WIN.bottom; } }] });
  },
  toggle() { this.paused = !this.paused; this.hud(); },
  exit() { this.root.visible = false; },
  relabel() { this.make(); },
  onTap() { this.toggle(); },
  update(dt: number) {
    if (!this.paused) this.y += dt * 0.075;
    const bb = this.body.textRenderInfo?.blockBounds, h = (bb ? bb[3] - bb[1] : 2) + 0.36;
    if (this.y > h + WIN.top) this.y = WIN.bottom;
    this.scroll.position.y = this.y;
    // orezanie: každý text je vidieť len v okne (súradnice clipRect sú v sústave textu)
    this.scroll.children.forEach((t: any) => { const o = this.y + t.position.y; t.clipRect = [-2, WIN.bottom - o, 2, WIN.top - o]; });
  }
};

/** Zoznam zdrojov aj na počítači (okno nad stránkou). */
export function domCredits() {
  if (document.getElementById('credits')) return;
  const c = ctx.content.credits, el = (tag: string, text?: string, cls?: string) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
  const wrap = el('div'); wrap.id = 'credits'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  const box = el('div', '', 'box');
  const logo = el('img') as HTMLImageElement; logo.src = url('logo-white.png'); logo.alt = 'KHaP MH';
  box.append(logo, el('h2', T(c.title)), el('p', T(c.intro), 'lead'));
  for (const s of c.sections) { box.append(el('h3', T(s.h))); for (const i of s.items) box.append(el('div', T(i))); }
  box.append(el('p', (en() ? 'Version ' : 'Verzia ') + __APP_VERSION__, 'lead ver'));
  const btn = el('button', en() ? 'Close' : 'Zavrieť', 'primary') as HTMLButtonElement; box.append(btn);
  wrap.append(box); document.body.append(wrap); btn.focus({ preventScroll: true });
  const close = () => { wrap.remove(); removeEventListener('keydown', key); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  btn.onclick = close; wrap.onclick = e => { if (e.target === wrap) close(); }; addEventListener('keydown', key);
}
