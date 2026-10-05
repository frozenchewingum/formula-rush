// Synthesized engine sound (Web Audio, no samples): an F1-style turbo V6 for your car, plus a
// pass-by voice for the nearest rival. Driven every frame from App with a small snapshot of the race.

/** Gear top speeds in track units/s: VMAX (78) sits high in 7th, boost (~97) reaches 8th. */
const GEAR_TOP = [22, 31, 40, 49, 58, 67, 82, 100];
const IDLE = 4200, REDLINE = 12000, LIMIT_RPM = 11400;
/** A V6 four-stroke fires 3 times per revolution: firing frequency = rpm / 60 * 3. */
const fire = (rpm: number) => rpm / 20;

export type EngineInput = {
  /** off: garage/results · grid: on the lights · race: driving · box: stopped in the pit box */
  mode: 'off' | 'grid' | 'race' | 'box';
  /** Holding the throttle on the grid. */
  revving: boolean;
  /** Your speed (track units/s) and throttle 0–1. */
  v: number; throttle: number;
  boost: boolean; limiter: boolean;
  /** Nearest rival: gap along the track (+ ahead), closing speed (+ = getting closer), lateral offset, speed. */
  rival: { gap: number; closing: number; side: number; v: number } | null;
};

function shaper(ctx: BaseAudioContext, k: number) {
  const ws = ctx.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
  ws.curve = curve; ws.oversample = '2x';
  return ws;
}

/** One engine: firing-frequency saw + half-order square + slightly detuned saw for V6 roughness. */
class Voice {
  private osc: OscillatorNode[];
  private whine: OscillatorNode;
  private whineGain: GainNode;
  private noiseGain: GainNode;
  private noiseBand: BiquadFilterNode;
  private lp: BiquadFilterNode;
  readonly level: GainNode;
  constructor(private ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, grit: number) {
    const mix = ctx.createGain(); mix.gain.value = 0.32;
    const ws = shaper(ctx, grit);
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 2.2; this.lp.frequency.value = 900;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    this.level = ctx.createGain(); this.level.gain.value = 0;
    mix.connect(ws).connect(this.lp).connect(hp).connect(this.level).connect(dest);
    const mk = (type: OscillatorType, gain: number, detune = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.detune.value = detune; g.gain.value = gain;
      o.connect(g).connect(mix); o.start();
      return o;
    };
    this.osc = [mk('sawtooth', 0.55), mk('square', 0.35), mk('sawtooth', 0.3, 14), mk('triangle', 0.25)];
    // turbo / MGU-K whine: a thin sine a few orders up, louder on boost
    this.whine = ctx.createOscillator(); this.whine.type = 'sine';
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(this.level); this.whine.start();
    // intake / exhaust hiss that follows the revs
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    this.noiseBand = ctx.createBiquadFilter(); this.noiseBand.type = 'bandpass'; this.noiseBand.Q.value = 1.4;
    this.noiseGain = ctx.createGain(); this.noiseGain.gain.value = 0;
    ns.connect(this.noiseBand).connect(this.noiseGain).connect(mix); ns.start();
  }
  set(rpm: number, throttle: number, level: number, whine: number, tc = 0.03) {
    const t = this.ctx.currentTime, f = fire(rpm);
    const [a, b, c, d] = this.osc;
    a.frequency.setTargetAtTime(f, t, tc);
    b.frequency.setTargetAtTime(f / 2, t, tc);
    c.frequency.setTargetAtTime(f, t, tc);
    d.frequency.setTargetAtTime(f * 2, t, tc);
    this.whine.frequency.setTargetAtTime(f * 4.6, t, tc);
    this.whineGain.gain.setTargetAtTime(whine, t, 0.08);
    this.noiseBand.frequency.setTargetAtTime(f * 3, t, tc);
    this.noiseGain.gain.setTargetAtTime(0.15 + 0.35 * throttle, t, 0.05);
    // the filter opens with throttle and revs: lifting off sounds muffled, flat out sounds raw
    this.lp.frequency.setTargetAtTime(380 + throttle * 2600 + (rpm / REDLINE) * 1100, t, 0.04);
    this.level.gain.setTargetAtTime(level, t, 0.025);
  }
}

