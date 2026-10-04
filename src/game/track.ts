import { LANE, wrapA } from './constants';

export type Apex = { i: number; s: number; d: number; hit: number; miss: number };

export type Track = {
  N: number; step: number; L: number;
  x: number[]; y: number[]; hd: number[]; k: number[]; ka: number[];
  nx: number[]; ny: number[]; kerb: boolean[]; drs: boolean[];
  drsStarts: number[]; apexes: Apex[];
};

const CONTROL = [[0,0],[0,-300],[40,-420],[160,-460],[260,-400],[280,-280],[380,-220],[520,-260],[600,-380],[720,-400],[800,-300],[780,-120],[680,0],[700,140],[620,260],[440,280],[300,200],[180,240],[60,200]];

export function buildTrack(): Track {
  const P = CONTROL.map(p => [p[0] * 0.62, p[1] * 0.62]);
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
  return { N, step, L: N * step, x, y, hd, k, ka, nx, ny, kerb, drs, drsStarts, apexes };
}

export function trackAt(T: Track, p: number) {
  let s = p % T.L;
  if (s < 0) s += T.L;
  const f = s / T.step, i = Math.floor(f) % T.N, j = (i + 1) % T.N, r = f - Math.floor(f);
  const dh = wrapA(T.hd[j] - T.hd[i]);
  return { x: T.x[i] + (T.x[j] - T.x[i]) * r, y: T.y[i] + (T.y[j] - T.y[i]) * r, h: T.hd[i] + dh * r, k: T.k[i], i };
}
