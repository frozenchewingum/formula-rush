// Tyre choice before the race, the lobby picker and the Pit Stop Rush overlay (v1.5).
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { COMPOUNDS, PIT_SWAP, compoundIndex, type Compound } from '../game/tyres';
import { PitScene } from '../garage/pitScene';
import type { Paint } from '../garage/carModel';
import { weatherMeta, type Weather } from '../game/constants';
import type { PitUi } from '../game/engine';

const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const display: CSSProperties = { fontFamily: "'Big Shoulders Display', sans-serif" };

/** Tyre sidewall icon: compound-coloured ring with its letter. */
export function TyreDot({ i, size = 24 }: { i: number; size?: number }) {
  const c = COMPOUNDS[i] || COMPOUNDS[1];
  return (
    <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box', border: `${Math.max(2, size * 0.16)}px solid ${c.color}`, background: '#0E0E11', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...mono, fontWeight: 700, fontSize: size * 0.42, color: '#F2F2F2', lineHeight: 1 }}>{c.short}</span>
  );
}

/** Tyre life as a feel, not a lap count: players find out how far each compound goes by racing it. */
const lifeLabel = (life: number) => life < 2 ? 'SHORT ●○○' : life < 2.8 ? 'MID ●●○' : 'LONG ●●●';

function strategyHint(laps: number, weather: Weather) {
  if (weather === 'Rain') return "It's wet out there. Choose wisely.";
  if (laps <= 1) return 'Short and sharp. Every moment counts.';
  const base = laps <= 3 ? 'Will your tyres go the distance? Maybe. Maybe not.' : 'A long race. Think about when you will stop.';
  if (weather === 'Rain on final lap') return base + ' Keep an eye on the sky.';
  if (weather === 'Random') return base + ' The weather may change its mind.';
  return base;
}

