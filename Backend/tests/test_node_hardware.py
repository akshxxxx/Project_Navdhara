"""
Live hardware path for the wired Raah Node (app/node_sensors.py, app/serial_ingest.py):
raw ADC calibration, server-side state when the sketch sends none, tilt rate and strikes
from recent readings, USB serial lines (JSON + old CSV, Wi-Fi duplicates skipped), and a
full USB session through a pyserial loopback port.
"""
import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import config, node_sensors, node_service, serial_ingest
from app.database import get_db, init_db
from app.main import app
from app.notifiers import set_fake_notifier
from app.notifiers.base import BaseNotifier

client = TestClient(app)
KEY = "test-node-key-123"
H = {"X-Node-Key": KEY}
T0 = 1_800_000_000_000


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
def hw_env(monkeypatch):
    init_db()
    with get_db() as conn:
        for t in ("node_readings", "node_marks", "node_incidents"):
            conn.execute(f"DELETE FROM {t}")
    node_service.reset_state()
    serial_ingest._reset_status()
    monkeypatch.setattr(config, "NODE_API_KEY", KEY)
    monkeypatch.setattr(config, "ADMIN_API_KEY", "")
    monkeypatch.setattr(config, "ENV", "development")
    monkeypatch.setattr(config, "NODE_SERIAL_NODE_ID", "NODE1")
    monkeypatch.setattr(config, "NODE_SERIAL_SEGMENT", "seg_08")
    monkeypatch.setattr(node_service, "ALERT_ASYNC", False)
    clock = Clock()
    monkeypatch.setattr(node_service, "_now_ms", clock)
    fake = FakeNotifier()
    set_fake_notifier(fake)
    with patch("app.risk_service.fetch_rainfall_with_metadata", return_value=_dry_rain()):
        yield clock


def post(body):
    return client.post("/node/reading", json={"node_id": "NODE1", "segment_id": "seg_08", **body}, headers=H)


def fleet_node():
    return client.get("/node/fleet").json()["nodes"][0]


# ---------------------------------------------------------------- calibration

def test_raw_adc_calibration_matches_the_bench_numbers():
    assert node_sensors.raw_to_pct(4095, 4095, 1250) == 0.0     # soil dry
    assert node_sensors.raw_to_pct(1250, 4095, 1250) == 100.0   # soil in water
    assert node_sensors.raw_to_pct(900, 4095, 1250) == 100.0    # clamped
    assert node_sensors.raw_to_pct(2672, 4095, 1250) == 50.0
    assert node_sensors.raw_to_pct(2400, 4095, 2400) == 100.0   # rain plate wet


def test_raw_only_reading_gets_percentages_and_a_server_state():
    r = post({"tilt_deg": 0.3, "soil_raw": 4000, "rain_raw": 4090})
    assert r.status_code == 201, r.text
    assert r.json()["state"] == "OK" and r.json()["state_source"] == "server"
    n = fleet_node()
    assert n["reading"]["moisture_pct"] == pytest.approx(3.3, abs=0.1)
    assert n["reading"]["rain_wet"] == 0
    assert n["health"]["soil_raw"] == 4000 and n["health"]["state_source"] == "server"


def test_wet_rain_plate_and_saturated_soil_lower_the_thresholds():
    # rain plate at 2600 (88 % wet) -> WATCH
    assert post({"tilt_deg": 0.2, "soil_raw": 4000, "rain_raw": 2600}).json()["state"] == "WATCH"
    # 3.5 deg is only WATCH on dry soil, but WARNING on saturated soil (3.5 >= 5 x 0.6)
    assert post({"tilt_deg": 3.5, "soil_raw": 4000}).json()["state"] == "WATCH"
    assert post({"tilt_deg": 3.5, "soil_raw": 1300}).json()["state"] == "WARNING"


def test_server_state_alarm_escalates_like_firmware_alarm(hw_env):
    r = post({"tilt_deg": 9.0, "soil_raw": 4000, "rain_raw": 4095})
    assert r.json()["state"] == "ALARM"
    seg = next(s for s in client.get("/risk-map").json()["segments"] if s["id"] == "seg_08")
    assert seg["node_escalation"]["avoid"] is True


def test_state_sent_by_node_wins_and_accepts_simple_spellings():
    r = post({"state": "alarm", "tilt_deg": 0.1})
    assert r.status_code == 201 and r.json()["state"] == "ALARM" and r.json()["state_source"] == "node"
    assert post({"state": 1}).json()["state"] == "WATCH"
    assert post({"state": "BROKEN"}).status_code == 422
    assert post({"soil_raw": 5000}).status_code == 422  # not a 12-bit ADC value


def test_tilt_rate_and_strikes_come_from_recent_readings(hw_env):
    clock = hw_env
    for t in (0.0, 0.0, 0.0):
        post({"tilt_deg": t, "vib_g": 0.02})
        clock.advance(1)
    # +1 deg in 3 s = 20 deg/min -> ALARM from the rate alone
    r = post({"tilt_deg": 1.0, "vib_g": 0.4})
    assert r.json()["state"] == "ALARM"
    n = fleet_node()
    assert n["reading"]["tilt_rate_dpm"] == pytest.approx(20.0, abs=0.1)
    assert n["health"]["strikes_10s"] == 1


