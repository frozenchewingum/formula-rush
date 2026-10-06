// Formula Rush game engine: a direct port of the v1 prototype's Component class.
// Pure TS (no React). UI subscribes to `engine.ui` through `subscribe()`.
import {
  TEAMS, LANE, HALF, VMAX, GRID_SLOT, GRID_SIZE, aiProfile, clamp, fmt, buzz, sendInterval, racePaint, accelRate, DEFAULT_ACCEL,
  type Settings, type Controls, type Livery, type AccelModel, type AiPace, type AiProfile, DEFAULT_SETTINGS,
} from './constants';
import { buildTrack, trackAt, trackDef, CENTRES, lanesFor, type Track } from './track';
import { drawWorld } from './render';
import type { EngineInput } from '../audio/engineSound';
import {
  PIT, CLIFF, BOX_CALL, FAILED, PIT_FAST, PIT_GOOD, PIT_WRONG, PIT_SWAP, COMPOUNDS, spec, tyrePerf, wearRate, recommend, compoundIndex,
  type Compound,
} from './tyres';

export type Screen = 'garage' | 'join' | 'lobby' | 'lights' | 'race' | 'results';
export type Phase = 'hold' | 'red' | 'green';

export type Car = {
  name: string | null; userId: string | null; team: string; color: string; dark: string;
  stripe: string | null; helmet: string; teamColor: string;
  isPlayer: boolean; remote: boolean; ai: boolean;
  p: number; d: number; dTarget: number; v: number; k: number; i: number;
  base: number; startDelay: number; think: number; yawOff: number; contactT: number;
  finished: boolean; finishTime: number; boostOn: boolean; drsOn: boolean; brakeOn: boolean; dnf: boolean;
  snaps: Snap[];
  /** Tyres: compound index into COMPOUNDS, wear 1 (new) → 0 (gone). */
  tc: number; wear: number;
  /** Pit state: 0 racing · 1 pit lane to box · 2 stopped · 3 pit lane to exit · 4 merging back. */
  pit: number; lineP: number; boxP: number; outP: number; pitHold: number; pitT0: number; pitChecked: number;
  stops: number; bestPit: number; stints: number[]; boxCalled: boolean; failCalled: boolean;
  /** AI boost (Hard / Expert, v1.17): meter 0–100 earned at apexes, seconds of boost left, next defend check. */
  ab: number; abT: number; defT: number;
  /** Next check for giving way to a faster human behind (v1.19). */
  yT: number;
};
type Snap = { t: number; p: number; d: number; v: number; y: number };

export type Hud = {
  pos: number; lap: number; laps: number; time: string; best: string; boost: number; tyre: number;
  kmh: number; drsReady: boolean; drsOn: boolean; boostOn: boolean; braking: boolean; slip: boolean; rain: boolean; field: number;
  /** Tyre compound index, pit window open, pit lane limiter on, team radio call ('' when none). */
  tc: number; pitWindow: boolean; limiter: boolean; boxCall: string;
  /** Tyres the crew will fit at the next stop (same as tc unless changed). */
  nextTc: number;
};
export type ResultRow = { pos: number; name: string; color: string; gap: string; you: boolean; tyres: string };
export type Summary = { pos: number; gained: string; time: string; best: string; apex: string; contacts: string; pit: string; strategy: string };
export type Toast = { text: string; color: string; id: number };

/**
 * Pit Stop Rush (v1.14): the tyres picked during the race are waiting. Each wheel (FL, FR, RL, RR):
 * ws 0 = on the car, tap for gun off · 1 = crew swapping (seated PIT_SWAP s after offAt) · 2 = gun on, done.
 * 'done' = all four on (penalties still holding the car).
 */
export type PitUi = {
  phase: 'wheels' | 'done';
  chosen: number; ws: number[]; offAt: number[]; onAt: number[];
  pen: number; wrongAt: number; wrongWheel: number; t0: number; releaseAt: number;
};

export type UiState = {
  phase: Phase; lights: number; holding: boolean; reaction: string;
  toast: Toast | null; hud: Hud; results: ResultRow[]; summary: Summary | null; showResults: boolean; showRace: boolean;
  pit: PitUi | null;
  paused: boolean;
};

export type GridEntry = { team: number; userId?: string | null; name?: string | null; base: number; livery?: Livery; accent?: number };
export type MpStart = {
  grid: GridEntry[]; laps: number; rainPlan: [number, number][];
  greenAt: number; lightsDelay: number; hostId: string;
  /** AI difficulty the host picked (v1.16; older hosts leave it out). */
  ai?: AiPace;
  /** Circuit (v1.18; older hosts leave it out = the original circuit). */
  track?: string;
};
export type FinishInfo = {
  pos: number; totalTime: number; bestLap: number | null; apexes: string; contacts: number;
  pitStops: number; bestPit: number | null; tyres: string;
};

export type StateMsg = {
  id: string; t: number; p: number; d: number; v: number; y: number; b: boolean; r: boolean;
  /** Tyre compound index (v1.5; older clients leave it out). */
  c?: number;
  /** AI cars from the host: [index, p, d, v, yaw, compound, wear]. */
  ai?: [number, number, number, number, number, number?, number?][]; aiFin?: [number, number][];
  /** Host relay (v1.11): the other drivers' latest states, [id, t, p, d, v, yaw, boost 0/1, drs 0/1, compound]. */
  h?: [string, number, number, number, number, number, number, number, number][];
};
export type FinishMsg = { id: string; finishTime: number; best: number | null };

export interface NetLink {
  myId: string;
  isHost(): boolean;
  serverNow(): number;
  sendState(m: StateMsg): void;
  sendFinish(m: FinishMsg): void;
}

/** Off track (v1.24): grass top speed vs the car's base, and how far past the road edge a car can go. */
const GRASS_SPEED = 0.5, GRASS_MAX = 6;
/** Slipstream pull 0–1 by gap to the car ahead: nothing right on its gearbox, full from 12 to 22 units back, gone by 30. */
const towPull = (gap: number) => gap < 5 ? 0 : gap < 12 ? (gap - 5) / 7 : gap < 22 ? 1 : gap < 30 ? (30 - gap) / 8 : 0;

type Game = {
  cars: Car[]; player: Car; t: number; laps: number; running: boolean;
  boost: number; boostT: number; drsOn: boolean; drsReady: boolean; slip: boolean;
  lapStart: number; best: number; apexHits: number; apexTotal: number; contacts: number;
  skill: number; ai: AiProfile; camH: number; fov: number; shake: number; rainWas: boolean;
  rainPlan: [number, number][]; startSlot: number; finishedAt: number;
  /** Slingshot: seconds left, and the car you were towing behind (v1.19). */
  slingT: number; towCar: Car | null;
  /** Tow (v1.23): eased strength 0–1, seconds spent in a real tow, and the line you were on while in it. */
  tow: number; towT: number; towD: number;
  /** Braking (v1.20): toast cooldown for running wide, seconds the brake has been held, wheels locked, pit entry judged, pit speeding penalty. */
  wideCd: number; brakeHeld: number; locked: boolean; pitJudged: boolean; pitPen: number;
};

/** Launch grades: seconds from green to letting go, the auto-launch time and the bog-down penalty. */
const LAUNCH_PERFECT = 0.15, LAUNCH_GOOD = 0.35, LAUNCH_OK = 0.7, LAUNCH_AUTO = 1.5, LAUNCH_BOG = 0.5;

const emptyHud = (laps: number, tc = 1): Hud => ({
  pos: GRID_SLOT + 1, lap: 1, laps, time: '0:00.000', best: '—', boost: 20, tyre: 100, kmh: 0, drsReady: false, drsOn: false, boostOn: false,
  braking: false, slip: false, rain: false, field: GRID_SIZE, tc, nextTc: tc, pitWindow: false, limiter: false, boxCall: '',
});

export class Engine {
  T: Track = buildTrack();
  g!: Game;
  settings: Settings = { ...DEFAULT_SETTINGS };
  controls: Controls = 'swipe';
  team = 0;
  livery: Livery = 'classic';
  accent = 0;
  /** Starting tyres picked before the race (v1.5). */
  startCompound: Compound = 'medium';
  /** Acceleration feel under test (v1.8 hidden toggle). */
  accelModel: AccelModel = DEFAULT_ACCEL;
  screen: Screen = 'garage';
  ui: UiState;
  net: NetLink | null = null;
  mp: MpStart | null = null;
  onScreen: (s: Screen) => void = () => {};
  onFinish: (f: FinishInfo) => void = () => {};

