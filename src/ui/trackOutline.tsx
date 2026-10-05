import { buildTrack } from '../game/track';

const paths = new Map<string, { d: string; vb: string; sx: number; sy: number }>();

/** Outline path for a track, fitted to its own viewBox (cached; y down like the game). */
function outline(id: string) {
  let o = paths.get(id);
  if (o) return o;
  const T = buildTrack(id);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < T.N; i++) { x0 = Math.min(x0, T.x[i]); x1 = Math.max(x1, T.x[i]); y0 = Math.min(y0, T.y[i]); y1 = Math.max(y1, T.y[i]); }
  const pad = 30;
  let d = '';
  for (let i = 0; i < T.N; i += 2) d += (i ? 'L' : 'M') + T.x[i].toFixed(0) + ' ' + T.y[i].toFixed(0);
  o = { d: d + 'Z', vb: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`, sx: T.x[0], sy: T.y[0] };
  paths.set(id, o);
  return o;
}

export function TrackOutline({ id, size = 64, color = '#F2F2F2' }: { id: string; size?: number; color?: string }) {
  const o = outline(id);
  return (
    <svg viewBox={o.vb} width={size} height={size} aria-hidden style={{ display: 'block' }}>
      <path d={o.d} fill="none" stroke={color} strokeWidth={14} strokeLinejoin="round" opacity={0.9} />
      <circle cx={o.sx} cy={o.sy} r={16} fill="#E10600" />
    </svg>
  );
}
