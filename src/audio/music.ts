// Original reactive score, synthesized live with Web Audio (no audio files, no licensing).
// Four sister tracks (minor keys, 116–128 BPM): pulsing 16th-note ostinato, pedal bass, low brass swells
// and drums. Each race moves to the next track.
// Layers fade in and out with the race state: garage → lights → race → final lap → results.

export type Scene = 'menu' | 'lights' | 'race' | 'results';

type Layer = 'pad' | 'ost' | 'high' | 'bass' | 'kick' | 'hats' | 'snare' | 'brass';
const LAYERS: Layer[] = ['pad', 'ost', 'high', 'bass', 'kick', 'hats', 'snare', 'brass'];

const MIX: Record<Scene, Partial<Record<Layer, number>>> = {
  menu: { pad: 0.5, ost: 0.22 },
  lights: { pad: 0.42, bass: 0.32, kick: 0.6, hats: 0.3 },
  race: { pad: 0.26, ost: 0.45, bass: 0.5, kick: 0.7, hats: 0.24, brass: 0.42 },
  results: { pad: 0.55, ost: 0.18, brass: 0.2 },
};
const FINAL_LAP: Partial<Record<Layer, number>> = { high: 0.26, snare: 0.38, hats: 0.36 };

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

type Chord = { root: number; tones: number[] };
/** Chord from a MIDI root in octave 2: triad one octave up, minor or major. */
const ch = (root: number, minor: boolean): Chord => ({ root, tones: [root + 12, root + (minor ? 15 : 16), root + 19] });

/**
 * Sister tracks: same instruments and race-reactive layers, different key, tempo,
 * 4-bar progression and 16-step ostinato (indexes into chord tones 0–2 and the octave above 3–5).
 */
export const TRACKS: { name: string; bpm: number; prog: Chord[]; ost: number[] }[] = [
  // i – VI – III – VII in D minor (Dm Bb F C)
  { name: 'Lights Out', bpm: 120, prog: [ch(38, true), ch(34, false), ch(41, false), ch(36, false)], ost: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 4, 3, 2, 1, 2] },
  // i – VI – III – VII in E minor (Em C G D), faster, rising arpeggio
  { name: 'Slipstream', bpm: 128, prog: [ch(40, true), ch(36, false), ch(43, false), ch(38, false)], ost: [0, 2, 1, 2, 3, 2, 4, 2, 0, 2, 1, 2, 5, 4, 3, 2] },
  // i – iv – VI – V in A minor (Am Dm F E): the major V gives it a harmonic-minor bite
  { name: 'Apex Hunter', bpm: 124, prog: [ch(45, true), ch(38, true), ch(41, false), ch(40, false)], ost: [0, 1, 2, 3, 2, 1, 0, 1, 0, 2, 4, 3, 5, 3, 2, 1] },
  // i – VII – VI – VII in C minor (Cm Bb Ab Bb), slower and darker
  { name: 'Night Race', bpm: 116, prog: [ch(36, true), ch(34, false), ch(32, false), ch(34, false)], ost: [0, 0, 2, 1, 3, 1, 2, 0, 0, 0, 2, 1, 4, 3, 2, 1] },
];

export class Music {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private gains = {} as Record<Layer, GainNode>;
  private ostFilter!: BiquadFilterNode;
  private noise!: AudioBuffer;
  private timer = 0;
  private step = 0;
  private nextT = 0;
  private scene: Scene = 'menu';
  private finalLap = false;
  private lights = 0;
  private boost = false;
  private rain = false;
  private track = 0;
  private sixteenth = 60 / TRACKS[0].bpm / 4;
  muted: boolean;

  constructor() {
    let m = false;
    try { m = localStorage.getItem('fr-music') === 'off'; } catch { /* storage blocked */ }
    this.muted = m;
    this.setTrack(Math.floor(Math.random() * TRACKS.length));
  }

