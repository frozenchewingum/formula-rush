// Procedural F1 car built from three.js primitives, shared by the Garage viewer and the 3D pit stop.
import type * as THREE_NS from 'three';
import type { Livery } from '../game/constants';

type T3 = typeof THREE_NS;
type Mat = THREE_NS.Material;
export type Part = 'mono' | 'pod' | 'engine' | 'fw' | 'rEnd' | 'rFlap' | 'stripe';
export type Paint = { color: string; dark: string; accent: string; livery: Livery };
export type CarMaterials = Record<'paint' | 'dark' | 'helmet' | 'accent' | 'stealth', THREE_NS.MeshPhysicalMaterial> & Record<'carbon' | 'black' | 'tyre' | 'rim' | 'white' | 'halo', THREE_NS.MeshStandardMaterial>;
/** One wheel: group to move, its nut to spin, and the sidewall band showing the compound. */
export type CarWheel = { group: THREE_NS.Group; nut: THREE_NS.Mesh; band: THREE_NS.Mesh; bandMat: THREE_NS.MeshStandardMaterial; home: THREE_NS.Vector3; side: number; radius: number; width: number };
export type CarModel = { car: THREE_NS.Group; M: CarMaterials; parts: Record<Part, THREE_NS.Mesh[]>; wheels: CarWheel[]; paint: (p: Paint) => void };

let threeP: Promise<T3> | null = null;
/** three.js loads once, lazily (its own chunk), and is shared by every 3D view. */
export const loadThree = () => threeP || (threeP = import('three'));

