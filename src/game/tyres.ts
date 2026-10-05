// Tyre compounds, wear and the pit lane (v1.5). Pure TS, shared by the engine and the UI.

export type Compound = 'soft' | 'medium' | 'hard' | 'wet';

export type CompoundSpec = {
  id: Compound; name: string; short: string; color: string;
  /** Corner grip multiplier on a dry / wet track. */
  dryGrip: number; wetGrip: number;
  /** Top speed multiplier. */
  speed: number;
  /** Laps from new to fully worn in the right conditions. */
  life: number;
  blurb: string;
};

export const COMPOUNDS: CompoundSpec[] = [
  { id: 'soft', name: 'Soft', short: 'S', color: '#FF3B30', dryGrip: 1.08, wetGrip: 0.72, speed: 1.035, life: 1.7, blurb: 'Fastest, wears out quickly' },
  { id: 'medium', name: 'Medium', short: 'M', color: '#FFD400', dryGrip: 1.0, wetGrip: 0.7, speed: 1.0, life: 2.6, blurb: 'Balanced pace and life' },
  { id: 'hard', name: 'Hard', short: 'H', color: '#F2F2F2', dryGrip: 0.94, wetGrip: 0.68, speed: 0.965, life: 3.05, blurb: 'Slowest, lasts the longest' },
  { id: 'wet', name: 'Wet', short: 'W', color: '#3B6CFF', dryGrip: 0.86, wetGrip: 0.97, speed: 0.95, life: 3.6, blurb: 'Grip in the rain, melts in the dry' },
];
export const compoundIndex = (c: Compound) => Math.max(0, COMPOUNDS.findIndex(s => s.id === c));
export const spec = (i: number) => COMPOUNDS[i] || COMPOUNDS[1];
export const isCompound = (v: unknown): v is Compound => COMPOUNDS.some(c => c.id === v);

/** Below this wear level the tyre falls off the "cliff": grip and speed drop sharply. */
export const CLIFF = 0.25;
/** Show BOX BOX once tyres drop under this. */
export const BOX_CALL = 0.32;
/** Below this the tyre has failed: the car limps until it pits (v1.9). */
export const FAILED = 0.02;

/** Wear multiplier for the conditions: wets overheat on a dry track, slicks run cool in the rain. */
export function wearRate(i: number, rain: boolean) {
  const s = spec(i);
  if (s.id === 'wet') return rain ? 1 : 2.6;
  return rain ? 0.8 : 1;
}

/** Grip, top-speed and steering multipliers for a compound at a wear level (1 = new, 0 = gone). */
export function tyrePerf(i: number, wear: number, rain: boolean) {
  const s = spec(i), w = Math.max(0, Math.min(1, wear));
  const base = rain ? s.wetGrip : s.dryGrip;
  // A worn-out tyre has failed: the car limps (about half speed) until it pits.
  if (w < FAILED) return { grip: base * 0.4, speed: s.speed * 0.55, steer: 0.5 };
  // Gentle fade down to the cliff, then a steep drop.
  const fade = w >= CLIFF ? 0.92 + 0.08 * (w - CLIFF) / (1 - CLIFF) : 0.5 + 0.42 * (w / CLIFF);
  const vfade = w >= CLIFF ? 0.97 + 0.03 * (w - CLIFF) / (1 - CLIFF) : 0.76 + 0.21 * (w / CLIFF);
  return { grip: base * fade, speed: s.speed * vfade, steer: 0.7 + 0.3 * fade };
}

/** Softest compound that survives `laps` more laps (wets when it's raining). */
export function recommend(laps: number, rain: boolean): Compound {
  if (rain) return 'wet';
  if (laps <= COMPOUNDS[0].life * 0.8) return 'soft';
  if (laps <= COMPOUNDS[1].life * 0.8) return 'medium';
  return 'hard';
}

// ---------- pit lane geometry (track progress units, measured from the start/finish line) ----------
/** Pit lane runs along the main straight on the right-hand side (+d), entry before the line. */
export const PIT = {
  /** Commit window: swipe right from the right-hand line while p (mod lap) is in [WIN_FROM, ENTRY]. */
  WIN_FROM: -120,
  ENTRY: -28,
  /** Box positions after the line; each car uses one of BOXES slots spaced SPACING apart. */
  BOX: 24, BOXES: 4, SPACING: 7,
  EXIT: 72,
  /** Lateral position of the pit lane and the limiter speed. */
  D: 11, LIMIT: 52,
  /** Pit lane edges for drawing. */
  IN_EDGE: 9.2, OUT_EDGE: 13.4,
} as const;

export type Wheel = 'FL' | 'FR' | 'RL' | 'RR';
export type Dir = 'up' | 'down' | 'left' | 'right';
export const WHEELS: Wheel[] = ['FL', 'FR', 'RL', 'RR'];
export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
export const DIR_ARROW: Record<Dir, string> = { up: '↑', down: '↓', left: '←', right: '→' };
export const WHEEL_NAME: Record<Wheel, string> = { FL: 'FRONT LEFT', FR: 'FRONT RIGHT', RL: 'REAR LEFT', RR: 'REAR RIGHT' };
/** Stop time grades. */
export const PIT_FAST = 2.0, PIT_GOOD = 2.8, PIT_WRONG = 0.5;
