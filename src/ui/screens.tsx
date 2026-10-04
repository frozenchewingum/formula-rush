import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TEAMS, CODE_ABC, GRID_SIZE, GRID_SLOT, MAX_PLAYERS, MIN_PLAYERS, type Controls, type Settings, type Weather, type AiPace, fmt } from '../game/constants';
import type { UiState } from '../game/engine';
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

// ---------------- Garage ----------------
export function Garage(p: {
  team: number; setTeam: (t: number) => void; controls: Controls; setControls: (c: Controls) => void;
  settings: Settings; startSolo: () => void; createRoom: () => void; openJoin: () => void;
  openSettings: () => void; openGuide: () => void; muted: boolean; toggleMusic: () => void; busy: string; err: string; pb: number | null; online: boolean;
}) {
  const tm = TEAMS[p.team], tilt = p.controls === 'tilt';
  return (
    <div className="screen" style={{ ...full, padding: 'var(--pad-top) 24px var(--pad-bottom)', gap: 20 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -16 }}>
        <div style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 60, lineHeight: 0.85 }}>FORMULA<br /><span style={{ color: '#E10600' }}>RUSH</span></div>
        <div style={{ display: 'flex', gap: 8, order: -1, alignSelf: 'flex-end' }}>
        <button type="button" aria-label="How to play" title="How to play" className="icon-btn" onClick={p.openGuide}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
        </button>
        <button type="button" aria-label={p.muted ? 'Turn music on' : 'Turn music off'} aria-pressed={!p.muted} title="Music (M)" className="icon-btn" onClick={p.toggleMusic}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {p.muted ? <path d="m23 9-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />}
          </svg>
        </button>
        <button type="button" aria-label="Race settings" className="icon-btn" onClick={p.openSettings}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 160, borderRadius: 16, background: 'repeating-linear-gradient(90deg,#1A1A1E 0 2px,transparent 2px 40px),#141417', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ width: 64, height: 150, borderRadius: '14px 14px 10px 10px', background: `linear-gradient(${tm.color},${tm.dark})`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: -6, left: -14, right: -14, height: 12, background: '#222', borderRadius: 3 }} />
          <div style={{ position: 'absolute', bottom: -4, left: -10, right: -10, height: 14, background: '#222', borderRadius: 3 }} />
          <div style={{ position: 'absolute', top: 58, left: 20, width: 24, height: 30, borderRadius: 12, background: '#111' }} />
        </div>
        <div style={{ ...mono, position: 'absolute', bottom: 14, left: 16, fontSize: 12, color: '#8A8A92' }}>{tm.name.toUpperCase()} RACING · #07</div>
        <div style={{ ...mono, position: 'absolute', bottom: 14, right: 16, fontSize: 12, color: '#8A8A92' }}>{p.settings.laps} LAPS · START P{GRID_SLOT + 1}/{GRID_SIZE}</div>
        {p.pb != null && <div style={{ ...mono, position: 'absolute', top: 14, right: 16, fontSize: 12, color: '#A855F7' }}>PB {fmt(p.pb)}</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }} role="radiogroup" aria-label="Team">
        {TEAMS.map((t, i) => (
          <button type="button" key={t.name} aria-label={t.name} aria-checked={i === p.team} role="radio" onClick={() => p.setTeam(i)}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 0, padding: 0, background: t.color, outline: i === p.team ? '2px solid #fff' : '2px solid transparent', outlineOffset: 3, cursor: 'pointer' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: '#1A1A1E', borderRadius: 10, padding: 4 }}>
        {(['swipe', 'tilt'] as Controls[]).map(c => {
          const on = (c === 'tilt') === tilt;
          return (
            <button type="button" key={c} onClick={() => p.setControls(c)}
              style={{ textAlign: 'center', padding: 12, borderRadius: 8, border: 0, background: on ? '#F2F2F2' : 'transparent', color: on ? '#0E0E11' : '#A8A8B0', fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
              {c === 'swipe' ? 'Swipe' : 'Tilt'}
            </button>
          );
        })}
      </div>
      <Btn className="primary" onClick={p.startSolo} style={{ height: 60, ...display, fontWeight: 800, fontSize: 28, letterSpacing: '.04em' }}>RACE</Btn>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: -8 }}>
        <Btn className="secondary" disabled={!!p.busy || !p.online} onClick={p.createRoom} style={{ height: 54 }}>{p.busy === 'create' ? 'Creating…' : 'Create Room'}</Btn>
        <Btn className="secondary" disabled={!!p.busy || !p.online} onClick={p.openJoin} style={{ height: 54 }}>Join Room</Btn>
      </div>
      {(p.err || !p.online) && (
        <div style={{ ...mono, marginTop: -8, padding: '10px 12px', borderRadius: 6, background: '#2A0D0C', color: '#FF6A60', fontWeight: 700, fontSize: 12 }}>
          {p.err || 'OFFLINE · MULTIPLAYER UNAVAILABLE'}
        </div>
      )}
    </div>
  );
}

