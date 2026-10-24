"""
node_service.py - Raah Node (ESP32 slope sensor) state, escalation and incident timing
======================================================================================
Implements the backend half of the Raah Node 30-hour plan (S1 packet):

  * Message contract v1 + v2 (all v2 fields optional) arriving at POST /node/reading.
  * Node status (F3): ONLINE / STALE / OFFLINE / SENSOR_LOST. A node that falls silent
    after WARNING or ALARM is SENSOR_LOST and keeps its segment escalated until a person
    acknowledges it. "A destroyed node must never look safe."
  * Segment escalation: WARNING -> segment at least High; ALARM -> Very High and the trip
    planner returns AVOID. Simulated nodes (SIM-...) never escalate; replayed (REPLAY...)
    and mock (MOCK-...) nodes escalate but say so in every reason string.
  * Late readings (F7 outbox): "late": 1, or an NTP-valid ts_ms older than NODE_LATE_S,
    are stored as history only and never change the live state.
  * Incidents and marks (F2): every time is the SERVER (laptop) clock: mark -> first
    server message, mark -> ALARM, ALARM -> alert handed to Telegram/SMS.
  * One sensor-alarm message per incident to consenting subscribers of the segment.

Node kinds come from the node_id prefix:
  SIM-...    simulated  (labelled, never escalates)
  REPLAY...  replay     (recorded bench run, escalates, labelled)
  MOCK-...   mock       (generated test data from tools/mock_node.py, escalates, labelled)
  anything else          hardware (a real node)
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional

from app import config, node_log, node_sensors
from app.database import get_db

log = logging.getLogger("backend")

RANK = {"OK": 0, "WATCH": 1, "WARNING": 2, "ALARM": 3}
STATES = tuple(RANK)
LEVEL_RANK = {"Low": 0, "Moderate": 1, "High": 2, "Very High": 3}

# ts_ms below this (Sep 2020) means the node has no NTP time yet; ignore it for lateness
VALID_CLOCK_MS = 1_600_000_000_000

KIND_PREFIX = {
    "replay": "[REPLAY of a recorded bench test] ",
    "mock": "[MOCK sensor data, not a real node] ",
}

# Fields from contract v2 kept as node health (all optional)
HEALTH_FIELDS = (
    "fw", "rssi_dbm", "uptime_s", "heap_free", "rtt_ms", "buffered", "overwritten",
    "strikes_10s", "vib_thr_g", "vib_rms_g", "link", "relay_rssi_dbm",
    # raw hardware values and who decided the state (app/node_sensors.py)
    "soil_raw", "rain_raw", "rain_pct", "state_source", "state_capped_from",
)
READING_FIELDS = (
    "tilt_deg", "tilt_rate_dpm", "vib_g", "moisture_pct", "rain_wet", "model_state",
    "seq", "ts_ms", "event_ts_ms",
)

# Send sensor-alarm messages on a background thread so POST /node/reading answers fast.
# Tests set this to False to assert synchronously.
ALERT_ASYNC = True

_lock = threading.RLock()
_nodes: Dict[str, Dict[str, Any]] = {}
_loaded = False


def _now_ms() -> int:
    return int(time.time() * 1000)


def reset_state() -> None:
    """Forget in-memory node state (tests; the DB rows are untouched)."""
    global _loaded
    with _lock:
        _nodes.clear()
        _loaded = False
    node_sensors.reset()


def node_kind(node_id: str) -> str:
    nid = node_id.upper()
    if nid.startswith("SIM-"):
        return "simulated"
    if nid.startswith("REPLAY"):
        return "replay"
    if nid.startswith("MOCK-"):
        return "mock"
    return "hardware"


def is_late(reading: Dict[str, Any], now: int) -> bool:
    if reading.get("late"):
        return True
    ts = reading.get("ts_ms")
    if isinstance(ts, (int, float)) and ts >= VALID_CLOCK_MS:
        return (now - ts) > config.NODE_LATE_S * 1000
    return False


def node_status(n: Dict[str, Any], now: Optional[int] = None) -> str:
    """The dead-man rule (F3)."""
    now = now if now is not None else _now_ms()
    age_s = (now - n["last_seen_ms"]) / 1000
    if age_s <= config.NODE_STALE_S:
        return "ONLINE"
    if RANK.get(n["state"], 0) >= RANK["WARNING"] and not n.get("acked_ms"):
        return "SENSOR_LOST"
    return "STALE" if age_s <= config.NODE_OFFLINE_S else "OFFLINE"


# --------------------------------------------------------------------------------------
# Loading state after a restart
# --------------------------------------------------------------------------------------

def _ensure_loaded() -> None:
    """Rebuild in-memory node state from the latest live reading of each node."""
    global _loaded
    if _loaded:
        return
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT r.* FROM node_readings r
                JOIN (SELECT node_id, MAX(server_ms) AS m FROM node_readings WHERE late = 0 GROUP BY node_id) last
                  ON last.node_id = r.node_id AND last.m = r.server_ms
                WHERE r.late = 0
            """)
            rows = cur.fetchall()
            for r in rows:
                n = _node_from_row(dict(r))
                cur.execute(
                    "SELECT closed_ms, close_reason FROM node_incidents WHERE node_id = ? ORDER BY id DESC LIMIT 1",
                    (r["node_id"],),
                )
                inc = cur.fetchone()
                if inc and inc["close_reason"] == "acknowledged" and inc["closed_ms"] and inc["closed_ms"] >= n["last_seen_ms"]:
                    n["acked_ms"] = inc["closed_ms"]
                _nodes[n["node_id"]] = n
    except Exception as e:
        log.warning("node_service: could not reload node state: %s", e)
    _loaded = True


