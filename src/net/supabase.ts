import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = !!(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'formula-rush-auth' },
      realtime: { params: { eventsPerSecond: 40 } },
    })
  : null;

let userPromise: Promise<string> | null = null;

/** Anonymous sign-in; the session persists in localStorage so the same driver id survives reloads. */
export function ensureUser(): Promise<string> {
  if (!supabase) return Promise.reject(new Error('OFFLINE · SUPABASE NOT CONFIGURED'));
  if (!userPromise) {
    userPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) return data.session.user.id;
      const { data: d2, error } = await supabase.auth.signInAnonymously();
      if (error || !d2.user) throw new Error(error?.message?.toUpperCase() || 'SIGN-IN FAILED');
      return d2.user.id;
    })().catch(e => { userPromise = null; throw e; });
  }
  return userPromise;
}

/** Estimate server clock offset (ms) from a few round trips, keeping the lowest-latency sample. */
export async function estimateClockOffset(samples = 5): Promise<number> {
  if (!supabase) return 0;
  let best = { rtt: Infinity, off: 0 };
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const { data, error } = await supabase.rpc('fr_now');
    const t1 = Date.now();
    if (error || typeof data !== 'number') continue;
    const rtt = t1 - t0;
    if (rtt < best.rtt) best = { rtt, off: data - (t0 + t1) / 2 };
  }
  return best.off;
}

/** Postgres raises our room errors as messages like 'ROOM FULL (22/22)'. */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e);
  const full = m.match(/ROOM FULL \(\d+\/\d+\)/);
  if (full) return full[0];
  for (const k of ['ROOM NOT FOUND', 'RACE IN PROGRESS', 'NOT HOST', 'NO FREE CODE']) if (m.includes(k)) return k;
  if (/anonymous/i.test(m)) return 'ENABLE ANONYMOUS SIGN-INS IN SUPABASE';
  if (/fetch|network/i.test(m)) return 'NETWORK ERROR';
  return m.toUpperCase().slice(0, 60);
}
