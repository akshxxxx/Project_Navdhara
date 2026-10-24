# Raah — Feature Inventory

What Raah already does, what each part of the code is responsible for, and what is still planned.
Every change to a feature is also recorded, with who, why, how and when, in [log.md](log.md).

> Raah is a decision-support prototype, not an official warning. Emergency: **112**.

Last updated: 2026-10-23 17:05 IST (backend contract fixes L-003 to L-015)

**Run the backend:** Python **3.12+** (the pinned `scipy==1.18.0` needs it), then:

```
cd Backend
python -m venv venv
venv\Scripts\pip install -r requirements.txt
venv\Scripts\python run.py
```

API on `:8000`, Swagger at `/docs`, workbench at `/`.

**Settings:** edit `Backend/.env` (read automatically at start-up; template in `Backend/.env.example`). The app's backend address goes in `App/.env` (`EXPO_PUBLIC_API_URL`). Both files are git-ignored. No paid keys are needed; Telegram and Twilio are optional, for live alerts.

---

## 1. What exists

| Part | Folder | What it is | Status |
|---|---|---|---|
| Regional risk engine (backend) | `Backend/` | Python FastAPI + SQLite. Ranks the 18 segments of NH-7 (Rishikesh → Joshimath, 247.37 km) by terrain susceptibility plus a labelled 3-day rain rule, and serves everything below. | Built at the IBM x Jigyasa Hackathon 2026. Reused at this event and must be disclosed as reused. |
| Web dashboard | `Frontend/` | React 19 + Vite + Leaflet. | Built at the earlier hackathon by teammates. |
| Mobile app | `App/` | Expo / React Native + NativeWind, offline caching. | Built at the earlier hackathon by teammates. **Not being worked on at this event:** the team is doing the web dashboard only, made responsive for phones (decided 2026-10-23). |
| Backend test workbench | `Backend/app/static/index.html` | Single-file page with nine tabs used to exercise every endpoint during development. | Built. Developer tool, not user-facing. |
| Raah Node (hardware) | not in this repo yet | ESP32 + MPU6050 + soil + rain node; four states (OK / WATCH / WARNING / ALARM). | Being built at this event (Track 5). See section 6. |

---

## 2. Backend features (already built)

### 2.1 Terrain-susceptibility model (offline, `Backend/model/`)
- Random Forest (400 trees, min leaf 5, balanced class weights, seed 42) on eight 30 m Copernicus GLO-30 DEM features: elevation, slope, aspect sin/cos, relief 300 m, max slope 210 m, TPI 300 m, curvature.
- Trained on the 309 road-blocking landslides mapped by Mey et al. (2024) plus 927 distance-matched background points.
- Validation: 6 spatial blocks with a 2 km buffer. Block-mean AUC **0.664** (SD 0.043); pooled out-of-fold AUC 0.767; Spearman 0.653 against the survey.
- Pipeline: `build_static_dataset.py` → `add_features.py` → `score_segments.py`, which writes `segment_static_scores.json` (terrain percentile per segment).
- No machine learning runs at request time. The live server only looks up the table and does arithmetic.

### 2.2 Live risk engine (`app/risk_service.py`, `app/weather_service.py`)
- Score = `min(0.6 × effective_terrain + 0.4 × min(rain_3d / 150 mm, 1), 1)`, where effective_terrain = 0.35 + 0.65 × terrain percentile.
- Dry-weather cap: at or below 15 mm of 3-day rain the score cannot exceed 0.49 (Moderate). It ramps to the full score by 35 mm.
- Levels: Moderate ≥ 0.25, High ≥ 0.50, Very High ≥ 0.75. All of these values are uncalibrated demonstration heuristics and are labelled that way.
- Weather has four tiers: Open-Meteo hourly per segment → 5 corridor stations → last saved snapshot → terrain only. A 30 min cache and a 5 min circuit breaker keep a failing weather service from slowing requests.
- Every response carries freshness metadata: `weather_source`, `weather_fetched_at`, `weather_age_minutes`, `is_simulated`, `stale_warning`.
- `simulate_rain_mm` runs "what if X mm falls". The result is labelled simulated.
- `DEMO_MODE` pins the weather to the local snapshot so a demo is reproducible offline.

