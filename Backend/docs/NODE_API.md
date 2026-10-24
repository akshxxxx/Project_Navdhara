# Raah Node backend: API and mock-data guide

Backend for the Raah Node (ESP32 + MPU6050 + soil + rain), built from the 30-hour team plan (S1 packet) and the 48-hour build workflow. **Live hardware ready (2026-10-23, L-038):** plug the wired ESP32 into the backend laptop by USB and its readings flow in by themselves, or send them over Wi-Fi (see "Going live"). Mock tools still work for development.

> Bench-calibrated prototype. Not certified prediction and not an official warning. Emergency: 112.

Code: `app/node_service.py` (logic), `app/routes/node.py` (endpoints), `app/placement.py` (F8), `tools/` (mock and fallback tools), `app/static/node_live.html` (live page). Tests: `tests/test_node_backend.py`.

---

## 1. Run it with mock data (no hardware)

1. Start the backend (VS Code: **Terminal → Run Task → Raah: backend**).
2. Open the live page: **http://localhost:8000/static/node_live.html**
3. In another terminal, from `D:\Raah\Backend`:

```powershell
venv\Scripts\python tools\mock_node.py --scenario demo --auto-mark
```

The mock node is called `MOCK-NODE1` on `seg_05`. Every screen labels it **MOCK DATA**, but it escalates the segment exactly as real hardware will. Its key comes from `Backend/.env` (`NODE_API_KEY`).

| Scenario | What happens | Shows |
|---|---|---|
| `calm` | 60 s of normal readings | ONLINE, OK |
| `creep` | slow 6° lift over 120 s | WATCH, then WARNING; planner CAUTION (the E1 "slow" case) |
| `alarm` | fast lift to 9° in 10 s, then back to flat | ALARM, planner AVOID, Telegram; incident closes when calm |
| `impact` | severe stone drop | WARNING only: vibration never raises ALARM (calibration L-050) |
| `wet` | soil saturates, then a 3.5° tilt | WARNING (dry soil would only give WATCH): the wet-soil rule |
| `lost` | ALARM, then the node goes silent | **SENSOR_LOST** after 15 s; alert held until "site checked" |
| `outage` | Wi-Fi off for 20 s, then back | outbox: live message first, old ones tagged `late`; delivery % |
| `demo` | calm → creep → fast lift → silent | the stage demo chain |

Options: `--segment seg_08`, `--node MOCK-NODE2`, `--speed 4` (4× faster), `--dry-run`, `--csv-out file.csv`.

> ⚠ Mock ALARMs send a **real Telegram message** to anyone subscribed to that segment, prefixed "[MOCK sensor data, not a real node]". Use another segment (e.g. `--segment seg_08`) when you don't want that.

## 2. Going live (the wired ESP32)

Firmware: **[Hardware/raah_node/raah_node.ino](../../Hardware/raah_node/raah_node.ino)**. It matches the team wiring:

| Part | Pins |
|---|---|
| MPU6050 | SDA → GPIO21, SCL → GPIO22 (3V3) |
| Soil moisture (LM393) | AO → GPIO34 (dry 4095, wet ~1250) |
| Rain plate (LM393) | AO → GPIO35 (dry 4095, wet ~2400) |
| Traffic light | G → GPIO26, Y → GPIO27, R → GPIO33 |
| Active buzzer | + → GPIO25 |

It needs no extra libraries, only the ESP32 board package. Each second it sends one reading, with raw ADC values included.
Lights: green = OK, yellow blinking = WATCH, yellow steady = WARNING, red with buzzer = ALARM. Keep the node still for 2 s after power-on (that sets 0°); type `ZERO` in the Serial Monitor to re-zero it after mounting.

### Way A: USB cable into the backend laptop (nothing to configure)
1. Arduino IDE: board **ESP32 Dev Module**. In the sketch's CONFIG block set `NODE_ID` (e.g. `NODE1`) and `SEGMENT_ID`. In `secrets.h` (copy of `secrets.example.h`), leave `WIFI_SSID` empty. Upload.
2. **Close the Arduino Serial Monitor** (only one program can hold the port), then plug the board into the laptop running the backend.
3. The backend finds the board by itself (CP210x / CH340 / CH9102 / FTDI / Espressif USB chips, scanned every 3 s). Readings flow into the same path as Wi-Fi: map, planner, Telegram and SENSOR_LOST. Unplug it and it goes back to searching; plug it in again and it reconnects.
4. Check it at **http://127.0.0.1:8000/node/serial**: `state` should be `connected`, with `port`, `readings` counting up, and `recent_log` showing the board's `READY` / `CAL,OK` lines. The Sensors page shows the node with link `serial` and the raw ADC values.