  keySteer = 0; dragSteer = 0; gyroSteer = 0;
  /** Hold-to-brake: keyboard (↓ / S) and touch (press and hold without swiping). */
  brakeKey = false; brakeTouch = false;
  private listeners = new Set<() => void>();
  private timers: number[] = [];
  private holdingFlag = false;
  private toastTimer = 0;
  private toastSeq = 0;
  private sendT = 0;
  /** Host: latest state from each guest (arrives on their uplink) and when it was last relayed. */
  private relay = new Map<string, StateMsg>();
  private relayed = new Map<string, number>();
  private netInterval = 0.1;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private last = 0;
  private hudT = 0;
  drawCache: { S?: (number[] | null)[][]; V?: boolean[] } = {};

  constructor() {
    this.ui = { phase: 'hold', lights: 0, holding: false, reaction: '', toast: null, hud: emptyHud(3), results: [], summary: null, showResults: false, showRace: false, pit: null, paused: false };
    this.resetRace();
  }

  // ---------- store ----------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getUi = () => this.ui;
  private set(patch: Partial<UiState>) { this.ui = { ...this.ui, ...patch }; this.listeners.forEach(f => f()); }
  private later(fn: () => void, ms: number) { this.timers.push(window.setTimeout(fn, ms)); }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  setScreen(s: Screen) { this.screen = s; this.onScreen(s); }

  // ---------- loop ----------
  attach(cv: HTMLCanvasElement) {
    this.canvas = cv;
    this.last = performance.now();
    const loop = (t: number) => { this.tick(t); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  detach() { cancelAnimationFrame(this.raf); this.canvas = null; this.clearTimers(); }

  private tick(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.mp && this.net && (this.g.running || this.screen === 'lights')) this.mpLights();
    if (this.g.running && !this.paused) this.step(dt);
    if (this.canvas && (this.screen === 'lights' || this.screen === 'race')) drawWorld(this, this.canvas, dt);
    if (now - this.hudT > 100) { this.hudT = now; this.pushHud(); }
  }

  // ---------- race setup ----------
  resetRace(mp: MpStart | null = null) {
    this.clearTimers();
    this.mp = mp;
    const trackId = trackDef(mp ? mp.track : this.settings.track).id;
    if (this.T.id !== trackId) { this.T = buildTrack(trackId); this.drawCache = {}; }
    const T = this.T;
    const laps = mp ? mp.laps : this.settings.laps;
    const ai = aiProfile(mp ? mp.ai ?? this.settings.aiPace : this.settings.aiPace);
    let grid: GridEntry[];
    if (mp) grid = mp.grid;
    else {
      // AI: one car per team (your teammate included), so every team shows up once.
      const ti = this.team, pool = shuffle(TEAMS.map((_, t) => t)).slice(0, GRID_SIZE - 1);
      const slot = clamp(Math.round(ai.start), 0, GRID_SIZE - 1);
      const teams = [...pool.slice(0, slot), ti, ...pool.slice(slot)];
      grid = teams.map((t, i) => i === slot
        ? { team: t, userId: 'me', base: VMAX, livery: this.livery, accent: this.accent }
        : { team: t, userId: null, base: aiBase(i, ai) });
    }
    // Per-track AI pace (v1.21); the extra braking factor only where you brake for corners yourself (Hard / Expert).
    const td = trackDef(trackId), trackAi = (td.aiPace ?? 1) * (ai.assist === 0 || ai.assist > 1.1 ? td.brakePace ?? 1 : 1);
    const myId = mp && this.net ? this.net.myId : 'me';
    const host = !mp || !this.net || this.net.isHost();
    const rainPlan = mp ? mp.rainPlan : makeRainPlan(this.settings.weather, laps, T.L);
    const wetStart = rainPlan.some(([a, b]) => a <= 0 && b > 0);
    const myTyre = compoundIndex(this.startCompound);
    const cars: Car[] = grid.map((e, i) => {
      const me = e.userId === myId, human = !!e.userId, d = (i % 2 ? 1 : -1) * LANE, tm = TEAMS[e.team];
      // Humans carry their livery; AI cars keep the plain team look.
      const paint = human ? racePaint(e.team, e.livery, e.accent) : { color: tm.color, dark: tm.dark, stripe: null, helmet: '#E8E8EA' };
      return {
        name: human && !me ? (e.name || 'DRIVER') : null, userId: e.userId || null,
        team: tm.name, teamColor: tm.color, ...paint,
        isPlayer: me, remote: !me && (human || !host), ai: !human,
        p: -8 - i * 8, d, dTarget: d, v: 0, k: 0, i: 0,
        base: me ? VMAX : human ? e.base : e.base * trackAi, startDelay: me ? Infinity : ai.launch[0] + Math.random() * (ai.launch[1] - ai.launch[0]),
        think: Math.random() * 2, yawOff: 0, contactT: 0, finished: false, finishTime: 0,
        boostOn: false, drsOn: false, brakeOn: false, dnf: false, snaps: [],
        tc: me ? myTyre : human ? 1 : aiStartTyre(laps, wetStart), wear: 1,
        pit: 0, lineP: 0, boxP: 0, outP: 0, pitHold: 0, pitT0: 0, pitChecked: -1,
        stops: 0, bestPit: 0, stints: [], boxCalled: false, failCalled: false,
        ab: 20, abT: 0, defT: Math.random(), yT: Math.random() * 0.5,
      };
    });
    for (const c of cars) c.stints.push(c.tc);
    const player = cars.find(c => c.isPlayer) || cars[GRID_SLOT];
    if (!player.isPlayer) { player.isPlayer = true; player.tc = myTyre; player.stints = [myTyre]; }
    this.netInterval = sendInterval(grid.filter(e => e.userId).length);
    this.sendT = -1;
    this.relay.clear(); this.relayed.clear();
    this.nextTyre = null;
    this.g = {
      cars, player, t: 0, laps, running: false, boost: 20, boostT: 0, drsOn: false, drsReady: false, slip: false,
      lapStart: 0, best: 0, apexHits: 0, apexTotal: 0, contacts: 0,
      skill: ai.skill, ai, camH: trackAt(T, player.p).h, fov: 0, shake: 0,
      rainWas: false, rainPlan, startSlot: cars.indexOf(player), finishedAt: 0, slingT: 0, towCar: null, tow: 0, towT: 0, towD: 0, wideCd: 0, brakeHeld: 0, locked: false, pitJudged: false, pitPen: 0,
    };
    T.apexes.forEach(a => { a.hit = -9; a.miss = -9; });
    this.keySteer = 0; this.dragSteer = 0; this.brakeKey = false; this.brakeTouch = false;
    this.set({ hud: { ...emptyHud(laps, player.tc), pos: cars.indexOf(player) + 1 }, pit: null });
  }

  startRace(mp: MpStart | null = null) {
    this.resetRace(mp);
    this.holdingFlag = false;
    this.paused = false;
    this.set({ phase: 'hold', lights: 0, holding: false, reaction: '', toast: null, showResults: false, showRace: false, results: [], summary: null, pit: null, paused: false });
    this.setScreen('lights');
    // Solo: the countdown starts on its own; rooms run it from the shared clock (mpLights).
    if (!mp) this.later(() => { this.set({ phase: 'red' }); this.runLights(); }, 900);
  }

  // ---------- pause (solo) ----------
  paused = false;
  setPaused(p: boolean) {
    if (this.mp || this.screen !== 'race' || this.g.player.finished) p = false;
    if (p === this.paused) return;
    this.paused = p;
    if (p) { this.brakeKey = false; this.brakeTouch = false; this.keySteer = 0; this.dragSteer = 0; }
    this.set({ paused: p });
  }

  /** Lights driven by the shared clock so every client turns green together. */
  private mpLights() {
    const mp = this.mp!, now = this.net!.serverNow(), g = this.g;
    if (g.running) {
      g.t = (now - mp.greenAt) / 1000;
      return;
    }
    const greenAt = mp.greenAt, firstOn = greenAt - mp.lightsDelay - 4 * 700;
    if (now >= greenAt) {
      g.running = true; g.t = (now - greenAt) / 1000;
      this.set({ lights: 0, phase: 'green' }); buzz(40);
      this.afterGreen();
      return;
    }
    if (now >= firstOn) {
      const n = Math.min(5, 1 + Math.floor((now - firstOn) / 700));
      if (n !== this.ui.lights) { this.set({ lights: n, phase: 'red' }); buzz(10); }
    }
  }

  private runLights() {
    let n = 0;
    const stepL = () => {
      n++; this.set({ lights: n }); buzz(10);
      if (n < 5) return this.later(stepL, 700);
      this.later(() => {
        const g = this.g; g.running = true; g.t = 0;
        this.set({ lights: 0, phase: 'green' }); buzz(40);
        this.afterGreen();
      }, 700 + Math.random() * 1600);
    };
    this.later(stepL, 600);
  }

  private afterGreen() {
    // Nobody let go: the car bogs down and goes on its own.
    this.later(() => { if (this.g.player.startDelay === Infinity) this.launch(LAUNCH_AUTO); }, LAUNCH_AUTO * 1000);
  }

  /** Throttle on the grid: rev freely during the countdown; only a release after green launches. */
  throttleDown() {
    if (this.screen !== 'lights' || this.holdingFlag) return;
    this.holdingFlag = true; this.set({ holding: true });
  }

  throttleUp() {
    if (this.screen !== 'lights' || !this.holdingFlag) return;
    this.holdingFlag = false; this.set({ holding: false });
    if (this.ui.phase === 'green') this.launch(this.g.t);
  }

  /**
   * Launch graded by how quickly you let go after green (seconds):
   * ≤0.15 perfect (rolling start + boost), ≤0.35 good, ≤0.7 clean, slower = bogged down (+0.5 s).
   */
  private launch(r: number) {
    const g = this.g, pl = g.player;
    if (pl.startDelay !== Infinity) return;
    let text: string;
    if (r <= LAUNCH_PERFECT) {
      pl.startDelay = r; pl.v = 18; g.boost = Math.min(100, g.boost + 20);
      text = 'PERFECT · ' + r.toFixed(3) + 's'; buzz([20, 30, 20]);
    } else if (r <= LAUNCH_GOOD) {
      pl.startDelay = r; pl.v = 10; text = 'GOOD · ' + r.toFixed(3) + 's';
    } else if (r <= LAUNCH_OK) {
      pl.startDelay = r; text = r.toFixed(3) + 's';
    } else {
      pl.startDelay = r + LAUNCH_BOG; text = 'LATE START'; buzz([80, 40, 80]);
    }
    this.set({ reaction: text });
    this.later(() => this.setScreen('race'), 900);
  }

  isRain() {
    const g = this.g;
    return g.rainPlan.some(([a, b]) => g.player.p >= a && g.player.p < b);
  }

  toast(text: string, color: string) {
    this.set({ toast: { text, color, id: ++this.toastSeq } });
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.set({ toast: null }), 1000);
  }