/** Bottom sheet before lights out: pick the starting compound. */
export function TyreSheet(p: { value: Compound; set: (c: Compound) => void; laps: number; weather: Weather; go: () => void; close: () => void }) {
  const [, wname, , wdot] = weatherMeta(p.weather);
  const label: CSSProperties = { ...mono, fontSize: 11, letterSpacing: '.2em', color: '#8A8A92' };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); p.close(); }
      else if (e.key === 'Enter' && !(e.target as HTMLElement)?.closest?.('button')) { e.preventDefault(); e.stopPropagation(); p.go(); }
      else if (/^[1-4]$/.test(e.key)) { e.stopPropagation(); p.set(COMPOUNDS[+e.key - 1].id); }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [p]);
  return (
    <div className="scrim" onClick={p.close} style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,6,.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 5 }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Starting tyres" onClick={e => e.stopPropagation()}
        style={{ background: '#151518', borderRadius: '20px 20px 0 0', padding: '12px 20px var(--pad-bottom)', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid #2A2A30', maxHeight: '92%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3A3A42', alignSelf: 'center', flexShrink: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <div style={{ ...display, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>STARTING TYRES</div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.08em', color: '#8A8A92', whiteSpace: 'nowrap' }}>{p.laps} {p.laps === 1 ? 'LAP' : 'LAPS'} · <span style={{ color: wdot }}>{wname.toUpperCase()}</span></div>
        </div>
        <div role="radiogroup" aria-label="Tyre compound" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {COMPOUNDS.map((c, i) => {
            const on = p.value === c.id;
            return (
              <button type="button" role="radio" aria-checked={on} key={c.id} onClick={() => p.set(c.id)}
                style={{ minHeight: 58, borderRadius: 10, background: on ? '#1E1E22' : 'transparent', border: `1.5px solid ${on ? c.color : '#2A2A30'}`, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 14px 8px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }}>
                <TyreDot i={i} size={34} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {c.name}
                  </span>
                  <span style={{ fontSize: 12, color: '#8A8A92' }}>{c.blurb}</span>
                </span>
                <span style={{ ...mono, fontSize: 11, color: on ? '#F2F2F2' : '#8A8A92', textAlign: 'right', whiteSpace: 'nowrap' }}>{c.id === 'wet' ? 'RAIN ONLY' : lifeLabel(c.life)}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 10, background: '#1A1A1E' }}>
          <div style={label}>STRATEGY</div>
          <div style={{ fontSize: 14, lineHeight: 1.35, color: '#C8C8CE' }}>{strategyHint(p.laps, p.weather)}</div>
          <div style={{ fontSize: 13, color: '#8A8A92' }}>To pit: on the right-hand line before the finish, swipe right into the pit lane.</div>
        </div>
        <button type="button" className="btn primary" onClick={p.go} style={{ height: 58, flexShrink: 0, borderRadius: 12, justifyContent: 'space-between', padding: '0 22px', ...display, fontWeight: 800, fontSize: 26, letterSpacing: '.04em' }}>
          <span>TO THE GRID</span><span style={{ ...mono, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', opacity: 0.85 }}>{COMPOUNDS[compoundIndex(p.value)].name.toUpperCase()} →</span>
        </button>
      </div>
    </div>
  );
}

/** Compact starting-tyre row for the room lobby. */
export function TyrePicker({ value, set, disabled }: { value: Compound; set: (c: Compound) => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', color: '#8A8A92' }}>YOUR STARTING TYRES</div>
      <div role="radiogroup" aria-label="Starting tyres" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
        {COMPOUNDS.map((c, i) => {
          const on = value === c.id;
          return (
            <button type="button" role="radio" aria-checked={on} key={c.id} disabled={disabled} onClick={() => set(c.id)}
              style={{ height: 48, borderRadius: 10, background: on ? '#1E1E22' : '#151518', border: `1.5px solid ${on ? c.color : '#151518'}`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: disabled ? 'default' : 'pointer', color: on ? '#F2F2F2' : '#8A8A92', fontWeight: 600, fontSize: 13, fontFamily: 'Barlow, sans-serif', padding: 0 }}>
              <TyreDot i={i} size={20} />{c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- Next tyres (during the race) ----------------
/**
 * Slim strip on the right edge: the tyres the crew will fit at your next stop. Defaults to the
 * compound you're on; tap another to change it. Marked data-noswipe so taps never steer.
 */
export function NextTyreStrip({ current, next, set, rain }: { current: number; next: number; set: (i: number) => void; rain: boolean }) {
  return (
    <div data-noswipe role="radiogroup" aria-label="Next tyres"
      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 5px', borderRadius: 22, background: 'rgba(14,14,17,.55)' }}>
      <span style={{ ...mono, fontSize: 8, letterSpacing: '.14em', color: '#8A8A92' }}>NEXT</span>
      {COMPOUNDS.map((c, i) => {
        const on = i === next, hint = rain ? c.id === 'wet' : false;
        return (
          <button type="button" role="radio" aria-checked={on} key={c.id} aria-label={'Next tyres: ' + c.name + (i === current ? ' (same as now)' : '')} onClick={() => set(i)}
            style={{ width: 34, height: 34, borderRadius: 17, border: 0, padding: 0, cursor: 'pointer', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: on ? 1 : 0.45, transform: on ? 'scale(1.12)' : 'none', outline: on ? `2px solid ${c.color}` : hint ? '1.5px dashed #3B6CFF' : 'none', outlineOffset: 1, transition: 'opacity .12s, transform .12s' }}>
            <TyreDot i={i} size={26} />
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Pit Stop Rush ----------------
// Tap zones: one quadrant per wheel; the label sits in that quadrant's outer corner.
const CORNERS: CSSProperties[] = [
  { top: 0, left: 0, justifyContent: 'flex-start', alignItems: 'flex-start' }, { top: 0, right: 0, justifyContent: 'flex-end', alignItems: 'flex-start' },
  { bottom: 0, left: 0, justifyContent: 'flex-start', alignItems: 'flex-end' }, { bottom: 0, right: 0, justifyContent: 'flex-end', alignItems: 'flex-end' },
];
const KEY_HINT = ['Q', 'E', 'Z', 'C'];

/**
 * In the box: 8 taps. Each wheel: tap = gun off, the crew swaps the tyre, tap again = gun on once
 * it's seated (yellow). Any wheel, any order, both thumbs. The car is drawn in 3D (three.js) when
 * the phone can, otherwise as flat wheel tiles.
 */
export function PitStop({ pit, now, wear, oldTc, carColor, paint, tap }: { pit: PitUi; now: () => number; wear: number; oldTc: number; carColor: string; paint: Paint; tap: (w: number) => void }) {
  const [, tick] = useState(0);
  const [three, setThree] = useState<PitScene | null>(null);
  const host = useRef<HTMLDivElement>(null);
  // Latest props for the 3D frame loop (read through refs so it never needs re-attaching).
  const live = useRef({ pit, now, oldColor: (COMPOUNDS[oldTc] || COMPOUNDS[1]).color });
  live.current = { pit, now, oldColor: live.current.oldColor };
  useEffect(() => {
    let raf = 0;
    const loop = () => { tick(x => (x + 1) % 1e6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  // 3D scene (already built on the way down the pit lane, so this is instant).
  useEffect(() => {
    let live = true;
    const sc = PitScene.get();
    sc.ready.then(ok => { if (live && ok) setThree(sc); });
    return () => { live = false; sc.detach(); };
  }, []);
  const paintRef = useRef(paint);
  paintRef.current = paint;
  useEffect(() => {
    if (!three || !host.current) return;
    three.setPaint(paintRef.current);
    three.attach(host.current, () => {
      const { pit: p, now: clock, oldColor } = live.current;
      return { t: clock(), ws: p.ws, offAt: p.offAt, onAt: p.onAt, oldColor, newColor: (COMPOUNDS[p.chosen] || COMPOUNDS[1]).color, wrongWheel: p.wrongWheel, wrongAt: p.wrongAt };
    });
    return () => three.detach();
  }, [three]);
  const t = now();
  const time = Math.max(0, t - pit.t0);
  const wrong = t - pit.wrongAt < 0.4;
  const chosen = COMPOUNDS[pit.chosen] || COMPOUNDS[1];
  const left = pit.ws.filter(x => x !== 2).length;
  const head = wrong ? 'TOO EARLY' : pit.phase === 'done' ? (pit.pen > 0 ? 'HOLD…' : 'GO GO GO') : left === 4 && pit.ws.every(x => x === 0) ? 'TAP EVERY WHEEL' : left + (left === 1 ? ' WHEEL' : ' WHEELS') + ' TO GO';
  const state = (i: number) => {
    const s = pit.ws[i], seated = s === 1 && t >= pit.offAt[i] + PIT_SWAP;
    return s === 2 ? { label: '✓', fg: '#0E0E11', bg: '#22C55E', bd: '#22C55E' }
      : seated ? { label: 'GUN ON', fg: '#0E0E11', bg: '#FFD400', bd: '#FFD400' }
      : s === 1 ? { label: 'SWAP…', fg: '#A8A8B0', bg: '#1A1A1E', bd: '#3A3A42' }
      : { label: 'GUN OFF', fg: '#F2F2F2', bg: '#1A1A1E', bd: '#F2F2F2' };
  };
  return (
    <div className="screen" data-noswipe style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(var(--pad-top) + 78px) 14px var(--pad-bottom)', gap: 10, background: 'linear-gradient(rgba(14,14,17,.55),rgba(14,14,17,.92) 30%,rgba(14,14,17,.96))', boxSizing: 'border-box', touchAction: 'none' }}>
      <div style={{ ...mono, fontSize: 13, letterSpacing: '.2em', color: '#FFD400' }}>BOX BOX · TYRES {Math.round(wear * 100)}%</div>
      <div style={{ ...mono, fontSize: 60, fontWeight: 700, lineHeight: 1, color: wrong ? '#E10600' : '#F2F2F2', transition: 'color .15s' }}>
        {time.toFixed(2)}
        {pit.pen > 0 && <span style={{ fontSize: 18, color: '#E10600', marginLeft: 8 }}>+{pit.pen.toFixed(1)}</span>}
      </div>
      <div style={{ position: 'relative', width: '100%', maxWidth: 360, flex: '1 1 320px', minHeight: 260 }}>
        <div ref={host} aria-hidden style={{ position: 'absolute', inset: 0 }}>
          {!three && (
            // Flat fallback: the car body in the middle; the wheel tiles are the tap zones below.
            <div style={{ position: 'absolute', left: '50%', top: '8%', bottom: '8%', width: 64, marginLeft: -32, borderRadius: '20px 20px 12px 12px', background: carColor, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }} />
          )}
        </div>
        {[0, 1, 2, 3].map(i => {
          const st = state(i), err = wrong && pit.wrongWheel === i;
          return (
            <button type="button" key={i} aria-label={['Front left', 'Front right', 'Rear left', 'Rear right'][i] + ': ' + st.label}
              onPointerDown={e => { e.preventDefault(); tap(i); }}
              style={{ position: 'absolute', ...CORNERS[i], width: '50%', height: '50%', border: 0, background: 'transparent', padding: 10, boxSizing: 'border-box', display: 'flex', cursor: 'pointer', touchAction: 'none' }}>
              <span style={{ ...mono, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, width: three ? 'auto' : 66, height: three ? 'auto' : 92, minWidth: 64, padding: three ? '6px 10px' : 0, borderRadius: 10, boxSizing: 'border-box',
                background: err ? '#E10600' : st.bg, color: err ? '#F2F2F2' : st.fg, border: `2px solid ${err ? '#E10600' : st.bd}`, fontWeight: 700, fontSize: st.label === '✓' ? 18 : 11, letterSpacing: '.06em',
                boxShadow: st.label === 'GUN ON' ? '0 0 18px rgba(255,212,0,.45)' : 'none', opacity: three ? 0.92 : 1 }}>
                {st.label}
                <span style={{ fontSize: 8, opacity: 0.6, letterSpacing: '.1em' }}>{KEY_HINT[i]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ ...display, fontWeight: 800, fontSize: 28, lineHeight: 1, textAlign: 'center', color: wrong ? '#E10600' : '#F2F2F2', minHeight: 28 }}>{head}</div>
      <div style={{ ...mono, fontSize: 12, color: '#8A8A92', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C8C8CE' }}><TyreDot i={pit.chosen} size={20} /> {chosen.name.toUpperCase()} GOING ON</span>
        <span>Tap = gun off · tap again on yellow = gun on · be quick</span>
      </div>
    </div>
  );
}

/** Build the 3D pit scene ahead of time (call when the car enters the pit lane). */
export function prewarmPit3d() { PitScene.get(); }
