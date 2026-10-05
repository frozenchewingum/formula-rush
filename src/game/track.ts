import { LANE, wrapA } from './constants';

export type Apex = { i: number; s: number; d: number; hit: number; miss: number };

export type Track = {
  id: TrackId; N: number; step: number; L: number;
  x: number[]; y: number[]; hd: number[]; k: number[]; ka: number[];
  nx: number[]; ny: number[]; kerb: boolean[]; drs: boolean[];
  drsStarts: number[]; apexes: Apex[];
  /** Brake boards (v1.20): index of the last-moment braking point (board 1) before each corner that needs it. */
  brakes: number[];
};

export type TrackId = 'circuit-1' | 'monsoon' | 'harbour';
export type TrackDef = { id: TrackId; name: string; short: string; blurb: string; pts: number[][]; scale: number };

/**
 * Layouts as Catmull-Rom control points (y down, driven in point order, start/finish at the first point).
 * The first stretch must stay straight for the pit lane: ~130 units before the line to ~90 after, pit on the right.
 */
export const TRACKS: TrackDef[] = [
  { id: 'circuit-1', name: 'Rush Park', short: 'RUSH PARK', blurb: 'Where it all began', scale: 0.62,
    pts: [[0,0],[0,-300],[40,-420],[160,-460],[260,-400],[280,-280],[380,-220],[520,-260],[600,-380],[720,-400],[800,-300],[780,-120],[680,0],[700,140],[620,260],[440,280],[300,200],[180,240],[60,200]] },
  { id: 'monsoon', name: 'Monsoon Park', short: 'MONSOON', blurb: 'Built for speed. Mind the hairpins', scale: 0.8,
    pts: [[0,0],[0,-170],[0,-330],[5,-390],[35,-420],[75,-410],[85,-370],[95,-330],[125,-305],[175,-310],[280,-335],[370,-360],[440,-320],[470,-250],[460,-180],[430,-120],[460,-50],[440,20],[445,120],[415,190],[350,210],[290,215],[250,235],[222,215],[230,175],[262,120],[250,60],[270,-20],[255,-100],[240,-150],[200,-185],[140,-185],[103,-150],[95,-90],[95,50],[95,170],[90,232],[62,262],[28,262],[4,230],[0,160]] },
  { id: 'harbour', name: 'Harbour Streets', short: 'HARBOUR', blurb: 'Tight, twisty, no room for error', scale: 1,
    pts: [[0,0],[0,-110],[10,-165],[55,-185],[150,-200],[240,-240],[290,-290],[300,-350],[330,-400],[390,-410],[440,-390],[452,-335],[445,-285],[460,-248],[490,-250],[498,-285],[520,-315],[560,-300],[600,-240],[610,-130],[580,-30],[560,40],[577,82],[550,140],[480,160],[420,150],[395,188],[345,168],[310,196],[200,195],[165,238],[120,252],[78,236],[30,214],[5,172],[0,110]] },
];
export const DEFAULT_TRACK: TrackId = 'circuit-1';
export const trackDef = (id: string | undefined) => TRACKS.find(t => t.id === id) || TRACKS[0];