  // ---------- controls ----------
  lane(dir: number) {
    const pl = this.g.player;
    if (pl.finished || pl.pit || this.paused) return;
    const cs = this.centres(pl.p, 20), cur = this.nearestIdx(cs, pl.dTarget);
    // Swiping right from the right-hand line inside the pit window takes the pit lane.
    if (dir > 0 && cs.length === 3 && cur === 2 && Math.abs(cs[cur] - pl.dTarget) < 0.3 && this.canPit(pl)) return this.enterPit(pl);
    // Next line over in the swipe direction (from wherever you are, on a line, between two or on the grass);
    // past the outside line you can step off onto the grass (v1.25: no walls, nothing holds you on).
    const next = cs.filter(x => dir > 0 ? x > pl.dTarget + 0.3 : x < pl.dTarget - 0.3).sort((a, b) => Math.abs(a - pl.dTarget) - Math.abs(b - pl.dTarget))[0];
    pl.dTarget = next ?? clamp(pl.dTarget + dir * LANE, -this.grassAt(pl.p, -1) + 1, this.grassAt(pl.p, 1) - 1);
  }

  action() {
    const g = this.g;
    if (g.player.finished || g.player.pit || this.paused || g.t < g.player.startDelay) return;
    if (g.drsReady) { g.drsOn = true; g.drsReady = false; this.toast('DRS OPEN', '#00D2BE'); buzz(20); }
    else if (g.boost >= 35) { g.boost -= 35; g.boostT = 1.6; this.toast('BOOST', '#FFD400'); buzz(30); }
    else this.toast('HIT APEXES FOR BOOST', '#8A8A92');
  }

  // ---------- helpers ----------
  private carAhead(c: Car, range: number, lat: number) {
    let best: Car | null = null, bg = range;
    for (const o of this.g.cars) {
      if (o === c) continue;
      const gap = o.p - c.p;
      if (gap > 0 && gap < bg && Math.abs(o.d - c.d) < lat) { bg = gap; best = o; }
    }
    return best ? { car: best, gap: bg } : null;
  }
  // ---------- lanes (v1.21: 1–3 lanes per section) ----------
  private idx(p: number) { const T = this.T; return Math.floor((((p % T.L) + T.L) % T.L) / T.step) % T.N; }
  /** Fewest lanes over the next `ahead` units: what a car must fit into soon. */
  lanesAhead(p: number, ahead = 36) {
    const T = this.T, i0 = this.idx(p);
    let n = 4;
    // Lanes the section has, but never more than the road is wide yet (it tapers in and out).
    for (let j = 0; j <= ahead / T.step; j++) { const q = (i0 + j) % T.N; n = Math.min(n, T.lanes[q], lanesFor(T.hw[q])); }
    return n;
  }
  /** Lane centres a car at `p` should use. */
  centres(p: number, ahead = 36) { return CENTRES[this.lanesAhead(p, ahead)]; }
  private nearestIdx(cs: number[], d: number) {
    let b = 0;
    for (let k = 1; k < cs.length; k++) if (Math.abs(cs[k] - d) < Math.abs(cs[b] - d)) b = k;
    return b;
  }
  /** Road half width at `p` (tapers into narrow sections). */
  halfAt(p: number) { return this.T.hw[this.idx(p)]; }
  /** Furthest a car can go off the road on side `side` (±1) at `p`: grass, but not into the pit lane alongside the straight. */
  private grassAt(p: number, side: number) {
    const L = this.T.L; let s = ((p % L) + L) % L; if (s > L / 2) s -= L;
    const pitSide = side > 0 && s > PIT.ENTRY - 14 && s < PIT.EXIT + 16;
    return pitSide ? Math.min(this.halfAt(p) + GRASS_MAX, PIT.IN_EDGE - 1.3) : this.halfAt(p) + GRASS_MAX;
  }
  /** AI `c` moves to a free line away from `from` (and stops defending for a moment). */
  private giveWay(c: Car, from: Car) {
    const cs = this.centres(c.p), cur = this.nearestIdx(cs, c.dTarget), them = this.nearestIdx(cs, from.dTarget);
    const all = cs.map((_, k) => k), opts = all.filter(k => k !== cur && k !== them).concat(all.filter(k => k !== cur && k === them));
    for (const k of opts) {
      if (this.laneFree(c, cs[k]) && !this.makesWall(c, cs[k])) { c.dTarget = cs[k]; c.defT = 2.5; return; }
    }
  }
  private laneFree(c: Car, d: number) {
    for (const o of this.g.cars) {
      if (o === c) continue;
      if (Math.abs(o.p - c.p) < 10 && (Math.abs(o.d - d) < 2.4 || Math.abs(o.dTarget - d) < 2.4)) return false;
    }
    return true;
  }
  /** True if putting `c` on lane `d` would fill every lane side by side (a wall nobody can pass). */
  private makesWall(c: Car, d: number) {
    const cs = this.centres(c.p, 20);
    if (cs.length < 2) return false; // single line: nothing to keep open
    const lanes = new Set([this.nearestIdx(cs, d)]);
    for (const o of this.g.cars) {
      if (o !== c && !o.finished && Math.abs(o.p - c.p) < 14 && Math.abs(o.dTarget) < HALF + 2.5) lanes.add(this.nearestIdx(cs, o.dTarget));
    }
    return lanes.size >= cs.length;
  }
  private nextApex(p: number) {
    const T = this.T;
    let s = p % T.L;
    if (s < 0) s += T.L;
    let best = null, bd = 220;
    for (const a of T.apexes) { let dd = a.s - s; if (dd < 0) dd += T.L; if (dd < bd) { bd = dd; best = a; } }
    return best;
  }

