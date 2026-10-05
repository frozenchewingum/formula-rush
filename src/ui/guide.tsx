import type { CSSProperties, ReactNode } from 'react';
import { GRID_SIZE, MAX_PLAYERS } from '../game/constants';
import { COMPOUNDS } from '../game/tyres';

const mono: CSSProperties = { fontFamily: "'JetBrains Mono', monospace" };
const display: CSSProperties = { fontFamily: "'Big Shoulders Display', sans-serif" };
const media = (name: string) => `${import.meta.env?.BASE_URL ?? './'}guide/${name}.webp`;

type Step = { title: string; img?: string; alt?: string; art?: ReactNode; body: ReactNode; keys?: string };

const K = ({ children }: { children: ReactNode }) => (
  <span style={{ ...mono, fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#1A1A1E', color: '#F2F2F2', whiteSpace: 'nowrap' }}>{children}</span>
);
const Y = ({ c, children }: { c: string; children: ReactNode }) => <b style={{ color: c, fontWeight: 600 }}>{children}</b>;

function RoomArt() {
  return (
    <div aria-hidden style={{ width: '100%', aspectRatio: '300 / 538', borderRadius: 12, background: '#141417', display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxSizing: 'border-box', justifyContent: 'center' }}>
      <div style={{ ...mono, fontSize: 9, letterSpacing: '.2em', color: '#8A8A92' }}>ROOM CODE</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
        {'KMVF'.split('').map(c => <div key={c} style={{ ...mono, fontWeight: 700, fontSize: 18, textAlign: 'center', padding: '6px 0', borderRadius: 6, background: '#1A1A1E', border: '1.5px solid #2A2A30' }}>{c}</div>)}
      </div>
      {[['#E10600', 'YOU', true], ['#00D2BE', 'ALEX', true], ['#E040A0', 'SAM', false]].map(([c, n, r]) => (
        <div key={n as string} style={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 6, alignItems: 'center', height: 26, borderRadius: 6, background: '#1A1A1E', overflow: 'hidden', paddingRight: 6 }}>
          <div style={{ height: '100%', background: c as string }} />
          <span style={{ fontSize: 11, fontWeight: 600 }}>{n as string}</span>
          <span style={{ ...mono, fontSize: 8, fontWeight: 700, padding: '2px 4px', borderRadius: 3, background: r ? '#22C55E' : '#2A2A30', color: r ? '#0E0E11' : '#A8A8B0' }}>{r ? 'READY' : 'NOT READY'}</span>
        </div>
      ))}
      <div style={{ height: 26, borderRadius: 6, border: '1.5px dashed #2A2A30', ...mono, fontSize: 9, color: '#5A5A62', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>WAITING…</div>
    </div>
  );
}

function HazardArt() {
  const row = (color: string, label: string, sub: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, background: '#1A1A1E' }}>
      <span style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 17, color, lineHeight: 1 }}>{label}</span>
      <span style={{ ...mono, fontSize: 9, color: '#8A8A92' }}>{sub}</span>
    </div>
  );
  return (
    <div aria-hidden style={{ width: '100%', aspectRatio: '300 / 538', borderRadius: 12, background: '#141417', display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxSizing: 'border-box', justifyContent: 'center' }}>
      {row('#E10600', 'CONTACT', 'cars & walls slow you')}
      {row('#22C55E', 'TYRES', 'they won’t last forever')}
      {row('#3B6CFF', 'RAIN', 'everything gets harder')}
    </div>
  );
}

