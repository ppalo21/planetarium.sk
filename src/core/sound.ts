import { SET } from './settings';

/** Akordy pozadia (Hz): pokojné kvinty a oktávy, pre každý zážitok iná tónina. */
const MOODS: Record<string, number[]> = {
  lobby: [110, 164.81, 220.5, 329.6],          // A – vítanie
  cosmos: [82.41, 123.47, 164.9, 246.94],      // E – hlboký vesmír
  solar: [73.42, 110, 146.9, 220],             // D – let
  aurora: [98, 146.83, 196.3, 293.66],         // G – severská noc
  trips: [87.31, 130.81, 174.7, 261.63],       // F – cudzie svety
  depth: [92.5, 138.59, 185.2, 277.18],        // F# – hviezdy
  planets: [103.83, 155.56, 207.9, 311.13],
  phases: [98, 146.83, 196.3, 293.66],
  gravity: [130.81, 196, 261.9, 392],          // C – hravé
  machines: [116.54, 174.61, 233.3, 349.23],
  quiz: [130.81, 196, 261.9, 392]
};

/** Zvuky syntetizované cez WebAudio – bez zvukových súborov. */
class Sound {
  ctx: AudioContext | null = null;
  master!: GainNode;
  amb: { g: GainNode; os: OscillatorNode[][] } | null = null;

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }
  private ok() { if (!this.ctx || !SET.sound) return false; if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
  tone(f: number, dur: number, type: OscillatorType = 'sine', vol = 0.1, f2?: number | null, delay = 0) {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  hover() { this.tone(1200, 0.045, 'sine', 0.035); }
  click() { this.tone(620, 0.09, 'triangle', 0.14, 980); }
  good() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.11, null, i * 0.09)); }
  bad() { this.tone(260, 0.3, 'triangle', 0.1, 170); }
  chime() { this.tone(1320, 0.9, 'sine', 0.08); this.tone(1980, 0.7, 'sine', 0.04, null, 0.05); }
  whoosh() {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime, n = c.sampleRate * 0.7, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    const g = c.createGain(); g.gain.value = 0.16; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  /** krátky jemný zvuk pri prechode medzi krokmi (šípky) */
  step(up = true) { this.tone(up ? 520 : 440, 0.12, 'sine', 0.07, up ? 700 : 340); }
  /** tichý „nádych“ pri stmievaní scény */
  swell() {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime, n = Math.floor(c.sampleRate * 1.1), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n) ** 2;
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7; f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.5); f.frequency.exponentialRampToValueAtTime(300, t + 1.1);
    const g = c.createGain(); g.gain.value = 0.09; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  /** pozastaví všetok zvuk (okuliare zložené z hlavy) */
  pause(v: boolean) { if (!this.ctx) return; try { if (v) this.ctx.suspend(); else this.ctx.resume(); } catch { /* */ } }
  /** Hudobné pozadie: štyri tiché tóny, ktoré sa pomaly prelievajú. Každý zážitok má vlastný akord (náladu). */
  private chord = MOODS.lobby;
  ambient(on: boolean) {
    if (!this.ctx) return;
    if (on && SET.sound && !this.amb) {
      const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.05, c.currentTime + 3);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.connect(g); g.connect(this.master);
      const os = this.chord.map((f, i) => {
        const o = c.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 6;
        const og = c.createGain(); og.gain.value = i < 2 ? 0.5 : 0.18;
        const l = c.createOscillator(); l.frequency.value = 0.05 + i * 0.03; const lg = c.createGain(); lg.gain.value = 0.15;
        l.connect(lg); lg.connect(og.gain); l.start(); o.connect(og); og.connect(lp); o.start();
        return [o, l];
      });
      this.amb = { g, os };
    } else if ((!on || !SET.sound) && this.amb) {
      const a = this.amb, c = this.ctx; a.g.gain.cancelScheduledValues(c.currentTime); a.g.gain.setValueAtTime(a.g.gain.value, c.currentTime); a.g.gain.linearRampToValueAtTime(0, c.currentTime + 1);
      setTimeout(() => a.os.forEach(p => p.forEach(o => { try { o.stop(); } catch { /* */ } })), 1200);
      this.amb = null;
    }
  }
  /** Plynule preladí pozadie na náladu daného zážitku. */
  mood(id: string) {
    this.chord = MOODS[id] || MOODS.lobby;
    if (!this.ctx || !this.amb) return;
    const t = this.ctx.currentTime;
    this.amb.os.forEach((p, i) => p[0].frequency.setTargetAtTime(this.chord[i], t, 1.2));
  }
}
export const SND = new Sound();

export function haptic(src: XRInputSource | null | undefined, intensity: number, ms: number) {
  try { const h = (src?.gamepad as any)?.hapticActuators?.[0]; if (h) h.pulse(intensity, ms); } catch { /* */ }
}
