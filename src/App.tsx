import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Engine, type Screen, type MpStart } from './game/engine';
import { clamp, DEFAULT_SETTINGS, TEAMS, ACCENTS, ACCEL_MODELS, DEFAULT_ACCEL, isLivery, isAccelModel, type Controls, type Settings, type Livery, type AccelModel } from './game/constants';
import { RoomSession } from './net/room';
import { Music, type Scene } from './audio/music';
import { supabaseConfigured } from './net/supabase';
import { saveResult, fetchPersonalBest } from './net/results';
import { Guide } from './ui/guide';
import { Garage, RaceSettingsSheet, Join, Lobby, Lights, RaceHud, Results, ToastView, PauseMenu, CarSheet, cleanName } from './ui/screens';
import { TyreSheet, PitStop, NextTyreStrip, prewarmPit3d } from './ui/tyres';
import { isCompound, type Compound } from './game/tyres';

// Storage can throw (blocked cookies / some private modes); the game must still run.
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const load = <T,>(k: string, d: T): T => { try { const v = ls.get(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const music = useMemo(() => new Music(), []);
  // Debug hook used by the guide-capture script; VITE_FR_DEBUG is never set in production builds.
  if (import.meta.env?.VITE_FR_DEBUG) Object.assign(window, { __fr: engine, __frMusic: music });
  // Re-render whenever the sound state changes (first tap, mute, music/engine switches).
  const [, soundTick] = useState(0);
  const ui = useSyncExternalStore(engine.subscribe, engine.getUi);
  const [screen, setScreenState] = useState<Screen>('garage');
  const [team, setTeam] = useState(() => +(ls.get('fr-team') || 0) % TEAMS.length);
  const [livery, setLivery] = useState<Livery>(() => { const v = ls.get('fr-livery'); return isLivery(v) ? v : 'classic'; });
  const [accent, setAccent] = useState(() => +(ls.get('fr-accent') || 0) % ACCENTS.length);
  const [controls, setControls] = useState<Controls>(() => (ls.get('fr-controls') as Controls) || 'swipe');
  const [settings, setSettings] = useState<Settings>(() => load('fr-settings', DEFAULT_SETTINGS));
  const [tyre, setTyre] = useState<Compound>(() => { const v = ls.get('fr-tyre'); return isCompound(v) ? v : 'soft'; });
  const [showTyres, setShowTyres] = useState(false);
  const [showCar, setShowCar] = useState(false);
  const closeCar = useCallback(() => setShowCar(false), []);
  // Acceleration feel: Gentle by default (v1.10). Hidden toggle: long-press the logo in the Garage, or ?accel=….
  // Only an explicit choice is saved ('fr-accel-v2'); the old 'fr-accel' key was written for everyone, so it's ignored.
  const [accel, setAccel] = useState<AccelModel>(() => {
    const q = new URLSearchParams(location.search).get('accel');
    if (isAccelModel(q)) { ls.set('fr-accel-v2', q); return q; }
    const v = ls.get('fr-accel-v2');
    return isAccelModel(v) ? v : DEFAULT_ACCEL;
  });
  const closeTyres = useCallback(() => setShowTyres(false), []);
  const [showSettings, setShowSettings] = useState(false);
  const closeSettings = useCallback(() => setShowSettings(false), []);
  const [showGuide, setShowGuide] = useState(() => { try { return !ls.get('fr-guide-seen') && !location.search.includes('room='); } catch { return false; } });
  const closeGuide = () => { setShowGuide(false); try { ls.set('fr-guide-seen', '1'); } catch { /* storage blocked */ } };
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [busy, setBusy] = useState('');
  const [netErr, setNetErr] = useState('');
  const [starting, setStarting] = useState(false);
  const [pb, setPb] = useState<number | null>(null);
  // Server capacity (one live room at a time on the free plan): polled while the Garage is open.
  const [roomBusy, setRoomBusy] = useState(false);
  const [, bump] = useState(0);
  const sessionRef = useRef<RoomSession | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<Screen>('garage');

  const setScreen = useCallback((s: Screen) => { screenRef.current = s; engine.screen = s; setScreenState(s); }, [engine]);

  // engine wiring
  useEffect(() => {
    engine.onScreen = s => { screenRef.current = s; setScreenState(s); };
    engine.onFinish = f => {
      const s = sessionRef.current;
      saveResult(f, s?.room?.id ?? null).then(() => fetchPersonalBest().then(setPb));
    };
    if (canvasRef.current) engine.attach(canvasRef.current);
    return () => engine.detach();
  }, [engine]);

  useEffect(() => { engine.team = team; ls.set('fr-team', String(team)); }, [engine, team]);
  useEffect(() => { engine.livery = livery; ls.set('fr-livery', livery); }, [engine, livery]);
  useEffect(() => { engine.accent = accent; ls.set('fr-accent', String(accent)); }, [engine, accent]);
  useEffect(() => { engine.controls = controls; ls.set('fr-controls', controls); }, [engine, controls]);
  useEffect(() => { engine.startCompound = tyre; ls.set('fr-tyre', tyre); }, [engine, tyre]);
  useEffect(() => { engine.accelModel = accel; }, [engine, accel]);
  const cycleAccel = () => {
    const i = ACCEL_MODELS.findIndex(m => m[0] === accel), next = ACCEL_MODELS[(i + 1) % ACCEL_MODELS.length];
    setAccel(next[0]); ls.set('fr-accel-v2', next[0]); engine.toast('ACCEL · ' + next[1], '#A855F7');
  };
  useEffect(() => { engine.settings = settings; ls.set('fr-settings', JSON.stringify(settings)); }, [engine, settings]);
  useEffect(() => { if (supabaseConfigured) fetchPersonalBest().then(setPb); }, []);
  useEffect(() => {
    if (!supabaseConfigured || screen !== 'garage') return;
    let live = true;
    const poll = () => RoomSession.serverStatus().then(s => { if (live) setRoomBusy(!!s && s.active >= s.max); });
    poll();
    const id = window.setInterval(poll, 15000);
    return () => { live = false; clearInterval(id); };
  }, [screen]);

  // ---------- soundtrack + engine sound ----------
  useEffect(() => {
    music.onState = () => soundTick(x => x + 1);
    // Browsers only start audio inside a user gesture. On phones a touch only counts on touchend/click
    // (not pointerdown), so listen to all of them; whichever arrives first starts the sound.
    const unlock = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'm' || e.key === 'M') && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        music.unlock(); music.setMuted(!music.muted);
        return;
      }
      music.unlock();
    };
    const evs = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    for (const ev of evs) window.addEventListener(ev, unlock, { passive: true });
    // Engine sound follows the race every frame.
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const eng = music.engine();
      if (eng) eng.update(dt, engine.soundInput(dt));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { for (const ev of evs) window.removeEventListener(ev, unlock); cancelAnimationFrame(raf); music.dispose(); };
  }, [music, engine]);
  useEffect(() => {
    const scene: Scene = screen === 'lights' ? 'lights' : screen === 'race' ? 'race' : screen === 'results' ? 'results' : 'menu';
    music.setScene(scene);
  }, [music, screen]);
  // Countdown: a beep per red light, a long high beep on green.
  const lastLights = useRef(0);
  useEffect(() => {
    music.setLights(ui.lights);
    if (ui.lights > lastLights.current && screen === 'lights') music.beep(false);
    lastLights.current = ui.lights;
  }, [music, ui.lights, screen]);
  useEffect(() => { if (ui.phase === 'green' && screen === 'lights') { music.hit(); music.beep(true); } }, [music, ui.phase, screen]);
  useEffect(() => {
    music.setFinalLap(screen === 'race' && ui.hud.laps > 1 && ui.hud.lap === ui.hud.laps);
    music.setBoost(ui.hud.boostOn || ui.hud.drsOn);
    music.setRain(ui.hud.rain);
  }, [music, screen, ui.hud]);
  // The tap that first starts the audio must not also switch it off: remember whether sound was
  // already playing when the button was pressed (React handlers run before the window listener).
  const soundWasOn = useRef(false);
  const armSound = () => { soundWasOn.current = music.state === 'on'; };
  const toggleSound = () => {
    music.unlock();
    if (music.muted) music.setMuted(false);
    else if (soundWasOn.current) music.setMuted(true);
  };

  // deep link ?room=CODE
  useEffect(() => {
    const qr = new URLSearchParams(location.search).get('room');
    if (qr && qr.length === 4) { setJoinCode(qr.toUpperCase()); setScreen('join'); }
  }, [setScreen]);

  const name = () => cleanName(ls.get('fr-name') || 'DRIVER' + Math.floor(10 + Math.random() * 90));

  // ---------- room session ----------
  const handlers = useMemo(() => ({
    onChange: () => bump(x => x + 1),
    onStart: (m: MpStart) => { setStarting(false); engine.startRace(m); },
    onState: (m: Parameters<Engine['onRemoteState']>[0]) => engine.onRemoteState(m),
    onFinish: (m: Parameters<Engine['onRemoteFinish']>[0]) => engine.onRemoteFinish(m),
    onLobby: () => bump(x => x + 1),
    onHostChange: (host: boolean) => { if (host && engine.mp) engine.becomeHost(); },
    onPlayerGone: (id: string) => engine.dropPlayer(id),
    onClosed: (reason: string) => {
      sessionRef.current = null; engine.net = null;
      try { sessionStorage.removeItem('fr-room'); } catch { /* storage blocked */ }
      if (screenRef.current === 'lobby') { setNetErr(reason); engine.resetRace(); setScreen('garage'); }
    },
  }), [engine, setScreen]);

  const enterRoom = (s: RoomSession) => {
    ls.set('fr-name', s.me()?.name || name());
    sessionRef.current = s; engine.net = s;
    s.updateMe({ livery, accent });
    // Remember the room for this tab so a refresh can slip back in (see the rejoin effect below).
    try { if (s.room) sessionStorage.setItem('fr-room', s.room.code); } catch { /* storage blocked */ }
    engine.resetRace(); setScreen('lobby');
    if (location.search) history.replaceState(null, '', location.pathname);
  };

  const createRoom = async () => {
    setBusy('create'); setNetErr('');
    try { enterRoom(await RoomSession.create(handlers, name(), team, settings)); }
    catch (e) { setNetErr((e as Error).message); }
    finally { setBusy(''); }
  };
  const submitJoin = async () => {
    if (joinCode.length < 4) return;
    setBusy('join'); setJoinErr('');
    try { enterRoom(await RoomSession.join(handlers, joinCode, name(), team)); }
    catch (e) { setJoinErr((e as Error).message); }
    finally { setBusy(''); }
  };
  const leaveRoom = async () => {
    try { sessionStorage.removeItem('fr-room'); } catch { /* storage blocked */ }
    const s = sessionRef.current;
    sessionRef.current = null; engine.net = null;
    engine.resetRace(); setScreen('garage');
    await s?.leave();
  };
  const hostStart = async () => {
    const s = sessionRef.current;
    if (!s) return;
    setStarting(true);
    try { await s.hostStart(settings); }
    catch (e) { setStarting(false); setNetErr((e as Error).message); }
  };
  const backToLobby = async () => {
    engine.resetRace(); setScreen('lobby');
    await sessionRef.current?.backToLobby();
  };
  // Solo: pause when the app goes to the background (phone call, switching apps).
  useEffect(() => {
    const hide = () => { if (document.hidden) engine.setPaused(true); };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [engine]);
  // Refresh / closing the tab: leave the room right away, so a room left empty closes (and frees the
  // server slot) instead of lingering until its heartbeat times out.
  useEffect(() => {
    const leave = () => { sessionRef.current?.leaveOnUnload(); sessionRef.current = null; };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);
  // After a refresh, slip back into the room if it's still going (others were in it); if you were
  // alone it has closed and you land in the Garage.
  useEffect(() => {
    let code: string | null = null;
    try { code = sessionStorage.getItem('fr-room'); } catch { /* storage blocked */ }
    if (!code || !supabaseConfigured || location.search.includes('room=')) return;
    // Wait a moment so the previous page's leave request lands first.
    const t = window.setTimeout(() => {
      RoomSession.join(handlers, code!, name(), team).then(enterRoom, () => { try { sessionStorage.removeItem('fr-room'); } catch { /* storage blocked */ } });
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- input (ported from prototype bindInput) ----------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    // Press and hold still for 150 ms = brake; moving more than 14 px first makes it a swipe/drag.
    let ptr: { x: number; y: number; moved: boolean } | null = null, brakeTimer = 0;
    // Taps on the next-tyre strip (and other data-noswipe controls) never steer, brake or boost.
    const noSwipe = (e: Event) => !!(e.target as HTMLElement)?.closest?.('[data-noswipe]');
    const down = (e: PointerEvent) => {
      if (noSwipe(e)) return;
      ptr = { x: e.clientX, y: e.clientY, moved: false };
      if (screenRef.current === 'lights') engine.throttleDown();
      if (screenRef.current === 'race' && !engine.pitActive && !engine.paused) brakeTimer = window.setTimeout(() => { if (ptr && !ptr.moved) engine.brakeTouch = true; }, 150);
    };
    const move = (e: PointerEvent) => {
      if (!ptr || screenRef.current !== 'race') return;
      if (!ptr.moved && !engine.brakeTouch && Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y) > 14) { ptr.moved = true; clearTimeout(brakeTimer); }
      if (engine.controls === 'tilt' && ptr.moved) engine.dragSteer = clamp((e.clientX - ptr.x) / 70, -1, 1);
    };
    const up = (e: PointerEvent) => {
      const p = ptr, braked = engine.brakeTouch;
      ptr = null; engine.dragSteer = 0; engine.brakeTouch = false; clearTimeout(brakeTimer);
      if (screenRef.current === 'lights') return engine.throttleUp();
      if (!p || braked || screenRef.current !== 'race') return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y, tilt = engine.controls === 'tilt';
      // Pit Stop Rush: every swipe is a wheel gun.
      if (engine.pitActive) return; // the pit overlay handles its own taps
      if (!tilt && Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) engine.lane(Math.sign(dx));
      else if (dy < -34 && Math.abs(dy) > Math.abs(dx)) engine.action();
      else if (tilt && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        const r = el.getBoundingClientRect();
        if (e.clientX > r.left + r.width * 0.66) engine.action();
      }
    };
    const kd = (e: KeyboardEvent) => {
      const s = screenRef.current, k = e.key;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (s === 'garage' && k === 'Enter' && !showSettingsRef.current && !showGuideRef.current && !showTyresRef.current && !(e.target as HTMLElement)?.closest?.('button')) return startSolo();
      if (s === 'lights' && (k === ' ' || k === 'ArrowUp' || k === 'Enter')) { e.preventDefault(); if (!e.repeat) engine.throttleDown(); return; }
      if (s !== 'race') return;
      // Solo pause: Esc or P.
      if ((k === 'Escape' || k === 'p' || k === 'P') && !engine.mp) { e.preventDefault(); engine.setPaused(!engine.paused); return; }
      if (engine.paused) return;
      if (engine.pitActive) {
        // Wheel guns from a keyboard: Q E / Z C (or 7 9 / 1 3) = front-left, front-right / rear-left, rear-right.
        const w = ['q', 'e', 'z', 'c'].indexOf(k.toLowerCase()), n = ['7', '9', '1', '3'].indexOf(k);
        if (w >= 0 || n >= 0) { e.preventDefault(); if (!e.repeat) engine.pitTap(w >= 0 ? w : n); }
        else if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
        return;
      }
      // 1–4: next tyres (Soft / Medium / Hard / Wet).
      if (/^[1-4]$/.test(k)) { engine.setNextTyre(+k - 1); return; }
      const tilt = engine.controls === 'tilt';
      if (k === 'ArrowLeft' || k === 'a') { e.preventDefault(); if (tilt) engine.keySteer = -1; else if (!e.repeat) engine.lane(-1); }
      if (k === 'ArrowRight' || k === 'd') { e.preventDefault(); if (tilt) engine.keySteer = 1; else if (!e.repeat) engine.lane(1); }
      if (k === 'ArrowUp' || k === 'w' || k === ' ') { e.preventDefault(); if (!e.repeat) engine.action(); }
      if (k === 'ArrowDown' || k === 's') { e.preventDefault(); engine.brakeKey = true; }
    };
    const ku = (e: KeyboardEvent) => {
      if (screenRef.current === 'lights' && [' ', 'ArrowUp', 'Enter'].includes(e.key)) return engine.throttleUp();
      if (['ArrowLeft', 'a', 'ArrowRight', 'd'].includes(e.key)) engine.keySteer = 0;
      if (e.key === 'ArrowDown' || e.key === 's') engine.brakeKey = false;
    };
    const ori = (e: DeviceOrientationEvent) => {
      if (e.gamma != null) engine.gyroSteer = Math.abs(e.gamma) < 4 ? 0 : clamp(e.gamma / 22, -1, 1);
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('deviceorientation', ori);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('deviceorientation', ori);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Pit Stop Rush: stable props for the 3D view, and build it while the car drives down the pit lane.
  const pitClock = useCallback(() => engine.g.t, [engine]);
  const pitTap = useCallback((w: number) => engine.pitTap(w), [engine]);
  const myPaint = useMemo(() => ({ color: TEAMS[team].color, dark: TEAMS[team].dark, accent: ACCENTS[accent] || ACCENTS[0], livery }), [team, accent, livery]);
  useEffect(() => { if (ui.hud.limiter) prewarmPit3d(); }, [ui.hud.limiter]);
  const showSettingsRef = useRef(false);
  showSettingsRef.current = showSettings;
  const showGuideRef = useRef(false);
  showGuideRef.current = showGuide;
  const showTyresRef = useRef(false);
  showTyresRef.current = showTyres;

  /** RACE opens the starting-tyre sheet; TO THE GRID starts the race. */
  function startSolo() { setShowTyres(true); }
  function goSolo() {
    setShowTyres(false);
    try { sessionStorage.removeItem('fr-room'); } catch { /* storage blocked */ }
    const s = sessionRef.current;
    if (s) { sessionRef.current = null; engine.net = null; s.leave(); }
    engine.startRace(null);
  }

  const pickControls = (c: Controls) => {
    setControls(c);
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (c === 'tilt' && D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
  };

  const session = sessionRef.current;
  const mp = !!engine.mp;
  const amHost = !!session?.isHost();

  // Host's laps/weather are the room's settings (v1.4): push every change to the room.
  // A guest promoted to host keeps the room's current settings instead of overwriting them.
  const wasHostRef = useRef(amHost);
  useEffect(() => {
    const promoted = amHost && !wasHostRef.current && !!session?.room;
    wasHostRef.current = amHost;
    if (promoted && session?.room) { setSettings(st => ({ ...st, laps: session.room!.laps, weather: session.room!.weather })); return; }
    if (screen === 'lobby' && amHost) session?.setSettings(settings.laps, settings.weather);
  }, [screen, session, amHost, settings.laps, settings.weather]);

  // Room lobby: push car changes to your player row (everyone repaints you); a changed car un-readies you.
  useEffect(() => {
    if (screen !== 'lobby' || !session?.room || session.room.status !== 'lobby') return;
    const me = session.me();
    if (!me) return;
    if (me.team !== team || me.livery !== livery || (me.accent ?? 0) !== accent) session.updateMe({ team, livery, accent, ready: false });
  }, [screen, session, team, livery, accent]);

  const openSettings = () => {
    if (screen === 'lobby' && session && !session.isHost()) { engine.toast('SET BY HOST', '#8A8A92'); return; }
    setShowSettings(true);
  };

  return (
    <div className="page">
      <div ref={stageRef} className="stage">
        <canvas ref={canvasRef} className="world" />
        {screen === 'race' && <RaceHud ui={ui} engine={engine} tilt={controls === 'tilt'} onPause={mp ? undefined : () => engine.setPaused(true)} />}
        {screen === 'race' && ui.paused && (
          <PauseMenu resume={() => engine.setPaused(false)} restart={() => engine.startRace(null)}
            exit={() => { engine.setPaused(false); engine.resetRace(); setScreen('garage'); }} />
        )}
        {screen === 'race' && !ui.pit && !ui.paused && <NextTyreStrip current={ui.hud.tc} next={ui.hud.nextTc} set={i => engine.setNextTyre(i)} rain={ui.hud.rain} />}
        {screen === 'race' && ui.pit && <PitStop pit={ui.pit} now={pitClock} wear={ui.hud.tyre / 100} oldTc={ui.hud.tc} carColor={engine.g.player.color} paint={myPaint} tap={pitTap} />}
        {screen === 'lights' && <Lights ui={ui} />}
        {screen === 'garage' && (
          <Garage team={team} setTeam={setTeam} livery={livery} setLivery={setLivery} accent={accent} setAccent={setAccent} controls={controls} setControls={pickControls} settings={settings}
            startSolo={startSolo} createRoom={createRoom} openJoin={() => { setJoinCode(''); setJoinErr(''); setScreen('join'); }}
            openSettings={openSettings} openGuide={() => setShowGuide(true)} sound={music.state} armSound={armSound} toggleSound={toggleSound}
            accel={accel === DEFAULT_ACCEL ? '' : ACCEL_MODELS.find(m => m[0] === accel)![1]} secret={cycleAccel} busy={busy} err={netErr} pb={pb} online={supabaseConfigured} roomBusy={roomBusy} />
        )}
        {screen === 'garage' && showGuide && <Guide close={closeGuide} />}
        {(screen === 'garage' || (screen === 'lobby' && amHost)) && showSettings && (
          <RaceSettingsSheet settings={settings} set={setSettings} close={closeSettings} mode={screen === 'lobby' ? 'ROOM · HOST ONLY' : 'SOLO RACE'}
            audio={{ music: music.musicOn, engine: music.engineOn, setMusic: on => { music.unlock(); music.setMusicOn(on); }, setEngine: on => { music.unlock(); music.setEngineOn(on); } }} />
        )}
        {screen === 'join' && <Join code={joinCode} setCode={c => { setJoinCode(c); setJoinErr(''); }} err={joinErr} busy={busy === 'join'} submit={submitJoin} back={() => setScreen('garage')} />}
        {screen === 'lobby' && session?.room && <Lobby s={session} settings={settings} leave={leaveRoom} start={hostStart} starting={starting} openSettings={openSettings} tyre={tyre} editCar={() => setShowCar(true)} />}
        {screen === 'lobby' && showCar && session?.room && (
          <CarSheet team={team} setTeam={setTeam} livery={livery} setLivery={setLivery} accent={accent} setAccent={setAccent}
            tyre={tyre} setTyre={setTyre} ready={!!session.me()?.ready} close={closeCar} />
        )}
        {screen === 'results' && (
          <Results ui={ui} mp={mp && !!session}
            toGarage={() => { if (mp && session) leaveRoom(); else { engine.resetRace(); setScreen('garage'); } }}
            again={() => { if (mp && session) backToLobby(); else setShowTyres(true); }} />
        )}
        {(screen === 'garage' || screen === 'results') && showTyres && (
          <TyreSheet value={tyre} set={setTyre} laps={settings.laps} weather={settings.weather} go={goSolo} close={closeTyres} />
        )}
        <ToastView ui={ui} />
      </div>
    </div>
  );
}
