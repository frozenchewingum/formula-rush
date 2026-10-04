import { supabase, ensureUser } from './supabase';
import { TRACK_ID } from '../game/constants';
import type { FinishInfo } from '../game/engine';

/** Store a finished race and keep the driver's best lap for the leaderboard. Never throws. */
export async function saveResult(f: FinishInfo, roomId: string | null) {
  if (!supabase) return;
  try {
    const userId = await ensureUser();
    await supabase.from('fr_race_results').insert({
      room_id: roomId, user_id: userId, position: f.pos, total_time: f.totalTime,
      best_lap: f.bestLap, apexes: f.apexes, contacts: f.contacts,
    });
    if (f.bestLap) await supabase.rpc('fr_submit_best_lap', { p_track: TRACK_ID, p_lap: f.bestLap });
  } catch (e) {
    console.warn('[formula-rush] result not saved', e);
  }
}

/** Personal best on this track, if signed in. */
export async function fetchPersonalBest(): Promise<number | null> {
  if (!supabase) return null;
  try {
    const userId = await ensureUser();
    const { data } = await supabase.from('fr_best_laps').select('lap_time').eq('user_id', userId).eq('track_id', TRACK_ID).maybeSingle();
    return data?.lap_time ?? null;
  } catch { return null; }
}