def test_raw_accelerometer_gives_tilt_from_the_first_reading(hw_env):
    clock = hw_env
    post({"ax_g": 0.0, "ay_g": 0.0, "az_g": 1.0})
    clock.advance(1)
    # gravity now 10 deg away from where it started
    import math
    a = math.radians(10)
    post({"ax_g": math.sin(a), "ay_g": 0.0, "az_g": math.cos(a)})
    n = fleet_node()
    assert n["reading"]["tilt_deg"] == pytest.approx(10.0, abs=0.05)
    assert n["state"] == "ALARM"


# ---------------------------------------------------------------- USB serial lines

def test_parse_line_kinds():
    assert serial_ingest.parse_line('{"tilt_deg":1,"posted":0}') == ("reading", {"tilt_deg": 1})
    assert serial_ingest.parse_line('{"tilt_deg":1,"posted":1}')[0] == "wifi_dupe"
    kind, body = serial_ingest.parse_line("CSV,1234,6.2,3.1,0.05,0.12,41.0,0,WARNING,creep")
    assert kind == "reading" and body["state"] == "WARNING" and body["model_state"] == "creep"
    assert serial_ingest.parse_line("CSV,1234,6.2,3.1,0.05,0.12,41.0,0,2")[1]["state"] == "WARNING"
    assert serial_ingest.parse_line("READY,RAAH_NODE,2.1.0,NODE1,seg_05,usb") == ("log", None)
    assert serial_ingest.parse_line("NET,POST_FAIL,401") == ("log", None)
    assert serial_ingest.parse_line('{"tilt_deg":') == ("bad", None)


def test_handle_line_stores_usb_readings_with_defaults():
    res = serial_ingest.handle_line(json.dumps({"tilt_deg": 0.4, "soil_raw": 3900, "rain_raw": 4095, "posted": 0}))
    assert res["node_id"] == "NODE1" and res["state"] == "OK"
    n = fleet_node()
    assert n["segment_id"] == "seg_08" and n["health"]["link"] == "serial" and n["status"] == "ONLINE"
    # already delivered over Wi-Fi -> counted, not stored again
    assert serial_ingest.handle_line('{"tilt_deg":0.4,"posted":1}') is None
    serial_ingest.handle_line("CAL,OK,0.010,-0.020,0.998")
    serial_ingest.handle_line('{"segment_id":"seg_99"}')
    st = client.get("/node/serial").json()
    assert st["readings"] == 1 and st["skipped_wifi_dupes"] == 1 and st["bad_lines"] == 1
    assert st["recent_log"][-1]["line"].startswith("CAL,OK")
    with get_db() as conn:
        assert conn.execute("SELECT COUNT(*) FROM node_readings").fetchone()[0] == 1


def test_usb_alarm_sends_the_sensor_alarm_once():
    with get_db() as conn:
        conn.execute("DELETE FROM subscriptions WHERE name = 'HwTest'")
        conn.execute("""INSERT INTO subscriptions (name, phone_or_email, channel, segment_id, consent, created_at)
                        VALUES ('HwTest', '+910000000001', 'console', 'seg_08', 1, '2026-10-23T00:00:00Z')""")
    try:
        res = serial_ingest.handle_line('{"tilt_deg":9.5,"soil_raw":4000,"posted":0}')
        assert res["state"] == "ALARM" and res["alarm_started"] is True
        res2 = serial_ingest.handle_line('{"tilt_deg":9.6,"soil_raw":4000,"posted":0}')
        assert res2["alarm_started"] is False
        inc = client.get("/node/incidents").json()["incidents"][0]
        assert inc["alert_sent_ms"] is not None
    finally:
        with get_db() as conn:
            conn.execute("DELETE FROM subscriptions WHERE name = 'HwTest'")


def test_full_usb_session_over_a_loopback_port(monkeypatch):
    """The real reader thread against pyserial's loop:// port: what the board writes is ingested."""
    import serial
    import time as _t

    port = serial.serial_for_url("loop://", timeout=0.2)
    monkeypatch.setattr(config, "NODE_SERIAL", "loop://")
    monkeypatch.setattr(serial_ingest, "_open", lambda _p: port)
    monkeypatch.setattr(serial_ingest, "SCAN_EVERY_S", 0.05)
    assert serial_ingest.start() is False  # never opens a real port under pytest
    serial_ingest._stop.clear()
    serial_ingest._paused.clear()
    import threading
    serial_ingest._thread = threading.Thread(target=serial_ingest._run, daemon=True)
    serial_ingest._thread.start()
    try:
        port.write(b"READY,RAAH_NODE,2.1.0,NODE1,seg_08,usb\n")
        port.write(b'{"node_id":"NODE1","segment_id":"seg_08","tilt_deg":0.5,"soil_raw":3950,"rain_raw":4095,"posted":0}\n')
        deadline = _t.time() + 5
        while _t.time() < deadline and serial_ingest.get_status()["readings"] < 1:
            _t.sleep(0.05)
        st = serial_ingest.get_status()
        assert st["state"] == "connected" and st["readings"] == 1
        assert fleet_node()["health"]["link"] == "serial"
    finally:
        serial_ingest.stop()
        serial_ingest._thread = None


def test_serial_pause_and_resume_need_the_admin_key(monkeypatch):
    monkeypatch.setattr(config, "ADMIN_API_KEY", "adm-key")
    assert client.post("/node/serial/pause").status_code == 401
    assert client.post("/node/serial/pause", headers={"X-Admin-Key": "adm-key"}).json()["paused"] is True
    assert client.post("/node/serial/resume", headers={"X-Admin-Key": "adm-key"}).json()["paused"] is False
