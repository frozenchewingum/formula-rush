// Engine sound (Web Audio, no samples): an F1-style turbo V6 for your car, a pass-by voice for the
// nearest rival, and road/wind noise. Driven every frame from App with a small snapshot of the race.
//
// The engine itself is an AudioWorklet (engineWorklet.ts) that builds the sound from individual
// combustion pulses through exhaust resonances. Browsers without AudioWorklet get a simpler
// oscillator voice instead.
import { ENGINE_PROCESSOR, engineWorkletSource } from './engineWorklet';

/** Gear top speeds in track units/s: VMAX (78) sits high in 7th, boost (~97) reaches 8th. */
const GEAR_TOP = [22, 31, 40, 49, 58, 67, 82, 100];
const IDLE = 4200, REDLINE = 12000, LIMIT_RPM = 11400;
const VREF = 78;

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

/** rpm for a speed through the gearbox (rivals don't need hysteresis). */
function rpmFor(v: number) {
  const g = GEAR_TOP.findIndex(top => v <= top * 0.97), gi = g < 0 ? GEAR_TOP.length - 1 : g;
  const lo = gi ? GEAR_TOP[gi - 1] * 0.75 : 0;
  return IDLE + 600 + (REDLINE - IDLE - 600) * Math.min(1, Math.max(0, (v - lo) / (GEAR_TOP[gi] - lo)));
}

interface Voice {
  /** rpm, throttle 0–1, output level, turbo whine level, brightness 0–1 (distance / muffling). */
  set(rpm: number, throttle: number, level: number, whine: number, bright: number): void;
}

/** The real engine: combustion pulses from the worklet, then the car's body and exhaust tone. */
class PulseVoice implements Voice {
  private node: AudioWorkletNode;
  private lp: BiquadFilterNode;
  private whine: OscillatorNode;
  private whineGain: GainNode;
  private hiss: GainNode;
  private hissBand: BiquadFilterNode;
  constructor(private ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer) {
    this.node = new AudioWorkletNode(ctx, ENGINE_PROCESSOR, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { cylinders: 6 } });
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 38; hp.Q.value = 0.7;
    // Body: a low resonance for chest, a presence bump for the rasp you hear on onboards.
    const body = ctx.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 170; body.Q.value = 0.9; body.gain.value = 5;
    const rasp = ctx.createBiquadFilter(); rasp.type = 'peaking'; rasp.frequency.value = 2600; rasp.Q.value = 1.1; rasp.gain.value = 3;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.6; this.lp.frequency.value = 3000;
    const sat = shaper(ctx, 1.6);
    this.node.connect(hp).connect(body).connect(rasp).connect(sat).connect(this.lp).connect(dest);
    // Turbo / MGU-K whine: thin, a few orders up, mostly heard on boost.
    this.whine = ctx.createOscillator(); this.whine.type = 'sine';
    this.whineGain = ctx.createGain(); this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain).connect(dest); this.whine.start();
    // Intake rush that rises with revs and throttle.
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    this.hissBand = ctx.createBiquadFilter(); this.hissBand.type = 'bandpass'; this.hissBand.Q.value = 0.8;
    this.hiss = ctx.createGain(); this.hiss.gain.value = 0;
    ns.connect(this.hissBand).connect(this.hiss).connect(dest); ns.start(0, Math.random() * 0.5);
  }
  set(rpm: number, throttle: number, level: number, whine: number, bright: number) {
    const t = this.ctx.currentTime, p = this.node.parameters;
    p.get('rpm')!.setValueAtTime(rpm, t);
    p.get('throttle')!.setValueAtTime(throttle, t);
    p.get('gain')!.setValueAtTime(level, t);
    this.lp.frequency.setTargetAtTime(700 + bright * (2200 + throttle * 6500), t, 0.04);
    this.whine.frequency.setTargetAtTime(rpm / 20 * 4.6, t, 0.03);
    this.whineGain.gain.setTargetAtTime(whine * level, t, 0.08);
    this.hissBand.frequency.setTargetAtTime(600 + rpm * 0.18, t, 0.05);
    this.hiss.gain.setTargetAtTime(level * bright * (0.02 + 0.06 * throttle), t, 0.05);
  }
}

