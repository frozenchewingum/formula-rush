import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  TEAMS, CODE_ABC, GRID_SIZE, MAX_PLAYERS, MIN_PLAYERS, ACCENTS, LIVERIES, LAP_OPTS, WEATHER_OPTS,
  liveryName, liveryTile, isLivery, weatherMeta, fmt, type Controls, type Settings, type Weather, type AiPace, type Livery,
} from '../game/constants';
import { CarStage } from './CarStage';
import { TyreDot, TyrePicker } from './tyres';
import { COMPOUNDS, type Compound } from '../game/tyres';
import type { UiState, Engine } from '../game/engine';
import { MiniMap } from './minimap';
import type { SoundState } from '../audio/music';
import type { PlayerRow, RoomSession } from '../net/room';

const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const display: CSSProperties = { fontFamily: "'Big Shoulders Display', sans-serif" };
const full: CSSProperties = { position: 'absolute', inset: 0, background: '#0E0E11', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' };

function Btn({ onClick, style, children, disabled, className }: { onClick?: () => void; style?: CSSProperties; children: ReactNode; disabled?: boolean; className?: string }) {
  return (
    <button type="button" className={'btn ' + (className || '')} disabled={disabled} onClick={onClick} style={style}>
      {children}
    </button>
  );
}

// ---------------- Garage (v2) ----------------
type GTab = 'team' | 'livery' | 'accent';

export function Garage(p: {
  team: number; setTeam: (t: number) => void; livery: Livery; setLivery: (l: Livery) => void; accent: number; setAccent: (a: number) => void;
  controls: Controls; setControls: (c: Controls) => void;
  settings: Settings; startSolo: () => void; createRoom: () => void; openJoin: () => void;
  openSettings: () => void; openGuide: () => void; accel: string; secret: () => void; sound: SoundState; armSound: () => void; toggleSound: () => void; busy: string; err: string; pb: number | null; online: boolean;
  /** A room is already running and the server allows one at a time: Create is off, Join still works. */
  roomBusy: boolean;
}) {
  const tm = TEAMS[p.team], tilt = p.controls === 'tilt', n = TEAMS.length;
  const paint = useMemo(() => ({ color: tm.color, dark: tm.dark, accent: ACCENTS[p.accent] || ACCENTS[0], livery: p.livery }), [tm, p.accent, p.livery]);
  const arrow: CSSProperties = { position: 'absolute', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, border: 0, background: 'rgba(14,14,17,.6)', color: '#C8C8CE', fontSize: 22, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 2 };
  return (
    <div className="screen" style={{ ...full }}>
      {/* ---------- hero ---------- */}
      <div className="garage-hero" style={{ position: 'relative', flex: '1 1 404px', minHeight: 300, maxHeight: 404, background: 'radial-gradient(ellipse 80% 55% at 50% 66%,#23232A 0%,#141418 55%,#0E0E11 100%)', overflow: 'hidden' }}>
        <div aria-hidden style={{ ...display, position: 'absolute', left: -10, right: -10, top: '24%', textAlign: 'center', fontWeight: 900, fontStyle: 'italic', fontSize: 118, lineHeight: 1, letterSpacing: '-.01em', color: tm.color, opacity: 0.16, pointerEvents: 'none', whiteSpace: 'nowrap', transition: 'color .3s' }}>{tm.name.toUpperCase()}</div>
        <CarStage paint={paint} style={{ left: 0, right: 0, top: 'calc(var(--pad-top) + 26px)', bottom: 56 }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'var(--pad-top) 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, pointerEvents: 'none' }}>
          <LongPress onLong={p.secret} style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 26, lineHeight: 1, pointerEvents: 'auto', userSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}>
            FORMULA <span style={{ color: '#E10600' }}>RUSH</span>
          </LongPress>
          <div role="radiogroup" aria-label="Controls" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'rgba(26,26,30,.9)', borderRadius: 22, padding: 3, pointerEvents: 'auto' }}>
            {(['swipe', 'tilt'] as Controls[]).map(c => {
              const on = (c === 'tilt') === tilt;
              return (
                <button type="button" role="radio" aria-checked={on} key={c} onClick={() => p.setControls(c)}
                  style={{ height: 38, padding: '0 14px', borderRadius: 19, border: 0, background: on ? '#F2F2F2' : 'transparent', color: on ? '#0E0E11' : '#A8A8B0', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
                  {c === 'swipe' ? 'Swipe' : 'Tilt'}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ position: 'absolute', top: 'calc(var(--pad-top) + 50px)', right: 12, display: 'flex', gap: 6, zIndex: 2 }}>
          <button type="button" aria-label="How to play" title="How to play" className="icon-btn round" onClick={p.openGuide}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
          </button>
          <button type="button" aria-label={p.sound === 'muted' ? 'Turn sound on' : p.sound === 'locked' ? 'Start sound' : 'Turn sound off'} aria-pressed={p.sound !== 'muted'}
            title={p.sound === 'locked' ? 'Tap for sound' : 'Sound (M)'} className={'icon-btn round sound-' + p.sound}
            onPointerDown={p.armSound} onKeyDown={p.armSound} onClick={p.toggleSound}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 5 6 9H2v6h4l5 4V5z" />
              {p.sound === 'muted' ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
            </svg>
          </button>
        </div>
        <button type="button" className="hero-arrow" aria-label="Previous team" onClick={() => p.setTeam((p.team + n - 1) % n)} style={{ ...arrow, left: 8 }}>‹</button>
        <button type="button" className="hero-arrow" aria-label="Next team" onClick={() => p.setTeam((p.team + 1) % n)} style={{ ...arrow, right: 8 }}>›</button>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 22, borderRadius: 2, background: tm.color }} />
              <div style={{ ...display, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>{tm.name.toUpperCase()}</div>
            </div>
            <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', color: '#8A8A92' }}>#07 · {liveryName(p.livery).toUpperCase()} LIVERY</div>
          </div>
          <div style={{ ...mono, fontSize: 11, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {p.accel && <span style={{ color: '#A855F7' }}>ACCEL · {p.accel}</span>}
            {p.pb != null && <span style={{ color: '#A855F7' }}>PB {fmt(p.pb)}</span>}
            <span style={{ color: '#5A5A62' }}>DRAG TO SPIN</span>
          </div>
        </div>
      </div>

      {/* ---------- controls panel ---------- */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 20px var(--pad-bottom)', boxSizing: 'border-box', borderTop: '1px solid #1E1E22' }}>
        <CarPicker team={p.team} setTeam={p.setTeam} livery={p.livery} setLivery={p.setLivery} accent={p.accent} setAccent={p.setAccent} />
        {(p.err || !p.online) && (
          <div style={{ ...mono, padding: '8px 12px', borderRadius: 6, background: '#2A0D0C', color: '#FF6A60', fontWeight: 700, fontSize: 11 }}>
            {p.err || 'OFFLINE · MULTIPLAYER UNAVAILABLE'}
          </div>
        )}
        <SettingsBar laps={p.settings.laps} weather={p.settings.weather} canEdit onClick={p.openSettings} />
        <Btn className="primary" onClick={p.startSolo} style={{ height: 60, borderRadius: 12, justifyContent: 'space-between', padding: '0 22px', ...display, fontWeight: 800, fontSize: 28, letterSpacing: '.04em' }}>
          <span>RACE</span><span style={{ ...mono, fontSize: 12, fontWeight: 700, letterSpacing: '.1em', opacity: 0.85 }}>SOLO · VS AI →</span>
        </Btn>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Btn className="ghost" disabled={!!p.busy || !p.online || p.roomBusy} onClick={p.createRoom}>{p.busy === 'create' ? 'Creating…' : p.roomBusy ? 'Room busy' : 'Create Room'}</Btn>
          <Btn className="ghost" disabled={!!p.busy || !p.online} onClick={p.openJoin}>Join Room</Btn>
        </div>
      </div>
    </div>
  );
}

/** Press and hold for 700 ms (no visible affordance: used for hidden test switches). */
function LongPress({ onLong, style, children }: { onLong: () => void; style?: CSSProperties; children: ReactNode }) {
  const timer = useRef(0);
  const stop = () => clearTimeout(timer.current);
  return (
    <div style={style} onContextMenu={e => e.preventDefault()}
      onPointerDown={() => { stop(); timer.current = window.setTimeout(() => { onLong(); try { navigator.vibrate?.(20); } catch { /* unsupported */ } }, 700); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}>
      {children}
    </div>
  );
}

/** TEAM / LIVERY / ACCENT tabs: used in the Garage and in the room's Edit car sheet. */
export function CarPicker(p: { team: number; setTeam: (t: number) => void; livery: Livery; setLivery: (l: Livery) => void; accent: number; setAccent: (a: number) => void }) {
  const [tab, setTab] = useState<GTab>(() => { try { return (sessionStorage.getItem('fr-gtab') as GTab) || 'team'; } catch { return 'team'; } });
  const pickTab = (t: GTab) => { setTab(t); try { sessionStorage.setItem('fr-gtab', t); } catch { /* storage blocked */ } };
  const teamRow = useRef<HTMLDivElement>(null);
  // keep the selected team tile in view (11 teams scroll horizontally)
  useEffect(() => {
    const el = teamRow.current?.children[p.team] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [p.team, tab]);
  const tile = (on: boolean, border: string): CSSProperties => ({ height: 64, borderRadius: 10, background: on ? '#1E1E22' : '#151518', border: `1.5px solid ${on ? border : '#151518'}`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', padding: 0, color: on ? '#F2F2F2' : '#8A8A92', fontSize: 11, fontWeight: 600, fontFamily: 'Barlow, sans-serif' });
  return (
    <>
      <div role="tablist" aria-label="Customise car" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, background: '#151518', borderRadius: 10, padding: 4 }}>
        {([['team', 'TEAM'], ['livery', 'LIVERY'], ['accent', 'ACCENT']] as [GTab, string][]).map(([k, label]) => {
          const on = tab === k;
          return (
            <button type="button" role="tab" aria-selected={on} key={k} onClick={() => pickTab(k)}
              style={{ ...mono, height: 36, borderRadius: 7, border: 0, background: on ? '#F2F2F2' : 'transparent', color: on ? '#0E0E11' : '#8A8A92', fontWeight: 700, fontSize: 11, letterSpacing: '.12em', cursor: 'pointer' }}>
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" style={{ height: 64, display: 'flex', alignItems: 'center' }}>
        {tab === 'team' && (
          <div ref={teamRow} className="hscroll" role="radiogroup" aria-label="Team" style={{ width: '100%', display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'calc((100% - 24px) / 5)', gap: 6, overflowX: 'auto', scrollSnapType: 'x mandatory' }}>
            {TEAMS.map((t, i) => (
              <button type="button" role="radio" aria-checked={i === p.team} key={t.name} onClick={() => p.setTeam(i)} style={{ ...tile(i === p.team, t.color), scrollSnapAlign: 'start' }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg,${t.color} 0 50%,${t.dark} 50% 100%)` }} />
                {t.name}
              </button>
            ))}
          </div>
        )}
        {tab === 'livery' && (
          <div role="radiogroup" aria-label="Livery" style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {LIVERIES.map(([k, label]) => {
              const [body, pod, wing, stripe] = liveryTile(p.team, k, p.accent), on = p.livery === k;
              return (
                <button type="button" role="radio" aria-checked={on} key={k} onClick={() => p.setLivery(k)} style={tile(on, '#F2F2F2')}>
                  <span style={{ width: 14, height: 30, borderRadius: '7px 7px 4px 4px', background: body, position: 'relative', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ position: 'absolute', top: -3, left: -6, right: -6, height: 4, borderRadius: 1, background: wing }} />
                    <span style={{ position: 'absolute', top: 10, left: -5, right: -5, height: 12, borderRadius: 3, background: pod }} />
                    <span style={{ position: 'absolute', top: 2, bottom: 2, width: 3, borderRadius: 2, background: stripe, zIndex: 1 }} />
                  </span>
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {tab === 'accent' && (
          <div role="radiogroup" aria-label="Accent colour" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 6px', boxSizing: 'border-box' }}>
            {ACCENTS.map((c, i) => (
              <button type="button" role="radio" aria-checked={i === p.accent} aria-label={'Accent ' + c} key={c} onClick={() => p.setAccent(i)}
                style={{ width: 44, height: 44, borderRadius: '50%', border: 0, padding: 0, background: c, outline: i === p.accent ? '2px solid #fff' : '2px solid transparent', outlineOffset: 3, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Room lobby: change team, livery, accent and starting tyres. Changing the car un-readies you. */
export function CarSheet(p: { team: number; setTeam: (t: number) => void; livery: Livery; setLivery: (l: Livery) => void; accent: number; setAccent: (a: number) => void; tyre: Compound; setTyre: (c: Compound) => void; ready: boolean; close: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); p.close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [p]);
  const tm = TEAMS[p.team] || TEAMS[0];
  return (
    <div className="scrim" onClick={p.close} style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,6,.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 5 }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Your car" onClick={e => e.stopPropagation()}
        style={{ background: '#151518', borderRadius: '20px 20px 0 0', padding: '12px 20px var(--pad-bottom)', display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid #2A2A30', maxHeight: '92%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3A3A42', alignSelf: 'center', flexShrink: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 4, height: 26, borderRadius: 2, background: tm.color }} />
            <div style={{ ...display, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>{tm.name.toUpperCase()}</div>
          </div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', color: '#8A8A92' }}>YOUR CAR</div>
        </div>
        <CarPicker team={p.team} setTeam={p.setTeam} livery={p.livery} setLivery={p.setLivery} accent={p.accent} setAccent={p.setAccent} />
        <TyrePicker value={p.tyre} set={p.setTyre} />
        {p.ready && <div style={{ ...mono, fontSize: 11, color: '#FFD400' }}>CHANGING YOUR CAR UN-READIES YOU</div>}
        <button type="button" onClick={p.close} style={{ height: 54, flexShrink: 0, borderRadius: 12, border: 0, background: '#F2F2F2', color: '#0E0E11', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Done</button>
      </div>
    </div>
  );
}

// ---------------- Race settings (v1.4) ----------------
/** 48px bar on Garage + Lobby: LAPS · WEATHER · EDIT › (or SET BY HOST). */
export function SettingsBar({ laps, weather, canEdit, onClick }: { laps: number; weather: Weather; canEdit: boolean; onClick: () => void }) {
  const [, label, , dot] = weatherMeta(weather);
  const lab: CSSProperties = { fontSize: 9, color: '#8A8A92', letterSpacing: '.16em' };
  return (
    <button type="button" className={'settings-bar' + (canEdit ? '' : ' locked')} onClick={onClick} aria-label={`Race settings: ${laps} laps, ${label} weather${canEdit ? '' : ', set by host'}`}>
      <span style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '.06em' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}><span style={lab}>LAPS</span><span>{laps} {laps === 1 ? 'LAP' : 'LAPS'}</span></span>
        <span style={{ width: 1, height: 24, background: '#2A2A30' }} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}><span style={lab}>WEATHER</span><span style={{ color: dot }}>{label.toUpperCase()}</span></span>
      </span>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: canEdit ? '#F2F2F2' : '#5A5A62' }}>{canEdit ? 'EDIT ›' : 'SET BY HOST'}</span>
    </button>
  );
}

/** Bottom sheet: laps + weather, plus driver tweaks (AI pace, camera tilt) folded under "More". */
type AudioPrefs = { music: boolean; engine: boolean; setMusic: (on: boolean) => void; setEngine: (on: boolean) => void };

export function RaceSettingsSheet({ settings, set, close, mode, audio }: { settings: Settings; set: (s: Settings) => void; close: () => void; mode: string; audio: AudioPrefs }) {
  const [more, setMore] = useState(false);
  const label: CSSProperties = { ...mono, fontSize: 11, letterSpacing: '.2em', color: '#8A8A92' };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [close]);
  return (
    <div className="scrim" onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(5,5,6,.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 5 }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Race settings" onClick={e => e.stopPropagation()}
        style={{ background: '#151518', borderRadius: '20px 20px 0 0', padding: '12px 20px var(--pad-bottom)', display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid #2A2A30', maxHeight: '92%', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3A3A42', alignSelf: 'center', flexShrink: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ ...display, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>RACE SETTINGS</div>
          <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', color: '#8A8A92' }}>{mode}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={label}>LAPS</div>
          <div role="radiogroup" aria-label="Laps" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {LAP_OPTS.map(([n, sub]) => {
              const on = settings.laps === n;
              return (
                <button type="button" role="radio" aria-checked={on} key={n} onClick={() => set({ ...settings, laps: n })}
                  style={{ height: 56, borderRadius: 10, border: 0, background: on ? '#F2F2F2' : '#1E1E22', color: on ? '#0E0E11' : '#C8C8CE', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer' }}>
                  <span style={{ ...display, fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{n}</span>
                  <span style={{ ...mono, fontSize: 10, opacity: 0.75 }}>{sub}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={label}>WEATHER</div>
          <div role="radiogroup" aria-label="Weather" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {WEATHER_OPTS.map(([k, name, desc, dot]) => {
              const on = settings.weather === k;
              return (
                <button type="button" role="radio" aria-checked={on} key={k} onClick={() => set({ ...settings, weather: k })}
                  style={{ minHeight: 52, borderRadius: 10, background: on ? '#1E1E22' : 'transparent', border: `1.5px solid ${on ? '#F2F2F2' : '#2A2A30'}`, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Barlow, sans-serif' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: dot }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 600, fontSize: 15 }}>{name}</span><span style={{ fontSize: 12, color: '#8A8A92' }}>{desc}</span></span>
                  <span style={{ ...mono, fontSize: 14 }}>{on ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="back" onClick={() => setMore(m => !m)} aria-expanded={more} style={{ alignSelf: 'stretch', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.2em', color: '#8A8A92', minHeight: 32 }}>
          <span>MORE · AI PACE, CAMERA &amp; SOUND</span><span>{more ? '−' : '+'}</span>
        </button>
        {more && (
          <>
            <div role="radiogroup" aria-label="AI pace" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', background: '#1E1E22', borderRadius: 10, padding: 4, marginTop: -8 }}>
              {(['Easy', 'Normal', 'Hard'] as AiPace[]).map(a => {
                const on = settings.aiPace === a;
                return (
                  <button type="button" role="radio" aria-checked={on} key={a} onClick={() => set({ ...settings, aiPace: a })}
                    style={{ minHeight: 40, borderRadius: 8, border: 0, background: on ? '#F2F2F2' : 'transparent', color: on ? '#0E0E11' : '#A8A8B0', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>{a} AI</button>
                );
              })}
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...label, display: 'flex', justifyContent: 'space-between' }}><span>CAMERA TILT</span><span style={{ color: '#F2F2F2' }}>{settings.cameraTilt}°</span></span>
              <input type="range" min={35} max={90} step={1} value={settings.cameraTilt} onChange={e => set({ ...settings, cameraTilt: +e.target.value })} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([['MUSIC', audio.music, audio.setMusic], ['ENGINE SOUND', audio.engine, audio.setEngine]] as [string, boolean, (on: boolean) => void][]).map(([name, on, setOn]) => (
                <button type="button" role="switch" aria-checked={on} key={name} onClick={() => setOn(!on)}
                  style={{ minHeight: 44, borderRadius: 10, border: 0, background: '#1E1E22', color: on ? '#F2F2F2' : '#8A8A92', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', cursor: 'pointer', ...mono, fontSize: 11, fontWeight: 700, letterSpacing: '.1em' }}>
                  <span>{name}</span>
                  <span style={{ padding: '3px 7px', borderRadius: 4, background: on ? '#22C55E' : '#2A2A30', color: on ? '#0E0E11' : '#A8A8B0' }}>{on ? 'ON' : 'OFF'}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button type="button" onClick={close} style={{ height: 54, flexShrink: 0, borderRadius: 12, border: 0, background: '#F2F2F2', color: '#0E0E11', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>Done</button>
      </div>
    </div>
  );
}

// ---------------- Join ----------------
export function Join(p: { code: string; setCode: (c: string) => void; err: string; busy: boolean; submit: () => void; back: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => ref.current?.focus(), 50); return () => clearTimeout(t); }, []);
  const ok = p.code.length === 4 && !p.busy;
  return (
    <div className="screen" style={{ ...full, padding: 'var(--pad-top) 24px var(--pad-bottom)', gap: 24 }}>
      <button type="button" className="back" onClick={p.back}>← GARAGE</button>
      <div style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 52, lineHeight: 0.9 }}>JOIN<br />ROOM</div>
      <div style={{ fontSize: 16, color: '#A8A8B0' }}>Enter the 4-character code from the host.</div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ ...mono, height: 76, borderRadius: 10, background: '#1A1A1E', border: `2px solid ${i === Math.min(p.code.length, 3) ? '#F2F2F2' : '#2A2A30'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 36 }}>{p.code[i] || ''}</div>
          ))}
        </div>
        <input ref={ref} value={p.code} aria-label="Room code" maxLength={8} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={e => p.setCode(e.target.value.toUpperCase().split('').filter(ch => CODE_ABC.includes(ch)).join('').slice(0, 4))}
          onKeyDown={e => { if (e.key === 'Enter' && ok) p.submit(); }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, fontSize: 16, cursor: 'text' }} />
      </div>
      {p.err && <div style={{ ...mono, padding: '10px 12px', borderRadius: 6, background: '#2A0D0C', color: '#FF6A60', fontWeight: 700, fontSize: 13 }}>{p.err}</div>}
      <div style={{ flex: 1 }} />
      <Btn onClick={() => ok && p.submit()} disabled={!ok} style={{ height: 60, background: ok ? '#E10600' : '#1A1A1E', color: ok ? '#F2F2F2' : '#5A5A62', ...display, fontWeight: 800, fontSize: 26, letterSpacing: '.04em' }}>{p.busy ? 'JOINING…' : 'JOIN'}</Btn>
    </div>
  );
}

// ---------------- Lobby ----------------
export function Lobby(p: { s: RoomSession; settings: Settings; leave: () => void; start: () => void; starting: boolean; openSettings: () => void; tyre: Compound; editCar: () => void }) {
  const { s } = p, room = s.room!, me = s.me(), host = s.isHost();
  const slots: (PlayerRow | null)[] = [...s.players].sort((a, b) => a.slot - b.slot);
  if (s.players.length < MAX_PLAYERS) slots.push(null);
  const laps = host ? p.settings.laps : room.laps, weather = host ? p.settings.weather : room.weather;
  const can = s.canStart() && !p.starting;
  const racing = room.status === 'racing';
  const [shared, setShared] = useState(false);
  const share = () => {
    const url = location.origin + location.pathname + '?room=' + room.code;
    if (navigator.share) navigator.share({ title: 'Formula Rush', text: 'Join my race: ' + room.code, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).catch(() => {});
    setShared(true);
  };
  return (
    <div className="screen" style={{ ...full, padding: 'var(--pad-top) 24px var(--pad-bottom)', gap: 18 }}>
      <button type="button" className="back" onClick={p.leave}>← LEAVE ROOM</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...mono, fontSize: 12, letterSpacing: '.2em', color: '#8A8A92' }}>ROOM CODE</div>
          <div style={{ ...mono, fontWeight: 700, fontSize: 48, letterSpacing: '.12em', lineHeight: 1 }}>{room.code}</div>
        </div>
        <button type="button" className="outline" onClick={share}>{shared ? 'Copied' : 'Share'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SettingsBar laps={laps} weather={weather} canEdit={host} onClick={p.openSettings} />
        <div style={{ ...mono, fontSize: 12, color: '#8A8A92' }}>DRIVERS {s.players.length}/{MAX_PLAYERS} · {GRID_SIZE - s.players.length} AI</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {slots.map((q, i) => {
          if (!q) return (
            <div key={'open' + i} style={{ height: 60, flexShrink: 0, borderRadius: 10, border: '1.5px dashed #2A2A30', display: 'grid', gridTemplateColumns: '6px 1fr auto', gap: 12, alignItems: 'center', padding: '0 14px 0 0', boxSizing: 'border-box' }}>
              <div />
              <div><div style={{ fontWeight: 600, fontSize: 16, color: '#5A5A62' }}>WAITING…</div><div style={{ ...mono, fontSize: 11, color: '#8A8A92' }}>Share the code</div></div>
              <div style={{ ...mono, padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, color: '#5A5A62' }}>OPEN</div>
            </div>
          );
          const t = TEAMS[q.team], you = q.user_id === s.myId, isHost = q.user_id === room.host_id, on = s.online.has(q.user_id) || you;
          return (
            <div key={q.user_id} style={{ height: 60, flexShrink: 0, borderRadius: 10, background: you ? '#1E1416' : '#151518', border: `1.5px solid ${you ? '#3A2224' : '#151518'}`, display: 'grid', gridTemplateColumns: '6px 1fr auto', gap: 12, alignItems: 'center', padding: '0 14px 0 0', overflow: 'hidden', boxSizing: 'border-box', opacity: on ? 1 : 0.5 }}>
              <div style={{ height: '100%', background: t.color }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                {you ? (
                  <input aria-label="Your driver name" defaultValue={q.name} maxLength={12}
                    onBlur={e => { const v = cleanName(e.target.value); if (v !== q.name) { try { localStorage.setItem('fr-name', v); } catch { /* storage blocked */ } s.updateMe({ name: v }); } }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ background: 'transparent', border: 0, borderBottom: '1px dashed #3A3A42', color: '#F2F2F2', fontWeight: 600, fontSize: 16, fontFamily: 'Barlow, sans-serif', padding: 0, width: '100%', outline: 'none', textTransform: 'uppercase' }} />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}{isHost ? ' · HOST' : ''}</div>
                )}
                <div style={{ ...mono, fontSize: 11, color: '#8A8A92' }}>{t.name.toUpperCase()} · {liveryName(isLivery(q.livery) ? q.livery : 'classic').toUpperCase()}{you && isHost ? ' · HOST' : ''}{!on ? ' · RECONNECTING' : ''}</div>
              </div>
              <div style={{ ...mono, padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: q.ready ? '#22C55E' : '#2A2A30', color: q.ready ? '#0E0E11' : '#A8A8B0' }}>{q.ready ? 'READY' : 'NOT READY'}</div>
            </div>
          );
        })}
      </div>
      {me && (
        <button type="button" className={'settings-bar' + (racing ? ' locked' : '')} onClick={() => !racing && p.editCar()} aria-label="Edit your car and tyres">
          <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', minWidth: 0 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,${TEAMS[me.team]?.color} 0 50%,${ACCENTS[me.accent ?? 0]} 50% 100%)` }} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TEAMS[me.team]?.name.toUpperCase()} · {liveryName(isLivery(me.livery) ? me.livery : 'classic').toUpperCase()}</span>
            <TyreDot i={COMPOUNDS.findIndex(c => c.id === p.tyre)} size={20} />
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: racing ? '#5A5A62' : '#F2F2F2' }}>{racing ? 'RACING' : 'EDIT CAR ›'}</span>
        </button>
      )}
      <div style={{ fontSize: 14, color: '#8A8A92' }}>{GRID_SIZE}-car grid. AI fills the empty spots and drivers start at the back. {MIN_PLAYERS}+ drivers to race.</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
        <Btn onClick={() => me && s.updateMe({ ready: !me.ready })} disabled={racing} style={{ height: 60, background: me?.ready ? '#22C55E' : '#1A1A1E', color: me?.ready ? '#0E0E11' : '#F2F2F2' }}>{me?.ready ? 'Ready ✓' : 'Ready up'}</Btn>
        <Btn onClick={() => can && p.start()} disabled={!can} style={{ height: 60, background: can ? '#E10600' : '#1A1A1E', color: can ? '#F2F2F2' : '#5A5A62', ...display, fontWeight: 800, fontSize: 24, letterSpacing: '.04em', lineHeight: 1 }}>
          {racing ? 'RACE IN PROGRESS' : host ? (p.starting ? 'STARTING…' : can ? 'START RACE' : s.players.length < MIN_PLAYERS ? `NEED ${MIN_PLAYERS}+ DRIVERS` : 'WAITING FOR READY') : 'HOST STARTS'}
        </Btn>
      </div>
    </div>
  );
}

export function cleanName(v: string) {
  return (v.toUpperCase().replace(/[^A-Z0-9_ .-]/g, '').trim().slice(0, 12)) || 'DRIVER';
}

// ---------------- Lights ----------------
export function Lights({ ui }: { ui: UiState }) {
  const green = ui.phase === 'green';
  const title = green ? 'GO GO GO' : ui.phase === 'red' ? 'REV IT UP' : 'GET READY';
  const sub = green ? 'Let go now!' : 'Rev as you like · let go the instant it turns green';
  const bad = ui.reaction.includes('LATE'), perfect = ui.reaction.startsWith('PERFECT');
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'calc(var(--pad-top) + 28px) 24px 0', gap: 24, background: 'linear-gradient(rgba(14,14,17,.94) 0,rgba(14,14,17,.7) 42%,transparent 62%)', pointerEvents: 'none' }}>
      <div style={{ display: 'flex', gap: 10, background: '#050506', padding: 14, borderRadius: 12 }}>
        {[0, 1, 2, 3, 4].map(i => {
          const on = green || i < ui.lights, col = green ? '#22C55E' : '#E10600';
          return <div key={i} style={{ width: 42, height: 42, borderRadius: '50%', background: on ? col : '#2A0A0A', boxShadow: on ? `0 0 18px ${col}` : 'none' }} />;
        })}
      </div>
      <div style={{ ...display, fontWeight: 800, fontSize: 44, textAlign: 'center', lineHeight: 1 }}>{title}</div>
      {ui.reaction
        ? <div style={{ ...mono, fontSize: 32, fontWeight: 700, textAlign: 'center', color: bad ? '#E10600' : perfect ? '#A855F7' : '#22C55E' }}>{ui.reaction}</div>
        : <div style={{ fontSize: 16, color: '#A8A8B0', textAlign: 'center' }}>{sub}</div>}
      <div style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8A8A92' }}><span>THROTTLE</span><span>RPM</span></div>
        <div style={{ height: 12, borderRadius: 6, background: '#1A1A1E', overflow: 'hidden' }}>
          <div style={{ width: ui.holding ? '92%' : '8%', height: '100%', borderRadius: 6, background: ui.holding ? (green ? '#22C55E' : '#FFD400') : '#3A3A42', transition: 'width .35s ease-out' }} />
        </div>
      </div>
    </div>
  );
}

// ---------------- Race HUD ----------------
export function RaceHud({ ui, tilt, onPause, engine }: { ui: UiState; tilt: boolean; onPause?: () => void; engine?: Engine }) {
  const h = ui.hud;
  const chip: CSSProperties = { ...mono, padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700 };
  return (
    <>
      {onPause && !ui.paused && (
        <button type="button" aria-label="Pause" title="Pause (Esc)" className="icon-btn round" onClick={onPause}
          style={{ position: 'absolute', top: 'var(--pad-top)', left: '50%', marginLeft: -22, zIndex: 2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
        </button>
      )}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'var(--pad-top) 18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(rgba(14,14,17,.92),transparent)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ ...display, fontWeight: 900, fontSize: 48, lineHeight: 0.9 }}>P{h.pos}<span style={{ fontSize: 22, color: '#A8A8B0' }}>/{h.field}</span></div>
          {h.rain && <div style={{ ...mono, padding: '4px 10px', borderRadius: 4, background: '#3B6CFF', fontSize: 12, fontWeight: 700 }}>RAIN · GRIP LOW</div>}
        </div>
        <div style={{ ...mono, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          {engine && <MiniMap engine={engine} />}
          <div style={{ fontSize: 16 }}>LAP {h.lap}/{h.laps}</div>
          <div style={{ fontSize: 14 }}>{h.time}</div>
          <div style={{ fontSize: 12, color: '#A855F7' }}>BEST {h.best}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '48px 18px var(--pad-bottom)', display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(transparent,rgba(14,14,17,.95) 45%)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {h.boxCall && <div className="pulse" style={{ ...chip, background: h.boxCall.startsWith('TYRE') ? '#E10600' : h.boxCall === 'BOX FOR WETS' ? '#3B6CFF' : '#FFD400', color: h.boxCall.startsWith('TYRE') || h.boxCall === 'BOX FOR WETS' ? '#F2F2F2' : '#0E0E11' }}>{h.boxCall}</div>}
            {h.pitWindow && <div style={{ ...chip, border: '1.5px solid #FFD400', color: '#FFD400' }}>PIT {tilt ? '· STEER →' : '· SWIPE →'}</div>}
            {h.limiter && <div style={{ ...chip, background: '#FFD400', color: '#0E0E11' }}>PIT LIMITER</div>}
            {h.drsReady && <div style={{ ...chip, border: '1.5px solid #00D2BE', color: '#00D2BE' }}>DRS READY · ↑</div>}
            {h.drsOn && <div style={{ ...chip, background: '#00D2BE', color: '#0E0E11' }}>DRS OPEN</div>}
            {h.braking && <div style={{ ...chip, background: '#E10600', color: '#F2F2F2' }}>BRAKE</div>}
            {h.slip && <div style={{ ...chip, background: '#1A1A1E', color: '#C8C8CE' }}>SLIPSTREAM</div>}
          </div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>{h.kmh}<span style={{ fontSize: 12, color: '#8A8A92' }}> KM/H</span></div>
        </div>
        <Bar label="BOOST" w={h.boost} color={h.boost >= 35 ? '#FFD400' : '#7A6A1A'} tick />
        <Bar label="TYRES" w={h.tyre} color={h.tyre > 50 ? '#22C55E' : h.tyre > 25 ? '#FFD400' : '#E10600'} icon={<TyreDot i={h.tc} size={16} />} />
        <div style={{ textAlign: 'center', fontSize: 14, color: h.pitWindow ? '#FFD400' : '#8A8A92' }}>
          {h.pitWindow
            ? (tilt ? 'steer hard right on the right-hand line to pit' : 'from the right-hand line, swipe → to pit')
            : tilt ? 'tilt or drag to steer · tap right edge to boost · hold to brake' : '← → change line · ↑ DRS / boost · hold to brake'}
        </div>
      </div>
    </>
  );
}

function Bar({ label, w, color, tick, icon }: { label: string; w: number; color: string; tick?: boolean; icon?: ReactNode }) {
  return (
    <div style={{ ...mono, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
      <span style={{ width: 64, color: '#A8A8B0', display: 'flex', alignItems: 'center', gap: 4 }}>{icon}{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#2A2A30', position: 'relative' }}>
        <div style={{ width: w + '%', height: '100%', borderRadius: 4, background: color }} />
        {tick && <div style={{ position: 'absolute', left: '35%', top: -2, bottom: -2, width: 2, background: '#0E0E11' }} />}
      </div>
    </div>
  );
}

// ---------------- Pause (solo) ----------------
export function PauseMenu({ resume, restart, exit }: { resume: () => void; restart: () => void; exit: () => void }) {
  return (
    <div className="screen" role="dialog" aria-modal="true" aria-label="Paused"
      style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(8,8,10,.82)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px', gap: 12 }}>
      <div style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 64, lineHeight: 0.9, marginBottom: 18 }}>PAUSED</div>
      <Btn className="primary" onClick={resume} style={{ height: 60, ...display, fontWeight: 800, fontSize: 26, letterSpacing: '.04em' }}>RESUME</Btn>
      <Btn className="secondary" onClick={restart} style={{ height: 54 }}>Restart race</Btn>
      <Btn className="secondary" onClick={exit} style={{ height: 54 }}>Exit to Garage</Btn>
      <div style={{ ...mono, fontSize: 11, color: '#8A8A92', textAlign: 'center', marginTop: 6 }}>ESC TO RESUME</div>
    </div>
  );
}

// ---------------- Results ----------------
export function Results({ ui, mp, toGarage, again }: { ui: UiState; mp: boolean; toGarage: () => void; again: () => void }) {
  const sum = ui.summary;
  if (!sum) return null;
  return (
    <div className="screen" style={{ ...full, padding: 'calc(var(--pad-top) + 8px) 20px var(--pad-bottom)', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ ...display, fontWeight: 900, fontSize: 72, lineHeight: 0.85, fontStyle: 'italic' }}>P{sum.pos}</div>
        <div style={{ ...mono, fontSize: 13, color: '#A8A8B0', textAlign: 'right' }}>{sum.gained}<br />{sum.time}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 16, overflowY: 'auto', minHeight: 0 }}>
        {ui.results.map(r => (
          <div key={r.pos} style={{ display: 'grid', gridTemplateColumns: '28px 6px 1fr auto auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 6, background: r.you ? '#2A0D0C' : 'transparent' }}>
            <span style={{ ...mono, color: '#8A8A92' }}>{r.pos}</span>
            <span style={{ width: 6, height: 18, borderRadius: 2, background: r.color }} />
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <TyreStints s={r.tyres} />
            <span style={{ ...mono, fontSize: 13, color: '#A8A8B0' }}>{r.gap}</span>
          </div>
        ))}
      </div>
      <div style={{ ...mono, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <Tile label="BEST LAP" value={sum.best} color="#A855F7" />
        <Tile label={'PIT · ' + sum.strategy} value={sum.pit} color="#F2F2F2" />
        <Tile label="APEXES" value={sum.apex} color="#FFD400" />
        <Tile label="CONTACTS" value={sum.contacts} color="#E10600" />
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Btn className="secondary" onClick={toGarage} style={{ height: 54 }}>{mp ? 'Leave' : 'Garage'}</Btn>
        <Btn className="primary" onClick={again} style={{ height: 54, ...display, fontWeight: 800, fontSize: 22 }}>{mp ? 'BACK TO LOBBY' : 'RACE AGAIN'}</Btn>
      </div>
    </div>
  );
}

/** Results: one tyre dot per stint, e.g. "S M". */
function TyreStints({ s }: { s: string }) {
  const parts = s.split(' ').filter(Boolean);
  return (
    <span aria-label={'Tyres ' + parts.join(', ')} style={{ display: 'flex', gap: 2 }}>
      {parts.map((l, k) => <TyreDot key={k} i={Math.max(0, COMPOUNDS.findIndex(c => c.short === l))} size={16} />)}
    </span>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#151518', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, color: '#8A8A92' }}>{label}</span>
      <span style={{ fontSize: 14, color }}>{value}</span>
    </div>
  );
}

export function ToastView({ ui }: { ui: UiState }) {
  if (!ui.toast) return null;
  return (
    <div style={{ position: 'absolute', top: 210, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 4 }}>
      <div key={ui.toast.id} className="toast" style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 38, letterSpacing: '.02em', color: ui.toast.color, textShadow: '0 2px 14px rgba(0,0,0,.7)' }}>{ui.toast.text}</div>
    </div>
  );
}
