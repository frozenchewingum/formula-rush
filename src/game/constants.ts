export type Team = { name: string; color: string; dark: string };

export const TEAMS: Team[] = [
  { name: 'Vantor', color: '#E10600', dark: '#9A0400' },
  { name: 'Kestrel', color: '#00D2BE', dark: '#00877A' },
  { name: 'Orbis', color: '#FF8A00', dark: '#B35F00' },
  { name: 'Halcyon', color: '#3B6CFF', dark: '#2446B3' },
  { name: 'Meridian', color: '#E8E8EA', dark: '#9A9AA0' },
];

export const LANE = 4.6;
export const HALF = 7.5;
export const VMAX = 78;
export const GRID_SLOT = 6; // solo: player starts P7
export const TRACK_ID = 'circuit-1';

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
