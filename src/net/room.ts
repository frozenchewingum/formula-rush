// Room session: Postgres for membership (4-player cap enforced server-side),
// Realtime channel race:{roomId} for presence, start/state/finish broadcasts.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureUser, estimateClockOffset, errText, rpcOnUnload } from './supabase';
import { buildMpGrid, makeRainPlan, type MpStart, type StateMsg, type FinishMsg, type NetLink } from '../game/engine';
import { MIN_PLAYERS, isLivery, type Settings, type Weather } from '../game/constants';
import { trackLength } from '../game/trackInfo';

export type RoomRow = { id: string; code: string; host_id: string; status: 'lobby' | 'racing' | 'closed'; laps: number; weather: Weather; track?: string };
export type PlayerRow = { room_id: string; user_id: string; slot: number; name: string; team: number; livery?: string; accent?: number; ready: boolean; joined_at: string };

type Handlers = {
  onChange: () => void;
  onStart: (m: MpStart) => void;
  onState: (m: StateMsg) => void;
  onFinish: (m: FinishMsg) => void;
  onLobby: () => void;
  onHostChange: (iAmHost: boolean) => void;
  onPlayerGone: (userId: string) => void;
  onClosed: (reason: string) => void;
};

const ABSENT_MS = 8000;

export class RoomSession implements NetLink {
  myId = '';
  room: RoomRow | null = null;
  players: PlayerRow[] = [];
  online = new Set<string>();
  private absentSince = new Map<string, number>();
  private offset = 0;
  private ch: RealtimeChannel | null = null;
  private watchdog = 0;
  private heartbeat = 0;
  /** My uplink: I send my car here; only the host listens. */
  private up: RealtimeChannel | null = null;
  /** Host only: every guest's uplink. */
  private ups = new Map<string, RealtimeChannel>();
  private wasHost = false;
  private closed = false;

  constructor(private h: Handlers) {}

  // ---------- NetLink ----------
  isHost() { return !!this.room && this.room.host_id === this.myId; }
  serverNow() { return Date.now() + this.offset; }
  /** Host: one combined update to everyone. Guests: to the host only, through their uplink. */
  sendState(m: StateMsg) {
    if (this.isHost()) this.ch?.send({ type: 'broadcast', event: 'state', payload: m });
    else this.up?.send({ type: 'broadcast', event: 'state', payload: m });
  }
  sendFinish(m: FinishMsg) { this.ch?.send({ type: 'broadcast', event: 'finish', payload: m }); }

  me() { return this.players.find(p => p.user_id === this.myId) || null; }

  // ---------- lifecycle ----------
  /** Live rooms vs the cap, for the Garage's Create Room button. Null when unknown. */
  static async serverStatus(): Promise<{ active: number; max: number } | null> {
    if (!supabase) return null;
    try {
      await ensureUser();
      const { data, error } = await supabase.rpc('fr_server_status');
      return error || !data ? null : data as { active: number; max: number };
    } catch { return null; }
  }

  static async create(h: Handlers, name: string, team: number, settings: Settings) {
    const s = new RoomSession(h);
    s.myId = await ensureUser();
    const { data, error } = await supabase!.rpc('fr_create_room', { p_name: name, p_team: team, p_laps: settings.laps, p_weather: settings.weather, p_track: settings.track });
    if (error) throw new Error(errText(error));
    await s.open(data as RoomRow);
    return s;
  }

  static async join(h: Handlers, code: string, name: string, team: number) {
    const s = new RoomSession(h);
    s.myId = await ensureUser();
    const { data, error } = await supabase!.rpc('fr_join_room', { p_code: code, p_name: name, p_team: team });
    if (error) throw new Error(errText(error));
    await s.open(data as RoomRow);
    return s;
  }

