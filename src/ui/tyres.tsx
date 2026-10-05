// Tyre choice before the race, the lobby picker and the Pit Stop Rush overlay (v1.5).
import { useEffect, useState, type CSSProperties } from 'react';
import { COMPOUNDS, PIT_FAST, PIT_WRONG, WHEELS, DIR_ARROW, compoundIndex, type Compound, type Wheel } from '../game/tyres';
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

const lifeLabel = (laps: number) => '~' + (Math.round(laps * 2) / 2).toString().replace('.5', '½') + ' LAPS';

/** What to start on, from the race length and the forecast. */
export function startRecommendation(laps: number, weather: Weather): Compound {
  if (weather === 'Rain') return 'wet';
  if (laps <= 1) return 'soft';
  return laps <= 3 ? 'soft' : 'medium';
}

function strategyHint(laps: number, weather: Weather) {
  if (weather === 'Rain') return 'Wet race. Wets keep you on the road; slicks slide everywhere.';
  if (laps <= 1) return 'Sprint: no stop needed. Softs are fastest over one lap.';
  const base = laps <= 3 ? 'One stop is fastest: Soft, then Medium.' : laps <= 5 ? 'Plan one or two stops. Hards last longest.' : 'Plan two stops. Hards last longest.';
  if (weather === 'Rain on final lap') return base + ' Rain on the final lap: box for wets.';
  if (weather === 'Random') return base + ' If it rains, box for wets.';
  return base;
}

/** Bottom sheet before lights out: pick the starting compound. */
export function TyreSheet(p: { value: Compound; set: (c: Compound) => void; laps: number; weather: Weather; go: () => void; close: () => void }) {
  const rec = startRecommendation(p.laps, p.weather);
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
                    {rec === c.id && <span style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: '.1em', padding: '2px 5px', borderRadius: 3, background: '#22C55E', color: '#0E0E11' }}>PICK</span>}
                  </span>
                  <span style={{ fontSize: 12, color: '#8A8A92' }}>{c.blurb}</span>
                </span>
                <span style={{ ...mono, fontSize: 11, color: on ? '#F2F2F2' : '#8A8A92', textAlign: 'right', whiteSpace: 'nowrap' }}>{c.id === 'wet' ? 'RAIN ONLY' : lifeLabel(c.life * 0.75)}</span>
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
 * compound you're on; tap another to change it. Marked data-noswipe so taps never steer or brake.
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
const WHEEL_POS: Record<Wheel, CSSProperties> = {
  FL: { top: 36, left: 4 }, FR: { top: 36, right: 4 }, RL: { bottom: 30, left: 4 }, RR: { bottom: 30, right: 4 },
};

/** In the box: every wheel shows its arrow at once; swipe them in any order. */
export function PitStop({ pit, now, wear, carColor }: { pit: PitUi; now: () => number; wear: number; carColor: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => { tick(x => (x + 1) % 1e6); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const t = now();
  const time = Math.max(0, t - pit.t0);
  const wrong = t - pit.wrongAt < 0.45;
  const chosen = COMPOUNDS[pit.chosen] || COMPOUNDS[1];
  const left = pit.done.filter(d => !d).length;
  const head = wrong ? 'NO WHEEL THAT WAY +0.5s' : pit.phase === 'done' ? (pit.pen > 0 ? 'HOLD…' : 'GO GO GO') : left === 4 ? 'SWIPE EVERY ARROW' : left + ' TO GO';
  return (
    <div className="screen" style={{ position: 'absolute', inset: 0, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(var(--pad-top) + 78px) 20px var(--pad-bottom)', gap: 12, background: 'linear-gradient(rgba(14,14,17,.55),rgba(14,14,17,.92) 30%,rgba(14,14,17,.96))', boxSizing: 'border-box' }}>
      <div style={{ ...mono, fontSize: 13, letterSpacing: '.2em', color: '#FFD400' }}>BOX BOX · TYRES {Math.round(wear * 100)}%</div>
      <div style={{ ...mono, fontSize: 64, fontWeight: 700, lineHeight: 1, color: wrong ? '#E10600' : '#F2F2F2', transition: 'color .15s' }}>
        {time.toFixed(2)}
        {pit.pen > 0 && <span style={{ fontSize: 18, color: '#E10600', marginLeft: 8 }}>+{pit.pen.toFixed(1)}</span>}
      </div>
      <div aria-hidden style={{ position: 'relative', width: 220, flex: '1 1 300px', maxHeight: 330, minHeight: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 64, height: '82%', borderRadius: '20px 20px 12px 12px', background: carColor, boxShadow: '0 16px 40px rgba(0,0,0,.5)', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -6, left: -16, right: -16, height: 10, borderRadius: 3, background: '#222' }} />
          <div style={{ position: 'absolute', bottom: -4, left: -12, right: -12, height: 12, borderRadius: 3, background: '#222' }} />
          <div style={{ position: 'absolute', top: '40%', left: 20, width: 24, height: 30, borderRadius: 12, background: '#111' }} />
        </div>
        {WHEELS.map((w, i) => {
          const done = pit.done[i];
          return (
            <div key={w} style={{ position: 'absolute', ...WHEEL_POS[w], width: 52, height: 76, borderRadius: 10, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', ...mono, fontWeight: 700,
              background: done ? '#22C55E' : '#1A1A1E', color: done ? '#0E0E11' : '#FFD400', fontSize: done ? 18 : 30,
              border: done ? `3px solid ${chosen.color}` : '3px solid #FFD400', boxShadow: done ? 'none' : '0 0 18px rgba(255,212,0,.35)', transition: 'background .1s' }}>
              {done ? '✓' : DIR_ARROW[pit.dirs[i]]}
            </div>
          );
        })}
      </div>
      <div style={{ ...display, fontWeight: 800, fontSize: 30, lineHeight: 1, textAlign: 'center', color: wrong ? '#E10600' : '#F2F2F2', minHeight: 30 }}>{head}</div>
      <div style={{ ...mono, fontSize: 12, color: '#8A8A92', textAlign: 'center', minHeight: 72, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#C8C8CE' }}><TyreDot i={pit.chosen} size={20} /> {chosen.name.toUpperCase()} GOING ON</span>
        <span>Any order · under {PIT_FAST.toFixed(1)}s = +BOOST · wrong swipe +{PIT_WRONG.toFixed(1)}s</span>
      </div>
    </div>
  );
}