  /** Must be called from a user gesture (tap / key) so the browser allows audio. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(comp);
    this.ostFilter = ctx.createBiquadFilter();
    this.ostFilter.type = 'lowpass'; this.ostFilter.Q.value = 6; this.ostFilter.frequency.value = 900;
    for (const l of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.gains[l] = g;
    }
    this.ostFilter.connect(this.gains.ost);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextT = ctx.currentTime + 0.05;
    this.applyMix(0.01);
    this.timer = window.setInterval(() => this.schedule(), 25);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('fr-music', m ? 'off' : 'on'); } catch { /* storage blocked */ }
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.08);
  }

  setScene(s: Scene) {
    if (s === this.scene) return;
    this.scene = s;
    if (s !== 'race') this.finalLap = false;
    if (s === 'lights') { this.lights = 0; this.setTrack(this.track + 1); }
    this.applyMix(s === 'race' ? 0.05 : 0.6);
  }
  /** Switch tracks on the next bar line so the groove never stutters. */
  setTrack(i: number) {
    this.track = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
    this.sixteenth = 60 / TRACKS[this.track].bpm / 4;
    this.step = Math.ceil(this.step / 16) * 16;
  }
  get trackName() { return TRACKS[this.track].name; }
  setFinalLap(on: boolean) { if (on !== this.finalLap) { this.finalLap = on; this.applyMix(0.8); } }
  setLights(n: number) { this.lights = n; }
  setBoost(on: boolean) { this.boost = on; }
  setRain(on: boolean) { this.rain = on; }

  /** Lights out: a cymbal + brass hit on the next beat. */
  hit() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    this.cymbal(t, 0.5);
    this.swell(t, TRACKS[this.track].prog[0].root, 1.6, 0.9, true);
    this.kick(t, 1);
  }

  private applyMix(tc: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const mix = { ...MIX[this.scene], ...(this.finalLap ? FINAL_LAP : {}) };
    for (const l of LAYERS) this.gains[l].gain.setTargetAtTime(mix[l] ?? 0, ctx.currentTime, tc);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Ostinato brightness follows the action: brighter on boost/DRS, duller in the rain.
    const base = this.scene === 'race' ? (this.rain ? 1100 : 1700) : this.scene === 'lights' ? 500 + this.lights * 260 : 900;
    this.ostFilter.frequency.setTargetAtTime(this.boost ? base * 2.4 : base, ctx.currentTime, this.boost ? 0.05 : 0.4);
    while (this.nextT < ctx.currentTime + 0.12) {
      this.play(this.step, this.nextT);
      this.nextT += this.sixteenth;
      this.step++;
    }
  }

  private play(step: number, t: number) {
    const s16 = step % 16, bar = Math.floor(step / 16);
    // The lights hold on the tonic for tension; everything else walks the progression.
    const { prog, ost } = TRACKS[this.track], barLen = this.sixteenth * 16;
    const chord = this.scene === 'lights' ? prog[0] : prog[bar % 4];
    if (s16 === 0) {
      this.pad(t, chord.tones, barLen);
      if (bar % 2 === 0) this.swell(t, chord.root, barLen * 1.6, 0.6, false);
    }
    const tones = [...chord.tones, ...chord.tones.map(n => n + 12)];
    this.pluck(t, midi(tones[ost[s16]] + 12), this.ostFilter, 0.16);
    if (s16 % 2 === 0) this.pluck(t, midi(tones[ost[(s16 + 5) % 16]] + 24), this.gains.high, 0.08, 'square', 0.18);
    if (s16 % 2 === 0) this.bass(t, midi(chord.root + (s16 === 14 ? 7 : 0)));
    if (s16 % 4 === 0) this.kick(t, 0.9);
    if (this.scene === 'lights' && this.lights > 0 && s16 % 2 === 0) this.hat(t, 0.35 + this.lights * 0.08);
    if (this.scene === 'race' && (s16 % 2 === 1 || s16 % 4 === 2)) this.hat(t, s16 % 4 === 2 ? 0.9 : 0.45);
    if (s16 === 4 || s16 === 12) this.snare(t);
  }

  // ---------- instruments ----------
  private env(g: GainNode, t: number, a: number, peak: number, r: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + r);
  }

  private pluck(t: number, f: number, dest: AudioNode, len: number, type: OscillatorType = 'sawtooth', peak = 0.3) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    this.env(g, t, 0.005, peak, len);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + len + 0.05);
  }

  private bass(t: number, f: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f;
    o2.type = 'square'; o2.frequency.value = f / 2;
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(this.scene === 'race' ? 700 : 380, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 0.2);
    this.env(g, t, 0.006, 0.42, 0.24);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.gains.bass);
    o.start(t); o2.start(t); o.stop(t + 0.3); o2.stop(t + 0.3);
  }

  private pad(t: number, notes: number[], len: number) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.value = this.rain ? 650 : 1000; lp.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + len * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + len * 1.05);
    lp.connect(g).connect(this.gains.pad);
    for (const n of notes) for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len * 1.1);
    }
  }

  /** Low brass: stacked detuned saws on root + fifth with an opening filter. */
  private swell(t: number, root: number, len: number, peak: number, sharp: boolean) {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(sharp ? 2600 : 1500, t + (sharp ? 0.08 : len * 0.6));
    lp.frequency.exponentialRampToValueAtTime(300, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 * peak, t + (sharp ? 0.03 : len * 0.55));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g).connect(this.gains.brass);
    for (const n of [root + 12, root + 19, root + 24]) for (const det of [-12, 0, 12]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + len + 0.05);
    }
  }

  private kick(t: number, v: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    this.env(g, t, 0.003, 0.9 * v, 0.28);
    o.connect(g).connect(this.gains.kick);
    o.start(t); o.stop(t + 0.35);
  }

  private noiseHit(t: number, dest: AudioNode, type: BiquadFilterType, f: number, peak: number, len: number) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; s.loop = true;
    fl.type = type; fl.frequency.value = f;
    this.env(g, t, 0.002, peak, len);
    s.connect(fl).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05);
  }
  private hat(t: number, v: number) { this.noiseHit(t, this.gains.hats, 'highpass', 7500, 0.22 * v, 0.045); }
  private snare(t: number) {
    this.noiseHit(t, this.gains.snare, 'bandpass', 1900, 0.55, 0.16);
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    this.env(g, t, 0.002, 0.3, 0.1);
    o.connect(g).connect(this.gains.snare); o.start(t); o.stop(t + 0.15);
  }
  private cymbal(t: number, v: number) { this.noiseHit(t, this.master, 'highpass', 5200, 0.35 * v, 1.6); }

  dispose() { clearInterval(this.timer); this.ctx?.close(); this.ctx = null; }
}
