"""
Raah Node backend (app/node_service.py, app/routes/node.py, app/placement.py).
Covers the 30 h plan's S1 packet: contract v2, SENSOR_LOST hold (F3), one-clock incident
timing (F2), late outbox messages (F7), SIM/REPLAY/MOCK labelling, placement (F8),
and the link into /risk-map, /route-risk, alerts and the Telegram bot.
"""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import config, node_service
from app.database import get_db, init_db
from app.main import app
from app.notifiers import set_fake_notifier
from app.notifiers.base import BaseNotifier

client = TestClient(app)
KEY = "test-node-key-123"
H = {"X-Node-Key": KEY}
T0 = 1_800_000_000_000  # fixed "now" in epoch ms (2027), a valid NTP-era clock


class Clock:
    def __init__(self):
        self.ms = T0

    def __call__(self):
        return self.ms

    def advance(self, seconds):
        self.ms += int(seconds * 1000)


class FakeNotifier(BaseNotifier):
    def __init__(self):
        self.sent = []

    def send(self, recipient, message, channel="console"):
        self.sent.append((recipient, channel, message))
        return True


def _dry_rain():
    rain = {f"seg_{i:02d}": {"rain_mm": 0.0, "status": "ok"} for i in range(1, 19)}
    meta = {"weather_source": "live", "weather_fetched_at": None, "weather_age_minutes": 0.0,
            "is_simulated": False, "stale_warning": None}
    return rain, meta


@pytest.fixture(autouse=True)
def node_env(monkeypatch):
    init_db()
    with get_db() as conn:
        for t in ("node_readings", "node_marks", "node_incidents"):
            conn.execute(f"DELETE FROM {t}")
        conn.execute("DELETE FROM subscriptions WHERE name LIKE 'NodeTest%'")
    node_service.reset_state()
    monkeypatch.setattr(config, "NODE_API_KEY", KEY)
    monkeypatch.setattr(config, "ADMIN_API_KEY", "")
    monkeypatch.setattr(config, "ENV", "development")
    monkeypatch.setattr(node_service, "ALERT_ASYNC", False)
    clock = Clock()
    monkeypatch.setattr(node_service, "_now_ms", clock)
    fake = FakeNotifier()
    set_fake_notifier(fake)
    with patch("app.risk_service.fetch_rainfall_with_metadata", return_value=_dry_rain()):
        yield clock, fake
    set_fake_notifier(None)
    node_service.reset_state()


def post(state, node="NODE1", seg="seg_05", **extra):
    body = {"node_id": node, "segment_id": seg, "state": state, "tilt_deg": 1.0, **extra}
    return client.post("/node/reading", json=body, headers=H)


def seg(segment_id="seg_05"):
    return next(s for s in client.get("/risk-map").json()["segments"] if s["id"] == segment_id)


def subscribe_telegram(segment_id="seg_05", consent=1):
    with get_db() as conn:
        conn.execute("""
            INSERT INTO subscriptions (name, phone_or_email, segment_id, channel, consent, token, created_at)
            VALUES ('NodeTest Sub', '123456789', ?, 'telegram', ?, 'tok_nodetest', '2026-10-23T00:00:00Z')
        """, (segment_id, consent))


# --- contract and auth -------------------------------------------------------------------

def test_reading_auth_matches_firmware_table(monkeypatch):
    monkeypatch.setattr(config, "NODE_API_KEY", "")
    assert post("OK").status_code == 503
    monkeypatch.setattr(config, "NODE_API_KEY", KEY)
    assert client.post("/node/reading", json={"node_id": "NODE1", "segment_id": "seg_05", "state": "OK"},
                       headers={"X-Node-Key": "wrong"}).status_code == 401
    assert post("OK").status_code == 201


def test_contract_validation_and_v2_fields():
    assert post("OK", seg="seg_19").status_code == 422          # SEGMENT_ID must be seg_01..seg_18
    assert post("PANIC").status_code == 422
    r = post("OK", fw="2.0.0", rssi_dbm=-58, uptime_s=3605, heap_free=182000, rtt_ms=143, buffered=0,
             overwritten=0, strikes_10s=1, vib_thr_g=0.12, link="wifi", some_future_field=42)
    assert r.status_code == 201, r.text
    node = client.get("/node/fleet").json()["nodes"][0]
    assert node["health"]["rssi_dbm"] == -58 and node["health"]["link"] == "wifi"
    assert node["kind"] == "hardware" and node["status"] == "ONLINE"


# --- escalation into the regional system -------------------------------------------------