/** Fallback for browsers without AudioWorklet: stacked oscillators, soft-clipped. */
class OscVoice implements Voice {
  private osc: OscillatorNode[];
  private lp: BiquadFilterNode;
  private level: GainNode;
  constructor(private ctx: BaseAudioContext, dest: AudioNode) {
    const mix = ctx.createGain(); mix.gain.value = 0.32;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 1.2;
    this.level = ctx.createGain(); this.level.gain.value = 0;
    mix.connect(shaper(ctx, 2.4)).connect(this.lp).connect(this.level).connect(dest);
    const mk = (type: OscillatorType, gain: number, detune = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.detune.value = detune; g.gain.value = gain;
      o.connect(g).connect(mix); o.start();
      return o;
    };
    this.osc = [mk('sawtooth', 0.55), mk('square', 0.35), mk('sawtooth', 0.3, 14)];
  }
  set(rpm: number, throttle: number, level: number, _whine: number, bright: number) {
    const t = this.ctx.currentTime, f = rpm / 20;
    this.osc[0].frequency.setTargetAtTime(f, t, 0.03);
    this.osc[1].frequency.setTargetAtTime(f / 2, t, 0.03);
    this.osc[2].frequency.setTargetAtTime(f, t, 0.03);
    this.lp.frequency.setTargetAtTime(380 + bright * throttle * 2600 + (rpm / REDLINE) * 1100, t, 0.04);
    this.level.gain.setTargetAtTime(level * 0.9, t, 0.025);
  }
}

export class EngineSound {
  private me: Voice | null = null;
  private rival: Voice | null = null;
  private pan: StereoPannerNode;
  private bus: GainNode;
  private road: GainNode;
  private wind: GainNode;
  private gear = 0;
  private rpm = IDLE;
  private cut = 0;
  private t = 0;
  /** Resolves once the voices exist (the worklet module loads asynchronously). */
  ready: Promise<void>;

