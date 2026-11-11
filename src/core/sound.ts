import { SET } from './settings';

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
  /* Zvuky ovládania: krátke, mäkké, v jednej tónine (A dur), aby spolu ladili. */
  hover() { this.tone(1760, 0.03, 'sine', 0.012); }
  click() { this.tone(880, 0.07, 'sine', 0.07, 660); }
  good() { [880, 1108.7, 1318.5].forEach((f, i) => this.tone(f, 0.28, 'sine', 0.06, null, i * 0.08)); }
  bad() { this.tone(330, 0.25, 'sine', 0.07, 247); }
  chime() { this.tone(1318.5, 0.9, 'sine', 0.05); this.tone(1760, 0.7, 'sine', 0.025, null, 0.06); }
  /** jemný šum pri prechode medzi zážitkami */
  whoosh() {
    if (!this.ok()) return;
    const c = this.ctx!, t = c.currentTime, n = Math.floor(c.sampleRate * 0.8), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n) ** 2;
    const s = c.createBufferSource(); s.buffer = b;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.5; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.4); f.frequency.exponentialRampToValueAtTime(250, t + 0.8);
    const g = c.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }
  swell() { this.whoosh(); }
  step(_up = true) { /* šípky používajú bežné kliknutie */ }
  /** pozastaví všetok zvuk (okuliare zložené z hlavy) */
  pause(v: boolean) { if (!this.ctx) return; try { if (v) this.ctx.suspend(); else this.ctx.resume(); } catch { /* */ } }
  /** Hudobné pozadie: tichý stály akord (A – E – A – C#), ktorý sa pomaly prelieva. Rovnaký v celej appke. */
  ambient(on: boolean) {
    if (!this.ctx) return;
    if (on && SET.sound && !this.amb) {
      const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.03, c.currentTime + 4);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(g); g.connect(this.master);
      const os = [110, 164.81, 220, 277.18].map((f, i) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = (i - 1.5) * 3;
        const og = c.createGain(); og.gain.value = [0.5, 0.35, 0.22, 0.1][i];
        const l = c.createOscillator(); l.frequency.value = 0.04 + i * 0.017; const lg = c.createGain(); lg.gain.value = og.gain.value * 0.35;
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
  mood(_id: string) { /* pozadie je zámerne rovnaké všade – zmena tóniny pôsobila rušivo */ }
}
export const SND = new Sound();

export function haptic(src: XRInputSource | null | undefined, intensity: number, ms: number) {
  try { const h = (src?.gamepad as any)?.hapticActuators?.[0]; if (h) h.pulse(intensity, ms); } catch { /* */ }
}