  // ---------- pit lane ----------
  /** Signed distance to the next start/finish line (negative = before it). */
  private toLine(p: number) {
    const L = this.T.L;
    return p - Math.ceil(p / L) * L;
  }
  /** Laps still to run after the next line; 0 means the next line is the chequered flag. */
  private lapsAfterLine(p: number) { return this.g.laps - Math.ceil(p / this.T.L); }
  inPitWindow(c: Car) {
    const s = this.toLine(c.p);
    return c.p > 0 && s >= PIT.WIN_FROM && s <= PIT.ENTRY;
  }
  canPit(c: Car) {
    return !c.finished && c.pit === 0 && this.inPitWindow(c) && this.lapsAfterLine(c.p) >= 1 && this.g.t >= c.startDelay;
  }
  private enterPit(c: Car) {
    const g = this.g, line = Math.ceil(c.p / this.T.L) * this.T.L, slot = g.cars.indexOf(c) % PIT.BOXES;
    c.pit = 1; c.lineP = line;
    c.boxP = line + PIT.BOX + slot * PIT.SPACING; c.outP = line + PIT.EXIT;
    c.dTarget = PIT.D;
    if (c.isPlayer) {
      g.boostT = 0; g.drsOn = false; g.drsReady = false; c.boxCalled = true; g.pitJudged = false;
      this.toast(g.ai.pitPen > 0 ? 'PIT LANE · BRAKE' : 'PIT LANE', '#FFD400'); buzz(20);
    }
  }
  /** AI strategy, decided once per lap as the car reaches the pit window. */
  private aiPitCheck(c: Car, rain: boolean) {
    const lapIdx = Math.ceil(c.p / this.T.L);
    if (c.pitChecked === lapIdx || !this.canPit(c)) return;
    c.pitChecked = lapIdx;
    const rem = this.lapsAfterLine(c.p), s = spec(c.tc), skill = this.g.skill;
    let go = false;
    if (rain && s.id !== 'wet') go = Math.random() < 0.55 + 0.4 * skill;
    else if (!rain && s.id === 'wet') go = Math.random() < 0.5 + 0.4 * skill;
    else {
      const atFlag = c.wear - rem / s.life * wearRate(c.tc, rain);
      go = c.wear < 0.65 && atFlag < CLIFF * 0.45 && Math.random() < 0.92;
    }
    if (!go) return;
    this.enterPit(c);
    // Pick the next tyre now; the stop takes 1.9–3.2 s (faster crews on harder AI).
    c.pitHold = 1.9 + Math.random() * 1.3 - skill * 0.3;
    c.stints.push(compoundIndex(recommend(rem, rain)));
  }
  /** Pit lane driving for every locally simulated car; returns the speed cap. */
  /** Pit limiter engaged: whole pit lane, except before the line when you brake for it yourself (Hard / Expert). */
  private limiterOn(c: Car) {
    return (c.pit === 1 && (!this.g.ai.pitPen || c.p >= c.lineP + PIT.ENTRY)) || c.pit === 3;
  }
  private pitSpeed(c: Car, target: number, dt: number) {
    const g = this.g;
    if (c.pit === 1) {
      const entry = c.lineP + PIT.ENTRY;
      // Hard / Expert: you brake for the pit lane yourself; the limiter only takes over at the line.
      const manual = c.isPlayer && g.ai.pitPen > 0;
      if (manual && !g.pitJudged && c.p >= entry) {
        g.pitJudged = true;
        if (c.v > PIT.LIMIT + 4) { g.pitPen = g.ai.pitPen; this.toast('PIT LANE SPEEDING', '#E10600'); buzz([80, 40, 80]); }
      }
      if (!manual || c.p >= entry) target = Math.min(target, Math.sqrt(PIT.LIMIT * PIT.LIMIT + 2 * 60 * Math.max(0, entry - c.p)));
      target = Math.min(target, Math.sqrt(2 * 55 * Math.max(0, c.boxP - c.p)) + 0.5);
      if (c.boxP - c.p < 0.6) {
        c.p = c.boxP; c.v = 0; c.pit = 2; c.pitT0 = g.t;
        if (c.isPlayer) this.openPitUi();
        return 0;
      }
      return target;
    }
    if (c.pit === 2) {
      if (!c.isPlayer) {
        c.pitHold -= dt;
        if (c.pitHold <= 0) this.fitTyres(c, c.stints[c.stints.length - 1], g.t - c.pitT0);
      }
      return 0;
    }
    if (c.pit === 3) {
      if (c.p >= c.outP) { c.pit = 4; c.dTarget = LANE; }
      return Math.min(target, PIT.LIMIT);
    }
    if (c.pit === 4 && Math.abs(c.d - LANE) < 0.8) c.pit = 0;
    return target;
  }
  private fitTyres(c: Car, tc: number, stopTime: number) {
    c.tc = tc; c.wear = 1; c.pit = 3; c.boxCalled = false; c.failCalled = false; c.stops++;
    if (!c.bestPit || stopTime < c.bestPit) c.bestPit = stopTime;
    if (c.isPlayer) c.stints.push(tc); // AI cars record their next stint when they decide to stop
  }

  // ---------- Pit Stop Rush (player) ----------
  /** Next tyres, picked any time during the race from the side strip; null = same compound again. */
  nextTyre: number | null = null;
  setNextTyre(i: number) {
    if (!COMPOUNDS[i] || this.g.player.finished) return;
    this.nextTyre = i === this.g.player.tc ? null : i;
    this.pushHud();
  }
  /** Stopped in the box: every wheel needs gun off, then (once the crew has swapped it) gun on. */
  private openPitUi() {
    const g = this.g, pl = g.player;
    const chosen = this.nextTyre ?? pl.tc;
    const pen = g.pitPen; g.pitPen = 0;
    this.set({ pit: { phase: 'wheels', chosen, ws: [0, 0, 0, 0], offAt: [-9, -9, -9, -9], onAt: [-9, -9, -9, -9], pen, wrongAt: -9, wrongWheel: -1, t0: g.t, releaseAt: 0 } });
    buzz([30, 30, 30]);
  }
  /**
   * Tap a wheel (0 FL, 1 FR, 2 RL, 3 RR). 1st tap = gun off (the crew then swaps the tyre, PIT_SWAP s);
   * 2nd tap = gun on, only once the new tyre is seated. Too early, or a finished wheel = +PIT_WRONG s.
   */
  pitTap(w: number) {
    const p = this.ui.pit, g = this.g;
    if (!p || p.phase !== 'wheels' || this.paused || w < 0 || w > 3) return;
    const ws = [...p.ws], offAt = [...p.offAt], onAt = [...p.onAt];
    const seated = ws[w] === 1 && g.t >= offAt[w] + PIT_SWAP;
    if (ws[w] === 0) { ws[w] = 1; offAt[w] = g.t; buzz(10); }
    else if (seated) { ws[w] = 2; onAt[w] = g.t; buzz(16); }
    else {
      this.set({ pit: { ...p, pen: p.pen + PIT_WRONG, wrongAt: g.t, wrongWheel: w } });
      g.shake = 0.15; buzz([50, 25, 50]);
      return;
    }
    if (ws.every(x => x === 2)) { this.set({ pit: { ...p, ws, offAt, onAt, phase: 'done', releaseAt: g.t + p.pen } }); buzz(25); }
    else this.set({ pit: { ...p, ws, offAt, onAt } });
  }
  get pitActive() { return !!this.ui.pit; }
  private stepPitUi() {
    const p = this.ui.pit, g = this.g, pl = g.player;
    if (!p || pl.pit !== 2) return;
    // Nobody at the controls: the crew finishes the job on its own.
    if (p.phase === 'wheels' && g.t - p.t0 > 8) { this.set({ pit: { ...p, ws: [2, 2, 2, 2], phase: 'done', releaseAt: g.t + p.pen } }); return; }
    if (p.phase === 'done' && g.t >= p.releaseAt) {
      // Released: straight back to racing, the stop time shows as a toast.
      const time = g.t - p.t0;
      this.fitTyres(pl, p.chosen, time);
      this.nextTyre = null;
      this.set({ pit: null });
      if (time < PIT_FAST) { g.boost = Math.min(100, g.boost + 25); this.toast(time.toFixed(2) + 's · FAST STOP', '#A855F7'); }
      else this.toast(time.toFixed(2) + 's STOP', time < PIT_GOOD ? '#22C55E' : '#FF8A00');
      buzz(40);
    }
  }