export function buildTrack(id: string = DEFAULT_TRACK): Track {
  const def = trackDef(id);
  const P = def.pts.map(p => [p[0] * def.scale, p[1] * def.scale]);
  const n = P.length, dense: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n];
    for (let j = 0; j < 40; j++) {
      const t = j / 40, t2 = t * t, t3 = t2 * t;
      const f = (p0: number, p1: number, p2: number, p3: number) =>
        0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      dense.push([f(a[0], b[0], c[0], d[0]), f(a[1], b[1], c[1], d[1])]);
    }
  }
  const step = 3, pts = [dense[0]];
  let acc = 0;
  for (let i = 1; i <= dense.length; i++) {
    let a = dense[i - 1];
    const b = dense[i % dense.length];
    let seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + seg >= step) {
      const r = (step - acc) / seg;
      const q = [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
      pts.push(q); a = q; seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0;
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - pts[0][0], last[1] - pts[0][1]) < step * 0.6) pts.pop();

  const N = pts.length;
  const x: number[] = [], y: number[] = [], hd: number[] = [], kr: number[] = [], k: number[] = [], ka: number[] = [];
  const nx: number[] = [], ny: number[] = [], kerb: boolean[] = [], drs: boolean[] = [];
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    x.push(pts[i][0]); y.push(pts[i][1]); hd.push(Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
  for (let i = 0; i < N; i++) kr.push(wrapA(hd[(i + 1) % N] - hd[(i - 1 + N) % N]) / (2 * step));
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -4; j <= 4; j++) s += kr[(i + j + N) % N];
    k.push(s / 9); nx.push(-Math.sin(hd[i])); ny.push(Math.cos(hd[i]));
  }
  for (let i = 0; i < N; i++) {
    let m = 0;
    for (let j = -2; j <= 12; j++) m = Math.max(m, Math.abs(k[(i + j + N) % N]));
    ka.push(m); kerb.push(Math.abs(k[i]) > 0.011); drs.push(false);
  }
  const apexes: Apex[] = [];
  let i0 = -1;
  for (let i = 0; i <= N; i++) {
    const on = i < N && Math.abs(k[i]) > 0.013;
    if (on && i0 < 0) i0 = i;
    if (!on && i0 >= 0) {
      let bi = i0;
      for (let j = i0; j < i; j++) if (Math.abs(k[j]) > Math.abs(k[bi])) bi = j;
      if (i - i0 > 3) apexes.push({ i: bi, s: bi * step, d: Math.sign(k[bi]) * LANE, hit: -9, miss: -9 });
      i0 = -1;
    }
  }
  const runs: [number, number][] = [];
  i0 = -1;
  for (let i = 0; i <= N; i++) {
    const on = i < N && Math.abs(k[i]) < 0.005;
    if (on && i0 < 0) i0 = i;
    if (!on && i0 >= 0) { runs.push([i0, i]); i0 = -1; }
  }
  runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const drsStarts: number[] = [];
  runs.slice(0, 2).forEach(r => {
    if (r[1] - r[0] > 30) {
      const s0 = r[0] + 6;
      for (let i = s0; i < r[1] - 8; i++) drs[i] = true;
      drsStarts.push(s0);
    }
  });
  // Brake boards: speed profile at your top speed (corner limit from local curvature, braking at 75/s);
  // board 1 marks where it starts dropping from flat out into a corner that's well below top speed.
  const top = 78, vc = k.map(kk => Math.min(top, Math.sqrt(66 / Math.max(Math.abs(kk), 1e-4))));
  const prof = [...vc];
  for (let r = 0; r < 2; r++) for (let i = N - 1; i >= 0; i--) prof[i] = Math.min(prof[i], Math.sqrt(prof[(i + 1) % N] ** 2 + 2 * 75 * step));
  const brakes: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!(prof[i] < top - 1 && prof[(i - 1 + N) % N] >= top - 1)) continue;
    let low = top;
    for (let j = 0; j < 40; j++) low = Math.min(low, vc[(i + j) % N]);
    if (low < 60 && (!brakes.length || i - brakes[brakes.length - 1] > 30)) brakes.push(i);
  }
  if (brakes.length > 1 && brakes[0] + N - brakes[brakes.length - 1] <= 30) brakes.shift();
  return { id: def.id, N, step, L: N * step, x, y, hd, k, ka, nx, ny, kerb, drs, drsStarts, apexes, brakes };
}

export function trackAt(T: Track, p: number) {
  let s = p % T.L;
  if (s < 0) s += T.L;
  const f = s / T.step, i = Math.floor(f) % T.N, j = (i + 1) % T.N, r = f - Math.floor(f);
  const dh = wrapA(T.hd[j] - T.hd[i]);
  return { x: T.x[i] + (T.x[j] - T.x[i]) * r, y: T.y[i] + (T.y[j] - T.y[i]) * r, h: T.hd[i] + dh * r, k: T.k[i], i };
}