def _node_from_row(r: Dict[str, Any]) -> Dict[str, Any]:
    extra = json.loads(r.get("extra_json") or "{}")
    reading = {k: r.get(k) for k in READING_FIELDS}
    return {
        "node_id": r["node_id"],
        "segment_id": r["segment_id"],
        "kind": r["kind"],
        "state": r["state"],
        "last_seen_ms": r["server_ms"],
        "acked_ms": None,
        "reading": reading,
        "health": {k: extra.get(k) for k in HEALTH_FIELDS if extra.get(k) is not None},
    }


# --------------------------------------------------------------------------------------
# Readings
# --------------------------------------------------------------------------------------

def on_reading(reading: Dict[str, Any], now: Optional[int] = None) -> Dict[str, Any]:
    """
    Store one reading and update live state. Returns
    {node_id, kind, late, status, stored_id, server_ms, incident_id, alarm_started}.
    `alarm_started` is True only on the first ALARM of an incident from a non-simulated node:
    the caller then sends the sensor-alarm message (send_sensor_alarm).
    """
    now = now if now is not None else _now_ms()
    node_id = reading["node_id"]
    kind = node_kind(node_id)
    late = is_late(reading, now)
    # Raw values -> percentages, tilt rate, strikes, and the state if the node sent none
    reading = node_sensors.complete(reading, now, remember=not late)
    state = reading["state"]
    extra ={k: reading.get(k) for k in HEALTH_FIELDS if reading.get(k) is not None}

    with _lock:
        _ensure_loaded()
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO node_readings (
                    node_id, segment_id, kind, state, tilt_deg, tilt_rate_dpm, vib_g, moisture_pct,
                    rain_wet, model_state, seq, ts_ms, event_ts_ms, server_ms, late, extra_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                node_id, reading["segment_id"], kind, state,
                reading.get("tilt_deg"), reading.get("tilt_rate_dpm"), reading.get("vib_g"),
                reading.get("moisture_pct"), reading.get("rain_wet"), reading.get("model_state"),
                reading.get("seq"), reading.get("ts_ms"), reading.get("event_ts_ms"),
                now, 1 if late else 0, json.dumps(extra),
            ))
            stored_id = cur.lastrowid
            node_log.append(reading, kind, now, late)  # daily CSV for the Admin page

            result = {
                "node_id": node_id, "kind": kind, "late": late, "stored_id": stored_id,
                "state": state, "state_source": reading["state_source"],
                "state_capped_from": reading.get("state_capped_from"),
                "server_ms": now, "incident_id": None, "alarm_started": False,
            }
            if late:
                # History only: an old ALARM from the outbox must never look like a new one
                n = _nodes.get(node_id)
                result["status"] = node_status(n, now) if n else "UNKNOWN"
                return result

            prev = _nodes.get(node_id)
            n = {
                "node_id": node_id,
                "segment_id": reading["segment_id"],
                "kind": kind,
                "state": state,
                "last_seen_ms": now,
                "acked_ms": None,  # a fresh reading supersedes any earlier acknowledgement
                "reading": {k: reading.get(k) for k in READING_FIELDS},
                "health": {**(prev or {}).get("health", {}), **extra},
            }
            _nodes[node_id] = n

            # Incident bookkeeping
            cur.execute(
                "SELECT * FROM node_incidents WHERE node_id = ? AND closed_ms IS NULL ORDER BY id DESC LIMIT 1",
                (node_id,),
            )
            inc = cur.fetchone()
            if RANK[state] >= RANK["WARNING"]:
                if inc is None:
                    mark = _recent_unlinked_mark(cur, now, node_id, reading["segment_id"])
                    cur.execute("""
                        INSERT INTO node_incidents (node_id, segment_id, kind, opened_ms, first_alarm_ms, peak_state,
                                                    mark_id, mark_ms, mark_label)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        node_id, reading["segment_id"], kind, now,
                        now if state == "ALARM" else None, state,
                        mark["id"] if mark else None, mark["server_ms"] if mark else None,
                        mark["label"] if mark else None,
                    ))
                    inc_id = cur.lastrowid
                    result["alarm_started"] = state == "ALARM" and kind != "simulated"
                else:
                    inc_id = inc["id"]
                    if RANK[state] > RANK[inc["peak_state"]]:
                        cur.execute("UPDATE node_incidents SET peak_state = ? WHERE id = ?", (state, inc_id))
                    if state == "ALARM" and inc["first_alarm_ms"] is None:
                        cur.execute("UPDATE node_incidents SET first_alarm_ms = ? WHERE id = ?", (now, inc_id))
                        result["alarm_started"] = kind != "simulated"
                result["incident_id"] = inc_id
            elif inc is not None:
                cur.execute(
                    "UPDATE node_incidents SET closed_ms = ?, close_reason = 'calm' WHERE id = ?",
                    (now, inc["id"]),
                )

        result["status"] = node_status(n, now)
        if prev and prev["state"] != state:
            log.info("node_service: %s %s -> %s on %s", node_id, prev["state"], state, reading["segment_id"])
        return result


def ingest(reading: Dict[str, Any]) -> Dict[str, Any]:
    """on_reading + the sensor-alarm message: the one path for Wi-Fi (POST /node/reading) and USB (serial_ingest)."""
    result = on_reading(reading)
    if result["alarm_started"] and result["incident_id"]:
        dispatch_sensor_alarm(result["incident_id"], result["node_id"], reading["segment_id"])
    return result


def _recent_unlinked_mark(cur, now: int, node_id: str, segment_id: str) -> Optional[Dict[str, Any]]:
    """The latest mark within NODE_MARK_WINDOW_S before now that no incident uses yet."""
    since = now - int(config.NODE_MARK_WINDOW_S * 1000)
    cur.execute("""
        SELECT m.* FROM node_marks m
        WHERE m.server_ms BETWEEN ? AND ?
          AND (m.node_id IS NULL OR m.node_id = ?)
          AND (m.segment_id IS NULL OR m.segment_id = ?)
          AND NOT EXISTS (SELECT 1 FROM node_incidents i WHERE i.mark_id = m.id)
        ORDER BY m.server_ms DESC LIMIT 1
    """, (since, now, node_id, segment_id))
    row = cur.fetchone()
    return dict(row) if row else None


# --------------------------------------------------------------------------------------
# Escalation used by the risk map, trip planner, alerts and Telegram bot
# --------------------------------------------------------------------------------------

def segment_escalation(segment_id: str, now: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """
    Highest live or held alert for a segment from its nodes, or None.
    Returns {"level": "High"|"Very High", "avoid": bool, "reason": str, "node_id", "status", "state", "kind"}.
    Simulated nodes are ignored. Replays and mocks escalate but say so in the reason.
    """
    now = now if now is not None else _now_ms()
    best = None
    with _lock:
        _ensure_loaded()
        nodes = [dict(n) for n in _nodes.values() if n.get("segment_id") == segment_id]
    for n in nodes:
        if n["kind"] == "simulated":
            continue
        st = node_status(n, now)
        rank = RANK.get(n["state"], 0)
        if rank < RANK["WARNING"] or st not in ("ONLINE", "SENSOR_LOST"):
            continue
        prefix = KIND_PREFIX.get(n["kind"], "")
        if st == "ONLINE":
            reason = (f"{prefix}Live slope sensor {n['node_id']} reports {n['state']} on {segment_id}. "
                      "Sensor warning, not an official closure.")
        else:
            silent = int((now - n["last_seen_ms"]) / 1000)
            reason = (f"{prefix}Slope sensor {n['node_id']} went silent {silent} s after reporting "
                      f"{n['state']}. Holding the alert until the site is checked. "
                      "Sensor warning, not an official closure.")
        cand = {
            "level": "Very High" if rank == RANK["ALARM"] else "High",
            "avoid": rank == RANK["ALARM"],
            "reason": reason,
            "node_id": n["node_id"],
            "status": st,
            "state": n["state"],
            "kind": n["kind"],
            "rank": rank,
        }
        if best is None or cand["rank"] > best["rank"]:
            best = cand
    if best:
        best.pop("rank")
    return best


# --------------------------------------------------------------------------------------
# Read views
# --------------------------------------------------------------------------------------

def get_fleet(now: Optional[int] = None) -> Dict[str, Any]:
    now = now if now is not None else _now_ms()
    with _lock:
        _ensure_loaded()
        nodes = [dict(n) for n in _nodes.values()]
    delivery = _delivery_stats()
    out = []
    for n in sorted(nodes, key=lambda x: x["node_id"]):
        st = node_status(n, now)
        out.append({
            "node_id": n["node_id"],
            "segment_id": n["segment_id"],
            "kind": n["kind"],
            "is_simulated": n["kind"] == "simulated",
            "label": {"simulated": "SIMULATED", "replay": "REPLAY", "mock": "MOCK DATA"}.get(n["kind"]),
            "state": n["state"],
            "status": st,
            "age_s": round((now - n["last_seen_ms"]) / 1000, 1),
            "last_seen_ms": n["last_seen_ms"],
            "acked_ms": n.get("acked_ms"),
            "escalates": n["kind"] != "simulated" and st in ("ONLINE", "SENSOR_LOST") and RANK.get(n["state"], 0) >= RANK["WARNING"],
            "reading": n["reading"],
            "health": n["health"],
            "delivery": delivery.get(n["node_id"]),
        })
    return {"server_ms": now, "stale_after_s": config.NODE_STALE_S, "offline_after_s": config.NODE_OFFLINE_S, "nodes": out}


def _delivery_stats() -> Dict[str, Dict[str, Any]]:
    """Messages received vs sent, from sequence numbers (experiment E6)."""
    stats = {}
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT node_id, MIN(seq) AS lo, MAX(seq) AS hi, COUNT(DISTINCT seq) AS got,
                       SUM(late) AS late_count
                FROM node_readings WHERE seq IS NOT NULL GROUP BY node_id
            """)
            for r in cur.fetchall():
                expected = (r["hi"] - r["lo"] + 1) if r["hi"] is not None else 0
                stats[r["node_id"]] = {
                    "first_seq": r["lo"], "last_seq": r["hi"], "received": r["got"],
                    "expected": expected, "late_recovered": r["late_count"] or 0,
                    "delivered_pct": round(100.0 * r["got"] / expected, 1) if expected else None,
                }
    except Exception as e:
        log.warning("node_service: delivery stats failed: %s", e)
    return stats


