// Garage 3D car: procedural F1 car built from three.js primitives (port of the
// handoff's f1-car-viewer.js). PBR paint with clearcoat, PMREM studio environment,
// slow auto-spin, drag-to-spin with inertia, and a spin kick on team/livery change.
import type * as THREE_NS from 'three';
import { buildCar, loadThree, type CarModel, type Paint } from './carModel';

type T3 = typeof THREE_NS;
export type { Paint };

const SPIN = 0.35; // rad/s auto-spin
const KICK = 5; // rad/s added on team/livery change


export class CarViewer {
  private alive = true;
  private r: THREE_NS.WebGLRenderer | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private model: CarModel | null = null;
  private vel = 0;
  private paint: Paint;

  constructor(private host: HTMLElement, paint: Paint) {
    this.paint = paint;
    loadThree().then(T => { if (this.alive) this.build(T); }).catch(e => console.warn('three failed to load', e));
  }

  /** Update colours; kicks the spin when team colour or livery changed. */
  setPaint(p: Paint) {
    const prev = this.paint;
    this.paint = p;
    this.apply();
    if (prev.color !== p.color || prev.livery !== p.livery) this.vel += KICK;
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    if (this.r) {
      this.r.dispose();
      this.r.forceContextLoss();
      this.r.domElement.remove();
      this.r = null;
    }
  }

  private apply() { this.model?.paint(this.paint); }

  private build(T: T3) {
    const r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    Object.assign(r.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', cursor: 'grab', touchAction: 'pan-y' });
    this.host.appendChild(r.domElement);
    this.r = r;

    // Studio environment: dark box with a few soft light panels, baked to PMREM.
    const scene = new T.Scene();
    const env = new T.Scene();
    env.add(new T.Mesh(new T.BoxGeometry(30, 30, 30), new T.MeshBasicMaterial({ color: 0x15151a, side: T.BackSide })));
    ([[0, 12, 0, 18, 1, 6, 4], [-12, 4, 4, 1, 6, 10, 1.6], [12, 4, -4, 1, 6, 10, 1.2], [0, 3, -13, 14, 3, 1, 0.8]] as const).forEach(([x, y, z, w, h, d, k]) => {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: new T.Color(k, k, k) }));
      m.position.set(x, y, z);
      env.add(m);
    });
    const pm = new T.PMREMGenerator(r);
    scene.environment = pm.fromScene(env, 0.04).texture;
    pm.dispose();
    scene.add(new T.HemisphereLight(0xffffff, 0x202024, 0.6));
    const key = new T.DirectionalLight(0xffffff, 2.2); key.position.set(4, 8, 6); scene.add(key);
    const rim = new T.DirectionalLight(0xbfd8ff, 1.4); rim.position.set(-6, 3, -7); scene.add(rim);

    const cam = new T.PerspectiveCamera(28, 1, 0.1, 100);
    const model = buildCar(T);
    const car = model.car;
    scene.add(car);
    this.model = model;
    this.apply();

    // Contact shadow + turntable ring
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sg = sc.getContext('2d')!, grd = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,.75)'); grd.addColorStop(0.6, 'rgba(0,0,0,.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
    const sh = new T.Mesh(new T.PlaneGeometry(2.6, 6.4), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(0, 0.005, 0.05); car.add(sh);
    const ring = new T.Mesh(new T.RingGeometry(3.15, 3.2, 96), new T.MeshBasicMaterial({ color: 0x2a2a30, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    car.position.z = 0.2; car.rotation.y = -0.7;

    // Fit the 6.4-long car to the element at a 17° elevation.
    const fit = () => {
      const w = this.host.clientWidth || 300, h = this.host.clientHeight || 300, a = w / h;
      const t = Math.tan(T.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max(6.4 / (2 * t * a), 3.2 / (2 * t));
      const el = T.MathUtils.degToRad(17);
      cam.aspect = a;
      cam.position.set(0, 0.45 + d * Math.sin(el), d * Math.cos(el));
      cam.lookAt(0, 0.4, 0);
      cam.updateProjectionMatrix();
      r.setSize(w, h, false);
    };
    fit();
    this.ro = new ResizeObserver(fit);
    this.ro.observe(this.host);

    // Drag to spin with inertia; auto-spin resumes 1.2 s after release.
    let drag: { x: number; t: number } | null = null, idleUntil = 0;
    const cv = r.domElement;
    cv.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, t: performance.now() };
      cv.setPointerCapture(e.pointerId);
      cv.style.cursor = 'grabbing';
      e.stopPropagation();
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, now = performance.now();
      car.rotation.y += dx * 0.012;
      this.vel = (dx * 0.012) / Math.max(0.016, (now - drag.t) / 1000);
      drag = { x: e.clientX, t: now };
    });
    const end = () => { if (!drag) return; drag = null; idleUntil = performance.now() + 1200; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!drag) {
        this.vel *= Math.pow(0.04, dt);
        car.rotation.y += (this.vel + (now > idleUntil ? SPIN : 0)) * dt;
      }
      r.render(scene, cam);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
