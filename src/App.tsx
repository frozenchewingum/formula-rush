import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Engine, type Screen, type MpStart } from './game/engine';
import { clamp, DEFAULT_SETTINGS, TEAMS, type Controls, type Settings } from './game/constants';
import { RoomSession } from './net/room';
import { Music, type Scene } from './audio/music';
import { supabaseConfigured } from './net/supabase';
import { saveResult, fetchPersonalBest } from './net/results';
import { Garage, SettingsSheet, Join, Lobby, Lights, RaceHud, Results, ToastView, cleanName } from './ui/screens';

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };

export default function App() {
  const engine = useMemo(() => new Engine(), []);
  const music = useMemo(() => new Music(), []);
  const [muted, setMuted] = useState(music.muted);
  const ui = useSyncExternalStore(engine.subscribe, engine.getUi);
  const [screen, setScreenState] = useState<Screen>('garage');
  const [team, setTeam] = useState(() => +(localStorage.getItem('fr-team') || 0) % TEAMS.length);
  const [controls, setControls] = useState<Controls>(() => (localStorage.getItem('fr-controls') as Controls) || 'swipe');
  const [settings, setSettings] = useState<Settings>(() => load('fr-settings', DEFAULT_SETTINGS));
  const [showSettings, setShowSettings] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinErr, setJoinErr] = useState('');
  const [busy, setBusy] = useState('');
  const [netErr, setNetErr] = useState('');
  const [starting, setStarting] = useState(false);
  const [pb, setPb] = useState<number | null>(null);
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

  useEffect(() => { engine.team = team; localStorage.setItem('fr-team', String(team)); }, [engine, team]);
  useEffect(() => { engine.controls = controls; localStorage.setItem('fr-controls', controls); }, [engine, controls]);
  useEffect(() => { engine.settings = settings; localStorage.setItem('fr-settings', JSON.stringify(settings)); }, [engine, settings]);
  useEffect(() => { if (supabaseConfigured) fetchPersonalBest().then(setPb); }, []);

  // ---------- soundtrack ----------
  useEffect(() => {
    const unlock = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === 'm' || e.key === 'M') && (e.target as HTMLElement)?.tagName !== 'INPUT') {
        music.setMuted(!music.muted); setMuted(music.muted);
      }
      music.unlock();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); music.dispose(); };
  }, [music]);
  useEffect(() => {
    const scene: Scene = screen === 'lights' ? 'lights' : screen === 'race' ? 'race' : screen === 'results' ? 'results' : 'menu';
    music.setScene(scene);
  }, [music, screen]);
  useEffect(() => { music.setLights(ui.lights); }, [music, ui.lights]);
  useEffect(() => { if (ui.phase === 'green' && screen === 'lights') music.hit(); }, [music, ui.phase, screen]);
  useEffect(() => {
    music.setFinalLap(screen === 'race' && ui.hud.laps > 1 && ui.hud.lap === ui.hud.laps);
    music.setBoost(ui.hud.boostOn || ui.hud.drsOn);
    music.setRain(ui.hud.rain);
  }, [music, screen, ui.hud]);
  const toggleMusic = () => { music.unlock(); music.setMuted(!music.muted); setMuted(music.muted); };

  // deep link ?room=CODE
  useEffect(() => {
    const qr = new URLSearchParams(location.search).get('room');
    if (qr && qr.length === 4) { setJoinCode(qr.toUpperCase()); setScreen('join'); }
  }, [setScreen]);

  const name = () => cleanName(localStorage.getItem('fr-name') || 'DRIVER' + Math.floor(10 + Math.random() * 90));

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
      if (screenRef.current === 'lobby') { setNetErr(reason); engine.resetRace(); setScreen('garage'); }
    },
  }), [engine, setScreen]);

  const enterRoom = (s: RoomSession) => {
    localStorage.setItem('fr-name', s.me()?.name || name());
    sessionRef.current = s; engine.net = s;
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
  useEffect(() => {
    const leave = () => { sessionRef.current?.close(); };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);

  // ---------- input (ported from prototype bindInput) ----------
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let ptr: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      ptr = { x: e.clientX, y: e.clientY };
      if (screenRef.current === 'lights') engine.throttleDown();
    };
    const move = (e: PointerEvent) => {
      if (!ptr || engine.controls !== 'tilt' || screenRef.current !== 'race') return;
      engine.dragSteer = clamp((e.clientX - ptr.x) / 70, -1, 1);
    };
    const up = (e: PointerEvent) => {
      const p = ptr; ptr = null; engine.dragSteer = 0;
      if (screenRef.current === 'lights') return engine.throttleUp();
      if (!p || screenRef.current !== 'race') return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y, tilt = engine.controls === 'tilt';
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
      if (s === 'garage' && k === 'Enter' && !showSettingsRef.current) return startSolo();
      if (s === 'lights' && (k === ' ' || k === 'ArrowUp' || k === 'Enter')) { e.preventDefault(); if (!e.repeat) engine.throttleDown(); return; }
      if (s !== 'race') return;
      const tilt = engine.controls === 'tilt';
      if (k === 'ArrowLeft' || k === 'a') { e.preventDefault(); if (tilt) engine.keySteer = -1; else if (!e.repeat) engine.lane(-1); }
      if (k === 'ArrowRight' || k === 'd') { e.preventDefault(); if (tilt) engine.keySteer = 1; else if (!e.repeat) engine.lane(1); }
      if (k === 'ArrowUp' || k === 'w' || k === ' ') { e.preventDefault(); if (!e.repeat) engine.action(); }
    };
    const ku = (e: KeyboardEvent) => {
      if (screenRef.current === 'lights' && [' ', 'ArrowUp', 'Enter'].includes(e.key)) return engine.throttleUp();
      if (['ArrowLeft', 'a', 'ArrowRight', 'd'].includes(e.key)) engine.keySteer = 0;
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

  const showSettingsRef = useRef(false);
  showSettingsRef.current = showSettings;

  function startSolo() {
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

  return (
    <div className="page">
      <div ref={stageRef} className="stage">
        <canvas ref={canvasRef} className="world" />
        {screen === 'race' && <RaceHud ui={ui} tilt={controls === 'tilt'} />}
        {screen === 'lights' && <Lights ui={ui} />}
        {screen === 'garage' && (
          <Garage team={team} setTeam={setTeam} controls={controls} setControls={pickControls} settings={settings}
            startSolo={startSolo} createRoom={createRoom} openJoin={() => { setJoinCode(''); setJoinErr(''); setScreen('join'); }}
            openSettings={() => setShowSettings(true)} muted={muted} toggleMusic={toggleMusic} busy={busy} err={netErr} pb={pb} online={supabaseConfigured} />
        )}
        {screen === 'garage' && showSettings && <SettingsSheet settings={settings} set={setSettings} close={() => setShowSettings(false)} />}
        {screen === 'join' && <Join code={joinCode} setCode={c => { setJoinCode(c); setJoinErr(''); }} err={joinErr} busy={busy === 'join'} submit={submitJoin} back={() => setScreen('garage')} />}
        {screen === 'lobby' && session?.room && <Lobby s={session} settings={settings} leave={leaveRoom} start={hostStart} starting={starting} />}
        {screen === 'results' && (
          <Results ui={ui} mp={mp && !!session}
            toGarage={() => { if (mp && session) leaveRoom(); else { engine.resetRace(); setScreen('garage'); } }}
            again={() => { if (mp && session) backToLobby(); else engine.startRace(null); }} />
        )}
        <ToastView ui={ui} />
      </div>
    </div>
  );
}