  // ---------- simulation ----------
  private step(dt: number) {
    const g = this.g, T = this.T, pl = g.player, rain = this.isRain();
    if (!this.mp) g.t += dt;
    if (rain && !g.rainWas && g.t > 2) this.toast('RAIN', '#3B6CFF');
    if (!rain && g.rainWas && g.t > 2) this.toast('TRACK DRYING', '#F2F2F2');
    g.rainWas = rain;
    for (const c of g.cars) { const a = trackAt(T, c.p); c.k = a.k; c.i = a.i; }
    if (this.controls === 'tilt' && !pl.finished && !pl.pit) {
      const steer = this.keySteer || this.dragSteer || this.gyroSteer || 0;
      // Steering hard right at the right-hand edge inside the pit window takes the pit lane.
      if (steer > 0.55 && pl.d > LANE + 0.6 && this.canPit(pl)) this.enterPit(pl);
      else pl.dTarget = clamp(pl.d + steer * 7, -this.grassAt(pl.p, -1), this.grassAt(pl.p, 1));
    }
    for (const c of g.cars) {
      if (c.remote) { this.stepRemote(c, dt); continue; }
      const started = g.t >= c.startDelay;
      const tp = tyrePerf(c.tc, c.wear, rain);
      const G = 66 * tp.grip * (c.isPlayer ? 1 : g.ai.grip);
      let vmax = c.base * tp.speed, mult = 1;
      if (c.isPlayer && !c.pit) {
        if (g.boostT > 0) mult *= 1.25;
        if (g.drsOn) mult *= 1.12;
        if (g.tow > 0) mult *= 1 + (g.ai.slip - 1) * g.tow;
        if (g.slingT > 0) mult *= g.ai.sling[0];
        if (c.contactT > 0.5) mult *= g.ai.bump[1];
      } else if (!c.isPlayer) {
        // Hard / Expert AI open DRS within a second of the car ahead; Normal+ take a tow.
        const live = !c.pit && started && !c.finished;
        const far = live && g.ai.drs && T.drs[c.i] ? this.carAhead(c, 400, 99) : null;
        c.drsOn = !!far && far.gap / Math.max(c.v, 1) < 1;
        if (c.drsOn) mult *= 1.12;
        // Hard / Expert AI spend boost the way you do: a 1.6 s burst for 35 of the meter.
        if (live && g.ai.boost && c.abT <= 0 && c.ab >= 35 && !c.drsOn) { c.ab -= 35; c.abT = 1.6; }
        c.boostOn = live && c.abT > 0;
        if (c.boostOn) mult *= 1.25;
        if (c.abT > 0) c.abT -= dt;
        else if (live && g.ai.tow) { const sl = this.carAhead(c, 30, 1.6); if (sl) mult *= 1 + (g.ai.slip - 1) * towPull(sl.gap); }
      }
      if (c.pit) vmax = Math.min(vmax, VMAX);
      const corner = Math.sqrt(G / Math.max(T.ka[c.i], 1e-4));
      // Braking assist (v1.20): Easy brakes for every corner for you; Normal/Hard only down to a margin over
      // the limit (boost no longer carries into corners); Expert not at all. Too fast → you slide wide below.
      const manual = c.isPlayer && !c.pit && g.ai.assist !== 1;
      let target = !started ? 0 : manual ? Math.min(vmax * mult, g.ai.assist ? corner * g.ai.assist : Infinity) : Math.min(vmax, corner) * mult;
      let decel = 75;
      if (c.isPlayer) {
        const pitBrake = c.pit === 1 && g.ai.pitPen > 0 && c.p < c.lineP + PIT.ENTRY;
        c.brakeOn = started && !c.finished && (!c.pit || pitBrake) && (this.brakeKey || this.brakeTouch);
        if (c.brakeOn) {
          target = 0; // eases off at the normal 75/s braking rate
          g.brakeHeld += dt;
          // Lock-up: hold hard braking on worn tyres, or on slicks in the rain, and the wheels lock.
          const risky = g.ai.lock > 0 && c.v > 35 && (c.wear < 0.45 || (rain && spec(c.tc).id !== 'wet'));
          if (risky && !g.locked && g.brakeHeld > g.ai.lock) {
            g.locked = true; c.wear = Math.max(0, c.wear - 0.05); g.shake = 0.25;
            this.toast('LOCK-UP', '#FF8A00'); buzz([30, 20, 30]);
          }
          if (g.locked) decel = 38;
        } else { g.brakeHeld = 0; g.locked = false; }
      }
      if (c.finished) target = Math.min(target, 38);
      if (!c.isPlayer && !c.finished && started) this.aiPitCheck(c, rain);
      if (c.pit) target = this.pitSpeed(c, target, dt);
      if (c.pit === 2) { if (c.isPlayer) this.stepPitUi(); continue; }
      // Narrowing ahead (v1.25): your line only moves when the road actually closes in on it, onto the nearest
      // line that's left (never because of traffic, so sitting in a tow doesn't push you aside). Off the road,
      // you stay where you are until you steer back.
      // v1.26: only when you fit here but won't a little further on, so it never fights a slide in a corner.
      if (c.isPlayer && !c.pit && started && !c.finished && this.controls !== 'tilt') {
        const room = Math.min(this.halfAt(c.p), this.halfAt(c.p + 20)) - 1.6;
        if (Math.abs(c.dTarget) > room && Math.abs(c.dTarget) <= this.halfAt(c.p) - 1.6) {
          const cs = this.centres(c.p, 20); c.dTarget = cs[this.nearestIdx(cs, c.d)];
        }
      }
      // AI: funnelled onto a line that still exists, a free one if there is.
      if (!c.isPlayer && !c.pit && started && !c.finished) {
        const cs = this.centres(c.p);
        if (Math.abs(cs[this.nearestIdx(cs, c.dTarget)] - c.dTarget) > 0.2) {
          const order = cs.map((_, j) => j).sort((a, b) => Math.abs(cs[a] - c.d) - Math.abs(cs[b] - c.d));
          const free = order.find(j => this.laneFree(c, cs[j]));
          c.dTarget = cs[free ?? order[0]];
        }
      }
      // Easy / Normal: in single file your car keeps its distance to the car ahead by itself.
      // In narrow sections it also watches where cars are heading, so a car merging in just ahead is let in.
      if (c.isPlayer && g.ai.follow && !c.pit && started && !c.finished && this.lanesAhead(c.p, 20) < 3) {
        const one = this.lanesAhead(c.p, 20) === 1;
        const ah = g.cars.filter(o => o !== c && !o.pit && o.p > c.p && o.p - c.p < 14 && (one || Math.abs(o.dTarget - c.dTarget) < 2.0 || Math.abs(o.d - c.d) < 2.0))
          .sort((a, b) => a.p - b.p)[0];
        if (ah) target = Math.min(target, ah.v * (ah.p - c.p < 6 ? 0.95 : 1));
      }
      // Merging side by side: the car behind backs off and lets the one ahead have the line (you too on Easy / Normal).
      if ((!c.isPlayer || g.ai.follow) && !c.pit && started && !c.finished) {
        const alongside = g.cars.find(o => o !== c && !o.pit && o.p > c.p && o.p - c.p < 7 && Math.abs(o.dTarget - c.dTarget) < 2.4 && Math.abs(o.d - c.d) > 1.2);
        if (alongside) target = Math.min(target, alongside.v * 0.9);
      }
      if (!c.isPlayer && !c.pit) {
        const ah = this.carAhead(c, 16, 2.3);
        if (ah) {
          let moved = false;
          if (ah.car.v < c.v + 2) {
            const cs = this.centres(c.p), li = this.nearestIdx(cs, c.dTarget);
            for (const dl of (Math.random() < 0.5 ? [1, -1] : [-1, 1])) {
              const nl = li + dl;
              if (nl >= 0 && nl < cs.length && this.laneFree(c, cs[nl]) && !this.makesWall(c, cs[nl])) { c.dTarget = cs[nl]; moved = true; break; }
            }
          }
          if (!moved || ah.gap < 6) target = Math.min(target, ah.car.v * (ah.gap < 6 ? 0.95 : 1));
        }
        // Already part of a three-wide wall and not its leader: lift slightly so the wall breaks up.
        if (this.makesWall(c, c.dTarget) && g.cars.some(o => o !== c && o.p > c.p && o.p - c.p < 14)) target *= 0.94;
        c.think -= dt;
        if (c.think <= 0) {
          c.think = 1.5 + Math.random() * 3;
          const ap = this.nextApex(c.p);
          const cs = this.centres(c.p);
          const raw = ap && Math.random() < g.skill ? ap.d : (Math.random() < 0.35 ? cs[Math.floor(Math.random() * cs.length)] : c.dTarget);
          const want = cs[this.nearestIdx(cs, raw)];
          if (this.laneFree(c, want) && !this.makesWall(c, want)) c.dTarget = want;
        }
        // Defending: a human closing in behind on another line → move across to cover it, now and then.
        if (g.ai.defend && started && !c.finished && (c.defT -= dt) <= 0) {
          c.defT = 0.9 + Math.random() * 0.6;
          const chaser = g.cars.find(o => !o.ai && !o.pit && !o.finished && c.p - o.p > 8 && c.p - o.p < 30 && Math.abs(o.d - c.dTarget) > 2.3);
          const cs = this.centres(c.p), cover = chaser ? cs[this.nearestIdx(cs, chaser.dTarget)] : 0;
          if (chaser && Math.random() < g.ai.defend && this.laneFree(c, cover) && !this.makesWall(c, cover)) c.dTarget = cover;
        }
        // Giving way: a clearly faster human closing in on the same line → step aside, more readily on easier levels.
        if (g.ai.yield && started && !c.finished && (c.yT -= dt) <= 0) {
          c.yT = 0.5;
          const fast = g.cars.find(o => !o.ai && !o.pit && !o.finished && c.p - o.p > 5 && c.p - o.p < 28 && Math.abs(o.d - c.d) < 2.3 && o.v > c.v + 2);
          if (fast && Math.random() < g.ai.yield) this.giveWay(c, fast);
        }
      }
      // Off track (v1.24): no walls. Past the road edge you're on the grass: the car bleeds speed down and chews
      // its tyres a little. It stays out there until you steer back (v1.25: no drifting back by itself).
      const edge = this.halfAt(c.p) - 0.9;
      const off = c.isPlayer && !c.pit && started && Math.abs(c.d) > edge;
      if (off) {
        target = Math.min(target, c.base * GRASS_SPEED);
        decel = Math.min(decel, 40);
        c.wear = Math.max(0, c.wear - 0.012 * dt);
        g.shake = Math.max(g.shake, 0.06);
        if (g.wideCd <= 0) { g.wideCd = 2; this.toast('OFF TRACK', '#FF8A00'); buzz(25); }
      }
      c.v += clamp(target - c.v, -decel * dt, accelRate(this.accelModel, c.isPlayer, c.v, target) * (c.isPlayer ? 1 : g.ai.accel / (24 / 26)) * dt);
      const prevD = c.d;
      const wets = spec(c.tc).id === 'wet';
      const lr = c.isPlayer ? 21 * tp.steer * (rain && !wets ? 0.7 : 1) : 9;
      c.d += clamp(c.dTarget - c.d, -lr * dt, lr * dt);
      if (c.isPlayer && rain && !c.pit) c.d += Math.sin(g.t * 1.7) * (wets ? 0.35 : 0.9) * dt;
      // Too fast for the corner (Normal and up): slide wide, scrub speed and tyre; far too fast runs off onto the grass.
      if (c.isPlayer && !c.pit && g.ai.assist !== 1 && started && !c.finished) {
        // Same limit the assist uses (worst curvature just ahead): perfect braking matches it, mistakes cost.
        const kk = T.k[c.i], lim = Math.sqrt(G / Math.max(T.ka[c.i], 1e-4)), vs = lim * 1.03;
        if (Math.abs(kk) > 0.006 && c.v > vs) {
          const e = c.v / vs - 1, out = -Math.sign(kk);
          c.v -= c.v * Math.min(0.6, e * 2.2) * dt;
          // v1.26: the car only slides sideways when you're faster than the assist would take you (your own
          // throttle, boost or a tow), so assisted corners hold their line; the speed scrub above still applies.
          const ew = c.v / (lim * Math.max(1.03, g.ai.assist + 0.01)) - 1;
          if (ew > 0) {
            c.d += out * Math.min(30, ew * 120) * dt;
            c.d = clamp(c.d, -this.grassAt(c.p, -1), this.grassAt(c.p, 1));
            // Wherever the slide leaves you is where you stay: no pull back to your old line.
            if (this.controls !== 'tilt') c.dTarget = c.d;
          }
          c.wear = Math.max(0, c.wear - e * 0.04 * dt);
          if (ew > 0.02 && g.wideCd <= 0) { g.wideCd = 2; this.toast('RUNNING WIDE', '#FF8A00'); buzz(25); }
        }
      }
      if (c.isPlayer && g.wideCd > 0) g.wideCd -= dt;
      const prevP = c.p;
      c.p += c.v * dt / clamp(1 - c.k * c.d, 0.6, 1.4);
      // Tyre wear by distance: a compound lasts `life` laps; boost works the tyres harder.
      if (started && !c.finished && c.p > 0) {
        const boosting = (c.isPlayer ? g.boostT > 0 : c.boostOn) ? 1.8 : 1;
        c.wear = Math.max(0, c.wear - (c.p - prevP) / T.L / spec(c.tc).life * wearRate(c.tc, rain) * boosting);
      }
      c.yawOff += (clamp((c.d - prevD) / dt / Math.max(c.v, 8), -0.45, 0.45) - c.yawOff) * Math.min(1, dt * 10);
      if (c.contactT > 0) c.contactT -= dt;
      let justFinished = false;
      if (!c.finished && c.p >= g.laps * T.L) {
        c.finished = true; justFinished = c.isPlayer;
        c.finishTime = g.t - (c.p - g.laps * T.L) / Math.max(c.v, 1);
      }
      if (!c.isPlayer && g.ai.boost && !c.pit && !c.finished && c.p > 0) {
        for (const a of T.apexes) {
          if (Math.floor((prevP - a.s) / T.L) !== Math.floor((c.p - a.s) / T.L) && Math.abs(c.d - a.d) < 2.6) c.ab = Math.min(100, c.ab + g.ai.boost);
        }
      }
      if (c.isPlayer) this.playerEvents(prevP, dt, justFinished);
      if (justFinished) this.finish();
    }
    if (g.shake > 0) g.shake -= dt;
    if (this.mp && this.net) this.broadcast();
  }