### 2.3 Endpoints

| Method | Path | Purpose | Used by |
|---|---|---|---|
| GET | `/health` | Server, DB, weather source, scheduler last run | App (start-up probe) |
| GET | `/risk-map` | 18 segments with level, score, terrain, rain, driver, consequence, closure, ground-report adjustment. Params: `simulate_rain_mm`, `as_of` (time machine), `lang` | Web, App |
| GET | `/route-risk` | Trip risk between two segments. Optional `depart_time` turns on the time-aware planner (ETA per segment, rain at ETA, GO / CAUTION / DELAY / AVOID, best departure windows in 48 h). `date` is optional and derived from `depart_time` in IST | Web, App |
| POST | `/trip-planner` | JSON-body form of `/route-risk` (`origin`, `destination`, `depart_time`, `speed_kmph`, `lang`). *Added 2026-10-23, L-005* | Web |
| GET | `/priority-list` | BRO/SDRF pre-positioning list: priority = risk × consequence. The same list is also returned as `priority_list` (web) and `priority_segments` (app) | Web (Officials), App (Alerts, Officials) |
| GET | `/closures` | `{active_closures_count, closures[]}` with `segment_name`. *Shape changed 2026-10-23, L-006* | Web, App |
| POST / DELETE | `/admin/closure`, `/admin/closure/{id}` | Create or lift a closure (admin key) | Web (lift), App (create, lift) |
| POST | `/field-report` | Crowd report: 3 km geofence, HTML stripped, ≤ 500 chars, 5/min per IP, 10 min duplicate guard | Web, App |
| POST | `/field-report/photo` | Photo for a report: multipart `photo`, JPEG/PNG ≤ 3 MB, 10/min per IP → `{photo_url}`; served at `GET /report-photos/<name>`. *Added 2026-10-24, L-048* | App |
| GET | `/field-reports` | List reports. `status` is `pending` / `verified` / `rejected`; the stored value is in `status_label` | Web, App |
| POST | `/admin/validate-report` | Validate or reject a report (admin key). Accepts `{decision, notes}` or `{status: verified\|rejected, verified_by}` | Web, App |
| POST | `/admin/alert-all` | Officials' broadcast (admin key): `{segment_id: seg_XX \| all, message?}` → every consenting subscriber of that stretch plus corridor subscribers. Default message is built from the live level. Logged as `OFFICIAL BROADCAST`. *Added 2026-10-23, L-032* | Web (Map "Alert All", Admin → Broadcast) |
| POST | `/subscribe` | Subscribe to alerts for a segment or `all` (consent, phone/e-mail validation, masked output, token). Also accepts the web payload `{phone_number, alert_channel}` | Web, App |
| GET | `/alerts` | Alerts for a subscription token. With no token: the public corridor feed | App |
| POST | `/webhook/sms` | Twilio inbound SMS (`NH7 HELP`, `NH7 SEG08`, `NH7 ROUTE RISHIKESH JOSHIMATH`), signature-checked | SMS |
| GET | `/voice-alert` | Hindi/English spoken advisory (gTTS, cached on disk). Falls back to JSON text for browser speech | Web, App |
| GET | `/offline-pack` | Compact offline bundle with ETag / 304 | Web (Emergency), App |
| GET | `/history` | Historical landslide records | Web, App |
| GET | `/model-info` | Model card: data, metrics, heuristics, limits | App (About) |
| GET | `/backtest-summary` | Back-test summary (synthetic flag) | App (About) |

