"""
POST /admin/alert-all: the officials' dashboard "Alert All" button (2026-10-23, log.md L-032).
"""
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from app import config
from app.database import get_db, init_db
from app.main import app
from app.notifiers import set_fake_notifier
from app.notifiers.base import BaseNotifier

client = TestClient(app)


class FakeNotifier(BaseNotifier):
    def __init__(self):
        self.sent = []

    def send(self, recipient, message, channel="console"):
        self.sent.append((recipient, channel, message))
        return True


def _rain():
    rain = {f"seg_{i:02d}": {"rain_mm": 120.0, "status": "ok"} for i in range(1, 19)}
    return rain, {"weather_source": "live", "weather_fetched_at": None, "weather_age_minutes": 0.0,
                  "is_simulated": False, "stale_warning": None}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM subscriptions")
        rows = [("Official A", "111111111", "seg_05", "telegram", 1),
                ("Official B", "+919800000002", "all", "SMS", 1),
                ("Official C", "+919800000003", "seg_08", "SMS", 1),
                ("No consent", "+919800000004", "seg_05", "SMS", 0)]
        for name, contact, seg, ch, consent in rows:
            conn.execute(
                "INSERT INTO subscriptions (name, phone_or_email, segment_id, channel, consent, token, created_at) "
                "VALUES (?, ?, ?, ?, ?, 'tok_x', '2026-10-23T00:00:00Z')", (name, contact, seg, ch, consent))
    monkeypatch.setattr(config, "ADMIN_API_KEY", "")
    monkeypatch.setattr(config, "ENV", "development")
    fake = FakeNotifier()
    set_fake_notifier(fake)
    with patch("app.risk_service.fetch_rainfall_with_metadata", return_value=_rain()):
        yield fake
    set_fake_notifier(None)
    with get_db() as conn:
        conn.execute("DELETE FROM subscriptions")


def test_alert_all_for_stretch_reaches_stretch_and_corridor_subscribers(env):
    r = client.post("/admin/alert-all", json={"segment_id": "seg_05"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["recipients"] == 2 and data["sent"] == 2 and data["failed"] == 0
    assert data["channels"] == {"telegram": 1, "sms": 1}
    assert data["message"].startswith("NH-7 OFFICIAL ALERT for Devprayag to Teen Dhara (seg_05): current risk")
    assert "Emergency: 112" in data["message"]
    assert sorted(x[0] for x in env.sent) == ["+919800000002", "111111111"]   # no unconsented, no seg_08
    with get_db() as conn:
        n = conn.execute("SELECT COUNT(*) FROM alert_log WHERE risk_level = 'OFFICIAL BROADCAST'").fetchone()[0]
    assert n >= 2


def test_alert_all_custom_message_and_whole_corridor(env):
    r = client.post("/admin/alert-all", json={"segment_id": "all", "message": "Convoy halted at Srinagar until 14:00."})
    data = r.json()
    assert data["recipients"] == 3 and data["segment_name"] == "Entire NH-7 corridor"
    assert all(m == "Convoy halted at Srinagar until 14:00." for _, _, m in env.sent)


def test_alert_all_validation_and_auth(monkeypatch):
    assert client.post("/admin/alert-all", json={"segment_id": "seg_19"}).status_code == 422
    monkeypatch.setattr(config, "ADMIN_API_KEY", "secret-x")
    assert client.post("/admin/alert-all", json={"segment_id": "seg_05"}).status_code == 401
    ok = client.post("/admin/alert-all", json={"segment_id": "seg_05"}, headers={"X-Admin-Key": "secret-x"})
    assert ok.status_code == 200
