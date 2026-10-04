# Formula Rush

**v1.4** · Garage v2 (3D car, liveries, accents) and race settings sheet. See [Garage](#garage).

Portrait mobile F1 racer. One-thumb controls, hybrid chase/top-down camera, 3-lap races on a 22-car grid (11 teams × 2, like the 2026 F1 grid), and 2–4 human drivers per room over Supabase Realtime; AI fills the rest of the grid.

**Loop:** Garage → Lights Out (throttle launch) → Race → Results. Multiplayer: Create Room / Join Room (4-character code) → Lobby → synchronized start.

## How to play

| | |
|---|---|
| <img src="public/guide/garage.webp" width="160" alt="Garage"> | **1. Pick your car.** Spin the 3D car, pick a team (‹ › or the TEAM tab), a livery and an accent colour, choose Swipe or Tilt, set laps and weather, then tap **RACE** to take on 21 AI drivers. |
| <img src="public/guide/launch.webp" width="160" alt="Launch"> | **2. Nail the launch.** Hold the screen (or Space) while the five red lights come on and let go the instant they turn green. Letting go early costs a second. |
| <img src="public/guide/lines.webp" width="160" alt="Lines and apexes"> | **3. Change lines, hit apexes.** Swipe left/right between three lines. Drive through the yellow rings on the inside of corners to fill boost; inside lines are shorter. |
| <img src="public/guide/boost.webp" width="160" alt="Boost"> | **4. Boost.** Swipe up (↑ / Space) once the bar passes the notch for 25% more speed. |
| <img src="public/guide/drs.webp" width="160" alt="DRS"> | **5. DRS.** On the teal straights, get within a second of the car ahead and **DRS READY** appears. Swipe up to open it. |
| | **6. Keep it clean.** Cars and walls cost speed, tyres wear, and rain cuts grip and visibility. |
| | **7. Race friends.** Create Room → share the 4-letter code → up to 3 friends join → everyone readies up → the host starts. AI fills the rest of the 22-car grid. |

The same guide opens in the game on first launch and from the **?** button in the Garage. Clips are real gameplay captured from the game.

## Stack

- **Vite + React + TypeScript.** The game is drawn on one `<canvas>` (2D context, manual perspective projection); screens are React overlays.
- **three.js** for the Garage car only (`src/garage/carViewer.ts`, loaded as a separate chunk the first time the Garage opens).
- **Supabase** for anonymous auth, Postgres (rooms, results, best laps) and Realtime (presence + broadcast).
- **GitHub Pages** deploy via GitHub Actions on every push to `main`.

```
src/
  game/        pure TS: track, physics, AI, weather, lights, renderer (no React)
  net/         Supabase client, room session (lobby + race sync), result saving
  garage/      three.js procedural F1 car for the Garage
  ui/          the screens: Garage, RaceSettingsSheet, Join, Lobby, Lights, Race HUD, Results
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

1. Apply the files in `supabase/migrations/` in order (SQL editor, or `supabase db push`). All objects are prefixed `fr_`, so they can share a project with other apps.
2. **Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".** Every driver gets an anonymous user; nothing else is required.
3. Realtime is enabled for `fr_room_players` and `fr_rooms` by the migration.

### Data model

| Table | Purpose |
|---|---|
| `fr_rooms` | code (unique while `lobby`/`racing`), host, status, laps (1–8), weather |
| `fr_room_players` | up to 4 per room, `slot` unique per room, team (0–10), livery, accent (0–4), name, ready |
| `fr_race_results` | one row per driver per finished race |
| `fr_best_laps` | personal best per track (leaderboard, future ghosts) |
| `fr_profiles` | reserved for named profiles |

RLS: signed-in users read everything and write only their own rows. Room membership changes only through security-definer functions, which enforce the rules server-side:

- `fr_create_room(name, team, laps, weather)` picks a free code from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- `fr_join_room(code, name, team)` locks the room row and raises `ROOM NOT FOUND`, `ROOM FULL (4/4)` or `RACE IN PROGRESS`.
- `fr_leave_room`, `fr_kick_player` (host drops a vanished player), `fr_claim_host` (oldest player takes over from a vanished host), `fr_set_room` (host: status/laps/weather), `fr_submit_best_lap` (keeps only improvements, rejects laps under 15 s), `fr_now` (server clock for sync).

## Garage

Hero stage with the 3D car (auto-spin, drag to spin with inertia, a spin kick on every team or livery change), the team name ghosted behind it and ‹ › team arrows. Below it: **TEAM / LIVERY / ACCENT** tabs, the race settings bar, **RACE** (solo vs AI) and **Create Room / Join Room**.

- **Liveries:** Classic (body team, sidepods team-dark), Split (body team-dark, sidepods + rear endplates team), Stripe (Classic + accent centre stripe), Stealth (carbon body, team colour on front wing and endplates, accent stripe). The accent always paints the helmet, front-wing flap and DRS flap, in the Garage and on track. AI cars keep plain team colours.
- **Race settings** open as a bottom sheet from the Garage and the Lobby: laps 1 / 3 / 5 / 8 and weather Random / Dry / Wet / Late rain. AI pace and camera tilt sit under *More*. In a room only the host can edit; guests see `SET BY HOST`. The host's changes are written to `fr_rooms` and reach guests through Realtime.

## Multiplayer

Client-authoritative for your own car, Supabase Realtime as the relay. Channel `race:{roomId}`:

- **Presence** `{ userId }` shows who is connected. If a player is gone for 8 s the host removes them; if the host is gone, the oldest player claims host.
- **`start`** (host): `{ grid, laps, rainPlan, greenAt, lightsDelay }`; each grid entry carries the driver's team, livery and accent. Everyone runs the lights from a shared server clock (offset estimated from `fr_now` round trips), so all clients go green at the same instant. Humans start in random mid-pack spots (P7–P14); AI takes the other 18–20 spots on the 22-car grid. The host needs at least 2 ready drivers to start.
- **`state`**: `{ id, t, p, d, v, y, b, r }` in race time. The send rate adapts to room size so the whole room stays inside the Realtime quota: every update is delivered to every other driver, so a room of n drivers costs n·(n−1)·rate messages/second. Remote cars interpolate ~100 ms behind when updates are frequent and keep driving along the track (with smooth correction) when they're sparse. The host also sends AI cars and their finish times; if the host leaves mid-race the new host takes over the AI.
- **`finish`**: `{ id, finishTime, best }`. Results update live as drivers cross the line.

Contacts are resolved by each client for its own car only.

### Realtime quota

A room of n drivers costs n·(n−1)·rate Realtime messages/second, since every update reaches every other driver. The rate adapts to stay under `VITE_RT_MSGS_PER_SEC` (default 80; Supabase Free allows 100/s): 10 Hz for 2–3 drivers, ~7 Hz for 4. The host's AI cars ride along in the host's own updates, so the 18–20 AI cars cost nothing extra.

## Deploy

`.github/workflows/deploy.yml` builds with `BASE_PATH=/<repo>/` and publishes to GitHub Pages. In the repo: **Settings → Pages → Source: GitHub Actions**. To point at another Supabase project, set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Room invites use `?room=CODE` deep links; `404.html` is a copy of the app so links always load.

## Soundtrack

`src/audio/music.ts` is an original score synthesized live with Web Audio, so there are no audio files and nothing to license. There are four sister tracks: **Lights Out** (D minor, 120 BPM), **Slipstream** (E minor, 128), **Apex Hunter** (A minor, 124) and **Night Race** (C minor, 116). They share the same sound (a pulsing 16th-note ostinato, a pedal bass, low brass swells and drums) and differ in key, tempo, chord progression and arpeggio pattern. A random track plays in the Garage and each race moves to the next one. Layers follow the race: a calm pad in the Garage, a heartbeat and ticking that build with each red light, a hit on lights-out, the full groove while racing (brighter on boost/DRS, darker in rain), and extra percussion and a high line on the final lap.

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
