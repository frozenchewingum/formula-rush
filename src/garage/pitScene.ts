// 3D pit stop (Pit Stop Rush, v1.14): your car from above in its pit box. Each wheel slides off and the
// new one (in the compound's colour) slides on, the wheel nut spins on each gun, and a ring on the
// floor shows what the wheel needs: white = gun off, yellow = gun on, green = done, red = mistimed.
//
// One renderer is built once (on the way down the pit lane) and reused for every stop, so stopping
// never waits on shader compilation. Taps are handled by plain HTML zones over it, not raycasting.
import type * as THREE_NS from 'three';
import { buildCar, loadThree, type CarModel, type Paint } from './carModel';
import { PIT_SWAP } from '../game/tyres';

type T3 = typeof THREE_NS;

export type PitView = {
  t: number; ws: number[]; offAt: number[]; onAt: number[];
  oldColor: string; newColor: string; wrongWheel: number; wrongAt: number;
};

/** WebGL available and the device isn't very low-end: otherwise the flat 2D pit stop is used. */
export function pit3dSupported() {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    if ((nav.deviceMemory ?? 4) < 2) return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export class PitScene {
  private static inst: PitScene | null = null;
  /** The shared pit scene; the first call starts loading three.js and building it. */
  static get() { return this.inst || (this.inst = new PitScene()); }

  ready: Promise<boolean>;
  private T!: T3;
  private r!: THREE_NS.WebGLRenderer;
  private scene!: THREE_NS.Scene;
  private cam!: THREE_NS.PerspectiveCamera;
  private model!: CarModel;
  private rings: THREE_NS.MeshBasicMaterial[] = [];
  private host: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private source: () => PitView | null = () => null;
  private paintKey = '';

  private constructor() {
    this.ready = pit3dSupported()
      ? loadThree().then(T => { this.build(T); return true; }).catch(e => { console.warn('pit 3D unavailable', e); return false; })
      : Promise.resolve(false);
  }

  setPaint(p: Paint) {
    const key = p.color + p.dark + p.accent + p.livery;
    if (this.model && key !== this.paintKey) { this.paintKey = key; this.model.paint(p); }
  }

  /** Show the scene inside `host`, animating from `source` every frame. */
  attach(host: HTMLElement, source: () => PitView | null) {
    if (!this.r) return;
    this.detach();
    this.host = host; this.source = source;
    host.appendChild(this.r.domElement);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(host);
    this.fit();
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); this.ro = null;
    if (this.r?.domElement.parentElement) this.r.domElement.remove();
    this.host = null;
  }

  private build(T: T3) {
    this.T = T;
    const r = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', pointerEvents: 'none' });
    this.r = r;

    const scene = this.scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x303036, 1.1));
    const key = new T.DirectionalLight(0xffffff, 2.4); key.position.set(3, 10, 4); scene.add(key);
    const fill = new T.DirectionalLight(0xbfd8ff, 0.9); fill.position.set(-5, 6, -6); scene.add(fill);

    // Pit box: dark floor with yellow box lines.
    const floor = new T.Mesh(new T.PlaneGeometry(9, 12), new T.MeshStandardMaterial({ color: 0x232328, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    const line = new T.MeshBasicMaterial({ color: 0xffd400 });
    for (const [w, d, x, z] of [[0.08, 7.4, -2.3, 0.1], [0.08, 7.4, 2.3, 0.1], [4.68, 0.08, 0, 3.8], [4.68, 0.08, 0, -3.6]]) {
      const m = new T.Mesh(new T.PlaneGeometry(w, d), line);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); scene.add(m);
    }

    const model = this.model = buildCar(T);
    scene.add(model.car);
    // A ring on the floor under each wheel shows what it needs next.
    for (const w of model.wheels) {
      const mat = new T.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.9 });
      const ring = new T.Mesh(new T.RingGeometry(0.5, 0.62, 40), mat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(w.home.x + w.side * 0.12, 0.01, w.home.z);
      scene.add(ring);
      this.rings.push(mat);
    }

    // From above, nose pointing up the screen (+z up), slightly behind so the wheels read as round.
    const cam = this.cam = new T.PerspectiveCamera(30, 1, 0.1, 60);
    cam.up.set(0, 0, 1);
    this.fit();
    r.compile(scene, cam); // shaders compiled now, not when the car stops
  }

  private fit() {
    if (!this.r) return;
    const T = this.T, w = this.host?.clientWidth || 300, h = this.host?.clientHeight || 400, a = w / h;
    const t = Math.tan(T.MathUtils.degToRad(this.cam.fov / 2));
    // Car is ~6.4 long; wheels slide out to about ±2.3 wide.
    const d = Math.max(7.2 / (2 * t), 5.2 / (2 * t * a));
    this.cam.aspect = a;
    this.cam.position.set(0, d, -d * 0.18);
    this.cam.lookAt(0, 0, 0.15);
    this.cam.updateProjectionMatrix();
    this.r.setSize(w, h, false);
  }

  private frame() {
    const v = this.source();
    if (!v) return;
    this.model.wheels.forEach((w, i) => {
      const s = v.ws[i];
      let out = 0, color = v.oldColor, spin = 0;
      if (s === 1) {
        // Gun off: nut spins out, old tyre slides away, new one slides in.
        const k = (v.t - v.offAt[i]) / PIT_SWAP;
        spin = Math.max(0, 1 - k * 4);
        if (k < 0.5) out = k / 0.5;
        else { out = Math.max(0, 1 - (k - 0.5) / 0.5); color = v.newColor; }
      } else if (s === 2) {
        color = v.newColor;
        spin = Math.max(0, 1 - (v.t - v.onAt[i]) / 0.12);
      }
      w.group.position.set(w.home.x + w.side * out * 1.4, w.home.y + Math.sin(out * Math.PI) * 0.15, w.home.z);
      w.nut.rotation.x += spin * 0.9;
      w.bandMat.color.set(color);
      // Ring: white = gun off, yellow pulse = seated, ready for gun on, green = done, red = mistimed.
      const seated = s === 1 && v.t >= v.offAt[i] + PIT_SWAP;
      const wrong = v.wrongWheel === i && v.t - v.wrongAt < 0.35;
      const ring = this.rings[i];
      ring.color.set(wrong ? 0xe10600 : s === 2 ? 0x22c55e : seated ? 0xffd400 : s === 1 ? 0x5a5a62 : 0xf2f2f2);
      ring.opacity = seated && !wrong ? 0.55 + 0.45 * Math.abs(Math.sin(v.t * 10)) : 0.9;
    });
    this.r.render(this.scene, this.cam);
  }
}