def test_alarm_escalates_map_planner_and_bot():
    post("ALARM")
    s = seg()
    assert s["adjusted_risk_level"] == "Very High"
    assert s["node_escalation"]["avoid"] is True
    assert "Live slope sensor NODE1 reports ALARM on seg_05" in s["adjustment_reason"]

    rr = client.get("/route-risk?from_segment=seg_04&to_segment=seg_06").json()
    assert rr["recommendation"]["action"] == "AVOID"
    assert "Sensor warning, not an official closure" in rr["recommendation"]["reason"]
    assert rr["max_risk_level"] == "Very High"
    assert "LIVE SENSOR ALARM" in rr["advisory"]

    from app.bot.telegram_bot import handle_telegram_command
    reply = handle_telegram_command(555, "/route Kaudiyala Kirtinagar")
    assert "Recommendation: AVOID" in reply


def test_warning_gives_high_and_caution():
    post("WARNING")
    s = seg()
    assert s["adjusted_risk_level"] in ("High", "Very High")
    assert s["node_escalation"]["avoid"] is False
    rr = client.get("/route-risk?from_segment=seg_04&to_segment=seg_06").json()
    assert rr["recommendation"]["action"] == "CAUTION"


def test_calm_reading_releases_and_closes_incident(node_env):
    clock, _ = node_env
    post("ALARM")
    clock.advance(5)
    post("OK")
    assert seg().get("node_escalation") is None
    inc = client.get("/node/incidents").json()["incidents"][0]
    assert inc["open"] is False and inc["close_reason"] == "calm" and inc["peak_state"] == "ALARM"


def test_time_machine_ignores_live_sensors():
    post("ALARM")
    replay = client.get("/risk-map?as_of=2023-08-14").json()
    s05 = next(s for s in replay["segments"] if s["id"] == "seg_05")
    assert s05.get("node_escalation") is None


# --- F3: a silent node never looks safe --------------------------------------------------

def test_sensor_lost_holds_until_acknowledged(node_env):
    clock, _ = node_env
    post("ALARM")
    clock.advance(16)
    node = client.get("/node/fleet").json()["nodes"][0]
    assert node["status"] == "SENSOR_LOST" and node["escalates"] is True
    s = seg()
    assert s["node_escalation"]["status"] == "SENSOR_LOST"
    assert "went silent 16 s after reporting ALARM" in s["adjustment_reason"]

    clock.advance(600)  # the old patch expired after 10 minutes; the hold must not
    assert client.get("/node/fleet").json()["nodes"][0]["status"] == "SENSOR_LOST"
    assert client.get("/route-risk?from_segment=seg_05&to_segment=seg_05").json()["recommendation"]["action"] == "AVOID"

    ack = client.post("/node/ack/NODE1")  # testclient counts as localhost; admin key unset in dev
    assert ack.status_code == 200 and ack.json()["status"] == "OFFLINE"
    assert seg().get("node_escalation") is None
    inc = client.get("/node/incidents").json()["incidents"][0]
    assert inc["close_reason"] == "acknowledged"


def test_quiet_calm_node_goes_stale_then_offline_without_escalating(node_env):
    clock, _ = node_env
    post("OK")
    clock.advance(20)
    assert client.get("/node/fleet").json()["nodes"][0]["status"] == "STALE"
    clock.advance(200)
    assert client.get("/node/fleet").json()["nodes"][0]["status"] == "OFFLINE"
    assert seg().get("node_escalation") is None


def test_ack_unknown_node_404():
    assert client.post("/node/ack/NOPE").status_code == 404


def test_state_survives_restart(node_env):
    clock, _ = node_env
    post("ALARM")
    node_service.reset_state()  # as after a backend restart
    clock.advance(20)
    assert client.get("/node/fleet").json()["nodes"][0]["status"] == "SENSOR_LOST"


# --- F7: late outbox messages are history only -------------------------------------------

def test_late_messages_never_change_live_state(node_env):
    clock, _ = node_env
    post("OK", ts_ms=clock.ms)
    r = post("ALARM", late=1, ts_ms=clock.ms - 25_000)
    assert r.json()["late"] is True
    r2 = post("ALARM", ts_ms=clock.ms - 60_000)            # old by a valid clock, no flag
    assert r2.json()["late"] is True
    assert client.get("/node/fleet").json()["nodes"][0]["state"] == "OK"
    assert seg().get("node_escalation") is None
    hist = client.get("/node/history?node_id=NODE1").json()["readings"]
    assert [h["late"] for h in hist] == [0, 1, 1]
    r3 = post("WATCH", ts_ms=12_345)                         # no NTP yet: never "late"
    assert r3.json()["late"] is False


def test_delivery_from_sequence_numbers():
    for s in (1, 2, 4):
        post("OK", seq=s)
    d = client.get("/node/fleet").json()["nodes"][0]["delivery"]
    assert d["received"] == 3 and d["expected"] == 4 and d["delivered_pct"] == 75.0


# --- node kinds --------------------------------------------------------------------------