// ---------------- Settings sheet ----------------
export function SettingsSheet({ settings, set, close }: { settings: Settings; set: (s: Settings) => void; close: () => void }) {
  const row: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
  const label: CSSProperties = { ...mono, fontSize: 12, letterSpacing: '.2em', color: '#8A8A92' };
  const seg = <T extends string | number>(opts: T[], val: T, on: (v: T) => void, lab?: (v: T) => string) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${opts.length},1fr)`, background: '#1A1A1E', borderRadius: 10, padding: 4 }}>
      {opts.map(o => (
        <button type="button" key={String(o)} onClick={() => on(o)}
          style={{ padding: '10px 4px', minHeight: 44, borderRadius: 8, border: 0, background: o === val ? '#F2F2F2' : 'transparent', color: o === val ? '#0E0E11' : '#A8A8B0', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Barlow, sans-serif' }}>
          {lab ? lab(o) : String(o)}
        </button>
      ))}
    </div>
  );
  return (
    <div className="screen" style={{ ...full, padding: 'var(--pad-top) 24px var(--pad-bottom)', gap: 22, zIndex: 5 }}>
      <button type="button" className="back" onClick={close}>← GARAGE</button>
      <div style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 52, lineHeight: 0.9 }}>RACE<br />SETTINGS</div>
      <div style={row}>
        <div style={{ ...label, display: 'flex', justifyContent: 'space-between' }}><span>CAMERA TILT</span><span style={{ color: '#F2F2F2' }}>{settings.cameraTilt}°</span></div>
        <input type="range" min={35} max={90} step={1} value={settings.cameraTilt} onChange={e => set({ ...settings, cameraTilt: +e.target.value })} aria-label="Camera tilt" />
      </div>
      <div style={row}><div style={label}>WEATHER</div>{seg<Weather>(['Random', 'Dry', 'Rain', 'Rain on final lap'], settings.weather, w => set({ ...settings, weather: w }), w => w === 'Rain on final lap' ? 'Final lap' : w)}</div>
      <div style={row}><div style={label}>AI PACE</div>{seg<AiPace>(['Easy', 'Normal', 'Hard'], settings.aiPace, a => set({ ...settings, aiPace: a }))}</div>
      <div style={row}><div style={label}>LAPS</div>{seg<number>([1, 2, 3, 4, 5], settings.laps, l => set({ ...settings, laps: l }))}</div>
      <div style={{ flex: 1 }} />
      <Btn className="primary" onClick={close} style={{ height: 60, ...display, fontWeight: 800, fontSize: 26, letterSpacing: '.04em' }}>DONE</Btn>
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
export function Lobby(p: { s: RoomSession; settings: Settings; leave: () => void; start: () => void; starting: boolean }) {
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
      <div style={{ ...mono, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8A8A92' }}>
        <span>DRIVERS {s.players.length}/{MAX_PLAYERS} · {GRID_SIZE - s.players.length} AI</span>
        <span>{laps} LAPS · {weather === 'Random' ? 'WEATHER ?' : weather.toUpperCase()}</span>
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
                    onBlur={e => { const v = cleanName(e.target.value); if (v !== q.name) { localStorage.setItem('fr-name', v); s.updateMe({ name: v }); } }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    style={{ background: 'transparent', border: 0, borderBottom: '1px dashed #3A3A42', color: '#F2F2F2', fontWeight: 600, fontSize: 16, fontFamily: 'Barlow, sans-serif', padding: 0, width: '100%', outline: 'none', textTransform: 'uppercase' }} />
                ) : (
                  <div style={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.name}{isHost ? ' · HOST' : ''}</div>
                )}
                <div style={{ ...mono, fontSize: 11, color: '#8A8A92' }}>{t.name.toUpperCase()}{you && isHost ? ' · HOST' : ''}{!on ? ' · RECONNECTING' : ''}</div>
              </div>
              <div style={{ ...mono, padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: q.ready ? '#22C55E' : '#2A2A30', color: q.ready ? '#0E0E11' : '#A8A8B0' }}>{q.ready ? 'READY' : 'NOT READY'}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 14, color: '#8A8A92' }}>{GRID_SIZE}-car grid. AI fills the empty spots and drivers start mid-pack. {MIN_PLAYERS}+ drivers to race.</div>
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
  const title = green ? 'GO GO GO' : ui.phase === 'red' ? 'HOLD IT…' : 'HOLD TO REV';
  const sub = green ? 'Release now!' : ui.phase === 'red' ? 'Release on green · early = +1s' : 'Hold screen / Space to build revs';
  const bad = ui.reaction.startsWith('JUMP') || ui.reaction.includes('LATE');
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
        ? <div style={{ ...mono, fontSize: 36, fontWeight: 700, color: bad ? '#E10600' : '#22C55E' }}>{ui.reaction}</div>
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
export function RaceHud({ ui, tilt }: { ui: UiState; tilt: boolean }) {
  const h = ui.hud;
  const chip: CSSProperties = { ...mono, padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700 };
  return (
    <>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'var(--pad-top) 18px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(rgba(14,14,17,.92),transparent)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ ...display, fontWeight: 900, fontSize: 48, lineHeight: 0.9 }}>P{h.pos}<span style={{ fontSize: 22, color: '#A8A8B0' }}>/{h.field}</span></div>
          {h.rain && <div style={{ ...mono, padding: '4px 10px', borderRadius: 4, background: '#3B6CFF', fontSize: 12, fontWeight: 700 }}>RAIN · GRIP LOW</div>}
        </div>
        <div style={{ ...mono, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <div style={{ fontSize: 16 }}>LAP {h.lap}/{h.laps}</div>
          <div style={{ fontSize: 14 }}>{h.time}</div>
          <div style={{ fontSize: 12, color: '#A855F7' }}>BEST {h.best}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '48px 18px var(--pad-bottom)', display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(transparent,rgba(14,14,17,.95) 45%)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {h.drsReady && <div style={{ ...chip, border: '1.5px solid #00D2BE', color: '#00D2BE' }}>DRS READY · ↑</div>}
            {h.drsOn && <div style={{ ...chip, background: '#00D2BE', color: '#0E0E11' }}>DRS OPEN</div>}
            {h.slip && <div style={{ ...chip, background: '#1A1A1E', color: '#C8C8CE' }}>SLIPSTREAM</div>}
          </div>
          <div style={{ ...mono, fontSize: 28, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap' }}>{h.kmh}<span style={{ fontSize: 12, color: '#8A8A92' }}> KM/H</span></div>
        </div>
        <Bar label="BOOST" w={h.boost} color={h.boost >= 35 ? '#FFD400' : '#7A6A1A'} tick />
        <Bar label="TYRES" w={h.tyre} color={h.tyre > 60 ? '#22C55E' : h.tyre > 45 ? '#FFD400' : '#E10600'} />
        <div style={{ textAlign: 'center', fontSize: 14, color: '#8A8A92' }}>{tilt ? 'drag or tilt to steer · tap right edge to boost' : '← swipe to change line → · swipe ↑ DRS / boost'}</div>
      </div>
    </>
  );
}

function Bar({ label, w, color, tick }: { label: string; w: number; color: string; tick?: boolean }) {
  return (
    <div style={{ ...mono, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
      <span style={{ width: 48, color: '#A8A8B0' }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: '#2A2A30', position: 'relative' }}>
        <div style={{ width: w + '%', height: '100%', borderRadius: 4, background: color }} />
        {tick && <div style={{ position: 'absolute', left: '35%', top: -2, bottom: -2, width: 2, background: '#0E0E11' }} />}
      </div>
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
          <div key={r.pos} style={{ display: 'grid', gridTemplateColumns: '28px 6px 1fr auto', gap: 10, alignItems: 'center', padding: '7px 10px', borderRadius: 6, background: r.you ? '#2A0D0C' : 'transparent' }}>
            <span style={{ ...mono, color: '#8A8A92' }}>{r.pos}</span>
            <span style={{ width: 6, height: 18, borderRadius: 2, background: r.color }} />
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
            <span style={{ ...mono, fontSize: 13, color: '#A8A8B0' }}>{r.gap}</span>
          </div>
        ))}
      </div>
      <div style={{ ...mono, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Tile label="BEST LAP" value={sum.best} color="#A855F7" />
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