  /**
   * Remote cars: interpolate ~100 ms behind when updates are frequent; when the room is big and
   * updates are sparse, keep driving them along the track at their last speed and steer the
   * error away smoothly so nothing teleports.
   */
  private stepRemote(c: Car, dt: number) {
    const s = c.snaps;
    if (!s.length) return;
    const rt = this.g.t - 0.1;
    let a = s[0], b: Snap | null = null;
    for (let n = 0; n < s.length; n++) { if (s[n].t <= rt) a = s[n]; else { b = s[n]; break; } }
    let tp: number, td: number, tv: number, ty: number;
    if (b && b.t > a.t && a.t <= rt) {
      const r = (rt - a.t) / (b.t - a.t);
      tp = a.p + (b.p - a.p) * r; td = a.d + (b.d - a.d) * r; tv = a.v + (b.v - a.v) * r; ty = a.y + (b.y - a.y) * r;
    } else {
      const last = s[s.length - 1], ex = clamp(this.g.t - last.t, 0, this.netInterval * 1.5 + 0.5);
      tp = last.p + last.v * ex; td = last.d; tv = last.v; ty = last.y;
    }
    const err = tp - c.p;
    if (Math.abs(err) > 40) c.p = tp;
    else c.p += tv * dt + err * Math.min(1, dt * 6);
    c.d += (td - c.d) * Math.min(1, dt * 8);
    c.v = tv; c.yawOff += (ty - c.yawOff) * Math.min(1, dt * 8);
    c.dTarget = c.d;
    while (s.length > 2 && s[1].t < rt - 0.5) s.shift();
  }

  private broadcast() {
    const g = this.g, net = this.net!, pl = g.player;
    if (g.t - this.sendT < this.netInterval) return;
    this.sendT = g.t;
    const m: StateMsg = { id: net.myId, t: g.t, p: pl.p, d: pl.d, v: pl.v, y: pl.yawOff, b: g.boostT > 0, r: g.drsOn, c: pl.tc };
    if (net.isHost()) {
      m.ai = []; m.aiFin = [];
      g.cars.forEach((c, i) => {
        if (!c.ai) return;
        m.ai!.push([i, r2(c.p), r2(c.d), r2(c.v), r2(c.yawOff), c.tc, r2(c.wear)]);
        if (c.finished) m.aiFin!.push([i, c.finishTime]);
      });
      // Relay the guests: only states that are new since the last update.
      m.h = [];
      for (const [id, s] of this.relay) {
        if (this.relayed.get(id) === s.t) continue;
        this.relayed.set(id, s.t);
        m.h.push([id, s.t, r2(s.p), r2(s.d), r2(s.v), r2(s.y), s.b ? 1 : 0, s.r ? 1 : 0, s.c ?? 1]);
      }
    }
    net.sendState(m);
  }

