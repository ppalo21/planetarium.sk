import * as THREE from 'three';
import { ctx, D2R, ASSET } from '../core/context';
import { T, en } from '../core/i18n';
import { setHud, keepHud, makeClickable } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree, camWorld, canvasTex } from '../core/util';
import { sunMaterial, SUN_U } from './sun';
import { arReady, startPlacing, isPlacing } from '../core/ar';

/**
 * Fázy Mesiaca: klasický školský pokus v okuliaroch.
 * Slnko = lampa v miestnosti, Zem = hlava návštevníka, Mesiac (reálna textúra) obieha okolo hlavy.
 * Osvetlenie Mesiaca sa počíta presne z polohy Slnka, fáza sa určuje z geometrie (nie z animácie).
 * Bonus: keď je Mesiac presne za hlavou, padne naň tieň Zeme (zatmenie Mesiaca);
 * keď je presne pred Slnkom, zakryje ho (zatmenie Slnka).
 */
const ORBIT_R = 0.6, MOON_R = 0.055, MONTH_S = 45;   // polomer dráhy, polomer Mesiaca, sekundy na jeden obeh

const moonVS = `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const moonFS = `uniform sampler2D uMap; uniform vec3 uSun; uniform float uEclipse; uniform float uHasMap;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 base = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : vec3(0.55);
  vec3 L = normalize(uSun - vW);
  float d = dot(normalize(vN), L);
  float lit = smoothstep(-0.02, 0.06, d) * (0.35 + 0.65 * max(d, 0.0));   // ostrý terminátor ako na skutočnom Mesiaci
  vec3 col = base * (lit * 1.35 + 0.025);                                 // 0.025 = popolavý svit od Zeme
  col = mix(col, base * vec3(0.55, 0.16, 0.08) * 0.9, uEclipse);           // tieň Zeme: krvavý Mesiac
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function phaseName(elong: number, waxing: boolean) {
  if (elong < 10) return { sk: 'Nov', en: 'New Moon' };
  if (elong > 170) return { sk: 'Spln', en: 'Full Moon' };
  if (elong >= 80 && elong <= 100) return waxing ? { sk: 'Prvá štvrť', en: 'First Quarter' } : { sk: 'Posledná štvrť', en: 'Last Quarter' };
  if (elong < 80) return waxing ? { sk: 'Dorastajúci kosák', en: 'Waxing Crescent' } : { sk: 'Ubúdajúci kosák', en: 'Waning Crescent' };
  return waxing ? { sk: 'Dorastajúci Mesiac pred splnom', en: 'Waxing Gibbous' } : { sk: 'Ubúdajúci Mesiac po splne', en: 'Waning Gibbous' };
}