**Flashing while the backend runs:** `POST /node/serial/pause` (admin key) frees the port, and `POST /node/serial/resume` takes it back. Alternatively, unplug the board, upload, and plug it in again; if the upload fails with "port busy", pause first.

### Way B: Wi-Fi (node on the slope, laptop elsewhere)
1. In `Hardware/raah_node/secrets.h` (git-ignored; first time, copy `secrets.example.h`) set `WIFI_SSID` / `WIFI_PASS` (2.4 GHz only), `SERVER_URL` = `http://<backend laptop IP on that Wi-Fi>:8000/node/reading` (the backend prints it as "Team LAN URL"), and `NODE_KEY` = **exactly** `NODE_API_KEY` from `Backend/.env` on the laptop that runs the backend. A missing or different key is `NET,POST_FAIL,401`. Copy the whole `raah_node` folder (both files) to the computer that flashes the board.
2. Give the node a real id such as `NODE1` (no `MOCK-` / `SIM-` / `REPLAY` prefix). Stop `mock_node.py` so the two don't share a segment.
3. If USB is also plugged in, nothing is counted twice: the board marks each USB line `"posted":1` once it was delivered over Wi-Fi, and the backend skips those. USB then only fills the gaps when Wi-Fi drops.

### Your own sketch instead
Any sketch works if it prints one JSON line per second on serial (or POSTs it). Every field is optional except what the backend cannot guess:
```json
{"node_id":"NODE1","segment_id":"seg_05","tilt_deg":0.8,"vib_g":0.03,"soil_raw":3200,"rain_raw":4090}
```
- Leave out `state` and the backend decides it with the same thresholds as the firmware (`app/node_sensors.py`; `state_source: "server"`).
- `soil_raw` / `rain_raw` (0–4095) become `moisture_pct` / `rain_pct` / `rain_wet` with the bench calibration (`NODE_SOIL_*_RAW`, `NODE_RAIN_*_RAW`).
- Raw `ax_g, ay_g, az_g` become `tilt_deg`, measured from the node's first reading after a backend start.
- A missing `tilt_rate_dpm` is computed from the last ~10 s, and a missing `strikes_10s` from the last 10 s.
- `state` may be `"alarm"` or `0`–`3`. On USB, `node_id` / `segment_id` default to `NODE_SERIAL_NODE_ID` / `NODE_SERIAL_SEGMENT`.
- The older `CSV,millis,tilt,rate,vrms,vpk,moist,rain,state` lines still work.

**After editing `Backend/.env`, restart the backend.** Auto-reload watches code files only, not `.env`.

## 3. Message contract (v1 + v2)

`POST /node/reading`, header `X-Node-Key: <NODE_API_KEY>`, JSON body:

```json
{"node_id":"NODE1","segment_id":"seg_05","state":"ALARM",
 "tilt_deg":9.10,"tilt_rate_dpm":2.40,"vib_g":0.412,"moisture_pct":41.0,"rain_wet":0,
 "model_state":"failure","seq":812,"ts_ms":1792667334020,"event_ts_ms":1792667333940,
 "fw":"2.0.0","rssi_dbm":-58,"uptime_s":3605,"heap_free":182000,"rtt_ms":143,
 "buffered":0,"overwritten":0,"strikes_10s":1,"vib_thr_g":0.120,"link":"wifi","late":1}
```

