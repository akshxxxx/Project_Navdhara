# Raah — Change Log

**Append-only.** Add new entries at the bottom and never edit or delete old ones. To correct an entry, add a new one that refers to it by ID.

Each entry records **When** (IST), **Who**, **What**, **Why**, **How**, and the **Files** touched.

---

### L-001 — Feature inventory created
- **When:** 2026-10-23 15:40 IST (H+3.7 in the 30-hour plan)
- **Who:** Claude Code (AI assistant), working for Aakash (software team)
- **What:** Created `features.md`, a list of everything already built in Backend, Frontend (web) and App (Expo), plus the planned Raah Node backend work.
- **Why:** The team needed one place that says what exists before changing anything. Disclosing reused parts is also required at this event.
- **How:** Read the three plan PDFs (30 h team plan, 48 h build workflow, NH-7 project report) and the code of all three apps, and checked every endpoint the web and app clients call.
- **Files:** `features.md` (new)

### L-002 — Python toolchain installed for backend verification
- **When:** 2026-10-23 15:45 IST
- **Who:** Claude Code for Aakash (approved by Aakash in chat)
- **What:** Installed Python 3.11.9 per-user with winget. Created `Backend/venv` and installed `Backend/requirements.txt` into it.
- **Why:** The laptop had no Python, so the backend and its tests could not run.
- **How:** `winget install --id Python.Python.3.11 --scope user`, then `python -m venv Backend/venv` and `pip install -r requirements.txt`.
- **Files:** `Backend/venv/` (local only, git-ignored)

### L-003 — `.gitignore` was hiding team docs and the reports the backend reads
- **When:** 2026-10-23 16:05 IST
- **Who:** Claude Code for Aakash
- **What:** Allow-listed `/features.md`, `/log.md`, `/Backend/outputs/*.md` and `/Backend/docs/*.md` in the root `.gitignore`.
- **Why:** The root rule `*.md` ignores every Markdown file except the READMEs. That meant (a) `features.md` and `log.md` would never be committed, and (b) `Backend/outputs/validation_report.md`, which `/model-info` parses at runtime, never reached a clone, so `/model-info` returned 500 on every machine except the one that generated it. `backtest_report.md`, `validation_audit.md` and `docs/DEPLOY.md` were lost the same way, and 8 backend tests fail without them.
- **How:** Added `!` exceptions below the Markdown rule. **Action for whoever has those generated reports locally (the report says Nitish built the model and backend): commit `Backend/outputs/*.md` and `Backend/docs/DEPLOY.md`.**
- **Files:** `.gitignore`

### L-004 — Risk map: ground-report escalation never applied; client field aliases
- **When:** 2026-10-23 16:10 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `compute_segment()` passed an undefined name (`level`) to `compute_segment_ground_truth()`. The `NameError` was swallowed by `except Exception: pass`, so **validated field reports never raised a segment's level on `/risk-map`, `/route-risk`, `/alerts` or the alert dispatcher**. Fixed to `risk_lvl`, and the swallowed error is now logged.
  2. `adjusted_risk_level` is now set only when reports actually escalate the level. The web dashboard (`toEffective`) adds +1 level whenever the field is non-empty, so sending it for every segment would have raised every segment by one step. `ground_report_count_24h` is now always an integer.
  3. Added `terrain_score` (alias of `terrain_percentile`), which both clients read. `r3d_mm` now mirrors `rain_mm_3d` when `PER_SEGMENT_WEATHER=false` (it is the same 3-day total; the app read `undefined` before). Fields that only the hourly feed provides (`rain_24h_mm`, forecasts, peaks) are still `null` in that mode.
- **Why:** The ground-truth flywheel is a headline feature in the project report, and it was silently off. The clients read fields the backend didn't send.
- **How:** Edited `compute_segment`. Updated `test_per_segment_weather_flag_off` for the deliberate `r3d_mm` change, and added regression tests.
- **Files:** `Backend/app/risk_service.py`, `Backend/app/models.py`, `Backend/tests/test_weather_upgrade_task1.py`

### L-005 — `/route-risk` returned HTTP 500 for Hindi and for restricted closures; `POST /trip-planner` added
- **When:** 2026-10-23 16:15 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. With `depart_time` set, the planner's recommendation stayed a plain `dict`, but later code used attribute access (`.action`, `.action_en`). Result: **HTTP 500 for every `lang=hi` trip plan** (the app always sends `depart_time`) and for any route crossing a `one_way`/`restricted` closure. It is now wrapped in `TripRecommendation`. Two local `from app.models import TripRecommendation` lines were removed: they made the name function-local, which would have raised `UnboundLocalError`.
  2. `date` is now optional. When `depart_time` is given, the date is taken from the departure in IST. The app builds `date` with `toISOString()` (UTC), which is the previous day for departures between 00:00 and 05:30 IST.
  3. Added `POST /trip-planner` (JSON body `{origin, destination, depart_time, speed_kmph, lang, simulate_rain_mm}`). The web client calls it first and fell back to `/route-risk` after a 405. The README already listed it. It returns the same payload as `/route-risk`, through one shared `_route_risk()` function.
- **Why:** The trip planner is the main traveller feature, and it was broken in Hindi on the app.
- **How:** Refactored the endpoint body into `_route_risk()`. Added a `TripPlannerRequest` model. Added regression tests, and called the live server exactly as the app does.
- **Files:** `Backend/app/routes/risk.py`, `Backend/app/models.py`

### L-006 — `GET /closures` returns the shape both clients read
- **When:** 2026-10-23 16:20 IST
- **Who:** Claude Code for Aakash
- **What:** `/closures` now returns `{active_closures_count, closures: [...]}` instead of a bare list, and each closure (in `/closures`, `/admin/closure` and the `closure` object inside `/risk-map`) carries `segment_name`.
- **Why:** The web pages (`LiveMap`, `Alerts`, `Officials`) and the app (`ClosuresResponse`, Alerts tab, Officials) all read `.closures`, so closures never appeared on any screen. This is a **contract change**, not an additive one. The only list consumers were the backend's own workbench and one test, and both were updated.
- **How:** SQL `LEFT JOIN segments` for the name, plus a new `ClosuresListResponse` model.
- **Files:** `Backend/app/routes/closures.py`, `Backend/app/flywheel_service.py`, `Backend/app/models.py`, `Backend/app/static/index.html`, `Backend/tests/test_closures_and_flywheel_task5.py`

### L-007 — Field reports and report validation matched to the clients
- **When:** 2026-10-23 16:25 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `POST /admin/validate-report` accepts `{report_id, status: "verified"|"rejected", verified_by}` (what the web and app send) as well as the original `{decision, notes}`. Before this, **every Approve/Reject click in both Officials screens returned 422**.
  2. `GET /field-reports` items now have `status` in client words (`pending` / `verified` / `rejected`), `status_label` (the stored `Pending` / `Validated` / `Rejected`), `segment_id` and `reported_at`. Before this, the web Officials page never showed Approve/Reject buttons, because it checks `status === 'pending'`.
  3. `POST /field-report` also returns `id` and `segment_id`. The app tracks its reports by `res.id`, which was `undefined`.
  4. Backend workbench: the report list read `res.data.reports` from a bare list, so it was always empty. Fixed, and it now uses `status_label`.
- **Why:** Report moderation was completely broken from both frontends.
- **How:** A Pydantic `model_validator` maps the alias fields. Stored values are unchanged, so the flywheel and the CSV export still see `Validated`.
- **Files:** `Backend/app/routes/reports.py`, `Backend/app/models.py`, `Backend/app/static/index.html`

### L-008 — Subscriptions and alerts: web payload, whole-corridor subscriptions, privacy leak closed
- **When:** 2026-10-23 16:30 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `POST /subscribe` accepts the web payload `{phone_number, alert_channel: "sms"}`. `name` defaults to "Traveller" and `segment_id` defaults to `all`. Channel case is normalised (`sms` → `SMS`). `consent` still defaults to `false`; it is never assumed.
  2. `segment_id: "all"` is supported. The app passes `'all'` for "follow everything", which used to return 404. `/alerts` for such a token covers every segment, and the dispatcher checks every segment for it, with its own cooldown per segment.
  3. `GET /alerts` **without a token used to return the first subscriber's alerts** (dev fallback). It now returns a public corridor feed (`user_id: 0`, no subscriber data). `user_id` without a token is still 401. The app calls `/alerts` before anyone subscribes, so it now gets real corridor alerts.
  4. Alerts use the ground-report adjusted level, the same as the dispatcher.
- **Why:** The web subscribe call always failed with 422, and the old fallback exposed another person's subscription.
- **How:** Alert building moved into `_build_alert_item()`. The subscription lookup uses `LEFT JOIN`.
- **Files:** `Backend/app/routes/subscriptions.py`, `Backend/app/models.py`, `Backend/app/alert_dispatcher.py`

### L-009 — Priority list keys for both clients
- **When:** 2026-10-23 16:35 IST
- **Who:** Claude Code for Aakash
- **What:** `/priority-list` now also returns the same ranked list as `priority_list` (web) and `priority_segments` (app). Each item adds `segment_id`, `segment_name` and `hazard_risk_score`.
- **Why:** The web BRO Priority tab read `priority_list[].segment_name/hazard_risk_score`, and the app read `priority_segments`. Both showed empty lists.
- **How:** Additive keys only. `segments` is unchanged.
- **Files:** `Backend/app/consequence_service.py`, `Backend/app/routes/risk.py`, `Backend/app/models.py`

