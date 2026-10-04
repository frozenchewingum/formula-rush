// Hybrid chase/top-down camera rendered with a manual perspective projection on a 2D canvas.
import { clamp, wrapA } from './constants';
import { trackAt } from './track';
import type { Engine, Car } from './engine';

type Proj = (wx: number, wy: number) => [number, number, number] | null;

export function drawWorld(e: Engine, cv: HTMLCanvasElement, dt: number) {
  const W = cv.clientWidth || 360, H = cv.clientHeight || 760;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = e.g, T = e.T, pl = g.player, rain = e.isRain();
  const pa = trackAt(T, pl.p);
  g.camH += wrapA(pa.h - g.camH) * Math.min(1, dt * 4);
  const th = clamp(e.settings.cameraTilt ?? 52, 20, 90) * Math.PI / 180, sT = Math.sin(th), cT = Math.cos(th);
  const h = 40, B = 14;
  const dx = Math.cos(g.camH), dy = Math.sin(g.camH), rx = -dy, ry = dx;
  const px = pa.x - Math.sin(pa.h) * pl.d, py = pa.y + Math.cos(pa.h) * pl.d;
  const Cx = px - dx * B, Cy = py - dy * B;
  g.fov += ((g.boostT > 0 || g.drsOn ? 1 : 0) - g.fov) * Math.min(1, dt * 3);
  const F = 520 * (W / 360) * (1 - 0.12 * g.fov);
  const k0 = (-h * cT + B * sT) / (h * sT + B * cT);
  const sh = g.shake > 0 ? g.shake * 14 : 0;
  const X0 = W / 2 + (Math.random() - 0.5) * sh, Y0 = H * 0.7 + (Math.random() - 0.5) * sh;
  const proj: Proj = (wx, wy) => {
    const ax = wx - Cx, ay = wy - Cy, z = ax * dx + ay * dy, x = ax * rx + ay * ry, dep = h * sT + z * cT;
    if (dep < 1.5) return null;
    return [X0 + F * x / dep, Y0 - F * ((-h * cT + z * sT) / dep - k0), dep];
  };

  ctx.fillStyle = rain ? '#10261A' : '#16351F';
  ctx.fillRect(0, 0, W, H);
  const O = [-24, -8.8, -7.5, -7.2, -2.4, -2.2, 2.2, 2.4, 7.2, 7.5, 8.8, 24], NO = O.length;
  const S = e.drawCache.S || (e.drawCache.S = O.map(() => new Array(T.N).fill(null)));
  const vis = e.drawCache.V || (e.drawCache.V = new Array(T.N).fill(false));
  const range = rain ? 380 : 700;
  for (let i = 0; i < T.N; i++) {
    const ax = T.x[i] - Cx, ay = T.y[i] - Cy, z = ax * dx + ay * dy, x = ax * rx + ay * ry;
    vis[i] = false;
    if (z < -60 || z > range || Math.abs(x) > 70 + 0.7 * Math.max(z, 0)) continue;
    let ok = true;
    for (let o = 0; o < NO; o++) {
      const p = proj(T.x[i] + T.nx[i] * O[o], T.y[i] + T.ny[i] * O[o]);
      S[o][i] = p; if (!p) ok = false;
    }
    vis[i] = ok;
  }
  const segs: number[] = [];
  for (let i = 0; i < T.N; i++) { const j = (i + 1) % T.N; if (vis[i] && vis[j]) segs.push(i); }
  const quad = (o1: number, o2: number, i: number, j: number) => {
    const a = S[o1][i]!, b = S[o1][j]!, c = S[o2][j]!, d = S[o2][i]!;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
  };
  ctx.fillStyle = rain ? '#132D1F' : '#1A3D24';
  for (const i of segs) if ((i >> 2) & 1) { quad(0, 11, i, (i + 1) % T.N); ctx.fill(); }
  const asph = rain ? '#24262C' : '#2B2B30';
  ctx.fillStyle = asph; ctx.strokeStyle = asph; ctx.lineWidth = 1;
  for (const i of segs) { quad(2, 9, i, (i + 1) % T.N); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,210,190,.11)';
  for (const i of segs) if (T.drs[i]) { quad(2, 9, i, (i + 1) % T.N); ctx.fill(); }
  for (const i of segs) {
    const j = (i + 1) % T.N;
    if (T.kerb[i]) {
      ctx.fillStyle = (i & 1) ? (rain ? '#8A0400' : '#E10600') : (rain ? '#9A9AA0' : '#F2F2F2');
      quad(1, 2, i, j); ctx.fill(); quad(9, 10, i, j); ctx.fill();
    } else {
      ctx.fillStyle = '#C8C8CE'; quad(2, 3, i, j); ctx.fill(); quad(8, 9, i, j); ctx.fill();
    }
    if (i % 5 < 2) { ctx.fillStyle = 'rgba(255,255,255,.22)'; quad(4, 5, i, j); ctx.fill(); quad(6, 7, i, j); ctx.fill(); }
  }
  ctx.strokeStyle = '#00D2BE'; ctx.lineWidth = 2;
  for (const i of T.drsStarts) if (vis[i]) { ctx.beginPath(); ctx.moveTo(S[2][i]![0], S[2][i]![1]); ctx.lineTo(S[9][i]![0], S[9][i]![1]); ctx.stroke(); }
  const lerp = (P: number[], Q: number[], t: number) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
  for (let r = 0; r < 2; r++) {
    const i = r, j = r + 1;
    if (!vis[i] || !vis[j]) continue;
    for (let c = 0; c < 10; c++) {
      const a = lerp(S[2][i]!, S[9][i]!, c / 10), b = lerp(S[2][i]!, S[9][i]!, (c + 1) / 10);
      const cc = lerp(S[2][j]!, S[9][j]!, (c + 1) / 10), d = lerp(S[2][j]!, S[9][j]!, c / 10);
      ctx.fillStyle = (c + r) & 1 ? '#0E0E11' : '#F2F2F2';
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(cc[0], cc[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    }
  }
  for (const a of T.apexes) {
    if (!vis[a.i]) continue;
    const wx = T.x[a.i] + T.nx[a.i] * a.d, wy = T.y[a.i] + T.ny[a.i] * a.d;
    const pts: number[][] = [];
    let ok = true;
    for (let n = 0; n < 16; n++) {
      const an = n / 16 * Math.PI * 2, p = proj(wx + Math.cos(an) * 1.8, wy + Math.sin(an) * 1.8);
      if (!p) { ok = false; break; }
      pts.push(p);
    }
    if (!ok) continue;
    const hit = g.t - a.hit < 1.2, miss = g.t - a.miss < 1.2;
    ctx.beginPath(); pts.forEach((p, n) => n ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.strokeStyle = hit ? '#22C55E' : miss ? '#5A5A62' : '#FFD400'; ctx.lineWidth = 3;
    ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = miss ? 0 : 14; ctx.stroke(); ctx.shadowBlur = 0;
    if (hit) { ctx.fillStyle = 'rgba(34,197,94,.25)'; ctx.fill(); }
  }
  if (cT > 0.02) {
    const hy = Y0 - F * (sT / cT - k0);
    if (hy > -60) {
      const sky = ctx.createLinearGradient(0, 0, 0, hy + 50);
      sky.addColorStop(0, '#0E0E11');
      sky.addColorStop(clamp(hy / (hy + 50), 0, 1), rain ? '#1A1E26' : '#1E2430');
      sky.addColorStop(1, 'rgba(30,36,48,0)');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, Math.max(0, hy + 50));
    }
  }
  const list = g.cars.map(c => {
    const a = trackAt(T, c.p), wx = a.x - Math.sin(a.h) * c.d, wy = a.y + Math.cos(a.h) * c.d;
    const p = proj(wx, wy);
    return { c, h: a.h, wx, wy, dep: p ? p[2] : -1 };
  }).filter(o => o.dep > 0).sort((a, b) => b.dep - a.dep);
  for (const o of list) drawCar(ctx, o.c, o.h, o.wx, o.wy, proj, F, rain);
  if (g.boostT > 0 || g.drsOn) {
    ctx.strokeStyle = g.drsOn ? 'rgba(0,210,190,.35)' : 'rgba(255,212,0,.35)'; ctx.lineWidth = 2;
    for (let n = 0; n < 14; n++) {
      const side = n & 1 ? 1 : -1, x = W / 2 + side * (110 + Math.random() * 70), y = Math.random() * H, len = 60 + Math.random() * 90;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * len * 0.15, y + len); ctx.stroke();
    }
  }
  if (rain) {
    ctx.fillStyle = 'rgba(12,16,24,.3)'; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(X0, Y0 - 60, 90, X0, Y0 - 60, 460);
    vg.addColorStop(0, 'rgba(14,16,20,0)'); vg.addColorStop(1, 'rgba(14,16,20,.9)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(200,215,255,.28)'; ctx.lineWidth = 1;
    const t = performance.now() / 1000;
    ctx.beginPath();
    for (let n = 0; n < 90; n++) {
      const sx = ((n * 97.3 + t * 140) % (W + 60)) - 30, sy = ((n * 53.7 + t * 900) % (H + 40)) - 20;
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 4, sy + 16);
    }
    ctx.stroke();
  }
}

function drawCar(ctx: CanvasRenderingContext2D, c: Car, heading: number, wx: number, wy: number, proj: Proj, F: number, rain: boolean) {
  const hh = heading + c.yawOff;
  const fx = Math.cos(hh), fy = Math.sin(hh), qx = -fy, qy = fx;
  const P = (f: number, r: number) => proj(wx + fx * f + qx * r, wy + fy * f + qy * r);
  const poly = (pts: number[][], fill: string, stroke?: string | null) => {
    const s = pts.map(([f, r]) => P(f, r));
    if (s.some(v => !v)) return;
    ctx.beginPath(); s.forEach((v, i) => i ? ctx.lineTo(v![0], v![1]) : ctx.moveTo(v![0], v![1])); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  };
  const rect = (f0: number, f1: number, r0: number, r1: number, fill: string) => poly([[f0, r0], [f1, r0], [f1, r1], [f0, r1]], fill);
  if (rain && c.v > 20) poly([[-2.4, -1], [-2.4, 1], [-9, 2.2], [-9, -2.2]], 'rgba(220,230,255,.16)');
  poly([[2.3, -0.9], [2.3, 1.5], [-2.9, 1.5], [-2.9, -0.9]], 'rgba(0,0,0,.32)');
  rect(1.15, 2.0, 0.72, 1.28, '#111'); rect(1.15, 2.0, -1.28, -0.72, '#111');
  rect(-2.05, -1.0, 0.72, 1.32, '#111'); rect(-2.05, -1.0, -1.32, -0.72, '#111');
  poly([[2.45, -0.22], [2.45, 0.22], [0.6, 0.42], [-0.9, 0.72], [-2.0, 0.6], [-2.0, -0.6], [-0.9, -0.72], [0.6, -0.42]], c.color, c.isPlayer ? '#FFFFFF' : null);
  rect(2.2, 2.65, -1.2, 1.2, c.dark);
  rect(-2.6, -2.15, -0.95, 0.95, '#151515');
  rect(-0.8, 0.15, -0.3, 0.3, '#0E0E11');
  if (c.name) {
    const tp = P(0, 0);
    if (tp && tp[2] < 260) {
      ctx.font = '700 11px "JetBrains Mono", monospace';
      const w = ctx.measureText(c.name).width + 10, y = tp[1] - Math.max(18, F * 3.4 / tp[2]);
      ctx.fillStyle = 'rgba(14,14,17,.85)'; ctx.fillRect(tp[0] - w / 2, y - 14, w, 16);
      ctx.fillStyle = c.color; ctx.fillRect(tp[0] - w / 2, y + 2, w, 2);
      ctx.fillStyle = '#F2F2F2'; ctx.textAlign = 'center'; ctx.fillText(c.name, tp[0], y - 2); ctx.textAlign = 'left';
    }
  }
  const hp = P(-0.25, 0);
  if (hp) {
    ctx.beginPath(); ctx.arc(hp[0], hp[1], Math.max(1, F * 0.26 / hp[2]), 0, Math.PI * 2);
    ctx.fillStyle = c.isPlayer ? '#FFD400' : '#E8E8EA'; ctx.fill();
  }
}