  // ---------- network input ----------
  onRemoteState(m: StateMsg) {
    if (!this.mp || !this.g) return;
    const g = this.g;
    // Host: guests' states arrive on their uplinks; keep the latest to relay to everyone.
    if (this.net?.isHost() && m.id !== this.net.myId) {
      const prev = this.relay.get(m.id);
      if (!prev || m.t >= prev.t) this.relay.set(m.id, m);
    }
    // Guests: the host's update carries the other drivers too.
    if (m.h && this.net) {
      for (const [id, t, p, d, v, y, b, r, tc] of m.h) {
        if (id === this.net.myId) continue;
        this.onRemoteState({ id, t, p, d, v, y, b: !!b, r: !!r, c: tc });
      }
    }
    const c = g.cars.find(x => x.userId === m.id);
    if (c && c.remote) {
      c.snaps.push({ t: m.t, p: m.p, d: m.d, v: m.v, y: m.y }); c.boostOn = m.b; c.drsOn = m.r;
      if (typeof m.c === 'number' && COMPOUNDS[m.c]) c.tc = m.c;
    }
    if (m.ai && !(this.net && this.net.isHost())) {
      for (const [i, p, d, v, y, tc, w] of m.ai) {
        const a = g.cars[i];
        if (!a || !a.ai) continue;
        a.remote = true; a.snaps.push({ t: m.t, p, d, v, y });
        if (typeof tc === 'number' && COMPOUNDS[tc]) a.tc = tc;
        if (typeof w === 'number') a.wear = w;
      }
      for (const [i, ft] of m.aiFin || []) { const a = g.cars[i]; if (a && !a.finished) { a.finished = true; a.finishTime = ft; this.refreshResults(); } }
    }
  }
  onRemoteFinish(m: FinishMsg) {
    if (!this.mp || !this.g) return;
    const c = this.g.cars.find(x => x.userId === m.id);
    if (c && !c.finished) { c.finished = true; c.finishTime = m.finishTime; this.refreshResults(); }
  }
  /** Host left: the new host takes over AI cars from their last known state. */
  becomeHost() {
    if (!this.g) return;
    for (const c of this.g.cars) {
      if (!c.ai || !c.remote) continue;
      c.remote = false; c.startDelay = 0; c.snaps = [];
      // Pit lane state isn't broadcast: a car caught in the pit lane finishes its stop with fresh tyres.
      if (Math.abs(c.d) > Math.max(HALF, this.halfAt(c.p))) { c.pit = 3; c.wear = 1; c.outP = Math.max(c.p, Math.ceil((c.p - PIT.EXIT) / this.T.L) * this.T.L + PIT.EXIT); c.dTarget = PIT.D; }
      else { const cs = this.centres(c.p); c.dTarget = cs[this.nearestIdx(cs, c.d)]; }
    }
  }
  /** A remote human vanished mid-race: freeze them as a slow AI so the grid stays sane. */
  dropPlayer(userId: string) {
    const c = this.g?.cars.find(x => x.userId === userId);
    if (c && !c.finished) { c.snaps = []; c.v = 0; c.p = -1e6; c.dnf = true; this.refreshResults(); }
  }

  private playerEvents(prevP: number, dt: number, justFinished = false) {
    const g = this.g, T = this.T, pl = g.player;
    if (pl.p > 0 && Math.floor(prevP / T.L) < Math.floor(pl.p / T.L)) {
      const lapN = Math.floor(pl.p / T.L);
      if (lapN === 0) g.lapStart = g.t;
      else if (!pl.finished || justFinished) {
        // the line is crossed part-way through the frame; use the interpolated crossing time
        const cross = justFinished ? pl.finishTime : g.t;
        const lt = cross - g.lapStart;
        g.lapStart = cross;
        const fastest = !g.best || lt < g.best;
        if (fastest) g.best = lt;
        if (lapN === g.laps - 1) this.toast('FINAL LAP', '#FFD400');
        else if (fastest && !justFinished) this.toast('FASTEST LAP', '#A855F7');
      }
    }
    if (pl.finished) return;
    for (const a of T.apexes) {
      if (pl.p > 0 && Math.floor((prevP - a.s) / T.L) !== Math.floor((pl.p - a.s) / T.L)) {
        g.apexTotal++;
        if (Math.abs(pl.d - a.d) < 2.6) { g.boost = Math.min(100, g.boost + 30); a.hit = g.t; g.apexHits++; this.toast('APEX +BOOST', '#FFD400'); buzz(15); }
        else a.miss = g.t;
      }
    }
    const inZone = T.drs[pl.i];
    const ah = this.carAhead(pl, 400, 99);
    const gapT = ah ? ah.gap / Math.max(pl.v, 1) : 9;
    if (g.drsOn && !inZone) g.drsOn = false;
    g.drsReady = inZone && !g.drsOn && gapT < 1.0 && pl.p > 0 && !pl.pit;
    // Slipstream (v1.23): the pull builds and fades smoothly with the gap instead of switching on and off,
    // tails off as you close right up (no shove into the gearbox ahead), and only a real move out of a
    // built-up tow earns the slingshot (not the car ahead changing lines, or simply catching it).
    const sl = !pl.pit && pl.p > 0 ? this.carAhead(pl, 30, 1.6) : null;
    const want = sl ? towPull(sl.gap) : 0;
    g.tow += (want - g.tow) * Math.min(1, dt * (want > g.tow ? 2.5 : 4));
    if (g.tow < 0.02) g.tow = 0;
    if (sl && want > 0.3) {
      if (g.towCar !== sl.car) { g.towCar = sl.car; g.towT = 0; }
      g.towT += dt; g.towD = pl.dTarget;
    } else if (g.towCar) {
      const o = g.towCar, gap = o.p - pl.p, moved = Math.abs(pl.dTarget - g.towD) > 1.2 && Math.abs(o.d - pl.dTarget) >= 1.6;
      if (moved && g.towT > 0.8 && gap > 0 && gap < 24 && !pl.pit) { g.slingT = g.ai.sling[1]; this.toast('SLINGSHOT', '#00D2BE'); }
      // Still sitting behind the same car (just a touch close): keep the tow alive, otherwise drop it.
      if (moved || !sl || sl.car !== o) { g.towCar = null; g.towT = 0; }
    }
    g.slip = g.tow > 0.35;
    if (g.slingT > 0) g.slingT -= dt;
    if (g.boostT > 0) g.boostT -= dt;
    // Team radio: worn tyres with laps still to run.
    if (!pl.boxCalled && !pl.pit && pl.wear < BOX_CALL && this.lapsAfterLine(pl.p) >= 1) {
      pl.boxCalled = true; this.toast('BOX BOX', '#FFD400'); buzz([40, 40, 40]);
    }
    if (!pl.failCalled && !pl.pit && pl.wear < FAILED) {
      pl.failCalled = true; this.toast('TYRE FAILURE', '#E10600'); buzz([120, 60, 120]); g.shake = 0.4;
    }
    if (pl.pit) return; // pit lane: no contact
    for (const o of g.cars) {
      if (o === pl || pl.contactT > 0 || o.pit || Math.abs(o.d) > Math.max(HALF, this.halfAt(o.p)) + 0.5) continue;
      const dp = o.p - pl.p, dd = Math.abs(o.d - pl.d);
      // From behind it only counts when you're closing in (or right on top of them), not when they pull away.
      if (Math.abs(dp) < 4.8 && dd < 2.05 && !(dp > 3.2 && o.v > pl.v)) {
        if (dp > 1.5) {
          pl.v = Math.min(pl.v, o.v * g.ai.bump[0]);
          // Easier AI shuffle aside after a tap from behind.
          if (o.ai && !o.remote && Math.random() < g.ai.yield) this.giveWay(o, pl);
        }
        else {
          pl.v *= 0.88;
          if (!o.remote) o.v *= 0.9;
          const away = pl.d < o.d ? -1 : 1;
          const cs = this.centres(pl.p, 12);
          pl.dTarget = cs[clamp(this.nearestIdx(cs, pl.d) + away, 0, cs.length - 1)];
        }
        pl.contactT = 1.0; g.contacts++; g.shake = 0.35; pl.wear = Math.max(0, pl.wear - 0.03);
        this.toast('CONTACT', '#E10600'); buzz([60, 30, 60]);
      }
    }
  }

  private computeResults() {
    const g = this.g, total = g.laps * this.T.L;
    const rows = g.cars.map(c => ({ c, time: c.dnf ? Infinity : c.finished ? c.finishTime : g.t + (total - c.p) / Math.max(c.v, 45) })).sort((a, b) => a.time - b.time);
    const lead = rows[0].time;
    const results: ResultRow[] = rows.map((r, i) => ({
      pos: i + 1,
      name: r.c.isPlayer ? 'YOU · ' + r.c.team : r.c.name ? r.c.name + ' · ' + r.c.team : r.c.team + ' (AI)',
      color: r.c.teamColor,
      gap: r.c.dnf ? 'DNF' : i === 0 ? fmt(r.time) : '+' + (r.time - lead).toFixed(3),
      you: r.c.isPlayer,
      tyres: r.c.stints.map(i => spec(i).short).join(' '),
    }));
    const pos = rows.findIndex(r => r.c.isPlayer) + 1;
    return { results, pos };
  }

