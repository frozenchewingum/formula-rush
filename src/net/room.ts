// Room session: Postgres for membership (4-player cap enforced server-side),
// Realtime channel race:{roomId} for presence, start/state/finish broadcasts.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, ensureUser, estimateClockOffset, errText } from './supabase';
import { buildMpGrid, makeRainPlan, type MpStart, type StateMsg, type FinishMsg, type NetLink } from '../game/engine';
import type { Settings, Weather } from '../game/constants';
import { TRACK_L } from '../game/trackInfo';

export type RoomRow = { id: string; code: string; host_id: string; status: 'lobby' | 'racing' | 'closed'; laps: number; weather: Weather };
export type PlayerRow = { room_id: string; user_id: string; slot: number; name: string; team: number; ready: boolean; joined_at: string };

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
  private wasHost = false;
  private closed = false;

  constructor(private h: Handlers) {}

  // ---------- NetLink ----------
  isHost() { return !!this.room && this.room.host_id === this.myId; }
  serverNow() { return Date.now() + this.offset; }
  sendState(m: StateMsg) { this.ch?.send({ type: 'broadcast', event: 'state', payload: m }); }
  sendFinish(m: FinishMsg) { this.ch?.send({ type: 'broadcast', event: 'finish', payload: m }); }

  me() { return this.players.find(p => p.user_id === this.myId) || null; }

  // ---------- lifecycle ----------
  static async create(h: Handlers, name: string, team: number, settings: Settings) {
    const s = new RoomSession(h);
    s.myId = await ensureUser();
    const { data, error } = await supabase!.rpc('fr_create_room', { p_name: name, p_team: team, p_laps: settings.laps, p_weather: settings.weather });
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

  async leave() {
    const id = this.room?.id;
    this.close();
    if (id) await supabase!.rpc('fr_leave_room', { p_room: id });
  }

  close() {
    this.closed = true;
    clearInterval(this.watchdog);
    if (this.ch) { this.ch.untrack(); supabase!.removeChannel(this.ch); this.ch = null; }
  }

  // ---------- lobby actions ----------
  async updateMe(patch: Partial<Pick<PlayerRow, 'ready' | 'name' | 'team'>>) {
    if (!this.room) return;
    const me = this.me();
    if (me) Object.assign(me, patch);
    this.h.onChange();
    await supabase!.from('fr_room_players').update(patch).eq('room_id', this.room.id).eq('user_id', this.myId);
  }

  canStart() {
    return this.isHost() && this.players.length >= 2 && this.players.every(p => p.ready);
  }

  /** Host: lock the room, build the shared grid + weather, and schedule a common green light. */
  async hostStart(settings: Settings) {
    if (!this.room || !this.canStart()) return;
    const { data, error } = await supabase!.rpc('fr_set_room', { p_room: this.room.id, p_status: 'racing', p_laps: settings.laps, p_weather: settings.weather });
    if (error) throw new Error(errText(error));
    this.room = data as RoomRow;
    const humans = this.players.map(p => ({ userId: p.user_id, name: p.name, team: p.team }));
    const lightsDelay = 700 + Math.random() * 1600;
    const msg: MpStart = {
      grid: buildMpGrid(humans, settings.aiPace),
      laps: settings.laps,
      rainPlan: makeRainPlan(settings.weather, settings.laps, TRACK_L),
      lightsDelay,
      greenAt: this.serverNow() + 1500 + 4 * 700 + lightsDelay,
      hostId: this.myId,
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
