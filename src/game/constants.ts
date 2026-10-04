export type Team = { name: string; color: string; dark: string };

// 11 teams × 2 drivers = 22 cars, matching the real 2026 F1 grid.
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

export const GRID_SIZE = TEAMS.length * 2; // 22
export const MAX_PLAYERS = 4; // humans per room; AI fills the rest of the 22-car grid
export const MIN_PLAYERS = 2;

export const LANE = 4.6;
export const HALF = 7.5;
export const VMAX = 78;
export const GRID_SLOT = 14; // solo: player starts P15 of 22, same mid-pack spot as P7 of 10
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
