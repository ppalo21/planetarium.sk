import * as THREE from 'three';
import { ctx, ASSET } from '../core/context';
import { T, INPUT, en } from '../core/i18n';
import { SET, saveSet } from '../core/settings';
import { SND } from '../core/sound';
import { setHud, makeClickable } from '../core/ui3d';
import { loadTex, textSprite, setSpriteH, disposeTree } from '../core/util';
import { VISIT, startVisitor, setLang, toggleLang } from '../core/app';

/* ---------------- Úvod: naučí ovládanie rukami alebo ovládačmi ---------------- */
export const intro: any = {
  stars: true,
  build() {
    const r = this.root = new THREE.Group(); ctx.anchor.add(r);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x9fc0ff, emissive: new THREE.Color('#2a4a9a'), emissiveIntensity: 0.6, roughness: 0.6 });
    loadTex(ASSET.planets + '2k_earth_daymap.jpg').then(t => { if (t) { orbMat.map = t; orbMat.color.set('#ffffff'); orbMat.emissive.set('#203050'); orbMat.needsUpdate = true; } });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 48, 24), orbMat); this.orb.position.set(0, 0, -1.3); r.add(this.orb);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.175, 64), new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.position.copy(this.orb.position); r.add(this.ring);
    // ruky: palec a ukazovák sa spájajú
    this.f1 = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd9b0 })); this.f2 = this.f1.clone(); r.add(this.f1, this.f2);
    // ovládač so spúšťou
    const cg = this.ctrl = new THREE.Group(), gm = new THREE.MeshStandardMaterial({ color: 0xe8e8ea, roughness: 0.5 }), dk = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.6 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 24), gm); grip.rotation.x = -0.35; cg.add(grip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.006, 10, 40), gm); ring.position.set(0, 0.065, 0.012); ring.rotation.x = 1.2; cg.add(ring);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 24), dk); face.position.set(0, 0.058, -0.006); face.rotation.x = -0.35; cg.add(face);
    const trig = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.03, 0.012), new THREE.MeshStandardMaterial({ color: 0xffb46b, emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 0.5 }));
    this.trigPivot = new THREE.Group(); this.trigPivot.position.set(0, 0.035, -0.028); this.trigPivot.add(trig); trig.position.set(0, -0.012, -0.004); cg.add(this.trigPivot);
    const rayL = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.28, 6), new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.7 }));
    rayL.rotation.x = Math.PI / 2; rayL.position.set(0, 0.06, -0.16); cg.add(rayL); cg.scale.setScalar(1.6); r.add(cg);
    makeClickable(this.orb, { onClick: () => this.done(), onHover: v => { this.hover = v; } });
  },
  label() {
    if (this.lab) { this.root.remove(this.lab); disposeTree(this.lab); }
    this.lab = textSprite([en() ? 'Welcome to space!' : 'Vitaj vo vesmíre!', T({ sk: 'Namier na Zem a štipni', en: 'Point at Earth and pinch' })], ['#ffb46b', '#e9ecf7'], 80);
    setSpriteH(this.lab, 0.24); this.lab.position.set(0, 0.42, -1.6); this.root.add(this.lab);
    if (this.tl) { this.root.remove(this.tl); disposeTree(this.tl); }
    this.tl = textSprite(INPUT.mode === 'controllers' ? (en() ? 'trigger (index finger)' : 'spúšť (ukazovák)') : (en() ? 'thumb + index finger' : 'palec + ukazovák'), '#ffb46b', 56);
    setSpriteH(this.tl, 0.045); this.root.add(this.tl);
  },
  enter() { this.root.visible = true; this.label(); this.hud(); },
  hud() {
    const c = INPUT.mode === 'controllers';
    setHud({ kicker: c ? { sk: 'Ako ovládať: ovládače', en: 'How to control: controllers' } : { sk: 'Ako ovládať: ruky', en: 'How to control: hands' },
      title: c ? { sk: 'Spúšť stlačíte ukazovákom', en: 'Press the trigger with your index finger' } : { sk: 'Spojte palec a ukazovák ako pinzetu', en: 'Touch your thumb and index finger' },
      body: c ? { sk: 'Namierte modrým lúčom z ovládača na Zem a stlačte spúšť pod ukazovákom. Podržaním spúšte na 1,5 s sa kedykoľvek vrátite domov. Ovládače môžete odložiť, appka funguje aj s rukami.', en: 'Point the blue ray from the controller at the Earth and press the trigger under your index finger. Hold the trigger for 1.5 s to go home at any time. You can also put the controllers down and use your hands.' }
        : { sk: 'Namierte lúčom z ruky na Zem pred sebou a krátko spojte palec s ukazovákom. Dlhé štipnutie (1,5 s) vás kedykoľvek vráti domov. Ak máte ovládače, stlačte spúšť.', en: 'Point the ray from your hand at the Earth and briefly touch thumb and index finger. A long pinch (1.5 s) takes you home at any time. With controllers, press the trigger.' },
      rows: [[{ label: 'Slovensky', active: !en(), onClick: () => setLang('sk') }, { label: 'English', active: en(), onClick: () => setLang('en') }]], home: false, autoHide: false });
  },
  done() { SND.good(); VISIT.start = performance.now(); VISIT.warned = false; ctx.goTo('lobby'); },
  relabel() { if (ctx.current === 'intro') { this.label(); this.hud(); } },
  exit() { this.root.visible = false; },
  update(dt: number, t: number) {
    const k = (this.hover ? 1.25 : 1) * (1 + 0.05 * Math.sin(t * 3)); this.orb.scale.setScalar(k); this.orb.rotation.y += dt * 0.3;
    this.ring.lookAt(ctx.anchor.localToWorld(new THREE.Vector3())); this.ring.scale.setScalar(k * (1 + 0.15 * ((t * 0.8) % 1))); this.ring.material.opacity = 1 - ((t * 0.8) % 1);
    const ph = (Math.sin(t * 2.4) + 1) / 2, gap = 0.012 + 0.05 * ph, c = this.orb.position, ctl = INPUT.mode === 'controllers';
    this.f1.position.set(c.x + 0.3, c.y - 0.02 + gap, c.z + 0.15); this.f2.position.set(c.x + 0.3, c.y - 0.02 - gap, c.z + 0.15);
    this.f1.visible = this.f2.visible = !ctl; this.ctrl.visible = ctl;
    this.ctrl.position.set(c.x + 0.32, c.y - 0.1, c.z + 0.35); this.ctrl.rotation.set(0, 0.5, 0); this.trigPivot.rotation.x = -0.45 * ph;
    if (this.tl) this.tl.position.set(c.x + 0.32, c.y + (ctl ? -0.2 : -0.1), c.z + (ctl ? 0.35 : 0.15));
  }
};