- **Required:** `node_id` (letters, digits, `-`, `_`), `segment_id` (`seg_01` … `seg_18`), `state` (`OK` / `WATCH` / `WARNING` / `ALARM`). Everything else is optional. Unknown extra fields are ignored, so new firmware never gets a 422.
- `vib_g` is the vibration peak; `vib_rms_g` (optional) is the 1-second RMS.
- **Late messages** (`"late": 1`, or `ts_ms` older than 15 s by a valid NTP clock) are stored as history only and never change the live state. A `ts_ms` before NTP sync (earlier than 2020) is ignored for lateness.
- **Node id prefixes:** `SIM-` = simulated, never escalates. `REPLAY…` = recorded run, escalates, labelled. `MOCK-` = generated test data, escalates, labelled. Anything else = real hardware.

| Firmware sees | Meaning | Fix |
|---|---|---|
| `NET,POST_FAIL,401` | wrong key | `NODE_KEY` must equal `NODE_API_KEY` exactly |
| `NET,POST_FAIL,503` | server has no `NODE_API_KEY` | set it in `Backend/.env`, restart the backend |
| `NET,POST_FAIL,422` | bad data | `SEGMENT_ID` must look like `seg_05`; state must be one of the four |
| `NET,POST_FAIL,-1` | server not reachable | wrong IP, firewall, different network, 5 GHz hotspot |

## 4. What a node does to the regional system

| Node | Segment on `/risk-map` | `/route-risk` and the Telegram bot's `/route` |
|---|---|---|
| WARNING (online) | `adjusted_risk_level` ≥ **High**, `node_escalation.avoid = false` | at least **CAUTION** |
| ALARM (online) | **Very High**, `node_escalation.avoid = true` | **AVOID** with the sensor reason (official closures still win) |
| silent ≥ 15 s after WARNING/ALARM | **SENSOR_LOST**: escalation **held** | still AVOID / CAUTION: "went silent N s after reporting ALARM. Holding the alert until the site is checked." |
| silent while OK/WATCH | STALE (15 s), then OFFLINE (120 s) | nothing |
| `POST /node/ack/{id}` (admin key) | hold released | back to normal |

- Every segment carries `node_escalation` (`{level, avoid, reason, node_id, status, state, kind}`) and `adjustment_reason`.
- The time machine (`?as_of=`) ignores live sensors.
- **Telegram/SMS:** one message per incident, at its first ALARM, to consenting subscribers of the segment (or of `all`). Simulated nodes never send. The 10-minute risk dispatcher ignores sensor escalation, so subscribers are not messaged twice.

## 5. Endpoints

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/node/reading` | X-Node-Key | `{ok, node_id, kind, late, status, stored_id, server_ms, incident_id, sensor_alarm_sent}` (201) |
| GET | `/node/fleet` | – | `{server_ms, nodes:[{node_id, segment_id, kind, label, state, status, age_s, escalates, reading, health, delivery}]}` |
| GET | `/node/latest` | – | latest reading per node with `age_s`, `alert_active` |
| GET | `/node/history?node_id=NODE1&minutes=15` | – | readings in time order (late ones flagged) |
| GET | `/node/alerts` | – | `{alerts: {seg_05: {level, avoid, reason, …}}}` |
| GET | `/node/incidents?limit=10` | – | newest first: `mark_to_server_ms`, `mark_to_alarm_ms`, `alarm_to_alert_ms`, `duration_s`, `alert_channel`, `node_status` |
| POST | `/node/mark` | X-Node-Key or X-Admin-Key | `{mark_id, server_ms}`; body optional `{label, node_id, segment_id}` |
| GET | `/node/marks` | – | recent marks |
| POST | `/node/ack/{node_id}` | admin key | releases SENSOR_LOST, closes the incident |
| GET | `/node/placement?n=10&min_spacing_km=2` | – | proposed node sites (F8) |
| GET | `/node/serial` | – | USB link: `state` (searching / connected / port_busy / paused / off), `port`, `chip`, `readings`, `skipped_wifi_dupes`, `bad_lines`, `last_error`, `recent_log` (the board's boot/NET lines) |
| POST | `/node/serial/pause`, `/node/serial/resume` | admin key | free / retake the USB port (flashing, Serial Monitor) |
| GET | `/admin/node-logs` | admin key | daily sensor log files: `{dir, columns, days:[{date, rows, size_bytes, nodes}]}` |
| GET | `/admin/node-logs/{YYYY-MM-DD}` | admin key | that day's readings, newest first (`?node_id=&limit=`), or the CSV file with `?format=csv` |

All timings in `/node/incidents` use the **laptop's clock** (F2). A mark links to the next incident that opens within 180 s. `delivery` in `/node/fleet` gives received vs expected messages from `seq` (experiment E6).

**Polling example for the dashboard / app (S2):** `GET /node/fleet` and `GET /node/incidents?limit=5` every 2 s. Show `label` (MOCK DATA / REPLAY / SIMULATED) clearly, and show `status == "SENSOR_LOST"` as its own state.

## 6. Tools (`Backend/tools/`)

| Tool | Use |
|---|---|
| `mock_node.py` | fake node for development (above) |
| `mark_event.py --label "E3 20cm"` | press ENTER at each physical event (E5, one-clock timing) |
| `replay_session.py data\golden.csv` | backup demo: replays a recorded run as `REPLAY1` (labelled) |
| `serial_bridge.py --port auto --url http://<backend>:8000` | only when the board is plugged into a **different** laptop than the backend (the backend reads its own USB by itself); `--file … --dry-run` to test without hardware. If both run on one laptop, set `NODE_SERIAL=off` first |
| `sim_fleet.py --n 12` | labelled simulated fleet on the map (never escalates) |