### 2.4 Feature areas
- **Time machine** — `/risk-map?as_of=YYYY-MM-DD` replays the map for a past date with archived rainfall, cached in `data/backtest_cache/`.
- **Time-aware trip planner** (`app/trip_planner.py`) — departure time is read as IST; default speed 30 km/h; hourly search over the next 48 h for up to three better departures. It never says "safe", only "LOW RISK – proceed with caution".
- **Official closures** — `closed` forces AVOID on any route through the segment. `one_way` / `restricted` gives CAUTION.
- **Ground-truth flywheel** (`app/flywheel_service.py`) — validated reports decay with a 48 h half-life and can raise a segment's displayed level by at most one step.
- **Consequence and priority** (`app/consequence_service.py`) — hospital distance 40 %, no detour 35 %, traffic 25 %, from `data/segment_consequence.csv`.
- **Alerts** (`app/alert_dispatcher.py`, `app/scheduler.py`, `app/notifiers/`) — runs every 10 min. Sends only on High/Very High, only when the level rises above the last level sent, and at most once per 3 h per person and segment. Uses real weather only. Notifiers: console, Telegram, Twilio. `DRY_RUN=true` by default, so messages are logged, not sent.
- **Telegram bot** (`app/bot/telegram_bot.py`) — `/start`, `/lang`, `/status`, `/route`, `/subscribe`, `/unsubscribe`, `/help`. Off by default (`ENABLE_TELEGRAM_BOT`).
- **Hindi and English** (`app/i18n.py`) — segment names, levels, drivers, advisories, voice scripts. `*_en` fields are added next to the Hindi ones. Still used by the Telegram bot and SMS; the web console no longer asks for Hindi (L-033).
- **Offline pack** — simplified geometry (Ramer-Douglas-Peucker), levels, bilingual advisories, emergency numbers (112; other agency numbers left blank on purpose), nearest hospital. Under 17 KB. The service worker caches it for the workbench.
- **Security** — per-IP rate limits (SlowAPI), constant-time admin key check, refuses to start in production without an admin key, geofence, input sanitisation, masked contacts, CORS from env (open only in development), per-subscription token on `/alerts`.
- **Logging** — every request and response gets a request ID; rotating file at `logs/backend.log` (5 MB × 5).
- **Tests** — about 130 PyTest tests: golden-schema contract tests (`tests/golden/`), resilience, freshness, trip planner, closures/flywheel, consequence, alert delivery, localisation/voice, offline pack, security, production guards, geometry, model info, validation audit, back-test.
- **Scripts** (`Backend/scripts/`) — `validation_audit.py`, `backtest.py`, `smoke.py`, `demo_check.py`, geometry rebuild and diagnostics, `export_validated_reports.py`.

---

## 3. Web dashboard (`Frontend/src/pages/`): officials' console, English only
Since 2026-10-23 (L-033, L-034) the web dashboard is **for officials only** and **English only**: no Hindi, no public view, no "Officials" button, no login screen. Admin calls use `getAdminKey()`: `localStorage` `admin_key`, otherwise `VITE_ADMIN_API_KEY` in `Frontend/.env` (same value as `ADMIN_API_KEY` in `Backend/.env`). ⚠ The key is built into the page JavaScript, so run the console only on control-room machines.
- **LiveMap** (`/`) — corridor map, segment colours, rain simulation modal, voice button. The stretch panel has **Alert All** (L-034): confirm → `POST /admin/alert-all` → "sent to N of M subscribers" / test mode / nobody subscribed.
- **PlanTrip** (`/plan`) — route planner on `/route-risk` with departure windows and delay advice.
- **Alerts** (`/alerts`) — "Live Incident Center" built from `/risk-map` and `/closures`.
- **Reports** (`/report`) — log field reports and **Verify / Reject** pending ones (L-035); only verified reports raise a stretch's risk (fades over 48 h).
- **Sensors** (`/sensors`, L-030, redesigned L-036) — Raah Node screen with **all four sensors** as tiles with gauges, thresholds and 5-minute sparklines:
  - tilt (MPU6050) and tilt rate;
  - vibration peak, RMS and strikes;
  - soil moisture with saturation (≥ 70 %, thresholds ×0.6);
  - rain plate WET/DRY.
  Also: the health strip, fleet summary (Online / Alerting / Sensor lost / Stale-offline), alert banners, a node picker, map with node dots and proposed sites, the trip planner's answer for the stretch, and incidents (a table, or cards on phones) with one-clock timings. "Mark event now" and "Site checked (release)" use the admin key. English voice on ALARM and SENSOR LOST.
- **Admin** (`/admin`; `/officials` redirects) — tabs:
  - **Reports**: verify / reject;
  - **Closures**: declare closed / one-way / restricted, and reopen;
  - **Broadcast**: Alert All for one stretch or the whole corridor, with an optional message;
  - **BRO Priority**: the table.
  Plus a key override field.