### L-010 — Offline pack fields for the app; ETag readable from the web
- **When:** 2026-10-23 16:40 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `/offline-pack` adds `hospitals[] {segment_id, segment_name, hospital_name, distance_km}` and a corridor-level `advisory_en`/`advisory_hi` (worst segment). Contacts may carry `description`. These are derived values, kept out of the ETag hash, which is unchanged.
  2. CORS now exposes `ETag`, `X-Offline-Pack-Version`, `X-TTS-Source` and `X-TTS-Lang`. Before this, the browser hid the ETag from the web dashboard (port 5173), so it could never use 304s.
- **Why:** The app's Emergency screen showed an empty hospital list and no advisory.
- **How:** Built from the existing consequence CSV and `i18n.build_subscriber_alert_message`. Nothing new is invented, and agency phone numbers stay blank as before.
- **Files:** `Backend/app/routes/risk.py`, `Backend/app/main.py`, `Backend/app/models.py`

### L-011 — `/model-info` no longer 500s without the report; back-test recall/F1 for the app
- **When:** 2026-10-23 16:45 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. If `outputs/validation_report.md` is missing (see L-003), `/model-info` now serves the committed `model/cv_report_static_v2.json` numbers (pooled AUC 0.767, block AUC 0.664, AP 0.533, top-20 % capture 0.430). Spearman and the bootstrap CIs exist only in the full report, so they come back as `null` with a note, not estimated. Adds `metrics_source`, `coefficients_source` and `notes`. When the report exists, the output is the same as before.
  2. `/backtest-summary` adds `metrics.recall`, `precision`, `f1_score` and `headline_tier` from the stored High-tier row (recall 0.417, precision 0.357, F1 0.385). The app's About screen showed "NaN%". The summary is still flagged `synthetic_mode: true`.
- **Why:** The app's About screen calls both endpoints.
- **Files:** `Backend/app/model_info.py`, `Backend/app/models.py`, `Backend/app/routes/risk.py`

### L-012 — Request-logging middleware crashed file routes
- **When:** 2026-10-23 16:50 IST
- **Who:** Claude Code for Aakash
- **What:** `GET /`, `/manifest.json` and `/sw.js` raised `RuntimeError: Unexpected message received: http.request`. The workbench page and the PWA files didn't load.
- **Why:** The middleware replaced `receive` with a function that always returned `http.request`. With the pinned Starlette, `FileResponse` listens on `receive` for `http.disconnect`.
- **How:** Removed the re-binding. Starlette's `BaseHTTPMiddleware` already caches a body read in middleware and replays it to the endpoint. Checked that POSTed JSON bodies still arrive (security and contract tests pass).
- **Files:** `Backend/app/middleware.py`

### L-013 — Time machine no longer stores invented rainfall as real
- **When:** 2026-10-23 16:55 IST
- **Who:** Claude Code for Aakash
- **What:** When the Open-Meteo archive call fails, `/risk-map?as_of=` used a hash-based placeholder (15–85 mm), **wrote it to `data/backtest_cache/` and labelled it as real archive data**. That fake value would then be reused on every later replay. The placeholder is now never cached. Its segments get `rain_status: archive_replay_synthetic (...)`, and the response sets `is_simulated: true` and a `stale_warning`.
- **Why:** Honesty rules in the project report: heuristics must be labelled. I checked the existing cache files: the placeholder only produces whole numbers, and the committed values (for example 51.5 mm) are real.
- **Files:** `Backend/app/risk_service.py`

### L-014 — Test and setup fixes (corrects L-002)
- **When:** 2026-10-23 17:00 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. **Correction to L-002:** Python 3.11 cannot install the pinned `scipy==1.18.0` (it needs Python 3.12 or newer). Python 3.12.10 was installed the same way and `Backend/venv` was rebuilt with it. **The backend needs Python 3.12+**; the project report's "3.11+" is out of date. 3.11.9 is still installed and unused.
  2. Added `pandas==3.1.0` to `requirements.txt`. Two test modules and the scripts import it; the 48 h workflow already flagged it as missing.
  3. `tests/conftest.py` now calls `init_db()`. On a fresh checkout, 19 contract tests failed with "no such table", because a module-level `TestClient` never runs the lifespan.
  4. `test_per_segment_weather_flag_on`'s mock forecast was pinned to 2026-10-06, so it has failed since 2026-10-07. It is now anchored to the current hour.
  5. New `tests/test_frontend_contract_fixes.py` (21 tests) sends exactly what the web and the app send for every fix in L-004 to L-011.
- **Files:** `Backend/requirements.txt`, `Backend/tests/conftest.py`, `Backend/tests/test_weather_upgrade_task1.py`, `Backend/tests/test_frontend_contract_fixes.py` (new)

### L-015 — Verification of L-003 to L-014
- **When:** 2026-10-23 17:05 IST
- **Who:** Claude Code for Aakash
- **What / How:**
  - `pytest` (Python 3.12.10): **149 passed, 8 failed**. All 8 failures are missing generated files (`outputs/backtest_report.md`, `outputs/validation_report.md`, `outputs/validation_audit.md`, `docs/DEPLOY.md`; see L-003), not code. The first run on this fresh checkout, before the conftest, middleware and weather-test fixes in L-012 and L-014, gave 34 failures.
  - Live server (`python run.py`), called the way `Frontend/src/api/client.js` and `App/src/api/client.ts` call it (cross-origin from `http://localhost:5173`): **22/22 checks passed**, including the Hindi trip plan with a 01:30 IST departure (date corrected from the UTC 2026-10-23 to 2026-10-24), the web subscribe payload, report approve/reject with `{status}`, the ETag 304, `/model-info` (fallback) and `/voice-alert`.
  - The SQLite DB `Backend/data/landslide_nh7.db` did not exist before this session. The test runs created it and filled it with test rows, so it was deleted afterwards. The first `python run.py` reseeds it. Running the server also refreshes `data/rain_snapshot.json` and may add `data/tts_cache/*.mp3`, which is normal behaviour.
- **Not verified:** the web dashboard and the Expo app were not run against the fixed backend. The checks reproduce their requests from their source code.

### L-016 — `features.md` updated for L-003 to L-015
- **When:** 2026-10-23 17:10 IST
- **Who:** Claude Code for Aakash
- **What:** Endpoint table updated (`POST /trip-planner`, new `/closures` shape, client aliases). Added section 7 (changes at this event) and section 8 (11 client-side bugs in Frontend/ and App/ found during this work, for the web/app owner). Added run instructions (Python 3.12+).
- **Why:** `features.md` must stay the single place that says what exists. The client bugs belong to the web/app owner and weren't changed here.
- **Files:** `features.md`

