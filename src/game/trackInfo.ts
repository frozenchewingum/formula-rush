import { buildTrack, trackDef } from './track';

const lengths = new Map<string, number>();
/** Length of one lap in track units (used for weather plans before an engine exists). */
export function trackLength(id: string | undefined) {
  const key = trackDef(id).id;
  let L = lengths.get(key);
  if (L === undefined) { L = buildTrack(key).L; lengths.set(key, L); }
  return L;
}