All tools default to `http://127.0.0.1:8000`, because "localhost" costs ~2 s per request on Windows, and read the key from `Backend/.env`.

## 7. Still mock / still to do

- **Placement** uses a **mock** score (each road vertex gets its segment's terrain percentile) until S3 puts `point_scores.csv` (`lat, lon, segment_id, score[, chainage_km]`) in `Backend/data/`. The response says `is_mock: true` until then.
- Thresholds: **[SENSOR_THRESHOLDS.md](SENSOR_THRESHOLDS.md)** (what raises what, why, references). Only tilt can raise ALARM; vibration and soil moisture stop at WARNING. The firmware (`Hardware/raah_node/raah_node.ino`), `app/node_sensors.py`, `tools/mock_node.py` and the Sensors page hold the same numbers; change them together. The backend lowers any node-sent ALARM without a tilt reason to WARNING (`state_capped_from`).
- The firmware has not been compiled or run by the software side yet (no Arduino toolchain on the backend laptop). The outbox (F7 late messages) is not in this firmware; USB fills Wi-Fi gaps instead.
- Not built (plan says don't, or stretch only): LoRa, HMAC/TLS on the node, ESP-NOW gateway forwarder (F13), placement coverage statistics (S3's `placement.py`).

## 8. Settings (`Backend/.env`)

`NODE_API_KEY` (required for Wi-Fi readings; USB needs no key), `NODE_STALE_S=15`, `NODE_OFFLINE_S=120`, `NODE_LATE_S=15`, `NODE_MARK_WINDOW_S=180`, `POINT_SCORES_CSV` (default `data/point_scores.csv`).
USB: `NODE_SERIAL=auto` (or `COM5`, or `off`), `NODE_SERIAL_BAUD=115200`, `NODE_SERIAL_NODE_ID=NODE1`, `NODE_SERIAL_SEGMENT=seg_05`. Calibration: `NODE_SOIL_DRY_RAW=4095`, `NODE_SOIL_WET_RAW=1250`, `NODE_RAIN_DRY_RAW=4095`, `NODE_RAIN_WET_RAW=2400`, `NODE_RAIN_WET_PCT=50`.

## 9. Sensor log (for the control room)

Every reading from a real, mock or replayed node is also appended to one CSV file per IST day:
`Backend/logs/node_readings/YYYY-MM-DD.csv` (`NODE_LOG_DIR`, `NODE_LOG_ENABLED=true`). Simulated SIM- nodes are not logged.
Columns: `time_ist, server_ms, node_id, kind, segment_id, state, state_source, state_capped_from, late, tilt_deg, tilt_rate_dpm,
vib_g, vib_rms_g, strikes_10s, moisture_pct, soil_raw, rain_wet, rain_pct, rain_raw, link, rssi_dbm, seq, fw`.

Officials open it on the dashboard: **Admin → Sensor log** (list of days, the newest 200 readings of a day filtered by node,
**CSV** download). The files are git-ignored and kept until someone deletes them.
