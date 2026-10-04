export type Team = { name: string; color: string; dark: string };

// 11 teams. A race has 12 cars: fewer cars means fewer three-wide walls to get stuck behind.
export const TEAMS: Team[] = [
  { name: 'Vantor', color: '#E10600', dark: '#9A0400' },
  { name: 'Kestrel', color: '#00D2BE', dark: '#00877A' },
  { name: 'Orbis', color: '#FF8A00', dark: '#B35F00' },
  { name: 'Halcyon', color: '#3B6CFF', dark: '#2446B3' },
  { name: 'Meridian', color: '#E8E8EA', dark: '#9A9AA0' },
  { name: 'Sable', color: '#1E9E5A', dark: '#12643A' },
  { name: 'Corvo', color: '#E040A0', dark: '#9A1F6C' },
  { name: 'Aurex', color: '#D4A017', dark: '#8C6A0C' },
  { name: 'Nimbus', color: '#7DD3FC', dark: '#3E8FB8' },
  { name: 'Ferro', color: '#6B7280', dark: '#3F444D' },
  { name: 'Lumen', color: '#A3E635', dark: '#6B9A1E' },
];

export const GRID_SIZE = 12;
export const MAX_PLAYERS = 4; // humans per room; AI fills the rest of the grid
export const MIN_PLAYERS = 2;

export const LANE = 4.6;
export const HALF = 7.5;
export const VMAX = 78;
export const GRID_SLOT = 7; // solo: player starts P8 of 12, mid-pack
export const TRACK_ID = 'circuit-1';

/**
 * Realtime budget (messages/second for the whole project; every delivery to every player counts).
 * Supabase Free = 100, Pro = 500, Team = 2,500. Keep headroom for presence and lobby traffic.
 */
export const RT_BUDGET = Number(import.meta.env?.VITE_RT_MSGS_PER_SEC) || 80;

/** Seconds between state broadcasts so a room of n drivers stays inside the Realtime budget. */
export const sendInterval = (n: number) => Math.max(0.1, (n * Math.max(1, n - 1)) / RT_BUDGET);

export const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export type Weather = 'Random' | 'Dry' | 'Rain' | 'Rain on final lap';
export type AiPace = 'Easy' | 'Normal' | 'Hard';
export type Controls = 'swipe' | 'tilt';

export type Settings = { cameraTilt: number; weather: Weather; aiPace: AiPace; laps: number };

/** Race settings sheet options (v1.4). */
export const LAP_OPTS: [number, string][] = [[1, 'SPRINT'], [3, 'SHORT'], [5, 'MEDIUM'], [8, 'LONG']];
export const MAX_LAPS = 8;
/** [value, label, description, dot colour] */
export const WEATHER_OPTS: [Weather, string, string, string][] = [
  ['Random', 'Random', 'Rain may arrive or clear at any point', '#F2F2F2'],
  ['Dry', 'Dry', 'Full grip all race', '#FFD400'],
  ['Rain', 'Wet', 'Rain from lights out · low grip', '#3B6CFF'],
  ['Rain on final lap', 'Late rain', 'Dry, then rain on the final lap', '#00D2BE'],
];
export const weatherMeta = (w: Weather) => WEATHER_OPTS.find(o => o[0] === w) || WEATHER_OPTS[0];

// ---------- Liveries (v1.2) ----------
export type Livery = 'classic' | 'split' | 'stripe' | 'stealth';
export const LIVERIES: [Livery, string][] = [['classic', 'Classic'], ['split', 'Split'], ['stripe', 'Stripe'], ['stealth', 'Stealth']];
/** Accent always colours helmet, front-wing flap and DRS flap. */
export const ACCENTS = ['#FFD400', '#F2F2F2', '#00D2BE', '#A855F7', '#FF8A00'];
export const isLivery = (v: unknown): v is Livery => LIVERIES.some(l => l[0] === v);
export const liveryName = (l: Livery) => (LIVERIES.find(x => x[0] === l) || LIVERIES[0])[1];

/** 2D in-race paint: body, front wing, centre stripe, helmet. */
export function racePaint(team: number, livery: Livery = 'classic', accent = 0) {
  const t = TEAMS[team] || TEAMS[0], A = ACCENTS[accent] || ACCENTS[0];
  switch (livery) {
    case 'split': return { color: t.dark, dark: A, stripe: null, helmet: A };
    case 'stripe': return { color: t.color, dark: A, stripe: A, helmet: A };
    case 'stealth': return { color: '#1E1E22', dark: t.color, stripe: A, helmet: A };
    default: return { color: t.color, dark: A, stripe: null, helmet: A };
  }
}

/** Mini top-down car in the LIVERY tab: [body, sidepods, front wing, stripe]. */
export function liveryTile(team: number, livery: Livery, accent: number) {
  const t = TEAMS[team] || TEAMS[0], P = t.color, D = t.dark, A = ACCENTS[accent] || ACCENTS[0];
  return ({ classic: [P, D, A, 'transparent'], split: [D, P, A, 'transparent'], stripe: [P, D, A, A], stealth: ['#2A2A30', '#2A2A30', P, A] } as Record<Livery, string[]>)[livery];
}
export const DEFAULT_SETTINGS: Settings = { cameraTilt: 52, weather: 'Random', aiPace: 'Normal', laps: 3 };

export const PACE: Record<AiPace, number> = { Easy: 0.9, Normal: 0.955, Hard: 0.995 };

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const wrapA = (a: number) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
export const fmt = (t: number) => {
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
};
export const buzz = (p: number | number[]) => {
  try { navigator.vibrate?.(p); } catch { /* unsupported */ }
};