  constructor(private ctx: BaseAudioContext, dest: AudioNode, noise: AudioBuffer) {
    // Your car goes through a little space: two short reflections, like walls and grandstands.
    this.bus = ctx.createGain(); this.bus.connect(dest);
    for (const [d, g, p] of [[0.027, 0.13, -0.6], [0.043, 0.09, 0.6]]) {
      const dl = ctx.createDelay(0.1), gn = ctx.createGain(), pn = ctx.createStereoPanner();
      dl.delayTime.value = d; gn.gain.value = g; pn.pan.value = p;
      this.bus.connect(dl).connect(gn).connect(pn).connect(dest);
    }
    this.pan = ctx.createStereoPanner(); this.pan.connect(dest);
    // Tyre rumble and wind rise with speed.
    const n1 = ctx.createBufferSource(), n2 = ctx.createBufferSource();
    n1.buffer = noise; n2.buffer = noise; n1.loop = n2.loop = true;
    const roadLp = ctx.createBiquadFilter(); roadLp.type = 'lowpass'; roadLp.frequency.value = 320;
    const windBp = ctx.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 1100; windBp.Q.value = 0.5;
    this.road = ctx.createGain(); this.road.gain.value = 0;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    n1.connect(roadLp).connect(this.road).connect(dest);
    n2.connect(windBp).connect(this.wind).connect(dest);
    n1.start(0, 0.1); n2.start(0, 0.6);

    const worklet = (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet;
    const fallback = () => { this.me = new OscVoice(ctx, this.bus); this.rival = new OscVoice(ctx, this.pan); };
    if (!worklet || typeof AudioWorkletNode === 'undefined') { fallback(); this.ready = Promise.resolve(); return; }
    const url = URL.createObjectURL(new Blob([engineWorkletSource], { type: 'application/javascript' }));
    this.ready = worklet.addModule(url).then(() => {
      this.me = new PulseVoice(ctx, this.bus, noise);
      this.rival = new PulseVoice(ctx, this.pan, noise);
    }, fallback).finally(() => URL.revokeObjectURL(url));
  }

  update(dt: number, s: EngineInput) {
    this.t += dt;
    const me = this.me, rv = this.rival, now = this.ctx.currentTime;
    if (!me || !rv) return;
    const speed = s.mode === 'off' ? 0 : Math.max(0, s.v) / VREF;
    this.road.gain.setTargetAtTime(0.05 * Math.min(1.3, speed), now, 0.1);
    this.wind.gain.setTargetAtTime(0.035 * speed * speed, now, 0.1);
    if (s.mode === 'off') {
      me.set(IDLE, 0, 0, 0, 1); rv.set(IDLE, 0, 0, 0, 1);
      this.gear = 0; this.rpm = IDLE;
      return;
    }
    // ---------- your car ----------
    let rpm: number, throttle = s.throttle, level = 1, whine = 0;
    if (s.mode === 'grid' || s.mode === 'box') {
      this.gear = 0;
      if (s.revving) {
        // Holding on the grid: up to the limiter and bouncing off it (the ignition cuts out briefly).
        const target = LIMIT_RPM - 200 + Math.sin(this.t * 2 * Math.PI * 6) * 300;
        rpm = this.rpm + (target - this.rpm) * Math.min(1, dt * 5);
        const bouncing = rpm > LIMIT_RPM - 600 && Math.sin(this.t * 2 * Math.PI * 13) < -0.3;
        throttle = bouncing ? 0.05 : 1;
        level = 1.2;
      } else {
        // Idle with a lumpy, hunting rhythm.
        rpm = this.rpm + (IDLE + Math.sin(this.t * 7) * 140 + Math.sin(this.t * 2.3) * 90 - this.rpm) * Math.min(1, dt * 4);
        throttle = 0.12; level = 0.6;
      }
    } else {
      // Gearbox with hysteresis so shifts don't hunt.
      const v = Math.max(0, s.v), prev = this.gear;
      while (this.gear < GEAR_TOP.length - 1 && v > GEAR_TOP[this.gear] * 0.97) this.gear++;
      while (this.gear > 0 && v < GEAR_TOP[this.gear - 1] * 0.8) this.gear--;
      if (this.gear > prev) this.cut = 0.045; // seamless-shift ignition cut
      const lo = this.gear ? GEAR_TOP[this.gear - 1] * 0.75 : 0, hi = GEAR_TOP[this.gear];
      rpm = IDLE + 600 + (REDLINE - IDLE - 600) * Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      if (this.gear < prev && throttle < 0.5) rpm += 900; // downshift blip
      level = 0.95 + 0.15 * throttle;
      whine = s.boost ? 0.035 : 0.006 * throttle;
      if (s.boost) { level *= 1.1; throttle = 1; }
      // Pit limiter: the rev cut stutters on and off at a fixed speed.
      if (s.limiter && v > 20 && Math.sin(this.t * 2 * Math.PI * 9) < 0) throttle = 0.04;
      if (this.cut > 0) { this.cut -= dt; throttle = 0.05; }
    }
    this.rpm = rpm;
    me.set(rpm, throttle, level, whine, 1);

    // ---------- nearest rival: louder and brighter when close, pitch bends as it passes ----------
    const r = s.rival;
    if (r && s.mode === 'race') {
      const dist = Math.hypot(r.gap, r.side);
      const near = 1 / (1 + (dist / 14) ** 2);
      const doppler = Math.min(1.18, Math.max(0.84, 1 + r.closing / 260));
      rv.set(rpmFor(r.v) * doppler, 0.85, 0.75 * near, 0, 0.25 + 0.75 * near);
      this.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, r.side / 8)), now, 0.05);
    } else rv.set(IDLE, 0, 0, 0, 0.3);
  }
}