export class EngineSound {
  private me: Voice;
  private rival: Voice;
  private pan: StereoPannerNode;
  private popBus: GainNode;
  private gear = 0;
  private rpm = IDLE;
  private cut = 0;
  private t = 0;
  constructor(private ctx: AudioContext, dest: AudioNode, private noise: AudioBuffer) {
    this.me = new Voice(ctx, dest, noise, 2.6);
    this.pan = ctx.createStereoPanner();
    this.pan.connect(dest);
    this.rival = new Voice(ctx, this.pan, noise, 2.0);
    this.popBus = ctx.createGain(); this.popBus.gain.value = 0.5; this.popBus.connect(dest);
  }

  update(dt: number, s: EngineInput) {
    this.t += dt;
    if (s.mode === 'off') {
      this.me.set(IDLE, 0, 0, 0, 0.2); this.rival.set(IDLE, 0, 0, 0, 0.2);
      this.gear = 0; this.rpm = IDLE;
      return;
    }
    // ---------- your car ----------
    let rpm: number, throttle = s.throttle, level: number, whine = 0;
    if (s.mode === 'grid' || s.mode === 'box') {
      this.gear = 0;
      if (s.revving) {
        // Holding on the grid: straight up to the limiter and bounce off it.
        const target = LIMIT_RPM - 250 + Math.sin(this.t * 2 * Math.PI * 7) * 350;
        rpm = this.rpm + (target - this.rpm) * Math.min(1, dt * 6);
        throttle = 1;
        level = 0.3 * (rpm > LIMIT_RPM - 700 && Math.sin(this.t * 2 * Math.PI * 15) < -0.2 ? 0.55 : 1);
      } else {
        rpm = this.rpm + (IDLE + Math.sin(this.t * 9) * 120 - this.rpm) * Math.min(1, dt * 4);
        throttle = 0.15; level = 0.16;
      }
    } else {
      // Gearbox with hysteresis so shifts don't hunt.
      const v = Math.max(0, s.v);
      const prev = this.gear;
      while (this.gear < GEAR_TOP.length - 1 && v > GEAR_TOP[this.gear] * 0.97) this.gear++;
      while (this.gear > 0 && v < GEAR_TOP[this.gear - 1] * 0.8) this.gear--;
      if (this.gear > prev) this.cut = 0.07; // upshift: a short ignition cut
      if (this.gear < prev && throttle < 0.5) this.downshiftBlip();
      const lo = this.gear ? GEAR_TOP[this.gear - 1] * 0.75 : 0, hi = GEAR_TOP[this.gear];
      rpm = IDLE + 600 + (REDLINE - IDLE - 600) * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      level = 0.18 + 0.16 * throttle;
      whine = s.boost ? 0.07 : 0.012 * throttle;
      if (s.boost) { level *= 1.15; throttle = 1; }
      // Pit limiter: the stuttering buzz of the rev cut at a fixed speed.
      if (s.limiter && v > 20) level *= Math.sin(this.t * 2 * Math.PI * 11) > 0 ? 1 : 0.45;
      if (this.cut > 0) { this.cut -= dt; level *= 0.3; }
      // Lifting at high revs: overrun crackle.
      if (throttle < 0.2 && rpm > 8000 && Math.random() < dt * 9) this.pop(0.25 + Math.random() * 0.35);
    }
    this.rpm = rpm;
    this.me.set(rpm, throttle, level, whine);

    // ---------- nearest rival: loud when close, pitch bends as it passes (doppler) ----------
    const r = s.rival;
    if (r && s.mode === 'race') {
      const dist = Math.hypot(r.gap, r.side);
      const near = 1 / (1 + (dist / 14) ** 2);
      const doppler = Math.min(1.18, Math.max(0.84, 1 + r.closing / 260));
      const g = GEAR_TOP.findIndex(top => r.v <= top * 0.97);
      const gi = g < 0 ? GEAR_TOP.length - 1 : g, lo = gi ? GEAR_TOP[gi - 1] * 0.75 : 0;
      const rrpm = IDLE + 600 + (REDLINE - IDLE - 600) * Math.min(1, Math.max(0, (r.v - lo) / (GEAR_TOP[gi] - lo)));
      this.rival.set(rrpm * doppler, 0.8, 0.22 * near, 0, 0.06);
      this.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, r.side / 8)), this.ctx.currentTime, 0.05);
    } else this.rival.set(IDLE, 0, 0, 0, 0.1);
  }

  /** One exhaust pop: a short burst of filtered noise. */
  private pop(v: number) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 1400; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.popBus);
    s.start(t, Math.random() * 0.5); s.stop(t + 0.07);
  }
  private downshiftBlip() { this.pop(0.3); }
}
