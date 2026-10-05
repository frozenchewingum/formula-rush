import { useEffect, useRef, type CSSProperties } from 'react';
import type { Engine } from '../game/engine';
import { trackAt } from '../game/track';

const W = 108, H = 100, PAD = 8;
const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };

/**
 * Corner mini map: the circuit outline plus a marker per car, read straight from the engine every frame
 * (no React re-renders). AI = small dot · online driver = white-edged diamond · you = ringed dot on top.
 */
export function MiniMap({ engine }: { engine: Engine }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const legend = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Fit the track (world y is down, same as canvas, so turns keep their hand).
    const T = engine.T;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < T.N; i++) {
      x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]);
      y0 = Math.min(y0, T.y[i]); y1 = Math.max(y1, T.y[i]);
    }
    const s = Math.min((W - PAD * 2) / (x1 - x0), (H - PAD * 2) / (y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oy = (H - (y1 - y0) * s) / 2 - y0 * s;
    const outline = new Path2D();
    for (let i = 0; i < T.N; i++) {
      const px = T.x[i] * s + ox, py = T.y[i] * s + oy;
      if (i) outline.lineTo(px, py); else outline.moveTo(px, py);
    }
    outline.closePath();
    // Start / finish: a short tick across the track at p = 0.
    const sfx = T.x[0] * s + ox, sfy = T.y[0] * s + oy, sfnx = T.nx[0] * 4, sfny = T.ny[0] * 4;

    let raf = 0, online = -1;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const g = engine.g;
      if (!g) return;
      ctx.clearRect(0, 0, W, H);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(242,242,242,.18)'; ctx.lineWidth = 5; ctx.stroke(outline);
      ctx.strokeStyle = 'rgba(242,242,242,.55)'; ctx.lineWidth = 1.5; ctx.stroke(outline);
      ctx.strokeStyle = '#F2F2F2'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sfx - sfnx, sfy - sfny); ctx.lineTo(sfx + sfnx, sfy + sfny); ctx.stroke();

      const at = (p: number, d: number) => {
        const a = trackAt(T, p), i = a.i;
        return [(a.x + T.nx[i] * d) * s + ox, (a.y + T.ny[i] * d) * s + oy];
      };
      // AI first, online drivers above them, you on top.
      let humans = 0;
      for (const c of g.cars) {
        if (c.isPlayer || !c.ai) continue;
        const [x, y] = at(c.p, c.d);
        ctx.globalAlpha = c.finished || c.dnf ? 0.35 : 1;
        ctx.fillStyle = c.color; ctx.strokeStyle = 'rgba(14,14,17,.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      for (const c of g.cars) {
        if (c.isPlayer || c.ai) continue;
        humans++;
        const [x, y] = at(c.p, c.d), r = 4.4;
        ctx.globalAlpha = c.finished || c.dnf ? 0.45 : 1;
        ctx.fillStyle = c.color; ctx.strokeStyle = '#F2F2F2'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const me = g.player, [mx, my] = at(me.p, me.d);
      ctx.strokeStyle = '#FFD400'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(mx, my, 5.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = me.color; ctx.strokeStyle = '#0E0E11'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(mx, my, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      if (humans !== online && legend.current) { online = humans; legend.current.style.display = humans ? 'flex' : 'none'; }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, marginBottom: 4 }}>
      <canvas ref={ref} aria-label="Track map" role="img"
        style={{ width: W, height: H, borderRadius: 8, background: 'rgba(14,14,17,.55)', border: '1px solid rgba(242,242,242,.12)' }} />
      <div ref={legend} style={{ ...mono, display: 'none', gap: 8, fontSize: 9, color: '#A8A8B0', letterSpacing: '.04em' }}>
        <span><span style={{ color: '#F2F2F2' }}>◆</span> ONLINE</span>
        <span><span style={{ color: '#F2F2F2' }}>●</span> AI</span>
      </div>
    </div>
  );
}