  private async open(room: RoomRow) {
    this.room = room;
    this.wasHost = this.isHost();
    const [off] = await Promise.all([estimateClockOffset(), this.refresh()]);
    this.offset = off;
    const ch = supabase!.channel('race:' + room.id, { config: { presence: { key: this.myId }, broadcast: { self: false, ack: false } } });
    this.ch = ch;
    ch.on('presence', { event: 'sync' }, () => {
      this.online = new Set(Object.keys(ch.presenceState()));
      this.h.onChange();
    })
      .on('broadcast', { event: 'start' }, ({ payload }: { payload: unknown }) => this.h.onStart(payload as MpStart))
      .on('broadcast', { event: 'state' }, ({ payload }: { payload: unknown }) => this.h.onState(payload as StateMsg))
      .on('broadcast', { event: 'finish' }, ({ payload }: { payload: unknown }) => this.h.onFinish(payload as FinishMsg))
      .on('broadcast', { event: 'lobby' }, () => { this.refresh(); this.h.onLobby(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fr_room_players', filter: 'room_id=eq.' + room.id }, () => this.refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fr_rooms', filter: 'id=eq.' + room.id }, () => this.refresh());
    await new Promise<void>((resolve) => {
      ch.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ userId: this.myId, at: Date.now() });
          resolve();
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
      });
    });
    this.watchdog = window.setInterval(() => this.checkAbsent(), 2000);
    // Uplink to the host (see sendState) and, as host, listen to everyone else's.
    this.up = supabase!.channel(this.upTopic(this.myId), { config: { broadcast: { self: false, ack: false } } });
    this.up.subscribe();
    this.syncUplinks();
    // Liveness for the room cap: a room nobody heartbeats for 60 s is retired.
    const beat = () => { if (this.room) supabase!.rpc('fr_room_heartbeat', { p_room: this.room.id }).then(() => {}, () => {}); };
    beat();
    this.heartbeat = window.setInterval(beat, 20000);
  }

  private upTopic(userId: string) { return 'race:' + this.room!.id + ':up:' + userId; }

  /** Host listens on every guest's uplink; guests listen to none. */
  private syncUplinks() {
    if (!this.room || this.closed) return;
    const want = new Set(this.isHost() ? this.players.map(p => p.user_id).filter(id => id !== this.myId) : []);
    for (const [id, ch] of this.ups) if (!want.has(id)) { supabase!.removeChannel(ch); this.ups.delete(id); }
    for (const id of want) {
      if (this.ups.has(id)) continue;
      const ch = supabase!.channel(this.upTopic(id), { config: { broadcast: { self: false, ack: false } } });
      ch.on('broadcast', { event: 'state' }, ({ payload }: { payload: unknown }) => this.h.onState(payload as StateMsg)).subscribe();
      this.ups.set(id, ch);
    }
  }

  async refresh() {
    if (!this.room || this.closed) return;
    const [r, p] = await Promise.all([
      supabase!.from('fr_rooms').select('*').eq('id', this.room.id).single(),
      supabase!.from('fr_room_players').select('*').eq('room_id', this.room.id).order('slot'),
    ]);
    if (r.data) this.room = r.data as RoomRow;
    if (p.data) this.players = p.data as PlayerRow[];
    if (this.room.status === 'closed' || (p.data && !this.me())) {
      this.close();
      this.h.onClosed(this.me() ? 'ROOM CLOSED' : 'REMOVED FROM ROOM');
      return;
    }
    const host = this.isHost();
    if (host !== this.wasHost) { this.wasHost = host; this.h.onHostChange(host); }
    this.syncUplinks();
    this.h.onChange();
  }

  /** Drop players whose connection vanished; take over as host if the host vanished. */
  private async checkAbsent() {
    if (!this.room || !this.ch) return;
    const now = Date.now();
    for (const p of this.players) {
      if (p.user_id === this.myId) continue;
      if (this.online.has(p.user_id)) { this.absentSince.delete(p.user_id); continue; }
      const since = this.absentSince.get(p.user_id) ?? now;
      this.absentSince.set(p.user_id, since);
      if (now - since < ABSENT_MS) continue;
      if (this.room.host_id === p.user_id) {
        const others = this.players.filter(q => q.user_id !== p.user_id).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
        if (others[0]?.user_id === this.myId) {
          this.absentSince.delete(p.user_id);
          const { error } = await supabase!.rpc('fr_claim_host', { p_room: this.room.id });
          if (!error) { this.h.onPlayerGone(p.user_id); await this.refresh(); }
        }
      } else if (this.isHost()) {
        this.absentSince.delete(p.user_id);
        await supabase!.rpc('fr_kick_player', { p_room: this.room.id, p_user: p.user_id });
        this.h.onPlayerGone(p.user_id);
      }
    }
  }

  /** Page is closing (refresh / tab closed): leave the room so an empty room closes straight away. */
  leaveOnUnload() {
    if (this.room) rpcOnUnload('fr_leave_room', { p_room: this.room.id });
    this.close();
  }

  async leave() {
    const id = this.room?.id;
    this.close();
    if (id) await supabase!.rpc('fr_leave_room', { p_room: id });
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    clearInterval(this.heartbeat);
    if (this.ch) { this.ch.untrack(); supabase!.removeChannel(this.ch); this.ch = null; }
    if (this.up) { supabase!.removeChannel(this.up); this.up = null; }
    for (const ch of this.ups.values()) supabase!.removeChannel(ch);
    this.ups.clear();
  }

  // ---------- lobby actions ----------
  async updateMe(patch: Partial<Pick<PlayerRow, 'ready' | 'name' | 'team' | 'livery' | 'accent'>>) {
    if (!this.room) return;
    const me = this.me();
    if (me) Object.assign(me, patch);
    this.h.onChange();
    await supabase!.from('fr_room_players').update(patch).eq('room_id', this.room.id).eq('user_id', this.myId);
  }

  /** Host: push laps/weather/track to the room row; guests pick it up via postgres_changes. */
  async setSettings(laps: number, weather: Weather, track: string) {
    if (!this.room || !this.isHost() || this.room.status !== 'lobby') return;
    if (this.room.laps === laps && this.room.weather === weather && this.room.track === track) return;
    this.room = { ...this.room, laps, weather, track };
    this.h.onChange();
    const { error } = await supabase!.rpc('fr_set_room', { p_room: this.room.id, p_status: null, p_laps: laps, p_weather: weather, p_track: track });
    if (error) console.warn('fr_set_room', errText(error));
  }

  canStart() {
    return this.isHost() && this.players.length >= MIN_PLAYERS && this.players.every(p => p.ready);
  }

  /** Host: lock the room, build the shared grid + weather, and schedule a common green light. */
  async hostStart(settings: Settings) {
    if (!this.room || !this.canStart()) return;
    const { data, error } = await supabase!.rpc('fr_set_room', { p_room: this.room.id, p_status: 'racing', p_laps: settings.laps, p_weather: settings.weather, p_track: settings.track });
    if (error) throw new Error(errText(error));
    this.room = data as RoomRow;
    const humans = this.players.map(p => ({ userId: p.user_id, name: p.name, team: p.team, livery: isLivery(p.livery) ? p.livery : undefined, accent: p.accent ?? 0 }));
    const lightsDelay = 700 + Math.random() * 1600;
    const msg: MpStart = {
      grid: buildMpGrid(humans, settings.aiPace),
      laps: settings.laps,
      rainPlan: makeRainPlan(settings.weather, settings.laps, trackLength(settings.track)),
      lightsDelay,
      greenAt: this.serverNow() + 1500 + 4 * 700 + lightsDelay,
      hostId: this.myId,
      ai: settings.aiPace,
      track: settings.track,
    };
    this.ch?.send({ type: 'broadcast', event: 'start', payload: msg });
    this.h.onStart(msg);
  }

  async backToLobby() {
    if (!this.room) return;
    if (this.isHost() && this.room.status === 'racing') {
      await supabase!.rpc('fr_set_room', { p_room: this.room.id, p_status: 'lobby' });
      this.ch?.send({ type: 'broadcast', event: 'lobby', payload: {} });
    } else {
      await this.updateMe({ ready: false });
    }
    await this.refresh();
  }
}
