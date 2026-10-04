# Formula Rush

Portrait mobile F1 racer. One-thumb controls, hybrid chase/top-down camera, 3-lap races on a 22-car grid (11 teams × 2, like the 2026 F1 grid), and 2–4 human drivers per room over Supabase Realtime; AI fills the rest of the grid.

**Loop:** Garage → Lights Out (throttle launch) → Race → Results. Multiplayer: Create Room / Join Room (4-character code) → Lobby → synchronized start.

## Stack

- **Vite + React + TypeScript.** The game is drawn on one `<canvas>` (2D context, manual perspective projection); screens are React overlays.
- **Supabase** for anonymous auth, Postgres (rooms, results, best laps) and Realtime (presence + broadcast).
- **GitHub Pages** deploy via GitHub Actions on every push to `main`.

```
src/
  game/        pure TS: track, physics, AI, weather, lights, renderer (no React)
  net/         Supabase client, room session (lobby + race sync), result saving
  ui/          the screens: Garage, Settings, Join, Lobby, Lights, Race HUD, Results
supabase/migrations/   schema, RLS and room functions
```

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
npm run typecheck
```

Supabase settings come from `.env.development` / `.env.production` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). The publishable key is meant to ship to browsers; row-level security protects the data. Without them the game still runs solo and the room buttons show as offline.

## Supabase setup

1. Apply `supabase/migrations/20261004000000_formula_rush.sql` (SQL editor, or `supabase db push`). All objects are prefixed `fr_`, so they can share a project with other apps.
2. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".** Every driver gets an anonymous user; nothing else is required.
3. Realtime is enabled for `fr_room_players` and `fr_rooms` by the migration.

### Data model

| Table | Purpose |
|---|---|
| `fr_rooms` | code (unique while `lobby`/`racing`), host, status, laps, weather |
| `fr_room_players` | up to 4 per room, `slot` unique per room, team (0–10), name, ready |
| `fr_race_results` | one row per driver per finished race |
| `fr_best_laps` | personal best per track (leaderboard, future ghosts) |
| `fr_profiles` | reserved for named profiles |

RLS: signed-in users read everything and write only their own rows. Room membership changes only through security-definer functions, which enforce the rules server-side:

- `fr_create_room(name, team, laps, weather)` picks a free code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- `fr_join_room(code, name, team)` locks the room row and raises `ROOM NOT FOUND`, `ROOM FULL (4/4)` or `RACE IN PROGRESS`.
- `fr_leave_room`, `fr_kick_player` (host drops a vanished player), `fr_claim_host` (oldest player takes over from a vanished host), `fr_set_room` (host: status/laps/weather), `fr_submit_best_lap` (keeps only improvements, rejects laps under 15 s), `fr_now` (server clock for sync).

## Multiplayer

Client-authoritative for your own car, Supabase Realtime as the relay. Channel `race:{roomId}`:

- **Presence** `{ userId }` shows who is connected. If a player is gone for 8 s the host removes them; if the host is gone, the oldest player claims host.
- **`start`** (host): `{ grid, laps, rainPlan, greenAt, lightsDelay }`. Everyone runs the lights from a shared server clock (offset estimated from `fr_now` round trips), so all clients go green at the same instant. Humans start in random mid-pack spots (P7–P14); AI takes the other 18–20 spots on the 22-car grid. The host needs at least 2 ready drivers to start.
- **`state`**: `{ id, t, p, d, v, y, b, r }` in race time. The send rate adapts to room size so the whole room stays inside the Realtime quota: every update is delivered to every other driver, so a room of n drivers costs n·(n−1)·rate messages/second. Remote cars interpolate ~100 ms behind when updates are frequent and keep driving along the track (with smooth correction) when they're sparse. The host also sends AI cars and their finish times; if the host leaves mid-race the new host takes over the AI.
- **`finish`**: `{ id, finishTime, best }`. Results update live as drivers cross the line.

Contacts are resolved by each client for its own car only.

### Realtime quota

A room of n drivers costs n·(n−1)·rate Realtime messages/second, since every update reaches every other driver. The rate adapts to stay under `VITE_RT_MSGS_PER_SEC` (default 80; Supabase Free allows 100/s): 10 Hz for 2–3 drivers, ~7 Hz for 4. The host's AI cars ride along in the host's own updates, so the 18–20 AI cars cost nothing extra.

## Deploy

`.github/workflows/deploy.yml` builds with `BASE_PATH=/<repo>/` and publishes to GitHub Pages. In the repo: **Settings → Pages → Source: GitHub Actions**. To point at another Supabase project, set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Room invites use `?room=CODE` deep links; `404.html` is a copy of the app so links always load.

## Soundtrack

`src/audio/music.ts` is an original score synthesized live with Web Audio, so there are no audio files and nothing to license. It's in D minor at 120 BPM, built from a pulsing 16th-note ostinato, a pedal bass, low brass swells and drums. Layers follow the race: a calm pad in the Garage, a heartbeat and ticking that build with each red light, a hit on lights-out, the full groove while racing (brighter on boost/DRS, darker in rain), and extra percussion and a high line on the final lap.

Audio starts on the first tap or key press (a browser rule). Toggle it with the speaker button in the Garage or the **M** key; the choice is remembered.

## Controls

| Input | Action |
|---|---|
| ← → / swipe | change racing line (3 lanes) |
| ↑ / Space / swipe up | DRS when ready, otherwise boost (35 of the meter) |
| hold, release on green | launch; releasing on red is a +1 s jump start |
| Tilt mode | drag, tilt or hold arrows to steer; tap the right edge to boost |
| M | music on/off |

Hit yellow apex rings for +30 boost. Inside lines are shorter.

Settings (gear icon in the Garage): camera tilt 35–90°, weather (Random / Dry / Rain / Rain on final lap), AI pace, laps 1–5.