/* ---------------- Poďakovanie po uplynutí času ---------------- */
export const thanks: any = {
  stars: true,
  build() { this.root = new THREE.Group(); ctx.anchor.add(this.root); },
  enter() {
    this.root.visible = true; if (this.lab) { this.root.remove(this.lab); disposeTree(this.lab); }
    this.lab = textSprite([en() ? 'Thank you!' : 'Ďakujeme!', en() ? 'Please hand the headset to the next visitor' : 'Prosím, odovzdajte okuliare ďalšiemu návštevníkovi'], ['#ffb46b', '#e9ecf7'], 80);
    setSpriteH(this.lab, 0.26); this.lab.position.set(0, 0.2, -1.6); this.root.add(this.lab);
    setHud({ kicker: 'KHaP MH', title: { sk: 'Čas na návštevu vypršal', en: 'Your time is up' }, body: { sk: 'Dúfame, že sa vám vesmír páčil. Príďte sa pozrieť aj do Hviezdnej sály!', en: 'We hope you enjoyed space. Come and visit our planetarium dome too!' },
      rows: [[{ label: en() ? 'Next visitor ›' : 'Ďalší návštevník ›', onClick: startVisitor, primary: true }]], home: false, autoHide: false });
  },
  exit() { this.root.visible = false; }
};

/* ---------------- Režim obsluhy (5× ťuknúť na logo) ---------------- */
export const operator: any = {
  stars: true,
  build() { this.root = new THREE.Group(); ctx.anchor.add(this.root); },
  enter() { this.root.visible = true; this.hud(); },
  exit() { this.root.visible = false; },
  hud() {
    const MN: Record<string, any> = { trips: { sk: 'Výlety', en: 'Trips' }, depth: { sk: 'Hĺbka', en: 'Depth' }, planets: { sk: 'Planéty', en: 'Planets' }, gravity: { sk: 'Gravitácia', en: 'Gravity' }, machines: { sk: 'Rover', en: 'Rover' }, quiz: { sk: 'Kvíz', en: 'Quiz' } };
    const tog = (k: string) => ({ label: T(MN[k]), active: SET.mods[k], onClick: () => { SET.mods[k] = !SET.mods[k]; if (!Object.values(SET.mods).some(Boolean)) SET.mods[k] = true; saveSet(); this.hud(); } });
    const lim = (s: number) => ({ label: s ? (s / 60) + ' min' : (en() ? 'No limit' : 'Bez limitu'), active: SET.limit === s, onClick: () => { SET.limit = s; saveSet(); this.hud(); } });
    const onoff = (v: boolean) => v ? (en() ? 'on' : 'zap') : (en() ? 'off' : 'vyp');
    setHud({ kicker: { sk: 'Režim obsluhy', en: 'Staff mode' }, title: { sk: 'Čo uvidia návštevníci', en: 'What visitors will see' },
      body: { sk: 'Oranžové = zapnuté. Druhý riadok je čas na jedného návštevníka. Nastavenie sa uloží v okuliaroch. Otvorenie: 5× rýchlo ťuknúť na logo.', en: 'Orange = on. Row two is the time per visitor. Settings are stored in the headset. Open: tap the logo 5 times quickly.' },
      rows: [Object.keys(MN).map(tog), [lim(0), lim(120), lim(180), lim(300)],
        [{ label: (en() ? 'Intro: ' : 'Úvod: ') + onoff(SET.tutorial), active: SET.tutorial, onClick: () => { SET.tutorial = !SET.tutorial; saveSet(); this.hud(); } },
         { label: (en() ? 'Sound: ' : 'Zvuk: ') + onoff(SET.sound), active: SET.sound, onClick: () => { SET.sound = !SET.sound; saveSet(); SND.ambient(SET.sound && ctx.renderer.xr.isPresenting); this.hud(); } },
         { label: en() ? 'Slovensky' : 'English', onClick: toggleLang }],
        [{ label: en() ? 'Done, new visitor ›' : 'Hotovo, nový návštevník ›', primary: true, onClick: startVisitor }]], home: false, autoHide: false });
  },
  relabel() { if (ctx.current === 'operator') this.hud(); }
};