- **Emergency**, **Past events** (verified reports show as "Resolved"; L-035 fix).
- **How it works** (`/about`, L-037) — what feeds the level, the four node sensors and thresholds, the alarm flow, a control-room shift routine, limits.
- **Header sensor pill** — on every page, a pulsing red (ALARM), orange (WARNING) or purple (SENSOR LOST) pill links to `/sensors` while a node escalates a stretch.
- API base: `VITE_API_URL` (e.g. in `Frontend/.env`), default `http://localhost:8000` (`src/api/client.js`).
- **Responsive** (L-031): checked at 375 (phone), 768 (tablet), 1024, 1280 and 1920 px, with no sideways scrolling on any page.
  - Full nav row from 1280 px; below that, the ☰ menu lists every page (plus the bottom bar on phones and tablets).
  - The home page map now shows on phones; it was 0 px tall.
  - The Sensors page stacks into one column below 1280 px and shows incidents as cards on phones.

## 4. Mobile app (`App/app/`)
- Tabs: **Map** (index), **Plan**, **Report**, **Alerts**. Screens: plan result, my reports, drive mode, emergency (offline pack), history, officials (control room), settings (rain simulation), about (model card and back-test), language select.
- Offline-first: React Query cache, recorded fixtures as a fallback when the backend is unreachable, a queued report outbox (`src/api/queue.ts`), and the offline pack in AsyncStorage.
- API base: `EXPO_PUBLIC_API_URL`, otherwise the Expo host's LAN IP on port 8000.

---

## 5. Known limitations (unchanged from the project report)
- The terrain model has moderate skill (0.664 held-out AUC). Scores are relative rankings, not probabilities.
- The rain rule is not calibrated. The back-test uses 12 synthetic events and shows only that the harness runs.
- Alerts are in test mode (`DRY_RUN`). SMS needs a paid Twilio account.
- The free host wipes its disk. Demo from the laptop on the hotspot.
- The list of known chronic trouble spots is an empty template.

---

## 6. Raah Node backend: built, running on mock data (2026-10-23, L-024 to L-028)
Built from the 30-hour team plan (S1 packet) and the 48-hour workflow. Written fresh in this repo (the starter zips were not available). **Full guide for teammates: [Backend/docs/NODE_API.md](Backend/docs/NODE_API.md).** Live page: `http://localhost:8000/static/node_live.html`.

| Item | Plan ID | Status |
|---|---|---|
| Node readings `POST /node/reading` (X-Node-Key) + `GET /node/latest`, `/node/history`, `/node/alerts` | node patch | ✅ Built. WARNING → segment ≥ High; ALARM → Very High and planner AVOID; Telegram bot `/route` also says AVOID |
| Message contract v2 (all new fields optional, unknown fields ignored) | 4.2 | ✅ |
| Late outbox messages (`late:1` or old NTP timestamp) → history only | F7 | ✅ |
| SENSOR_LOST hold: silent 15 s after WARNING/ALARM keeps the escalation until `POST /node/ack/{id}` | F3 | ✅ Also survives a backend restart |
| One-clock timing: `POST /node/mark`, `GET /node/incidents` (mark → server, mark → ALARM, ALARM → alert sent) | F2 | ✅ |
| Fleet view `GET /node/fleet`: status, health (RSSI, uptime, heap, RTT, outbox), delivery % from `seq` | F3, F6, E6 | ✅ |
| SIM- (never escalates), REPLAY and MOCK- (escalate, labelled everywhere) | 4.2 | ✅ |
| One Telegram/SMS sensor-alarm message per incident; no double message from the 10-min dispatcher | 9 | ✅ |
| Placement `GET /node/placement?n=10&min_spacing_km=2` | F8 | ⚠ **Mock scores** until S3 provides `Backend/data/point_scores.csv` |
| Tools: `mock_node.py` (8 scenarios), `mark_event.py`, `replay_session.py`, `serial_bridge.py` (`--port auto`, JSON lines, for a board on another laptop), `sim_fleet.py` | F4, F15 | ✅ (not tried on the real ESP32 yet) |
| Live page `/static/node_live.html` (node cards, SENSOR LOST release, planner, chart, incident timings, mark button) | 14 | ✅ Fallback screen. Web dashboard **Sensors** page done (L-030), responsive (L-031). No Expo app screen: web only for this event |
| **Live hardware** (L-038) | — | ✅ Backend side built and tested; ⚠ firmware not yet compiled or run on the board. **USB:** the backend auto-detects an ESP32 plugged into its laptop (`NODE_SERIAL=auto`, `GET /node/serial`, pause/resume for flashing) and ingests every reading through the same path as Wi-Fi. **Wi-Fi:** `POST /node/reading` as before. Raw values accepted: `soil_raw` / `rain_raw` ADC with the bench calibration (soil 4095 → 1250, rain 4095 → 2400), raw accelerometer; a missing state, tilt rate or strike count is computed by the server with the firmware thresholds (`app/node_sensors.py`). Firmware for the team wiring: `Hardware/raah_node/raah_node.ino` (lights, buzzer, USB + Wi-Fi, no extra libraries) |
| **Sensor log + calibration** (L-050) | — | ✅ Every node reading (not SIM-) also goes to a daily CSV, `Backend/logs/node_readings/YYYY-MM-DD.csv`; officials view and download it on **Admin → Sensor log** (`GET /admin/node-logs`, admin key). **Only tilt (angle or rate) raises ALARM**; vibration and soil moisture stop at WARNING (soil WATCH 50 %, WARNING 70 %), rain plate WATCH; node-sent ALARMs without a tilt reason are lowered to WARNING. Rationale and references: `Backend/docs/SENSOR_THRESHOLDS.md` |
| Not built: ESP-NOW gateway forwarder (F13), LoRa, HMAC/TLS on the node, placement coverage statistics (S3) | — | — |