/** Builds the car facing +z. Wheels come back as [front-left, front-right, rear-left, rear-right] (driver's left = +x). */
export function buildCar(T: T3): CarModel {
  const M = {
    paint: new T.MeshPhysicalMaterial({ metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }),
    dark: new T.MeshPhysicalMaterial({ metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.12 }),
    helmet: new T.MeshPhysicalMaterial({ metalness: 0.2, roughness: 0.25, clearcoat: 1 }),
    accent: new T.MeshPhysicalMaterial({ metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }),
    stealth: new T.MeshPhysicalMaterial({ color: 0x1c1c20, metalness: 0.5, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.2 }),
    carbon: new T.MeshStandardMaterial({ color: 0x141416, metalness: 0.4, roughness: 0.45 }),
    black: new T.MeshStandardMaterial({ color: 0x08080a, roughness: 0.7 }),
    tyre: new T.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.92 }),
    rim: new T.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 0.9, roughness: 0.3 }),
    white: new T.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }),
    halo: new T.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.35 }),
  };

  const car = new T.Group();
  const add = (geo: THREE_NS.BufferGeometry, mat: Mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); car.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number, mat: Mat, x: number, y: number, z: number, rx = 0) => add(new T.BoxGeometry(w, h, d), mat, x, y, z, rx);
  // Plan-view outline [x, z] extruded upward.
  const plan = (pts: number[][], h: number, y: number, mat: Mat, bev = 0.06) => {
    const s = new T.Shape();
    pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
    s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: bev * 0.8, bevelSize: bev, bevelSegments: 4, curveSegments: 8 });
    g.rotateX(-Math.PI / 2);
    return add(g, mat, 0, y, 0);
  };
  // Side-view profile [z, y] extruded across the car's width.
  const side = (pts: number[][], w: number, mat: Mat, bev = 0.06) => {
    const s = new T.Shape();
    pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    s.closePath();
    const g = new T.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4 });
    g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
    return add(g, mat);
  };
  const mirror = (half: number[][]) => [...half, ...half.slice().reverse().map(([x, z]) => [-x, z])];
  const rod = (a: number[], b: number[], rad = 0.018, mat: Mat = M.black) => {
    const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]);
    const m = new T.Mesh(new T.CylinderGeometry(rad, rad, A.distanceTo(B), 8), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    car.add(m);
  };

  // Floor, monocoque, sidepods, engine cover
  box(1.5, 0.03, 3.4, M.carbon, 0, 0.1, -0.35);
  const mono = plan(mirror([[0.07, 2.75], [0.12, 2.2], [0.2, 1.3], [0.28, 0.6], [0.34, 0.15], [0.32, -1.4], [0.18, -2.0], [0.1, -2.3]]), 0.26, 0.2, M.paint);
  const pod = [[0.3, 0.38], [0.74, 0.26], [0.78, -0.3], [0.6, -1.1], [0.34, -1.65], [0.3, -1.65]];
  const pods = [plan(pod, 0.24, 0.16, M.dark, 0.08), plan(pod.map(([x, z]) => [-x, z]).reverse(), 0.24, 0.16, M.dark, 0.08)];
  const engPts = [[0.15, 0.48], [-0.25, 0.98], [-0.85, 0.92], [-2.05, 0.5], [-2.05, 0.42], [0.15, 0.42]];
  const eng = side(engPts, 0.3, M.paint);
  const stripes = [side(engPts, 0.1, M.accent, 0.066), box(0.08, 0.012, 2.25, M.accent, 0, 0.512, 1.55)];
  box(0.16, 0.12, 0.08, M.black, 0, 0.96, -0.2);
  box(0.32, 0.04, 0.7, M.black, 0, 0.53, 0.18);
  // Cockpit, helmet, halo, mirrors
  const helm = add(new T.SphereGeometry(0.13, 24, 16), M.helmet, 0, 0.62, -0.02);
  helm.scale.set(1, 1, 1.12);
  box(0.2, 0.05, 0.05, M.black, 0, 0.64, 0.1);
  const halo = add(new T.TorusGeometry(0.28, 0.028, 10, 28, Math.PI), M.halo, 0, 0.78, 0.0, Math.PI / 2);
  halo.scale.set(1, 1.25, 1);
  rod([0, 0.56, 0.52], [0, 0.78, 0.35], 0.03, M.halo);
  rod([0.27, 0.78, 0], [0.3, 0.55, -0.12], 0.025, M.halo);
  rod([-0.27, 0.78, 0], [-0.3, 0.55, -0.12], 0.025, M.halo);
  [-1, 1].forEach(sx => { rod([sx * 0.3, 0.52, 0.42], [sx * 0.45, 0.66, 0.42], 0.012); box(0.14, 0.07, 0.04, M.paint, sx * 0.5, 0.68, 0.42); });
  // Front wing
  box(1.9, 0.035, 0.34, M.carbon, 0, 0.1, 2.62);
  const fw = box(1.84, 0.03, 0.2, M.paint, 0, 0.18, 2.5, -0.35);
  box(1.8, 0.03, 0.14, M.white, 0, 0.25, 2.4, -0.55);
  [-1, 1].forEach(sx => box(0.03, 0.24, 0.52, M.carbon, sx * 0.95, 0.18, 2.58));
  rod([0.06, 0.24, 2.45], [0.06, 0.12, 2.5], 0.02);
  rod([-0.06, 0.24, 2.45], [-0.06, 0.12, 2.5], 0.02);
  // Rear wing (DRS flap = accent)
  box(1.0, 0.05, 0.34, M.carbon, 0, 0.95, -2.28);
  const rFlap = box(1.0, 0.04, 0.2, M.paint, 0, 1.06, -2.2, 0.45);
  const rEnd = [-1, 1].map(sx => box(0.04, 0.58, 0.58, M.dark, sx * 0.52, 0.76, -2.22));
  const parts: Record<Part, THREE_NS.Mesh[]> = { mono: [mono], pod: pods, engine: [eng], fw: [fw], rEnd, rFlap: [rFlap], stripe: stripes };
  box(0.06, 0.42, 0.1, M.carbon, 0, 0.66, -2.12);
  box(0.95, 0.16, 0.42, M.carbon, 0, 0.14, -2.22);
  add(new T.SphereGeometry(0.05, 12, 8), new T.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1a10, emissiveIntensity: 1.2 }), 0, 0.3, -2.44);

  // Wheels + suspension
  // Each wheel is its own group (tyre, rim, wheel nut, compound sidewall band) so the pit stop can
  // slide it off and back on; the band gets its own material so it can show the tyre compound.
  const wheel = (x: number, z: number, rad: number, w: number): CarWheel => {
    const sx = Math.sign(x), g = new T.Group();
    g.position.set(x, rad, z);
    const part = (geo: THREE_NS.BufferGeometry, mat: Mat, px = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new T.Mesh(geo, mat); m.position.set(px, 0, 0); m.rotation.set(rx, ry, rz); g.add(m); return m;
    };
    part(new T.CylinderGeometry(rad, rad, w, 40), M.tyre, 0, 0, 0, Math.PI / 2);
    part(new T.CylinderGeometry(rad * 0.62, rad * 0.62, w + 0.01, 32), M.rim, 0, 0, 0, Math.PI / 2);
    const nut = part(new T.CylinderGeometry(rad * 0.18, rad * 0.18, w + 0.03, 6), M.black, 0, 0, 0, Math.PI / 2);
    const bandMat = M.white.clone() as THREE_NS.MeshStandardMaterial;
    const band = part(new T.TorusGeometry(rad * 0.8, 0.02, 6, 40), bandMat, sx * (w / 2 + 0.002), 0, Math.PI / 2);
    car.add(g);
    return { group: g, nut, band, bandMat, home: g.position.clone(), side: sx, radius: rad, width: w };
  };
  const wheels = [wheel(0.86, 1.75, 0.34, 0.34), wheel(-0.86, 1.75, 0.34, 0.34), wheel(0.82, -1.6, 0.36, 0.44), wheel(-0.82, -1.6, 0.36, 0.44)];
  [-1, 1].forEach(sx => {
    rod([sx * 0.22, 0.42, 1.85], [sx * 0.7, 0.4, 1.75]); rod([sx * 0.22, 0.26, 1.55], [sx * 0.7, 0.3, 1.75]); rod([sx * 0.22, 0.26, 2.0], [sx * 0.7, 0.3, 1.75]);
    rod([sx * 0.3, 0.46, -1.45], [sx * 0.62, 0.44, -1.6]); rod([sx * 0.3, 0.26, -1.4], [sx * 0.62, 0.28, -1.6]); rod([sx * 0.3, 0.26, -1.85], [sx * 0.62, 0.28, -1.6]);
  });


  const paint = (p: Paint) => {
    const { color, dark, accent, livery } = p;
    M.paint.color.set(color); M.dark.color.set(dark); M.helmet.color.set(accent); M.accent.color.set(accent);
    const P = M.paint, D = M.dark, A = M.accent, S = M.stealth;
    const maps: Record<Livery, Record<Part, Mat | null>> = {
      classic: { mono: P, pod: D, engine: P, fw: A, rEnd: D, rFlap: A, stripe: null },
      split: { mono: D, pod: P, engine: D, fw: A, rEnd: P, rFlap: A, stripe: null },
      stripe: { mono: P, pod: D, engine: P, fw: A, rEnd: D, rFlap: A, stripe: A },
      stealth: { mono: S, pod: S, engine: S, fw: P, rEnd: P, rFlap: A, stripe: A },
    };
    const map = maps[livery] || maps.classic;
    (Object.keys(parts) as Part[]).forEach(k => parts[k].forEach(m => {
      const mat = map[k];
      m.visible = !!mat;
      if (mat) m.material = mat;
    }));
  };
  return { car, M: M as CarMaterials, parts, wheels, paint };
}
