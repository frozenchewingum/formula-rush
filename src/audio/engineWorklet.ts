// AudioWorklet that synthesizes an engine from individual combustion pulses rather than steady
// oscillators. Each cylinder firing is a short exhaust bang (a sharp click plus a burst of noise)
// with its own strength, slight timing jitter and per-cylinder imbalance; the pulse train then
// rings through two exhaust-pipe resonances (comb filters). This is what makes it sound mechanical
// instead of synthetic. Loaded from a Blob URL so it needs no separate build step.

export const ENGINE_PROCESSOR = 'fr-engine';

export const engineWorkletSource = /* js */ `
class FrEngine extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 4200, minValue: 300, maxValue: 18000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'gain', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.cyl = o.cylinders || 6;
    // Each cylinder is a little different: that unevenness gives real engines their texture.
    this.cg = [];
    for (let i = 0; i < this.cyl; i++) this.cg.push(0.78 + Math.random() * 0.44);
    this.ci = 0;
    this.count = 0;
    this.rpm = 4200; this.thr = 0; this.g = 0;
    this.click = 0; this.burst = 0; this.thump = 0;
    const sr = sampleRate;
    // Exhaust: primaries (~2.4 ms) and the tailpipe/collector (~4.3 ms) as feedback combs.
    this.d1 = new Float32Array(Math.ceil(sr * 0.0024)); this.i1 = 0;
    this.d2 = new Float32Array(Math.ceil(sr * 0.0043)); this.i2 = 0;
    this.lp = 0; this.dc = 0; this.dcIn = 0;
    this.kClick = Math.exp(-1 / (sr * 0.00035));
    this.kBurst = Math.exp(-1 / (sr * 0.0011));
    this.kThump = Math.exp(-1 / (sr * 0.0045));
    this.kRpm = 1 - Math.exp(-1 / (sr * 0.012));
    this.kSlow = 1 - Math.exp(-1 / (sr * 0.03));
  }
  process(inputs, outputs, params) {
    const out = outputs[0], L = out[0], R = out[1] || null, n = L.length, sr = sampleRate;
    const rpmT = params.rpm[0], thrT = params.throttle[0], gT = params.gain[0];
    for (let s = 0; s < n; s++) {
      this.rpm += (rpmT - this.rpm) * this.kRpm;
      this.thr += (thrT - this.thr) * this.kSlow;
      this.g += (gT - this.g) * this.kSlow;
      // Firing events: a four-stroke fires cyl/2 times per revolution.
      this.count -= 1;
      if (this.count <= 0) {
        const interval = sr / (this.rpm / 60 * this.cyl / 2);
        // Combustion varies cycle to cycle, more at low revs and on a closed throttle.
        const jit = 0.012 + 0.05 * (1 - Math.min(1, this.rpm / 9000)) + 0.04 * (1 - this.thr);
        this.count += interval * (1 + (Math.random() - 0.5) * jit);
        const t = this.thr, cyl = this.cg[this.ci];
        this.ci = (this.ci + 1) % this.cyl;
        let amp = (0.4 + 0.6 * t) * cyl * (0.85 + Math.random() * 0.3);
        // Off throttle: weak, uneven pulses with the occasional misfire bang (overrun crackle).
        if (t < 0.15) {
          amp *= 0.55 + Math.random() * 0.45;
          if (this.rpm > 7000 && Math.random() < 0.012) { this.burst += 2.2; this.thump += 0.8; }
        }
        this.click += amp;
        this.burst += amp * (0.5 + 0.5 * (1 - t));
        this.thump += amp * 0.6;
      }
      const noise = Math.random() * 2 - 1;
      const exc = this.click * 0.9 + this.burst * noise * 0.55 + this.thump * 0.7;
      this.click *= this.kClick; this.burst *= this.kBurst; this.thump *= this.kThump;
      // Exhaust resonances.
      const a = exc + this.d1[this.i1] * 0.36;
      this.d1[this.i1] = a; this.i1 = (this.i1 + 1) % this.d1.length;
      const b = a + this.d2[this.i2] * 0.3;
      this.d2[this.i2] = b; this.i2 = (this.i2 + 1) % this.d2.length;
      // Gentle smoothing (pipe walls soak up the very top end) and DC block.
      this.lp += (b - this.lp) * 0.55;
      const y = this.lp - this.dcIn + 0.995 * this.dc;
      this.dcIn = this.lp; this.dc = y;
      // More firings per second means more energy: normalise so loudness follows throttle, not revs.
      const v = y * 0.16 * this.g * Math.sqrt(380 / (this.rpm / 20));
      L[s] = v; if (R) R[s] = v;
    }
    return true;
  }
}
registerProcessor('fr-engine', FrEngine);
`;