### L-017 — Backend now reads `Backend/.env`; settings files created
- **When:** 2026-10-23 17:40 IST
- **Who:** Claude Code for Aakash (Aakash asked where to paste keys)
- **What:**
  1. `app/config.py` now loads `Backend/.env` at start-up. Before this, nothing read it: copying `.env.example` to `.env` silently did nothing, and every setting (admin key, Telegram token) had to be typed into the shell.
  2. Created `Backend/.env` with demo-ready values (`ADMIN_API_KEY=admin-dev-secret-key-nh7`, the value the web Officials page sends; `DRY_RUN=true`; empty Telegram and Twilio fields to paste into).
  3. Created `App/.env` with `EXPO_PUBLIC_API_URL=http://172.168.11.111:8000` (this laptop's Wi-Fi address at the time; it changes with the network).
  4. `.env.example`: `BACKTEST_ENABLED` changed from `false` to `true`. Copying the old example turned off the time machine that both apps use.
- **Why:** One file to paste keys into, instead of shell commands every time.
- **How:** A small reader with no new dependency. Variables already set in the shell win. It is skipped under pytest, so a real Telegram token with `DRY_RUN=false` can never send messages during tests. Both `.env` files are git-ignored by the root `.env` rule.
- **Verified:** `config.ADMIN_API_KEY` is loaded from the file. Full test suite unchanged: 149 passed, 8 failed (the missing reports from L-003). The test-created database was deleted again afterwards.
- **Files:** `Backend/app/config.py`, `Backend/.env.example`, `Backend/.env` (new, git-ignored), `App/.env` (new, git-ignored)

### L-018 — Live Telegram bot switched on (@Jarvis_raah_bot)
- **When:** 2026-10-23 17:55 IST
- **Who:** Claude Code for Aakash (Aakash supplied the BotFather token in chat)
- **What:** `Backend/.env`: `TELEGRAM_BOT_TOKEN` set (the value is not recorded here), `ENABLE_TELEGRAM_BOT=true`, `DRY_RUN=false`.
- **Why:** The 30 h plan uses Telegram as the one live alert channel (an ALARM sends one Telegram message). Bot replies go through the same notifier, so with `DRY_RUN=true` the bot would only print its replies.
- **How / safety:** `getMe` confirms the token is valid (`@Jarvis_raah_bot`). With `DRY_RUN=false`, SMS and WhatsApp still don't send, because Twilio keys are empty (the notifier falls back to printing). The 3 seed subscribers are WhatsApp/SMS/email, so no real person is messaged. The token lives only in the git-ignored `Backend/.env`. **If this token is ever shared outside the team, revoke it in @BotFather (`/revoke`) and paste the new one.**
- **Not verified yet:** a full `/start` → reply round trip through the running server.
- **Files:** `Backend/.env`

### L-019 — Telegram bot round trip verified (follows L-018)
- **When:** 2026-10-23 16:18 IST (time shown in Telegram)
- **Who:** Aakash tested it; Claude Code recorded it
- **What:** With the backend running from `run.py`, @Jarvis_raah_bot answered `/start` (command list), `/subscribe seg_05` ("Successfully subscribed … Devprayag to Teen Dhara (seg_05)") and `/status` (usage hint; a segment argument is required, e.g. `/status seg_05`).
- **Why:** Closes the open item in L-018. The live alert channel in the 30 h plan works end to end on the demo laptop.
- **Files:** none (verification only)

### L-020 — Telegram `/route` said "LOW RISK" when the route was Moderate
- **When:** 2026-10-23 16:20 IST
- **Who:** Claude Code for Aakash (Aakash spotted it in a live bot reply at 16:19)
- **What:** `/route Rishikesh Joshimath` replied "Max Risk: Moderate … Recommendation: LOW RISK – proceed with caution". The bot used its own rule: it only warned at High or above, and it ignored one-way/restricted closures. It now uses the same tiers as `/route-risk`: closed → AVOID; High/Very High → CAUTION / DELAY; Moderate, or a one-way/restricted stretch → CAUTION; otherwise LOW RISK.
- **Why:** The bot and the dashboards gave different advice for the same route. Under-warning is the unsafe direction.
- **How:** Edited the recommendation branch in `handle_telegram_command`. Added 5 parametrised regression tests.
- **Files:** `Backend/app/bot/telegram_bot.py`, `Backend/tests/test_frontend_contract_fixes.py`
- **Note:** The running server must be restarted (Ctrl+C, then `run.py`) to pick this up.

### L-021 — Incident: test run wiped the live demo database; tests now use their own DB
- **When:** 2026-10-23 16:21 IST
- **Who:** Claude Code (the mistake and the fix), for Aakash
- **What happened:** While Aakash's server was running, I ran the test suite and then deleted `data/landslide_nh7.db`, as I had done when no server was running (L-015, L-017). The tests share that file and delete subscriptions and reports (`DELETE FROM subscriptions WHERE id > 4`), and then the file was gone. Effect: the running server returned HTTP 500 on DB-backed endpoints for about 1 minute, and **Aakash's Telegram subscription to seg_05 was lost**.
- **Recovery:** Ran `init_db()` to recreate and reseed the file. The running server recovered without a restart (`/closures` and `/risk-map` returned 200). Aakash must send `/subscribe seg_05` again.
- **Fix:** `tests/conftest.py` sets `DB_PATH` to `data/test_landslide_nh7.db` before `app` is imported. Checked: after a full test run, the live DB still has its 3 seed reports and 3 seed subscriptions, and the deletions landed only in the test DB. Both `.db` files are git-ignored. Tests: 154 passed, 8 failed (the missing reports from L-003).
- **Rule from now on:** never delete `data/landslide_nh7.db` while a server may be running.
- **Files:** `Backend/tests/conftest.py`

### L-022 — L-020 and L-021 verified live
- **When:** 2026-10-23 16:24 IST (time shown in Telegram)
- **Who:** Aakash tested it after restarting the server; Claude Code recorded it
- **What:** `/subscribe seg_05` succeeded again (subscription restored after L-021). The same `/route Rishikesh Joshimath` that said "LOW RISK" at 16:19 now says "Max Risk: Moderate … Recommendation: CAUTION - Moderate landslide risk or traffic restriction on route."
- **Files:** none (verification only)

### L-023 — VS Code tasks to install and run the whole stack
- **When:** 2026-10-23 16:35 IST
- **Who:** Claude Code for Aakash (Aakash asked to run everything from VS Code)
- **What:** Added `.vscode/tasks.json`. **Terminal → Run Task…** offers "Raah: install (first time)" (npm install for web and app, in parallel), "Raah: start all" (backend `run.py`, web `npm run dev`, app `npx expo start`, each in its own terminal), the three individual tasks, and "Raah: backend tests".
- **Why:** One click instead of three Command Prompt windows. The backend task calls `Backend\venv\Scripts\python.exe` directly, so the shell type (cmd vs PowerShell) no longer matters.
- **Note:** `.vscode/` is git-ignored by the root `.gitignore`, so this file stays on this laptop. Teammates who want it can copy it.
- **Files:** `.vscode/tasks.json` (new, local)

### L-024 — Raah Node backend: storage, endpoints, SENSOR_LOST hold, incident timing
- **When:** 2026-10-23 16:50–17:05 IST
- **Who:** Claude Code for Aakash (requested by Aakash's teammate: "develop the backend for the upcoming hardware, use mock data, we switch to live data later")
- **What:** New backend for the ESP32 slope-sensor node, following the 30 h plan's S1 packet and the 48 h workflow §4.4–4.5, §9, §14. The starter zips were not in the repo, so it was written fresh here.
  - `POST /node/reading` (contract v1 + v2; v2 fields optional, unknown fields ignored). `X-Node-Key` auth with the firmware's 503/401/422 meanings.
  - Node status ONLINE / STALE (15 s) / OFFLINE (120 s) / **SENSOR_LOST**: silent after WARNING/ALARM, held until `POST /node/ack/{id}` (admin key), and still held after a backend restart (rebuilt from the DB).
  - Late messages (`late:1`, or an NTP-valid `ts_ms` older than 15 s) are history only.
  - Incidents (WARNING+ episodes) with one-clock timing (F2): `POST /node/mark`, `GET /node/incidents` (mark → server, mark → ALARM, ALARM → alert sent, duration).
  - `GET /node/fleet` (status, health, delivery % from `seq`), `/node/latest`, `/node/history`, `/node/alerts`, `/node/marks`.
  - Node kinds from the id prefix: `SIM-` never escalates; `REPLAY…` and `MOCK-` escalate with "[REPLAY …]" / "[MOCK sensor data, not a real node]" in every reason.
  - `GET /node/placement` (F8): greedy choice with spacing. **Mock scores** (segment terrain percentile per vertex) until `data/point_scores.csv` exists; the response says `is_mock`.
  - 3 new SQLite tables (`node_readings`, `node_marks`, `node_incidents`) and 6 new settings (`NODE_API_KEY`, `NODE_STALE_S`, `NODE_OFFLINE_S`, `NODE_LATE_S`, `NODE_MARK_WINDOW_S`, `POINT_SCORES_CSV`). A random `NODE_API_KEY` was generated into `Backend/.env`; `.env.example` has a placeholder.
- **Why:** The plan's Gate A needs a node reading to reach the backend and flip the planner. F3 (a destroyed node must never look safe) and F2 (response time on one clock) are Must items.
- **Files:** `Backend/app/node_service.py` (new), `Backend/app/routes/node.py` (new), `Backend/app/placement.py` (new), `Backend/app/models.py`, `Backend/app/database.py`, `Backend/app/config.py`, `Backend/app/main.py`, `Backend/.env.example`, `Backend/.env` (local)

### L-025 — Node escalation wired into the regional system
- **When:** 2026-10-23 17:00 IST
- **Who:** Claude Code for Aakash
- **What:**
  - `/risk-map`: every segment carries `node_escalation`. WARNING raises `adjusted_risk_level` to at least High, ALARM to Very High, with the sensor reason in `adjustment_reason`. The time machine (`as_of`) ignores live sensors.
  - `/route-risk` and `POST /trip-planner`: a sensor ALARM (or SENSOR_LOST after one) → **AVOID** with the sensor reason; a WARNING → at least CAUTION. Official closures still win. `max_risk_level` now includes ground-report and sensor escalation. The advisory says "LIVE SENSOR ALARM …".
  - Telegram bot `/route`: AVOID with the sensor reason.
  - One sensor-alarm message per incident (first ALARM) to consenting subscribers of the segment or `all`, through the existing notifiers, logged in `alert_log`. Simulated nodes never message. The 10-minute dispatcher now uses the level before sensor escalation (`pre_node_risk_level`), so nobody gets a second message for the same alarm.
- **Why:** The plan's core chain: "tray tilts, planner flips, phone buzzes".
- **Files:** `Backend/app/risk_service.py`, `Backend/app/routes/risk.py`, `Backend/app/alert_dispatcher.py`, `Backend/app/bot/telegram_bot.py`, `Backend/app/models.py`

### L-026 — Mock data and fallback tools, live node page, docs
- **When:** 2026-10-23 17:05 IST
- **Who:** Claude Code for Aakash
- **What:**
  - `Backend/tools/mock_node.py`: a fake node posting contract-v2 readings with the firmware's rules (thresholds, wet-soil 60 %, 30 s tilt rate, two-stage impact, outbox with `late`). Scenarios: calm, creep, alarm, impact, wet, lost, outage, demo. Ids start with `MOCK-`.
  - `mark_event.py` (ENTER = mark), `replay_session.py` (recorded run as REPLAY1, backup demo F4), `serial_bridge.py` (USB serial fallback; `--file --dry-run` without hardware), `sim_fleet.py` (labelled SIM- fleet, F15), and shared `_common.py`.
  - `app/static/node_live.html`: the plan's fallback live screen (node cards, SENSOR LOST with a release button, planner answer, tilt/vibration chart, incident timings, mark button). After the first look, offline nodes show "OFFLINE · last state ALARM" instead of a big red ALARM, and the planner panel follows the escalating/online node.
  - `Backend/docs/NODE_API.md`: guide for the hardware and dashboard teammates (contract, firmware error codes, endpoints, how to go live).
  - `.vscode/tasks.json`: "Raah: mock node (pick scenario)" and "Raah: mark event".
- **Why:** "Use the mock data; afterwards we will update to the live data." Going live needs no backend change: flash the same key and a non-mock node id.
- **Files:** `Backend/tools/*.py` (new), `Backend/app/static/node_live.html` (new), `Backend/docs/NODE_API.md` (new), `.vscode/tasks.json` (local)

### L-027 — Two operational findings while testing live
- **When:** 2026-10-23 17:10 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. **Editing `Backend/.env` needs a backend restart.** Uvicorn's auto-reload watches code only. The running server kept answering 503 (no node key) until a reload; I triggered one by touching `app/node_service.py` (no content change).
  2. **"localhost" costs about 2 s per request on this Windows laptop** (it tries IPv6 first): measured 2054 ms vs 13 ms for `127.0.0.1`. The mock node was posting every ~2 s instead of every second. All tools now default to `http://127.0.0.1:8000`. The ESP32 uses the LAN IP and browsers are unaffected.
- **Files:** `Backend/tools/_common.py`

### L-028 — Verification of L-024 to L-027
- **When:** 2026-10-23 17:13 IST
- **Who:** Claude Code for Aakash
- **What / How:**
  - New `tests/test_node_backend.py`: **22 tests pass** (auth codes, v2 fields, map/planner/bot escalation, SENSOR_LOST hold beyond 10 min and release, restart survival, late messages, delivery %, SIM/REPLAY/MOCK labelling, one message per incident, no dispatcher double message, mark auth, placement mock and CSV, CSV parser, live page). Full suite: **176 passed**, 8 failed (only the missing generated reports from L-003).
  - Live, against Aakash's running server, on seg_08 (not seg_05, so no test Telegram reached Aakash's phone): `mock_node --scenario lost` → ALARM → planner **AVOID** "[MOCK …] Live slope sensor MOCK-NODE8 reports ALARM on seg_08"; 29 s after silence → **SENSOR_LOST** and planner still AVOID ("went silent 29 s after reporting ALARM. Holding the alert…"); incident linked to the auto-mark (mark → server 7.2 s, mark → ALARM 12.4 s at 2× speed); release with the admin key → back to Moderate. `--scenario outage` → 51 of 60 delivered (85 %), 11 late readings recovered, live state unaffected. `--scenario impact` → ALARM, then the incident closed when calm.
  - Live page checked in the browser.
- **Left in the live DB:** test nodes MOCK-NODE8 (released, offline) and MOCK-NODE9 (calm, offline) on seg_08/seg_09, labelled MOCK DATA. Harmless; they stay in `/node/fleet` as OFFLINE.
- **Not verified:** a real ESP32 (none yet), and `serial_bridge.py --port` with real hardware.

### L-029 — Full demo on seg_05 with a real Telegram alarm; live-page border fix
- **When:** 2026-10-23 17:24 IST
- **Who:** Aakash asked for it and watched it; Claude Code ran it and recorded it
- **What:** `mock_node.py --scenario demo --segment seg_05 --auto-mark` against the running server: 120/120 readings delivered; WARNING at ~39 s (slow creep tripped the rate rule), ALARM after the fast lift; planner seg_04 → seg_06 **AVOID** with the mock-labelled sensor reason; **Telegram sensor alarm sent to Aakash's subscription, 1.6 s after the ALARM reached the server** (incident #4, `alert_channel=telegram`); the node went silent; Aakash entered the admin key on the live page and clicked "Site checked (release)" → node STALE "last state ALARM (site checked)", planner back to Moderate. Mark → server was 25.2 s because the automatic mark sits at the start of the slow creep, not at the alarm. Expected for this scenario.
- **Fix:** released and offline node cards on `node_live.html` kept a red border that looked like a live alarm. The border is now grey unless the node is ONLINE (state colour) or SENSOR_LOST (purple).
- **Files:** `Backend/app/static/node_live.html`

### L-030 — Web dashboard: Sensors page, header sensor pill, level fix
- **When:** 2026-10-23 17:20–17:33 IST
- **Who:** Claude Code for Aakash (Aakash asked: "make frontend for this also"). This is S2's area in the team plan; the S2 teammate should review it.
- **What:**
  1. **New page `/sensors`** (`Frontend/src/pages/Sensors.jsx`, nav item "Sensors / सेंसर"):
     - node cards with MOCK DATA / REPLAY / SIMULATED labels, status pill and health line;
     - ALARM / WARNING / **SENSOR LOST** banner with the backend's sensor reason;
     - the map flies to the active node's stretch, shows node dots (state colour, purple when lost) and optionally the proposed node sites (labelled mock);
     - the trip planner's answer for the stretch (AVOID / CAUTION / level) and a 5-minute tilt/vibration chart;
     - the incident table with mark → server, mark → ALARM, ALARM → alert on the laptop clock;
     - "Mark event now" and "Site checked (release)" (the key is shared with the Officials page via `localStorage` `admin_key`);
     - "Enable voice": speaks Hindi (if the browser has a Hindi voice) then English on a new ALARM or SENSOR LOST, saying "test data" for mock nodes;
     - full Hindi labels.
     Polls `/node/fleet` and `/node/incidents` every 2 s.
  2. **Header sensor pill** on every page (`Layout.jsx`, polls `/node/alerts` every 5 s): red ALARM, orange WARNING or purple SENSOR LOST, linking to `/sensors`. It shows the segment and "(mock)" on wide screens and stays on one line on narrow ones (first version wrapped to 4 lines; fixed).
  3. **Map levels now match the backend** (`adapters.js`, `features.md` §8 bugs #1 and #12, web part): `toEffective` uses the backend's level text (`adjusted_risk_level_en ?? adjusted_risk_level ?? risk_level_en ?? risk_level`) instead of recomputing from the score and adding +1 for any adjustment. `scoreToLevel` cut-offs changed from 0.80/0.60/0.35 to the backend's 0.75/0.50/0.25. A sensor ALARM now shows as Very High (red), not "base + 1". **Visible effect on every page:** stretch colours now match the backend (in today's dry weather most stretches show Moderate, yellow).
  4. API address configurable: `BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'`, now also used by `ListenButton` (it had its own hard-coded URL). `InteractiveMap` takes an optional `extraMarkers` prop (no effect on existing pages).
- **How verified:** `npm run build` succeeds (only a chunk-size warning; the test `dist/` was deleted afterwards). ESLint shows nothing new beyond the codebase's existing patterns (unused `React` import, as in every page). In the browser against the running backend with `mock_node --scenario lost` on seg_08: OK → ALARM (red banner, header pill, map seg_08 red, planner seg_07 → seg_09 **AVOID**, chart jump, incident row 1.41 s / 2.83 s) → **SENSOR LOST** (purple banner "went silent 19 s after reporting ALARM", release button) → clicked "Site checked (release)" with the dev admin key → "MOCK-NODE8 released", banner and pill gone. Hindi mode checked. Voice was not checked by ear.
- **Files:** `Frontend/src/pages/Sensors.jsx` (new), `Frontend/src/App.jsx`, `Frontend/src/components/Layout.jsx`, `Frontend/src/components/InteractiveMap.jsx`, `Frontend/src/components/ListenButton.jsx`, `Frontend/src/api/client.js`, `Frontend/src/api/adapters.js`, `features.md`

### L-031 — Web dashboard made responsive; scope set to web only
- **When:** 2026-10-23 17:35–17:41 IST
- **Who:** Claude Code for Aakash. Aakash: "we hadn't made mobile app, we are doing only for desktop as of now, just make the web page responsive".
- **Scope decision recorded:** no work on the Expo app (`App/`) at this event; the web dashboard is the product and must work on phones too. `features.md` updated where it said "app still to do".
- **What:**
  1. **Header** (`Layout.jsx`, all pages):
     - at 375 px it was 518 px wide (☰ cut off, "Simulate Rain" on two lines);
     - at 1215 px it was 8 px too wide, and at 1024 px the sensor pill covered "How it works".
     - Now: the full nav row only from 1280 px (`xl`), with labels on one line. Below that, the ☰ menu lists every page; from 1024 to 1279 px it also lists Map / Plan trip / Alerts / Report, because the bottom bar only exists below 1024.
     - "Simulate Rain" shows as an icon on phones and laptops. The logo tagline shows only on tablets and very wide screens. The sensor pill shrinks to the state ("ALARM" / "Lost") on phones.
  2. **Home page map was invisible on phones and tablets** (`LiveMap.jsx`): below 1024 px the map stacks above the details panel. It had no minimum height, so the panel took all the space and the map was **0 px tall**. Now `min-h-[60vh]` below `lg`. This is likely the "maps are not visible" Aakash reported earlier.
  3. **Sensors page** (`Sensors.jsx`): grid columns use `minmax(0, …)` so the incident table can't stretch the page (it was 586 px wide on a 375 px phone). Changes per width:
     - phones: 2 × 2 controls, 2 × 2 readings, incidents as cards instead of the 8-column table, smaller title and map;
     - below 1280 px: one column;
     - from 1280 px: two columns with the map.
- **How verified:** in the browser at 375, 768, 1024, 1280 and 1920 px, the page width equals the viewport width on all 9 pages (no sideways scroll). Visually checked:
  - Sensors at each width in its busiest states (ALARM, SENSOR LOST, with the header pill);
  - the home map at 375 px (map, road and details visible);
  - Plan trip at 375 px;
  - the ☰ menu at 1024 px lists all 9 pages.
  `npm run build` passes (test `dist/` deleted). My test node MOCK-NODE8 was released afterwards, so seg_08 is back to normal.
- **Not done:** the other pages were only checked for sideways scrolling and the two looks above, not redesigned for phones.
- **Files:** `Frontend/src/components/Layout.jsx`, `Frontend/src/pages/Sensors.jsx`, `Frontend/src/pages/LiveMap.jsx`, `features.md`

### L-032 — Backend: officials' "Alert All" broadcast (`POST /admin/alert-all`)
- **When:** 2026-10-23 17:45–18:33 IST (L-032 to L-037 are one piece of work)
- **Who:** Claude Code for Aakash. Aakash: "make it from user based to Official based … changing Alert me to Alert All".
- **Why:** the web dashboard is now for officials only. A citizen "Alert me" (subscribe) button makes no sense there; an official needs to push an alert to everyone already subscribed to a stretch.
- **What:**
  - New endpoint `POST /admin/alert-all` (admin key) with body `{segment_id: seg_01..seg_18 | all, message?: ≤ 600 chars}`.
  - For a stretch it sends to that stretch's consenting subscribers plus the whole-corridor (`all`) subscribers; for `all` it sends to every consenting subscriber.
  - With no message it builds one from the live level: "NH-7 OFFICIAL ALERT for {stretch}: current risk {LEVEL}. {sensor or report reason} Follow BRO / SDRF / police instructions. Emergency: 112".
  - Each send is written to `alert_log` with level `OFFICIAL BROADCAST`. The reply has recipients / sent / failed, counts per channel, and `dry_run`.
- **How:** new models `AlertAllRequest` / `AlertAllResponse`; the route reuses the existing notifiers (`get_notifier`) and `verify_admin_key`. It does not touch the 10-minute dispatcher's "only when the level rises" rule.
- **How verified:** 3 new tests in `tests/test_officials_console.py` (stretch + corridor subscribers, custom message to `all`, 422 for a bad stretch and 401 without the key). Full suite: 179 passed; the same 8 failures as before (missing generated reports).
- **Files:** `Backend/app/models.py`, `Backend/app/routes/subscriptions.py`, `Backend/tests/test_officials_console.py` (new)

### L-033 — Frontend: all Hindi removed
- **When:** 2026-10-23 17:45–18:33 IST
- **Who:** Claude Code for Aakash ("Remove Hindi from the frontend, all traces of it").
- **What:**
  - Deleted `Frontend/src/store/langStore.jsx` (the Hindi/English context) and its `LangProvider` in `main.jsx`.
  - Removed the language toggle and every Hindi label: nav items, header, `RiskBadge` (`labelHi` / `verdictHi`), `segments.js` (`nameHi` for stretches and towns), map tooltips, and the Sensors, Report, Officials, Alerts, Emergency, PlanTrip and About pages.
  - The API calls no longer send `lang` (`fetchRiskMap`, `fetchRouteRisk`, `postTripPlanner`, `getVoiceAlertUrl`); the backend defaults to English. The voice button and the Sensors voice are English only.
  - The Devanagari Google font was removed from `index.html` and from `--font-condensed` in `index.css`.
- **Not changed:** the backend still supports Hindi (`/risk-map?lang=hi`, the Telegram bot's `/lang`), because the bot and SMS still serve the public.
- **How verified:** searched `Frontend/src`, `index.html`, `README.md` and `public/` for Devanagari characters, `labelHi`, `nameHi`, `useLang`, `LangCtx`, "Hindi" and "Devanagari": no matches. In the browser, the rendered text of the How it works page has no Devanagari characters.
- **Files:** `Frontend/src/main.jsx`, `Frontend/src/store/langStore.jsx` (deleted), `Frontend/src/components/{Layout,RiskIcon,InteractiveMap,ListenButton}.jsx`, `Frontend/src/data/segments.js`, `Frontend/src/api/{client,adapters}.js`, `Frontend/src/pages/*.jsx`, `Frontend/index.html`, `Frontend/src/index.css`, `Frontend/README.md`

### L-034 — Frontend: the dashboard is now the officials' console (Admin page, Alert All)
- **When:** 2026-10-23 17:45–18:33 IST
- **Who:** Claude Code for Aakash ("remove official button and the admin section is opened instead now this entire frontend is for admin/official").
- **What:**
  1. **Header:** the "Officials" button is gone; **Admin** is a normal nav item (shield icon). The subtitle reads "Officials' control console" and the page title reads "Raah · NH-7 Officials Console". `/officials` redirects to `/admin`.
  2. **Admin page** (`Officials.jsx`, rewritten) with **no login screen**. Tabs:
     - **Reports:** Verify / Reject;
     - **Closures:** declare a closure, one-way or restriction (stretch, status, source, reason) and Reopen;
     - **Broadcast:** Alert All for one stretch or the whole corridor, with an optional message;
     - **BRO Priority:** the priority table.
     The key field at the top lets an official override the key (saved in `localStorage` `admin_key`).
  3. **Admin key:** every admin call uses `getAdminKey()`: `localStorage` `admin_key` first, otherwise `VITE_ADMIN_API_KEY` from `Frontend/.env` (git-ignored; dev value same as `ADMIN_API_KEY` in `Backend/.env`). `.env.example` has `change-me`. The old on-screen demo-key hint is gone (`features.md` §8 #5).
     **Security note:** a `VITE_` value is built into the page JavaScript. Anyone who can open the dashboard can read the key, so run it only on control-room machines and set a real key before any shared deployment.
  4. **Map → Alert All:** the stretch panel's "Alert me" link is now an **Alert All** button. It asks for confirmation, calls `POST /admin/alert-all`, and shows "Alert sent to N of M subscribers", "Test mode (DRY_RUN)" or "Nobody is subscribed to this stretch yet".
- **How verified:**
  - In the browser: the header has no Hindi and no Officials button, and `/officials` opens `/admin`. All four Admin tabs render.
  - Declared a one-way closure on seg_08 from the Closures tab; the toast and list showed it. It was then lifted through `DELETE /admin/closure/1`, so none remain.
  - Alert All on seg_02 returned "sent to 0 of 0 subscribers, nobody is subscribed" (the key was accepted).
  - At 375 px the Admin page has no sideways scroll.
  - Note: on the first open, the Admin page body looked blank for a moment while it was loading; it filled in after a few seconds.
- **Files:** `Frontend/src/components/Layout.jsx`, `Frontend/src/App.jsx`, `Frontend/src/pages/Officials.jsx`, `Frontend/src/pages/LiveMap.jsx`, `Frontend/src/api/client.js`, `Frontend/.env` (new, git-ignored), `Frontend/.env.example`

### L-035 — Frontend: officials verify field reports on the Reports page
- **When:** 2026-10-23 17:45–18:33 IST
- **Who:** Claude Code for Aakash ("in report section make it so that officials can verify the reports like a button").
- **What:**
  - Each **pending** report card has **Verify** and **Reject** buttons (`POST /admin/validate-report`, `verified_by: Control room`). Decided cards show the decision note instead.
  - The header shows "N awaiting verification".
  - The right column was renamed "What verification does": it raises the stretch's risk, the effect fades over 48 h, and rejected reports change nothing.
  - The fake likes/comments counters were removed.
  - **Fixed:** the status pill compared with `validated`, which the API never sends (it sends `verified`), so verified reports never showed as verified.
  - **Same bug fixed in `PastEvents.jsx`** (`features.md` §8 #4): verified reports showed as "Closed" instead of "Resolved".
- **How verified:** created test report #4 ("UI TEST (delete me)", seg_07) through the API and clicked Reject on the Reports page. The backend shows `status=rejected` with "Rejected by Control room". The report is still in the list (rejected reports have no effect). `npm run build` passes after the PastEvents fix.
- **Files:** `Frontend/src/pages/Report.jsx`, `Frontend/src/pages/PastEvents.jsx`

### L-036 — Frontend: Sensors page redesigned around all four Raah Node sensors
- **When:** 2026-10-23 17:45–18:33 IST
- **Who:** Claude Code for Aakash ("sensor section is fine except a need of UI improvement, and make sure it takes all of the sensor data (rain, tilt, soil moist and vibration sensor) as mentioned in the PDF").
- **What (from the 48-hour workflow PDF and the firmware thresholds):**
  - **Four sensor tiles** for the chosen node, each with a value, a gauge with threshold ticks, a 5-minute sparkline and its own level:
    1. **Tilt (MPU6050):** angle (WATCH 2°, WARNING 5°, ALARM 8°) plus the tilt rate (WARNING 3, ALARM 8 °/min);
    2. **Vibration:** peak and RMS g (`health.vib_rms_g`; WARNING 0.10 g RMS, impact 0.35 g peak) and the strike count;
    3. **Soil moisture:** % with the 70 % saturation line and a note that saturation multiplies the tilt thresholds by 0.6;
    4. **Rain plate:** WET / DRY (wet → WATCH).
  - Health strip (RSSI, uptime, heap, RTT, outbox, delivery %).
  - Fleet summary cards: Online, Alerting, Sensor lost, Stale/offline.
  - Clickable alert banners and a node picker.
  - Incidents as a table on wide screens and as cards on phones.
  - Map with node dots and proposed sites, and the trip planner's answer for the stretch.
  - Mark event and Site checked (release) use the admin key automatically.
- **Fixed during testing:** after switching nodes, the tilt gauge kept the previous node's red bar, because its CSS transition never finished in a background pane. The transition was removed, and the readout is keyed by node.
- **How verified:** ran the mock `wet` scenario on seg_08 (MOCK-NODE8). All four tiles showed live values: moisture 82 % lowered the thresholds, and ALARM came from a 5.5 °/min tilt rate. At 375 px there is no sideways scroll. MOCK-NODE8 was released afterwards (`POST /node/ack/MOCK-NODE8`, now OFFLINE).
- **Files:** `Frontend/src/pages/Sensors.jsx`

### L-037 — Frontend: "How it works" rewritten for officials
- **When:** 2026-10-23 17:45–18:33 IST
- **Who:** Claude Code for Aakash ("how it works can be updated").
- **What:** `About.jsx` is now "How the Raah console works". It covers:
  - what feeds a stretch's level: the terrain model (AUC 0.664, a ranking), rainfall, sensor nodes, verified reports, closures;
  - the four node sensors and their thresholds;
  - the alarm flow (reading → ALARM → map/planner AVOID → one Telegram message → SENSOR LOST hold until release);
  - a six-step control-room shift routine;
  - honest limits;
  - links to Map, Sensors and Admin, and Emergency 112.
  `Frontend/README.md` was updated to the officials-only, English console.
- **How verified:** page renders; no sideways scroll at 375 px; no Devanagari text.
- **Files:** `Frontend/src/pages/About.jsx`, `Frontend/README.md`

### L-038 — Raah Node: live data from the wired hardware (USB auto-connect, raw values, firmware)
- **When:** 2026-10-23 18:40–19:20 IST
- **Who:** Claude Code for Aakash. Aakash: "we have connected the hardware now I just want you to update the backend to get live data from hardware whenever we connect it". Wiring from the team diagram:
  - MPU6050 on GPIO21/22;
  - LM393 soil moisture AO on GPIO34 (dry 4095, wet ~1250);
  - LM393 rain plate AO on GPIO35 (dry 4095, wet ~2400);
  - traffic light G26 / Y27 / R33;
  - active buzzer on GPIO25.
- **Why:** the backend could only take finished readings (state + percentages) over Wi-Fi, or USB through a manual `serial_bridge.py` command, and pyserial was not installed. The wired boards give raw ADC values, and no firmware for this wiring was in the repo.
- **What:**
  1. **Automatic USB ingest** (`app/serial_ingest.py`, new; started in `app/main.py`):
     - every 3 s it looks for an ESP32 USB chip (CP210x, CH340/CH9102, FTDI, Espressif), opens it at 115200 with DTR/RTS released so the board is not reset, and feeds each line into the same path as Wi-Fi (new `node_service.ingest`): map, planner, incidents, Telegram, SENSOR_LOST;
     - unplugging goes back to searching, and plugging in reconnects;
     - it reads JSON lines and the older CSV lines;
     - a line marked `"posted":1` (already delivered over Wi-Fi) is counted, not stored twice;
     - boot / NET / CAL lines are kept for debugging.
     Settings: `NODE_SERIAL=auto|COMx|off` (never opens a port under pytest), `NODE_SERIAL_BAUD`, `NODE_SERIAL_NODE_ID`, `NODE_SERIAL_SEGMENT`.
  2. **New endpoints:**
     - `GET /node/serial`: link state, port, chip, counters, last error, recent board lines;
     - `POST /node/serial/pause` and `/resume` (admin key): free the port for flashing or the Arduino Serial Monitor.
  3. **Raw values accepted** (`app/node_sensors.py`, new; `NodeReading` in `models.py`):
     - `soil_raw` / `rain_raw` (0–4095) → `moisture_pct` / `rain_pct` / `rain_wet` with the bench calibration (`NODE_SOIL_*_RAW`, `NODE_RAIN_*_RAW`; wet at ≥ 50 %);
     - raw `ax_g / ay_g / az_g` → `tilt_deg` measured from the first reading;
     - a missing `tilt_rate_dpm` is computed from the last ~10 s, and a missing `strikes_10s` from the last 10 s.
     - **`state` is now optional:** without it the server applies the firmware thresholds (the same numbers as `tools/mock_node.py`) and reports `state_source: "server"`. A state sent by the node still wins. `state` may be `"alarm"` or `0`–`3`.
     - Raw values and `state_source` are stored with the node's health and shown in `/node/fleet`.
  4. **Firmware** `Hardware/raah_node/raah_node.ino` (new, no extra libraries):
     - MPU6050 read directly at 100 Hz; tilt measured from a 2 s still calibration at boot (`ZERO` command re-zeroes);
     - vibration peak/RMS, tilt rate, strikes, soil and rain ADC averaged, the same state rules plus a 5 s hold;
     - a dead MPU reports at least WATCH;
     - lights: green OK, yellow blinking WATCH, yellow WARNING, red + buzzer ALARM;
     - one JSON reading per second on USB, and over Wi-Fi on a separate core when `WIFI_SSID` is set.
  5. `tools/serial_bridge.py`: `--port auto`, JSON lines, the same parser as the backend; it is now only for a board plugged into a different laptop.
  6. `pyserial==3.5` installed in the venv and added to `requirements.txt`; `.env.example` lists the new settings.
  7. **Sensors page:** shows the raw ADC under soil and rain and "state decided by the backend / the node". Soil and rain are labelled LM393 instead of "capacitive" (also on How it works).
- **How verified:**
  - 14 new tests in `tests/test_node_hardware.py`:
    - calibration end points;
    - raw-only reading → percentages and server state;
    - wet plate / saturated soil;
    - server ALARM gives AVOID on `/risk-map`;
    - node state wins, and lowercase / number states;
    - tilt rate 20 °/min and strike count;
    - accelerometer tilt of 10°;
    - parser kinds; USB defaults, Wi-Fi duplicate skip and counters;
    - USB ALARM sends one sensor alarm;
    - a full reader-thread session over pyserial's `loop://` port;
    - pause/resume needs the admin key.
    Full suite: 191 passed, the same 8 known failures (missing generated reports).
  - On the running backend: `GET /node/serial` showed `searching`. No board was plugged into this laptop, so there were no COM ports.
  - A raw-only reading posted as `MOCK-HWTEST` on seg_08 (soil 3100, rain 4080) came back with moisture 35 %, state OK, `state_source: server`, and the Sensors page showed "ADC 3100" / "ADC 4080 · 1% wet". MOCK-HWTEST stays in the fleet as an OFFLINE mock node.
  - `npm run build` passes.
- **Not verified:** the firmware was **not compiled or run** (no Arduino toolchain on this laptop), and no real board has connected yet. The first USB session on the real node is the test.
- **Files:** `Backend/app/serial_ingest.py` (new), `Backend/app/node_sensors.py` (new), `Backend/app/node_service.py`, `Backend/app/models.py`, `Backend/app/routes/node.py`, `Backend/app/main.py`, `Backend/app/config.py`, `Backend/requirements.txt`, `Backend/.env.example`, `Backend/tools/serial_bridge.py`, `Backend/tests/test_node_hardware.py` (new), `Backend/docs/NODE_API.md`, `Hardware/raah_node/raah_node.ino` (new), `Frontend/src/pages/Sensors.jsx`, `Frontend/src/pages/About.jsx`, `features.md`

### L-039 — First real board got HTTP 401: firmware config moved to `secrets.h`
- **When:** 2026-10-23 21:15–21:31 IST
- **Who:** Claude Code for Aakash. Aakash: "my friend flashed this code but the backend is giving 401". The team had flashed its own quick sketch (node `TEST1`, posting every 2 s to `http://10.68.89.10:8000/node/reading` over the "realme 12 Pro+ 5G" hotspot).
- **Why it failed (all from that sketch, no backend bug):**
  1. **401:** it sent no `X-Node-Key` header. The 401 also proves the board reached the backend over the hotspot.
  2. Once the key was added it would have got **422**, for three reasons:
     - no `segment_id`;
     - states `NORMAL` / `CRITICAL`, which are not OK / WATCH / WARNING / ALARM;
     - `soil` / `rain` are not field names the backend knows, so they would have been dropped. The raw names are `soil_raw` / `rain_raw`.
  3. The MPU6050 (tilt, vibration) was never read.
- **What:**
  - `Hardware/raah_node/raah_node.ino` now reads Wi-Fi name/password, `SERVER_URL` and `NODE_KEY` from `secrets.h` in the same folder.
  - `secrets.example.h` is the committed template.
  - `secrets.h` was created with the hotspot settings and this laptop's `NODE_API_KEY` (read from `Backend/.env`, not printed). The root `.gitignore` now ignores `Hardware/**/secrets.h`, so the Wi-Fi password and key are not shared with the code.
  - `Wire.requestFrom(MPU, (uint8_t)6)` uses the overload every ESP32 core has.
  - `NODE_API.md` §2 updated.
- **Things to check on the day:**
  - this laptop was on another network (172.168.11.111), so 10.68.89.10 is the backend laptop's address on the hotspot; if that laptop gets a new address, update `SERVER_URL`;
  - if the backend at 10.68.89.10 is a different laptop, its `Backend/.env` `NODE_API_KEY` must equal `NODE_KEY` in `secrets.h` (restart the backend after editing `.env`);
  - the node reports as `NODE1` on `seg_05`, whose Telegram subscriber (Aakash) gets a message on a real ALARM.
- **How verified:** re-read the sketch for compile problems (types declared before the first function, so the Arduino IDE's generated function headers are safe; overloads; format strings). **Not compiled** (no Arduino toolchain here) and not yet flashed.
- **Files:** `Hardware/raah_node/raah_node.ino`, `Hardware/raah_node/secrets.example.h` (new), `Hardware/raah_node/secrets.h` (new, git-ignored), `.gitignore`, `Backend/docs/NODE_API.md`

### L-040 — `frontend.md`: client-facing feature list for the five traveller pages
- **When:** 2026-10-23 21:40–21:55 IST
- **Who:** Claude Code for Aakash. Aakash: "make an md file called frontened.md which should contain features only for clients/users … MAP, trip plan, alerts, reports, emergency pages only". Named `frontend.md` (spelling corrected, as with `features.md`).
- **Why:** the team wants a client view limited to Map, Plan trip, Alerts, Reports and Emergency, and needs a document describing what travellers get.
- **How:**
  - A sub-agent read `LiveMap.jsx`, `PlanTrip.jsx`, `Alerts.jsx`, `Report.jsx` and `Emergency.jsx` (with `client.js`, the adapters, components and backend routes) and listed every visible section and action, with its data source.
  - I spot-checked its claims against the code: the fixed `12°C`, Alerts' `severe || 2` fallback and fixed phone `+919876543210`, the pre-filled km `62`, and the hard-coded 1090 / 0135-2744064 numbers.
  - Only features that really work are described as features.
- **What:** `frontend.md` (root, new) covers:
  - the five pages and what each is for, and the risk levels and colours;
  - per-page features written for travellers;
  - the "not an official warning / Emergency 112" note;
  - a list of what must stay out of the client view (Admin, Sensors, Past events, How it works, Alert All, Verify/Reject, Simulate Rain, Live Fetch, Time Machine, sensor pill, admin key);
  - a final **"Team notes: fix before showing to clients"** section listing the placeholders found. Highlights:
    - Alerts shows invented counts and fixed timestamps;
    - "Enable Notifications" subscribes a hard-coded demo phone number without consent;
    - Reports has non-working photo upload and a default Srinagar location;
    - Emergency numbers other than 112 are typed into the page and are unverified (the backend leaves them blank on purpose);
    - the disclaimer appears only on How it works.
- **Not changed:** no code. The web app is still the officials' console (L-034); building the separate client view and fixing the team notes are open.
- **Files:** `frontend.md` (new)

### L-041 — UI design: traveller Map page (desktop + phone)
- **When:** 2026-10-23 21:58–22:20 IST
- **Who:** Claude Code for Aakash ("make a ui image for the page map first").
- **What:** a design canvas, "Raah traveller Map page" (private claude.ai artifact https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi), with two artboards: desktop at 1440 × 900 and phone at 390 × 844.
  - **Navigation:** only the five client pages (Map, Plan trip, Alerts, Reports, Emergency), plus a "Call 112" button. Nothing official appears: no Simulate Rain, Alert All, admin or sensor pill.
  - **Map:**
    - the NH-7 road drawn through the 18 real stretches in order, Rishikesh → Joshimath, coloured by risk;
    - warning badges on High and Severe stretches, and the selected stretch highlighted;
    - status pill, zoom / fit / map-style controls and the risk legend.
  - **Stretch panel** (a bottom sheet on phone):
    - verdict, Listen button, "why it is risky" bars, and rainfall for the last 24 h and next 24 / 72 h;
    - "Check a trip on this road" and "Report a problem";
    - the "not an official warning · Emergency 112" line.
  - Desktop also shows the three "stretches needing attention today" cards.
  - Only features listed in `frontend.md` §1 are shown.
- **Design choices:** the app's own tokens (ink, granite, glacier, river, milestone yellow, the risk colours) and IBM Plex Sans / Condensed. Text on risk tints uses darker shades so it stays readable (WCAG 4.5:1), and touch targets are at least 44 px.
- **Sample data:** the risk levels, percentages and rainfall figures are illustrative (Sirobagarh → Rudraprayag shown as Severe), not live data. Stretch names and km values are real (`Frontend/src/data/segments.js`).
- **How:** the map geometry was generated by a scratch script (not in the repo). The look was not checked by screenshot.
- **Files:** none in the repo (design lives in the artifact); `log.md`

### L-042 — UI design: Map page for the mobile app (Android)
- **When:** 2026-10-23 22:25–22:45 IST
- **Who:** Claude Code for Aakash ("make same ui for app also for map page").
- **What:** two app screens (360 × 800, Android size) added to the same canvas, below the web designs:
  1. **App · Map:**
     - a full-screen map of NH-7, Kaudiyala → Joshimath, under a floating top bar (Raah + "112" call);
     - a Live / "5 High or Severe" chip, map-style and fit buttons, and a compact risk legend;
     - a peek sheet "Needs attention today" with swipeable stretch cards;
     - an app-style bottom bar with the five pages.
  2. **App · Stretch details:** the map zoomed on the selected stretch, with a back button and 112. Below it is an expanded sheet with:
     - the verdict and Listen;
     - rainfall for the last 24 h and next 24 / 72 h;
     - "why it is risky" bars;
     - Check a trip / Report buttons;
     - the "not an official warning · Emergency 112" line.
  - The screens are linked: the Severe card opens the details, and Back returns to the map. Both are marked interactive for Play mode.
- **Same content as the web design:** same tokens, fonts and sample data, and only the client features from `frontend.md`. App-specific changes: a full-bleed map, floating controls, bottom sheets and Material-style navigation. The design covers the app layout only; no Expo app code was changed. The scope decision in L-031 still stands: the team builds the web app.
- **Files:** none in the repo (artifact https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi); `log.md`

### L-043 — Map designs exported as PNG images; overlap fixes
- **When:** 2026-10-23 22:50–23:05 IST
- **Who:** Claude Code for Aakash ("i cant see the app ui image"). The canvas was open in focused view on the desktop artboard, so the app screens further down were not visible.
- **What:**
  1. **PNG exports in `design/ui/`** (2× resolution), so the designs can be opened without the canvas:
     - `app_map.png`
     - `app_stretch_details.png`
     - `web_map_desktop.png`
     - `web_map_phone.png`
     Rendered from standalone copies of the canvas artboards with headless Edge.
  2. **Fixes found in the first render** (also published to the canvas):
     - map controls hid the Joshimath label (app and desktop);
     - the desktop legend covered Rishikesh;
     - the phone web zoom buttons covered the road;
     - the "Gauchar" label was cut off;
     - the footer and "Check a trip on this road" text wrapped.
     The desktop map was reframed, controls and legends moved to empty map areas, and the labels shortened.
- **How verified:** looked at all four PNGs after the fixes. Sample data, as in L-041.
- **Files:** `design/ui/*.png` (new), `log.md`

### L-044 — UI design: Plan trip page (desktop + app), with PNG images
- **When:** 2026-10-23 23:10–23:40 IST
- **Who:** Claude Code for Aakash ("make ui image for trip plan for both desktop and app").
- **What:** a "Plan trip (web and app)" row added to the design canvas (https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi), with three screens, each also exported as an image in `design/ui/`:
  1. **Desktop** (`web_plan_trip_desktop.png`, 1440 × 1560):
     - **trip form:** From / swap / To, date, leave time, Check route, and the five popular routes;
     - **DELAY recommendation**, with the reason and a "See safer times" button;
     - **summary:** distance, driving time, overall risk, high-risk stretches, closures;
     - **route map:** the risk for the hour you reach each stretch, with arrival times at the towns;
     - **route breakdown:** each town's arrival time, km and leg risk, with the severe leg highlighted;
     - **safer times to leave:** the best window +24 h, plus two other options with Select buttons;
     - rain along the route, where to wait (Srinagar / Rudraprayag / Karnaprayag), and the disclaimer.
  2. **App · Plan trip** (`app_plan_trip.png`): From / To with a swap button, date and time pickers, Check route, and a popular-routes list.
  3. **App · Trip result** (`app_plan_trip_result.png`): DELAY card, four stats, a mini route map, safer times with Select, and the start of the route breakdown. The form and result screens link to each other in Play mode.
- **Sample trip:** Rishikesh → Joshimath, leaving Fri 24 Oct at 06:00 at 30 km/h. The town ETAs are worked out from the real km values (Srinagar 09:26, Rudraprayag 10:32, Joshimath 14:15). Risk levels match the Map design's sample (Sirobagarh → Rudraprayag severe). The safer windows and rainfall are illustrative.
- **Only real features** (`frontend.md` §2). Facility claims for the waiting towns (hospitals, hotels) were left out because they are not verified.
- **Fixed after the first render:** the page was cut off before the breakdown ended (height 1400 → 1560), the map labels were too small, and the "Select this time", route-risk pill and "5 · 0 shut" labels wrapped.
- **Files:** `design/ui/web_plan_trip_desktop.png`, `design/ui/app_plan_trip.png`, `design/ui/app_plan_trip_result.png` (new), `log.md`

### L-045 — UI design: Alerts page (desktop + app), with PNG images
- **When:** 2026-10-24 00:00–00:20 IST
- **Who:** Claude Code for Aakash ("ok now do same work for alerts").
- **What:** an "Alerts (web and app)" row on the design canvas (https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi) with three screens, each also exported to `design/ui/`:
  1. **Desktop** (`web_alerts_desktop.png`, 1440 × 1220):
     - title with Live / updated 9:05 pm / refreshes every 5 minutes;
     - search box and an Emergency contacts button;
     - five count cards: Severe 1, High 4, Moderate 11, Road closures 0, Heavy rain 6;
     - filter pills with counts;
     - the alert list, worst first: level + verdict pill, km range, name, reason with rain and report counts. Under it, "Show 12 more stretches";
     - a selected-alert panel: zoomed map, verdict text, rain and report stats, View on map / Check a trip / Share;
     - travel safety tips and the disclaimer.
  2. **App · Alerts** (`app_alerts.png`): search, scrolling filter chips with counts, Live line, and alert cards.
  3. **App · Alert details** (`app_alert_details.png`):
     - a map with back, share and 112 buttons;
     - a sheet with the verdict, stats, View on map / Check a trip, and an "If you are already on this road" box.
  - The app screens link to each other and to the Map / Plan trip screens in Play mode.
- **Design choices against the current page's problems** (`frontend.md` team notes):
  - only real counts, including zero;
  - no invented "since" timestamps; only the risk update time;
  - plain level and verdict labels instead of "Rockfall activity" for Moderate;
  - no hard-coded "Live conditions" box;
  - no notification sign-up, because the real one is not built yet.
- **Sample data:** consistent with the Map and Plan trip designs (seg_09 Severe; seg_08, 10, 14 and 17 High; 11 Moderate; 2 Low).
- **Checked the renders:** after removing the coloured side stripe on the cards (redundant with the pill) and trimming empty space at the bottom of the desktop page.
- **Files:** `design/ui/web_alerts_desktop.png`, `design/ui/app_alerts.png`, `design/ui/app_alert_details.png` (new), `log.md`

### L-046 — UI design: Reports page (desktop + app), with PNG images
- **When:** 2026-10-24 00:25–00:45 IST
- **Who:** Claude Code for Aakash ("now do same work for reports").
- **What:** a "Reports (web and app)" row on the design canvas (https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi) with three screens, also exported to `design/ui/`:
  1. **Desktop** (`web_reports_desktop.png`, 1440 × 1260):
     - title and a "Someone hurt or in danger? Call 112 first" banner;
     - **Send a report** form:
       - six type buttons;
       - "Use my location", or tap the road on a small map, with a pin and a "Near Sirobagarh, km 114 · on NH-7" confirmation;
       - km and an optional name;
       - description with a 300-character counter;
       - consent box (not pre-ticked);
       - Send, with the 3 km / 10-minute rules spelled out;
     - **What happens to your report:** Pending → checked by officials → verified reports raise the risk by one level, fading over about two days; rejected change nothing;
     - **Recent reports**, with type filters and Pending / Verified / Rejected pills.
  2. **App · Send a report** (`app_report_form.png`): Send / Recent tabs, type tiles, GPS location card with Change, description, consent, Send, and the call-112 note.
  3. **App · Recent reports** (`app_reports_recent.png`): a "Report sent, Pending" confirmation, then the user's own report on top, followed by the others with their status.
  - Tabs and Send link the two app screens in Play mode.
- **Fixes to the current page's problems** (`frontend.md` team notes):
  - no photo upload, since it is not built;
  - location comes from GPS or a map tap, shown back to the user (no silent Srinagar default);
  - km is not pre-filled with 62;
  - consent is not pre-ticked;
  - an optional real name field instead of always "Traveller";
  - no stock photos and no fixed "Reports impact" numbers;
  - only the five real report types plus "Something else" as filters.
- **Sample reports:** based on the seeded reports (km 114 falling stones pending, Tangani cracks verified, Devprayag gravel verified), plus one rejected example. Reporter roles only, no names.
- **Fixed after the first render:** the location map was zoomed far too close and its label covered the map (reframed; label moved to the top). Empty space at the bottom was trimmed.
- **Files:** `design/ui/web_reports_desktop.png`, `design/ui/app_report_form.png`, `design/ui/app_reports_recent.png` (new), `log.md`

### L-047 — UI design: Emergency page (desktop + app), with PNG images; all five client pages designed
- **When:** 2026-10-24 00:50–01:10 IST
- **Who:** Claude Code for Aakash ("now do same work for emergency").
- **What:** an "Emergency (web and app)" row on the design canvas (https://claude.ai/artifact/WBVPkEAVwV7m9kke9BJhhi) with three screens, also exported to `design/ui/`:
  1. **Desktop** (`web_emergency_desktop.png`, 1440 × 1260):
     - a large red **Call 112** block (police, ambulance, fire, disaster; free, 24 × 7, no balance needed);
     - "When they answer, tell them" (where you are with the NH-7 km stone, what happened, how many hurt, your number);
     - **Other helplines:** SDMA Uttarakhand, Highway Police, BRO;
     - **Hospitals along NH-7:** 9 rows with hospital, nearest stretch and distance from the road, marked "Saved for offline use";
     - "Call 112 straight away if…" and "If a landslide happens near you" guidance, plus the disclaimer.
  2. **App · Emergency** (`app_emergency.png`): the Call 112 card with "Tell them", the helplines, a link to the hospitals screen, and landslide guidance.
  3. **App · Hospitals along NH-7** (`app_hospitals.png`): the offline badge and the 9 hospitals with distances.
  - The two app screens link to each other in Play mode.
- **Real data only:**
  - Hospital names and distances come from `Backend/data/segment_consequence.csv` (`nearest_hospital`, `nearest_hospital_km`), the same data `/offline-pack` returns.
  - Three source spellings were corrected in the design ("Governement", "Governnment"). **The CSV still has these typos.**
  - Rows that are not general public hospitals were left out: "Ayurveda Center" (seg_01), "ITBP Hospital" (seg_10), "ECHS PolyClinic" (seg_12). **The data team should check them.**
- **Helpline numbers:** only 112 is shown as a number. SDMA, Highway Police and BRO show **"[number to confirm]"** placeholders, because the backend deliberately leaves them blank and the numbers typed into the current page (1070, 1090, 0135-2744064) are unverified (`frontend.md` team notes).
- **Offline wording corrected before sending:** only the hospital list is cached today. The first draft said the whole page works offline; it was changed.
- **Fixed after the first render:** the desktop page was cut off before the end of the hospital list (height 1180 → 1260), and the app emergency screen's last card sat under the bottom bar (spacing tightened).
- **All five client pages now have desktop and app designs:** Map, Plan trip, Alerts, Reports, Emergency (L-041 to L-047, 16 images in `design/ui/`).
- **Files:** `design/ui/web_emergency_desktop.png`, `design/ui/app_emergency.png`, `design/ui/app_hospitals.png` (new), `log.md`

### L-048 — Backend: photo upload for field reports
- **When:** 2026-10-24 05:30–05:45 IST
- **Who:** Claude Code for Aakash (approved when asked: "Add a backend endpoint").
- **What:**
  - **New** `POST /field-report/photo` (multipart, field `photo`): takes one JPEG or PNG up to 3 MB and returns `201 {photo_url, bytes}`. 413 if too large, 415 if the bytes are not a JPEG or PNG (checked by the file's first bytes, not its name or content type). Limited to 10 per minute per IP.
  - Photos are saved in `Backend/data/report_photos/` under a random name and served at `GET /report-photos/<name>`.
  - `POST /field-report` already accepted `photo_url`; the app now sends it.
- **Why:** the mobile app (App/ APP-023) lets travellers attach a photo from the camera or gallery, so officials can see what was reported before verifying it.
- **How:** `routes/reports.py` holds the endpoint and the photo folder constants; `main.py` creates the folder and mounts it with `StaticFiles` after `/static`. The folder is git-ignored, because the photos are user data.
- **Checked:** 4 new tests in `tests/test_report_photos.py` (upload and fetch back, non-image → 415, over 3 MB → 413, a report accepts the returned URL) all pass. Full suite: 195 passed, 8 failed (the known missing generated reports).
- **Not done:** the web dashboard's Reports page does not show the photo yet; no clean-up of old photos.
- **Files:** `Backend/app/routes/reports.py`, `Backend/app/main.py`, `Backend/tests/test_report_photos.py` (new), `.gitignore`, `features.md`, `log.md`