---

## 7. Changes made at this event
Details, reasons and verification are in [log.md](log.md) under the given IDs.

| Date | Area | Change | Log |
|---|---|---|---|
| 2026-10-23 | Repo | `.gitignore` no longer hides `features.md`, `log.md`, `Backend/outputs/*.md` or `Backend/docs/*.md`. **Action:** whoever has the generated reports locally should commit them. | L-003 |
| 2026-10-23 | Risk engine | **Fixed:** validated field reports never escalated `/risk-map` (undefined variable, error swallowed). `adjusted_risk_level` is now sent only when escalated. Added `terrain_score`; `r3d_mm` is always filled. | L-004 |
| 2026-10-23 | Trip planner | **Fixed:** HTTP 500 for every Hindi trip plan and for routes through one-way/restricted closures. `date` is optional and taken from the IST departure. **New** `POST /trip-planner`. | L-005 |
| 2026-10-23 | Closures | `/closures` returns `{active_closures_count, closures}` with `segment_name`. Closures were invisible on every web and app screen. | L-006 |
| 2026-10-23 | Field reports | **Fixed:** Approve/Reject returned 422 from both Officials screens. The list uses client status words plus `segment_id` and `reported_at`. Submit returns `id`. The workbench report list is no longer always empty. | L-007 |
| 2026-10-23 | Alerts | Web subscribe payload accepted. `segment_id: all` (whole corridor) supported in subscribe, alerts and dispatcher. **Fixed privacy leak:** `/alerts` without a token returned the first subscriber's alerts; it now returns a public corridor feed. | L-008 |
| 2026-10-23 | Priority | `priority_list` and `priority_segments` keys and item aliases, so both priority screens show data. | L-009 |
| 2026-10-23 | Offline | Offline pack adds `hospitals[]` and a corridor advisory (app Emergency screen). CORS exposes `ETag` so the web can use 304s. | L-010 |
| 2026-10-23 | Transparency | `/model-info` falls back to the committed CV report instead of returning 500; missing metrics come back as `null`, not invented. `/backtest-summary` adds recall, precision and F1 (High tier, still marked synthetic). | L-011 |
| 2026-10-23 | Server | **Fixed:** `GET /`, `/manifest.json` and `/sw.js` crashed in the logging middleware. | L-012 |
| 2026-10-23 | Time machine | A failed archive fetch no longer caches an invented rainfall value as real; it is labelled synthetic. | L-013 |
| 2026-10-23 | Config | The backend now reads `Backend/.env` (before, nothing read it). `.env` files created for the backend and the app. `.env.example` no longer turns off the time machine. | L-017 |
| 2026-10-23 | Alerts | Live Telegram bot @Jarvis_raah_bot verified. **Fixed:** `/route` said LOW RISK on Moderate routes; it now uses the same tiers as `/route-risk`. | L-018 to L-020 |
| 2026-10-23 | Tests | Tests use their own database (`data/test_landslide_nh7.db`). A test run had wiped the live demo database. | L-021 |
| 2026-10-23 | Dev tools | VS Code tasks to install, start everything and run tests. | L-023 |
| 2026-10-23 | **Raah Node** | **New:** node backend (contract v2, SENSOR_LOST hold, incidents and marks, escalation into map/planner/bot, Telegram sensor alarm, placement) running on mock data. | L-024, L-025 |
| 2026-10-23 | Raah Node | **New:** mock node and fallback tools, live node page, `docs/NODE_API.md`, VS Code mock tasks. | L-026 |
| 2026-10-23 | Raah Node | Tools default to `127.0.0.1` (Windows "localhost" costs 2 s per request). After editing `.env`, restart the backend. | L-027 |
| 2026-10-23 | Raah Node | Full seg_05 demo with a real Telegram alarm; live-page border fix. | L-029 |
| 2026-10-23 | **Web dashboard** | **New Sensors page** + header sensor-alert pill on every page; map uses the backend's own level (sensor ALARM shows as Very High); API address configurable (`VITE_API_URL`). | L-030 |
| 2026-10-23 | Web dashboard | **Responsive:** header fits from phones to wide screens, Sensors page reflows for phone/tablet/laptop, **fixed: the home-page map was invisible (0 px) on phones and tablets.** | L-031 |
| 2026-10-23 | Alerts | **New** `POST /admin/alert-all`: the officials' broadcast to a stretch's or the whole corridor's subscribers. 3 new tests. | L-032 |
| 2026-10-23 | **Web dashboard** | **Officials only, English only:** all Hindi removed (language context, labels, Devanagari font, `lang` on API calls). The Officials button was replaced by an **Admin** nav page with no login (key from `Frontend/.env`). "Alert me" became **Alert All**. | L-033, L-034 |
| 2026-10-23 | Web dashboard | **Report verification** (Verify / Reject on the Reports page). **Fixed:** verified reports never showed as verified (`validated` vs `verified`) on Reports and Past events. | L-035 |
| 2026-10-23 | Web dashboard | Sensors page redesigned around all four node sensors (tilt, vibration, soil moisture, rain). How it works rewritten for officials. | L-036, L-037 |
| 2026-10-23 | **Raah Node** | **Live hardware link:** automatic USB ingest from a plugged-in ESP32, raw ADC and accelerometer values accepted, server-side state when the board sends none, ESP32 firmware for the team wiring, raw ADC shown on the Sensors page. `pyserial` added. 14 new tests. | L-038 |
| 2026-10-24 | **Raah Node** | **Sensor log** for admins (daily CSV, Admin → Sensor log, `/admin/node-logs`) and **calibration: only tilt raises ALARM** (vibration, soil moisture: WARNING at most), in backend, firmware 2.2.0, mock node and Sensors page; threshold references in `docs/SENSOR_THRESHOLDS.md`. 4 new tests. | L-050 |
| 2026-10-23 | Tests/setup | Python 3.12+, `pandas` added, test DB auto-created, a weather test with a fixed date repaired, 21 new client-contract tests. Result: 149 tests pass; the 8 failures are the missing generated reports. | L-014, L-015 |
| 2026-10-24 | Field reports | **New** `POST /field-report/photo` and `/report-photos/*`: travellers can attach a photo (camera or gallery) to a report from the app. Photos are git-ignored user data. 4 new tests. | L-048 |
| 2026-10-24 | Field reports | Real landslide photos (`Backend/app/static/landslides/`) replace Unsplash stock images on the seed reports; old databases are fixed at start-up. `/field-reports` returns full photo URLs. Admin Past Events, Reports and Alerts use the same photos. | L-049 |
| 2026-10-24 | Web dashboard | A field report sent **without a photo shows "No photo"** on admin Reports and Past Events instead of a stand-in landslide picture chosen from its words. Seed reports and built-in past events keep their own photos. | L-052 |
| 2026-10-24 | Weather | **Live weather stopped (Open-Meteo daily limit, HTTP 429).** Tests no longer call the real Open-Meteo (~108 quota calls per run), a restart reuses a snapshot younger than 30 min instead of refetching, the daily limit backs off until 05:30 IST instead of retrying every 5 min, the map shows why it is on saved weather, optional `OPEN_METEO_API_KEY` (paid plan). 3 new tests. | L-053 |
| 2026-10-24 | Weather | Live weather back on another network (the university Wi-Fi's shared IP had used up Open-Meteo's daily quota); after a daily-limit refusal the backend now retries **hourly** instead of waiting until 05:30 IST. | L-054 |