def get_latest(now: Optional[int] = None) -> List[Dict[str, Any]]:
    fleet = get_fleet(now)
    return [
        {
            "node_id": n["node_id"], "segment_id": n["segment_id"], "kind": n["kind"],
            "state": n["state"], "status": n["status"], "age_s": n["age_s"],
            "alert_active": n["escalates"], **(n["reading"] or {}),
        }
        for n in fleet["nodes"]
    ]


def get_history(node_id: str, minutes: float = 15.0, now: Optional[int] = None) -> List[Dict[str, Any]]:
    now = now if now is not None else _now_ms()
    since = now - int(minutes * 60_000)
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, node_id, segment_id, state, tilt_deg, tilt_rate_dpm, vib_g, moisture_pct, rain_wet,
                   model_state, seq, ts_ms, event_ts_ms, server_ms, late
            FROM node_readings WHERE node_id = ? AND server_ms >= ? ORDER BY server_ms ASC, id ASC
        """, (node_id, since))
        return [dict(r) for r in cur.fetchall()]


def get_active_alerts(now: Optional[int] = None) -> Dict[str, Dict[str, Any]]:
    with _lock:
        _ensure_loaded()
        segs = {n["segment_id"] for n in _nodes.values()}
    alerts = {}
    for seg in sorted(segs):
        esc = segment_escalation(seg, now)
        if esc:
            alerts[seg] = esc
    return alerts


def get_incidents(limit: int = 10, now: Optional[int] = None) -> Dict[str, Any]:
    """Newest first, every duration on the server clock."""
    now = now if now is not None else _now_ms()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM node_incidents ORDER BY id DESC LIMIT ?", (limit,))
        rows = [dict(r) for r in cur.fetchall()]
    with _lock:
        _ensure_loaded()
        nodes = {k: dict(v) for k, v in _nodes.items()}
    out = []
    for r in rows:
        n = nodes.get(r["node_id"])
        status = node_status(n, now) if n else None
        sensor_lost_ms = None
        if status == "SENSOR_LOST" and r["closed_ms"] is None:
            sensor_lost_ms = n["last_seen_ms"] + int(config.NODE_STALE_S * 1000)

        def diff(a, b):
            return (a - b) if (a is not None and b is not None) else None

        out.append({
            **r,
            "label": {"simulated": "SIMULATED", "replay": "REPLAY", "mock": "MOCK DATA"}.get(r["kind"]),
            "open": r["closed_ms"] is None,
            "node_status": status,
            "sensor_lost_ms": sensor_lost_ms,
            "mark_to_server_ms": diff(r["opened_ms"], r["mark_ms"]),
            "mark_to_alarm_ms": diff(r["first_alarm_ms"], r["mark_ms"]),
            "alarm_to_alert_ms": diff(r["alert_sent_ms"], r["first_alarm_ms"]),
            "duration_s": round(((r["closed_ms"] or now) - r["opened_ms"]) / 1000, 1),
        })
    return {
        "server_ms": now,
        "clock": "All times are the server (laptop) clock in epoch ms; no node clock is used.",
        "incidents": out,
    }


# --------------------------------------------------------------------------------------
# Marks and acknowledgement
# --------------------------------------------------------------------------------------

def add_mark(label: Optional[str] = None, node_id: Optional[str] = None,
             segment_id: Optional[str] = None, now: Optional[int] = None) -> Dict[str, Any]:
    now = now if now is not None else _now_ms()
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO node_marks (server_ms, label, node_id, segment_id) VALUES (?, ?, ?, ?)",
            (now, label, node_id, segment_id),
        )
        mark_id = cur.lastrowid
    return {"mark_id": mark_id, "server_ms": now, "label": label, "node_id": node_id, "segment_id": segment_id}


def list_marks(limit: int = 20) -> List[Dict[str, Any]]:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM node_marks ORDER BY id DESC LIMIT ?", (limit,))
        return [dict(r) for r in cur.fetchall()]


def acknowledge(node_id: str, now: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """A crew has checked the site: release a SENSOR_LOST hold and close the open incident."""
    now = now if now is not None else _now_ms()
    with _lock:
        _ensure_loaded()
        n = _nodes.get(node_id)
        if n is None:
            return None
        n["acked_ms"] = now
        with get_db() as conn:
            conn.execute(
                "UPDATE node_incidents SET closed_ms = ?, close_reason = 'acknowledged' WHERE node_id = ? AND closed_ms IS NULL",
                (now, node_id),
            )
        return {"node_id": node_id, "acked_ms": now, "status": node_status(n, now)}


# --------------------------------------------------------------------------------------
# Sensor-alarm message (one per incident)
# --------------------------------------------------------------------------------------

def mark_alert_sent(incident_id: int, channel: str, now: Optional[int] = None) -> None:
    now = now if now is not None else _now_ms()
    with get_db() as conn:
        conn.execute(
            "UPDATE node_incidents SET alert_sent_ms = ?, alert_channel = ? WHERE id = ? AND alert_sent_ms IS NULL",
            (now, channel, incident_id),
        )


def build_sensor_alarm_message(node_id: str, kind: str, segment_id: str, segment_name: str) -> str:
    prefix = KIND_PREFIX.get(kind, "")
    return (
        f"{prefix}NH-7 SENSOR ALARM: slope sensor {node_id} reports ALARM on {segment_name} ({segment_id}). "
        "Avoid this stretch until it is checked. Local sensor warning, not an official closure. Emergency: 112"
    )


def send_sensor_alarm(incident_id: int, node_id: str, segment_id: str) -> int:
    """Message every consenting subscriber of the segment (or of 'all'). Returns messages sent."""
    from app.notifiers import get_notifier

    kind = node_kind(node_id)
    sent = 0
    channels = []
    try:
        with get_db() as conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM segments WHERE id = ?", (segment_id,))
            seg = cur.fetchone()
            seg_name = seg["name"] if seg else segment_id
            cur.execute("""
                SELECT id, phone_or_email, channel FROM subscriptions
                WHERE consent = 1 AND (segment_id = ? OR segment_id = 'all')
            """, (segment_id,))
            subs = cur.fetchall()
            message = build_sensor_alarm_message(node_id, kind, segment_id, seg_name)
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            for s in subs:
                channel = s["channel"]
                try:
                    ok = get_notifier(channel).send(recipient=s["phone_or_email"], message=message, channel=channel)
                except Exception as e:
                    log.error("node_service: sensor alarm send failed for sub #%s: %s", s["id"], e)
                    ok = False
                cur.execute("""
                    INSERT INTO alert_log (subscription_id, segment_id, channel, contact, risk_level, message, sent_at, status)
                    VALUES (?, ?, ?, ?, 'SENSOR ALARM', ?, ?, ?)
                """, (s["id"], segment_id, channel, s["phone_or_email"], message, now_iso, "sent" if ok else "failed"))
                if ok:
                    sent += 1
                    channels.append(channel.lower())
    except Exception as e:
        log.error("node_service: send_sensor_alarm failed for incident #%s: %s", incident_id, e)

    if sent:
        mark_alert_sent(incident_id, ",".join(sorted(set(channels))))
    else:
        with get_db() as conn:
            conn.execute(
                "UPDATE node_incidents SET alert_channel = 'none (no consenting subscribers)' WHERE id = ? AND alert_channel IS NULL",
                (incident_id,),
            )
    log.info("node_service: sensor alarm for %s on %s sent to %d subscriber(s)", node_id, segment_id, sent)
    return sent


def dispatch_sensor_alarm(incident_id: int, node_id: str, segment_id: str) -> None:
    if ALERT_ASYNC:
        threading.Thread(
            target=send_sensor_alarm, args=(incident_id, node_id, segment_id),
            name=f"sensor-alarm-{incident_id}", daemon=True,
        ).start()
    else:
        send_sensor_alarm(incident_id, node_id, segment_id)