def test_simulated_never_escalates_replay_and_mock_are_labelled():
    post("ALARM", node="SIM-01", seg="seg_02")
    assert seg("seg_02").get("node_escalation") is None
    post("ALARM", node="REPLAY1", seg="seg_03")
    assert seg("seg_03")["adjustment_reason"].startswith("[REPLAY of a recorded bench test]")
    post("ALARM", node="MOCK-NODE1", seg="seg_04")
    assert seg("seg_04")["adjustment_reason"].startswith("[MOCK sensor data, not a real node]")
    labels = {n["node_id"]: n["label"] for n in client.get("/node/fleet").json()["nodes"]}
    assert labels == {"MOCK-NODE1": "MOCK DATA", "REPLAY1": "REPLAY", "SIM-01": "SIMULATED"}


# --- F2: one-clock incident timing and the alert message ---------------------------------

def test_incident_timing_on_one_clock(node_env):
    clock, fake = node_env
    subscribe_telegram()
    m = client.post("/node/mark", json={"label": "E3 20cm"}, headers=H)
    assert m.status_code == 200
    clock.advance(0.8)
    post("WARNING")
    clock.advance(1.2)
    post("ALARM")
    inc = client.get("/node/incidents").json()["incidents"][0]
    assert inc["mark_label"] == "E3 20cm"
    assert inc["mark_to_server_ms"] == 800
    assert inc["mark_to_alarm_ms"] == 2000
    assert inc["alarm_to_alert_ms"] == 0          # synchronous in tests
    assert inc["alert_channel"] == "telegram"
    assert len(fake.sent) == 1
    assert "SENSOR ALARM" in fake.sent[0][2] and "not an official closure" in fake.sent[0][2]


def test_alarm_message_once_per_incident_and_never_for_sim(node_env):
    clock, fake = node_env
    subscribe_telegram()
    post("ALARM"); clock.advance(1); post("ALARM"); clock.advance(1); post("ALARM")
    assert len(fake.sent) == 1
    clock.advance(1); post("OK"); clock.advance(1); post("ALARM")   # new incident
    assert len(fake.sent) == 2
    post("ALARM", node="SIM-02", seg="seg_05")
    assert len(fake.sent) == 2


def test_no_consenting_subscribers_is_recorded(node_env):
    subscribe_telegram(consent=0)
    post("ALARM")
    inc = client.get("/node/incidents").json()["incidents"][0]
    assert inc["alert_sent_ms"] is None and inc["alert_channel"].startswith("none")


def test_dispatcher_does_not_double_alert_on_sensor_escalation(node_env):
    _, fake = node_env
    post("ALARM")                                   # no subscribers yet: no sensor message
    subscribe_telegram()
    from app.alert_dispatcher import dispatch_alerts
    dispatch_alerts()                               # dry weather: base level is not High
    assert fake.sent == []


def test_mark_auth(monkeypatch):
    assert client.post("/node/mark", json={}).status_code == 401
    monkeypatch.setattr(config, "ADMIN_API_KEY", "admin-x")
    assert client.post("/node/mark", json={}, headers={"X-Admin-Key": "admin-x"}).status_code == 200
    assert client.post("/node/mark", headers=H).status_code == 200      # empty body allowed
    assert len(client.get("/node/marks").json()["marks"]) == 2


# --- F8 placement ------------------------------------------------------------------------

def test_placement_mock_respects_spacing():
    p = client.get("/node/placement?n=6&min_spacing_km=2").json()
    assert p["is_mock"] is True and len(p["sites"]) == 6
    kms = sorted(s["chainage_km"] for s in p["sites"])
    assert all(b - a >= 2 for a, b in zip(kms, kms[1:]))
    assert p["sites"][0]["rank"] == 1 and p["sites"][0]["segment_name"]


def test_placement_uses_point_scores_csv(tmp_path, monkeypatch):
    csv_path = tmp_path / "point_scores.csv"
    csv_path.write_text("lat,lon,segment_id,score,chainage_km\n"
                        "30.10,78.30,seg_01,0.40,1.0\n30.11,78.31,seg_01,0.95,1.5\n"
                        "30.20,78.60,seg_05,0.90,80.0\n", encoding="utf-8")
    monkeypatch.setattr(config, "POINT_SCORES_CSV", csv_path)
    p = client.get("/node/placement?n=3&min_spacing_km=2").json()
    assert p["is_mock"] is False
    assert [s["score"] for s in p["sites"]] == [0.95, 0.9]       # 0.40 is within 2 km of 0.95


# --- tools and page ----------------------------------------------------------------------

def test_tools_parse_firmware_csv():
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
    from _common import parse_csv_line
    r = parse_csv_line("CSV,12000,9.10,2.40,0.120,0.412,41.0,0,3,failure")
    assert r["state"] == "ALARM" and r["tilt_deg"] == 9.1 and r["vib_g"] == 0.412
    assert parse_csv_line("NET,wifi=3,dropped=0") is None
    assert parse_csv_line("12000,1.0,0.0,0.02,0.04,38,0,OK")["state"] == "OK"


def test_live_page_served():
    r = client.get("/static/node_live.html")
    assert r.status_code == 200 and "Raah Node Live" in r.text