---

## 8. Client-side bugs found while doing this (not fixed: they are in Frontend/ or App/)
For the web/app owner. These need frontend changes; the backend now sends everything listed in section 7.

| # | Where | Problem | Suggested fix |
|---|---|---|---|
| 1 ✅ fixed (L-030) | `Frontend/src/api/adapters.js` `scoreToLevel` | Uses cut-offs 0.35 / 0.60 / 0.80; the backend uses 0.25 / 0.50 / 0.75. The web map shows lower levels than the backend computed. | Use `risk_level_en ?? risk_level` from the API instead of recomputing. |
| 2 | `Frontend/src/pages/Alerts.jsx` | When a count is 0 it shows made-up numbers (`severe \|\| 2`, `high \|\| 3`, …), plus hard-coded times like "11:20 AM, 10 Oct 2026". The subscribe toggle sends a fixed demo phone number and shows success even when the request fails. | Show the real counts and real `updated_at`; ask for the phone number; show errors. |
| 3 ½ fixed (L-030: `VITE_API_URL`; the 304 part is still open) | `Frontend/src/api/client.js` | `apiFetch` throws on 304 (`res.ok` is false), so `fetchOfflinePack`'s `notModified` path never runs. `BASE_URL` is hard-coded to `localhost`. | Accept 304 before throwing; read `import.meta.env.VITE_API_URL`. |
| 4 ✅ fixed (L-035) | `Frontend/src/pages/PastEvents.jsx` | Checks `status === 'validated'`; the API sends `verified`. | Compare with `verified`. |
| 5 ✅ fixed (L-034; key now in `Frontend/.env`, still built into the page JS) | `Frontend/src/pages/Officials.jsx` | Shows and suggests the demo admin key. Production refuses that key. | Remove the hint before any public demo. |
| 6 | `App/src/api/hooks.ts` `useAlerts` | Maps `severity === 'Severe'`, but the API sends `Very High` (and Devanagari in Hindi), so Very High alerts show as level 0. | Use `parseLevel(a.severity_en ?? a.severity)`. |
| 7 | `App/app/plan/result.tsx` | `parseLevel(max_risk_level)` gets Devanagari text in Hindi and returns Low. | Use `max_risk_level_en ?? max_risk_level`. |
| 8 | `App/app/(tabs)/report.tsx` | After a successful POST it also calls `enqueueReport`, which POSTs again, gets 409, and marks the user's own report "rejected". | Store the sent report as `pending` with `serverId = res.id` instead of enqueueing it. |
| 9 | `App/src/api/offlinePack.ts` | Its `API_URL` defaults to `localhost` and skips the LAN-IP detection in `client.ts`, so a real phone never refreshes the pack. | Import `API_URL` from `client.ts`. |
| 10 | `App/app/officials.tsx` | Never sends `X-Admin-Key`. From a phone (not localhost) every admin action returns 401. | Add an admin-key field like the web Officials page. |
| 11 | `README.md` (root) | Lists `/ground-reports` and `/emergency/offline-pack`, which don't exist. The real paths are `/field-report(s)` and `/offline-pack`. Says Python 3.11+; it needs 3.12+. | Update the README. |
| 12 web ✅ (L-030); app out of scope (web only) | Web + App (S2) | No screen shows the Raah Node yet. Also, the web adds +1 level whenever `adjusted_risk_level` is set, so a node ALARM (Very High) shows as base+1, not Very High. | Build NodePanel/NodeScreen on `GET /node/fleet` + `/node/incidents` (see `Backend/docs/NODE_API.md` §5); show `adjusted_risk_level_en ?? adjusted_risk_level` directly. |