export const phases: any = {
  stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.anchor.add(r);
    this.mode = 'auto'; this.angle = 60 * D2R; this.showLabels = true; this.lastName = '';
    // Slnko (lampa)
    this.sun = new THREE.Group(); this.sun.position.set(0, 0.15, -3); r.add(this.sun);
    const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 64, 32), sunMaterial()); this.sun.add(sunMesh);
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 30, 128, 128, 128); gr.addColorStop(0, 'rgba(255,230,170,0.75)'); gr.addColorStop(0.4, 'rgba(255,190,90,0.25)'); gr.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(1.1, 1.1, 1); this.sun.add(glow);
    this.sunLbl = textSprite(en() ? 'Sun (lamp)' : 'Slnko (lampa)', '#ffd9a0', 56); setSpriteH(this.sunLbl, 0.06); this.sunLbl.position.y = -0.27; this.sun.add(this.sunLbl);
    // Mesiac – vonkajšia skupina sa natáča k hlave, vnútorná otočí textúru tak, aby k Zemi mierila privrátená strana
    this.mu = { uMap: { value: null }, uHasMap: { value: 0 }, uSun: { value: new THREE.Vector3() }, uEclipse: { value: 0 } };
    this.moon = new THREE.Group(); r.add(this.moon);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), new THREE.ShaderMaterial({ uniforms: this.mu, vertexShader: moonVS, fragmentShader: moonFS }));
    inner.rotation.y = -Math.PI / 2; inner.scale.setScalar(MOON_R); this.moon.add(inner); this.moonMesh = inner;
    loadTex(ASSET.planets + '2k_moon.jpg').then(t => { if (t) { this.mu.uMap.value = t; this.mu.uHasMap.value = 1; } });
    makeClickable(inner, { onHover: v => { this.hover = v; }, grab: { start: cc => this.grab(cc), end: () => this.release() } });
    this.moonLbl = null;
    // dráha a popisky fáz okolo hlavy
    this.orbit = new THREE.Group(); r.add(this.orbit);
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * ORBIT_R, 0, Math.cos(a) * ORBIT_R)); }
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x9fc0ff, dashSize: 0.03, gapSize: 0.03, transparent: true, opacity: 0.5 }));
    ring.computeLineDistances(); this.orbit.add(ring);
    this.marks = new THREE.Group(); this.orbit.add(this.marks); this.buildMarks();
  },
  buildMarks() {
    while (this.marks.children.length) { const o = this.marks.children.pop(); disposeTree(o); }
    // poloha vzhľadom na smer k Slnku: 0° = Nov, 90° = Prvá štvrť (proti smeru hodín pri pohľade zhora)
    [[0, { sk: 'Nov', en: 'New' }], [90, { sk: 'Prvá štvrť', en: '1st quarter' }], [180, { sk: 'Spln', en: 'Full' }], [270, { sk: 'Posledná štvrť', en: 'Last quarter' }]]
      .forEach(([deg, name]: any) => { const s = textSprite(T(name), '#9fc0ff', 52); setSpriteH(s, 0.03); s.userData.deg = deg; this.marks.add(s); });
  },
  grab(c: THREE.Object3D) { this.mode = 'hand'; this.grabbed = c; c.attach(this.moon); this.moon.position.set(0, 0.02, -0.12); keepHud(); this.hud(); },
  release() { this.grabbed = null; this.root.attach(this.moon); },
  enter() { this.root.visible = true; this.lastName = ''; this.hud(); },
  exit() { if (this.grabbed) this.release(); this.root.visible = false; },
  placeSun() {
    startPlacing(p => { const l = ctx.anchor.worldToLocal(p.clone()); this.sun.position.set(l.x, l.y + 0.25, l.z); keepHud(); this.hud(); }, false);
    keepHud(); this.hud();
  },
  hud() {
    const rows: any[] = [[
      { label: en() ? 'Moon orbits' : 'Mesiac obieha', active: this.mode === 'auto', onClick: () => { if (this.grabbed) this.release(); this.mode = 'auto'; keepHud(); this.hud(); } },
      { label: en() ? 'Moon in my hand' : 'Mesiac v ruke', active: this.mode === 'hand', onClick: () => { this.mode = 'hand'; keepHud(); this.hud(); } },
      { label: en() ? 'Labels' : 'Popisky', active: this.showLabels, onClick: () => { this.showLabels = !this.showLabels; keepHud(); this.hud(); } }]];
    if (arReady()) rows[0].unshift({ label: en() ? 'Place the Sun' : 'Umiestniť Slnko', active: isPlacing(), onClick: () => this.placeSun() });
    const name = this.cur ? T(this.cur.name) : '';
    const body = isPlacing()
      ? { sk: 'Pozrite sa na stôl, poličku alebo stenu, kde má svietiť Slnko, a štipnite.', en: 'Look at a table, shelf or wall where the Sun should shine, then pinch.' }
      : this.mode === 'hand'
        ? { sk: 'Vaša hlava je Zem. Chyťte Mesiac štipnutím, natiahnite ruku pred seba a pomaly sa otáčajte dokola. Sledujte, ako sa mení osvetlená časť.', en: 'Your head is the Earth. Grab the Moon with a pinch, stretch your arm out and slowly turn around. Watch the lit part change.' }
        : { sk: 'Vaša hlava je Zem, lampa je Slnko. Mesiac je vždy z polovice osvetlený, ale podľa toho, kde na dráhe je, vidíme z osvetlenej časti viac alebo menej.', en: 'Your head is the Earth, the lamp is the Sun. The Moon is always half lit, but depending on where it is, we see more or less of the lit half.' };
    setHud({ kicker: { sk: 'Fázy Mesiaca' + (name ? '   ' + this.pct + ' % osvetlené' : ''), en: 'Moon phases' + (name ? '   ' + this.pct + ' % lit' : '') },
      title: name || { sk: 'Fázy Mesiaca', en: 'Moon phases' }, body, credit: { sk: 'Textúra Mesiaca: Solar System Scope (CC BY 4.0)', en: 'Moon texture: Solar System Scope (CC BY 4.0)' }, rows });
  },
  relabel() {
    if (!this.built) return; this.buildMarks();
    this.sun.remove(this.sunLbl); disposeTree(this.sunLbl); this.sunLbl = textSprite(en() ? 'Sun (lamp)' : 'Slnko (lampa)', '#ffd9a0', 56); setSpriteH(this.sunLbl, 0.06); this.sunLbl.position.y = -0.27; this.sun.add(this.sunLbl);
    this.lastName = '';
  },
  onTap() { if (this.mode === 'auto') this.paused = !this.paused; },
  update(dt: number) {
    SUN_U.uTime.value += dt; SUN_U.uHa.value = 0;
    const head = camWorld(), sunW = this.sun.getWorldPosition(new THREE.Vector3());
    const S = sunW.clone().sub(head).setY(0).normalize();                    // smer k Slnku (vodorovne)
    // poloha Mesiaca
    if (this.mode === 'auto' && !this.grabbed) {
      if (!this.paused) this.angle = (this.angle + dt * Math.PI * 2 / MONTH_S) % (Math.PI * 2);
      const dir = S.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.angle);   // proti smeru hodín zhora
      const p = head.clone().addScaledVector(dir, ORBIT_R); p.y = head.y + 0.08 * Math.sin(this.angle * 0.5 + 1); // mierne naklonená dráha
      this.moon.position.copy(this.root.worldToLocal(p));
    }
    this.moon.lookAt(head);                                                   // viazaná rotácia: k Zemi stále tá istá strana
    const moonW = this.moon.getWorldPosition(new THREE.Vector3());
    this.mu.uSun.value.copy(sunW);
    // fáza z geometrie
    const toMoon = moonW.clone().sub(head), M = toMoon.clone().setY(0).normalize();
    const elong = Math.acos(THREE.MathUtils.clamp(S.dot(M), -1, 1)) / D2R;
    const waxing = new THREE.Vector3().crossVectors(S, M).y > 0;
    const phaseA = moonW.clone().sub(sunW).normalize().angleTo(head.clone().sub(moonW).normalize());   // uhol Slnko–Mesiac–Zem
    this.pct = Math.round((1 + Math.cos(Math.PI - phaseA)) / 2 * 100);
    // zatmenie Mesiaca: Mesiac v tieni hlavy (Zeme)
    const anti = head.clone().sub(sunW).normalize(), ang = anti.angleTo(toMoon.clone().normalize()) / D2R;
    const umbra = Math.atan(0.1 / Math.max(toMoon.length(), 0.2)) / D2R;     // hlava ~ 10 cm polomer
    this.mu.uEclipse.value = THREE.MathUtils.clamp((umbra - ang) / (umbra * 0.6), 0, 1);
    const nm = this.mu.uEclipse.value > 0.5 ? { sk: 'Zatmenie Mesiaca!', en: 'Lunar eclipse!' } : phaseName(elong, waxing);
    this.cur = { name: nm };
    const key = T(nm) + '|' + Math.round(this.pct / 10);
    if (key !== this.lastName) { this.lastName = key; keepHud(); this.hud(); }
    // popisky fáz okolo hlavy
    this.orbit.visible = this.showLabels && this.mode === 'auto';
    this.orbit.position.copy(this.root.worldToLocal(head.clone()));
    this.marks.children.forEach((s: any) => { const d = S.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.userData.deg * D2R).multiplyScalar(ORBIT_R + 0.08); s.position.set(d.x, -0.06, d.z); });
    const k = this.hover ? 1.15 : 1; this.moonMesh.scale.setScalar(MOON_R * k);
  }
};