  private refreshResults() {
    if (!this.g.player.finished) return;
    const { results, pos } = this.computeResults();
    const gained = (this.g.startSlot + 1) - pos;
    const summary = this.ui.summary ? { ...this.ui.summary, pos, gained: gainedLabel(gained, pos) } : null;
    this.set({ results, summary });
  }

  private finish() {
    const g = this.g, pl = g.player;
    g.boostT = 0; g.drsOn = false; g.drsReady = false;
    const { results, pos } = this.computeResults();
    const gained = (g.startSlot + 1) - pos;
    const summary: Summary = {
      pos, gained: gainedLabel(gained, pos), time: fmt(pl.finishTime), best: g.best ? fmt(g.best) : '—',
      apex: g.apexHits + '/' + g.apexTotal, contacts: String(g.contacts),
      pit: pl.stops ? pl.bestPit.toFixed(2) + 's' : 'NO STOP', strategy: pl.stints.map(i => spec(i).short).join(' → '),
    };
    this.toast('CHEQUERED FLAG', '#F2F2F2');
    if (this.mp && this.net) this.net.sendFinish({ id: this.net.myId, finishTime: pl.finishTime, best: g.best || null });
    this.onFinish({
      pos, totalTime: pl.finishTime, bestLap: g.best || null, apexes: summary.apex, contacts: g.contacts,
      pitStops: pl.stops, bestPit: pl.stops ? pl.bestPit : null, tyres: pl.stints.map(i => spec(i).short).join('-'),
    });
    this.later(() => { this.set({ results, summary }); this.refreshResults(); this.setScreen('results'); }, 1600);
  }

  // ---------- engine sound ----------
  private sndV = 0;
  private sndThr = 0;
  /** Snapshot for the engine sound: mode, revs input, throttle estimate and the nearest rival. */
  soundInput(dt: number): EngineInput {
    const g = this.g, pl = g.player;
    const off: EngineInput = { mode: 'off', revving: false, v: 0, throttle: 0, boost: false, limiter: false, rival: null };
    if (!g || this.paused || (this.screen !== 'lights' && this.screen !== 'race')) { this.sndV = 0; return off; }
    const moving = g.running && g.t >= pl.startDelay;
    const mode: EngineInput['mode'] = !moving ? 'grid' : pl.pit === 2 ? 'box' : 'race';
    // Throttle from what the car is doing: accelerating = flat out, braking = off, holding speed = part throttle.
    const acc = dt > 0 ? (pl.v - this.sndV) / dt : 0;
    this.sndV = pl.v;
    const want = pl.brakeOn || pl.contactT > 0.6 ? 0 : acc > 2 ? 1 : acc < -5 ? 0 : 0.55;
    this.sndThr += (want - this.sndThr) * Math.min(1, dt * 10);
    let rival: EngineInput['rival'] = null, best = 70;
    for (const o of g.cars) {
      if (o === pl || o.dnf) continue;
      const gap = o.p - pl.p, dist = Math.hypot(gap, o.d - pl.d);
      if (dist < best) { best = dist; rival = { gap, side: o.d - pl.d, v: o.v, closing: (gap >= 0 ? 1 : -1) * (pl.v - o.v) }; }
    }
    return {
      mode, revving: mode === 'grid' && this.ui.holding, v: pl.v, throttle: this.sndThr,
      boost: g.boostT > 0, limiter: this.limiterOn(pl), rival,
    };
  }

  /** Team radio line shown on the HUD while a stop makes sense. */
  private boxCall(rain: boolean) {
    const pl = this.g.player;
    if (pl.pit || pl.finished) return '';
    if (pl.wear < FAILED) return this.lapsAfterLine(pl.p) >= 1 ? 'TYRE FAILURE · BOX' : 'TYRE FAILURE';
    if (this.lapsAfterLine(pl.p) < 1) return '';
    const wets = spec(pl.tc).id === 'wet';
    if (rain && !wets) return 'BOX FOR WETS';
    if (!rain && wets) return 'BOX FOR SLICKS';
    return pl.wear < BOX_CALL ? 'BOX BOX' : '';
  }

  private pushHud() {
    const g = this.g, T = this.T, pl = g.player;
    if (!g) return;
    const pos = [...g.cars].sort((a, b) => b.p - a.p).indexOf(pl) + 1;
    const lap = Math.min(g.laps, Math.max(1, Math.floor(pl.p / T.L) + 1));
    const rain = this.isRain();
    this.set({
      hud: {
        pos, lap, laps: g.laps, time: fmt(pl.p > 0 && !pl.finished ? g.t - g.lapStart : 0), best: g.best ? fmt(g.best) : '—',
        boost: Math.round(g.boost), tyre: Math.round(pl.wear * 100), kmh: Math.round(pl.v * 4.1),
        drsReady: g.drsReady, drsOn: g.drsOn, boostOn: g.boostT > 0, braking: pl.brakeOn, slip: g.slip && !g.drsOn, rain, field: g.cars.length,
        tc: pl.tc, nextTc: this.nextTyre ?? pl.tc, pitWindow: this.canPit(pl), limiter: this.limiterOn(pl), boxCall: this.boxCall(rain),
      },
    });
  }
}

function r2(n: number) { return Math.round(n * 100) / 100; }
/** AI starting tyres: wets in the rain, otherwise a spread of strategies. */
function aiStartTyre(laps: number, wet: boolean) {
  if (wet) return compoundIndex(Math.random() < 0.85 ? 'wet' : 'medium');
  if (laps <= 1) return compoundIndex('soft');
  const r = Math.random();
  return compoundIndex(r < 0.4 ? 'soft' : r < 0.75 ? 'medium' : 'hard');
}
function gainedLabel(gained: number, pos: number) {
  return gained > 0 ? '+' + gained + ' PLACES' : gained < 0 ? gained + ' PLACES' : 'HELD P' + pos;
}
export function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function aiBase(i: number, ai: AiProfile) {
  return VMAX * ai.pace * (1 + ai.spread * 0.2 - i * (ai.spread / GRID_SIZE) + (Math.random() - 0.5) * 0.02);
}

/** Weather plan in track-progress units: list of [fromP, toP) ranges where it rains. */
export function makeRainPlan(weather: Settings['weather'], laps: number, trackL: number): [number, number][] {
  const L = laps * trackL;
  if (weather === 'Dry') return [];
  if (weather === 'Rain') return [[-1e9, 1e9]];
  // Arrives late in the penultimate lap so there is still one pit window to box for wets.
  if (weather === 'Rain on final lap') return laps > 1 ? [[(laps - 1.25) * trackL, 1e9]] : [[-1e9, 1e9]];
  const r = Math.random();
  if (r < 0.4) return [];
  if (r < 0.65) return [[-1e9, L * (0.3 + Math.random() * 0.4)]];
  const s = L * (0.15 + Math.random() * 0.6);
  return [[s, Math.random() < 0.5 ? 1e9 : s + L * (0.2 + Math.random() * 0.3)]];
}

/**
 * Host builds the shared grid. Humans start at the back of the pack in random order
 * (P9–P12 for 4 drivers); AI fills everything ahead.
 */
export function buildMpGrid(players: { userId: string; name: string; team: number; livery?: Livery; accent?: number }[], aiPace: Settings['aiPace']): GridEntry[] {
  const ai = aiProfile(aiPace);
  const humans = players.slice(0, GRID_SIZE);
  const pool: number[] = [];
  for (let t = 0; t < TEAMS.length; t++) for (let j = 0; j < 2; j++) pool.push(t);
  for (const p of humans) { const k = pool.indexOf(p.team); if (k >= 0) pool.splice(k, 1); }
  shuffle(pool);
  const slots = shuffle(humans.map((_, k) => GRID_SIZE - 1 - k));
  const grid: (GridEntry | null)[] = new Array(GRID_SIZE).fill(null);
  humans.forEach((p, n) => { grid[slots[n]] = { team: p.team, userId: p.userId, name: p.name, base: VMAX, livery: p.livery, accent: p.accent }; });
  let q = 0;
  return grid.map((e, i) => e || { team: pool[q++ % pool.length], userId: null, name: null, base: aiBase(i, ai) });
}