function PitArt() {
  return (
    <div aria-hidden style={{ width: '100%', aspectRatio: '300 / 538', borderRadius: 12, background: '#141417', display: 'flex', flexDirection: 'column', gap: 8, padding: 10, boxSizing: 'border-box', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.16em', color: '#FFD400' }}>BOX BOX</div>
      <div style={{ ...mono, fontSize: 22, fontWeight: 700 }}>1.84</div>
      <div style={{ position: 'relative', width: 70, height: 96 }}>
        <div style={{ position: 'absolute', left: 25, top: 4, width: 20, height: 88, borderRadius: '7px 7px 4px 4px', background: '#E10600' }} />
        {[[0, 12, '✓'], [52, 12, '✓'], [0, 62, '↓'], [52, 62, '']].map(([x, y, t], k) => (
          <div key={k} style={{ position: 'absolute', left: x as number, top: y as number, width: 18, height: 26, borderRadius: 4, ...mono, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: t === '✓' ? '#22C55E' : '#1A1A1E', color: t === '✓' ? '#0E0E11' : '#FFD400', border: t === '↓' ? '1.5px solid #FFD400' : 'none', boxSizing: 'border-box' }}>{t as string}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {COMPOUNDS.map(c => <span key={c.id} style={{ width: 18, height: 18, borderRadius: '50%', border: `3px solid ${c.color}`, boxSizing: 'border-box', ...mono, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.short}</span>)}
      </div>
    </div>
  );
}

const STEPS: Step[] = [
  {
    title: 'Pick your car', img: 'garage', alt: 'The Garage: team colours, Swipe or Tilt, and the RACE button',
    body: <>Choose a team colour and <Y c="#F2F2F2">Swipe</Y> or <Y c="#F2F2F2">Tilt</Y> controls. Tap <Y c="#E10600">RACE</Y> to take on {GRID_SIZE - 1} AI drivers. Race settings has three circuits to explore, each with its own character. Feeling brave? Turn up the AI too: the higher you go, the less they give away.</>,
  },
  {
    title: 'Nail the launch', img: 'launch', alt: 'Holding the screen through five red lights and letting go on green',
    body: <>Five red lights count down with a beep each. Rev as much as you like: <Y c="#FFD400">hold</Y> to rev, let go to lift. When the lights turn <Y c="#22C55E">green</Y>, let go. The quicker you react, the better your getaway, and a <Y c="#A855F7">perfect</Y> one comes with a little something extra. Hesitate and you’ll bog down.</>,
    keys: 'Hold Space',
  },
  {
    title: 'Change lines, hit apexes', img: 'lines', alt: 'Swiping right twice to reach a yellow apex ring',
    body: <><Y c="#F2F2F2">Swipe left or right</Y> to move between racing lines. The road changes width as you go: wide stretches open up room to pass, and where <Y c="#FFD400">yellow arrows</Y> appear it squeezes down, so pick your moment. Drive through the <Y c="#FFD400">yellow rings</Y> on the inside of corners to fill your boost.</>,
    keys: '← →',
  },
  {
    title: 'Boost', img: 'boost', alt: 'Swiping up to fire boost, with speed lines on screen',
    body: <><Y c="#F2F2F2">Swipe up</Y> to fire boost once the yellow bar passes the notch for a burst of speed. Line up the next apex to refill it. Use it wisely.</>,
    keys: '↑ or Space',
  },
  {
    title: 'DRS on the straights', img: 'drs', alt: 'DRS READY appears behind a rival; swiping up opens DRS',
    body: <>On the teal straights, stay close to the car ahead and <Y c="#00D2BE">DRS READY</Y> lights up. Swipe up to open it and fly past.</>,
    keys: '↑ or Space',
  },
  {
    title: 'Brake', art: <HazardArt />,
    body: <><Y c="#E10600">Press and hold</Y> the screen (without swiping) to brake. Boards count down <Y c="#F2F2F2">3 · 2 · 1</Y> before the big corners. On easy the car slows for corners by itself; turn the AI up and that’s on you. Too hot and you’ll run wide, and hard braking on tired tyres or in the wet can lock the wheels. Use the brake to tuck in behind a car too: sit in its tow, then swipe out at the right moment and you might just fly past.</>,
    keys: 'Hold ↓ or S',
  },
  {
    title: 'Keep it clean', art: <HazardArt />,
    body: <>Hitting cars or the wall costs you. Tyres don’t last forever, and when it <Y c="#3B6CFF">rains</Y>, everything gets harder. Rivals won’t always make room for you, either.</>,
  },
  {
    title: 'Tyres & Pit Stop Rush', art: <PitArt />,
    body: <>Pick your <Y c="#FF3B30">Soft</Y>, <Y c="#FFD400">Medium</Y>, <Y c="#F2F2F2">Hard</Y> or <Y c="#3B6CFF">Wet</Y> tyres before the race. Each one feels different; finding out which suits the race is up to you. When the team calls <Y c="#FFD400">BOX BOX</Y>, get on the right-hand line before the finish and <Y c="#F2F2F2">swipe right</Y> into the pit lane. Pick your next tyres any time from the NEXT strip on the right. In the box, tap each wheel twice in any order: gun off, then gun on once it glows yellow. A quick stop has its rewards.</>,
    keys: '→ to pit · 1–4 next tyres · Q E Z C wheels',
  },
  {
    title: 'Race your friends', art: <RoomArt />,
    body: <>Tap <Y c="#F2F2F2">Create Room</Y> and share the 4-letter code. Up to {MAX_PLAYERS - 1} friends tap <Y c="#F2F2F2">Join Room</Y>. When everyone is ready, the host starts. AI fills the rest of the {GRID_SIZE}-car grid.</>,
  },
];

export function Guide({ close }: { close: () => void }) {
  return (
    <div className="screen" role="dialog" aria-label="How to play" style={{ position: 'absolute', inset: 0, background: '#0E0E11', display: 'flex', flexDirection: 'column', zIndex: 6 }}>
      <div style={{ padding: 'var(--pad-top) 24px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="back" onClick={close}>← GARAGE</button>
        <div style={{ ...display, fontWeight: 900, fontStyle: 'italic', fontSize: 52, lineHeight: 0.9 }}>HOW TO<br /><span style={{ color: '#E10600' }}>PLAY</span></div>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: '8px 24px 16px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {STEPS.map((s, i) => (
          <li key={s.title} style={{ display: 'grid', gridTemplateColumns: '118px 1fr', gap: 14, alignItems: 'start' }}>
            {s.img
              ? <img src={media(s.img)} alt={s.alt} loading={i < 2 ? 'eager' : 'lazy'} width={300} height={538}
                  style={{ width: '100%', height: 'auto', aspectRatio: s.img === 'launch' ? '320 / 410' : s.img === 'garage' ? '320 / 608' : '300 / 538', objectFit: 'cover', borderRadius: 12, background: '#141417', display: 'block' }} />
              : s.art}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, paddingTop: 2 }}>
              <div style={{ ...mono, fontSize: 11, letterSpacing: '.2em', color: '#8A8A92' }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ ...display, fontWeight: 800, fontSize: 24, lineHeight: 1, textWrap: 'balance' } as CSSProperties}>{s.title}</div>
              <div style={{ fontSize: 15, lineHeight: 1.4, color: '#C8C8CE' }}>{s.body}</div>
              {s.keys && <div style={{ fontSize: 12, color: '#8A8A92', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>Keyboard <K>{s.keys}</K></div>}
            </div>
          </li>
        ))}
        <li style={{ fontSize: 13, color: '#8A8A92', lineHeight: 1.5 }}>
          Tilt mode: tilt or drag to steer, tap the right edge to boost. Press <K>M</K> to toggle sound; music and engine sound have their own switches in Race settings → More.
        </li>
      </ol>
      <div style={{ padding: '12px 24px var(--pad-bottom)', borderTop: '1px solid #1A1A1E' }}>
        <button type="button" className="btn primary" onClick={close} style={{ width: '100%', height: 56, ...display, fontWeight: 800, fontSize: 26, letterSpacing: '.04em' }}>GOT IT</button>
      </div>
    </div>
  );
}
