"""
Regression tests for the backend fixes made against the web dashboard (Frontend/) and the
Expo app (App/) on 2026-10-23. Each test sends exactly what a client sends and checks the
fields that client reads. See log.md for the why of each fix.
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import config
from app.database import get_db, init_db
from app.main import app

client = TestClient(app)
ADMIN_HEADERS = {"X-Admin-Key": config.ADMIN_API_KEY} if config.ADMIN_API_KEY else {}


def _rain(mm):
    rain = {f"seg_{i:02d}": {"rain_mm": mm, "status": "ok"} for i in range(1, 19)}
    meta = {
        "weather_source": "live",
        "weather_fetched_at": "2026-10-23T06:00:00Z",
        "weather_age_minutes": 1.0,
        "is_simulated": False,
        "stale_warning": None,
    }
    return rain, meta


@pytest.fixture(autouse=True)
def offline_weather_and_clean_tables():
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM road_closures")
        conn.execute("DELETE FROM field_reports WHERE reporter_name LIKE 'Contract-%'")
        conn.execute("DELETE FROM subscriptions WHERE name LIKE 'Contract%' OR name = 'Traveller'")
    with patch("app.risk_service.fetch_rainfall_with_metadata", return_value=_rain(120.0)):
        yield
    with get_db() as conn:
        conn.execute("DELETE FROM road_closures")
        conn.execute("DELETE FROM field_reports WHERE reporter_name LIKE 'Contract-%'")
        conn.execute("DELETE FROM subscriptions WHERE name LIKE 'Contract%' OR name = 'Traveller'")


def _tomorrow_ist_8am() -> str:
    ist = timezone(timedelta(hours=5, minutes=30))
    return (datetime.now(ist) + timedelta(days=1)).strftime("%Y-%m-%dT08:00:00")


# --- /route-risk crash fixes -------------------------------------------------------------

def test_route_risk_hindi_with_depart_time_does_not_crash(monkeypatch):
    """App in Hindi always sends depart_time; this used to raise AttributeError (dict.action_en) -> 500."""
    monkeypatch.setattr(config, "TIME_AWARE_PLANNER", True)
    resp = client.get("/route-risk", params={
        "from_segment": "seg_01", "to_segment": "seg_05",
        "depart_time": _tomorrow_ist_8am(), "speed_kmph": 30, "lang": "hi",
    })
    assert resp.status_code == 200, resp.text
    rec = resp.json()["recommendation"]
    assert rec["action_en"]
    assert rec["action"] != rec["action_en"]  # localized


def test_route_risk_restricted_closure_with_depart_time_does_not_crash(monkeypatch):
    """A one_way/restricted closure plus depart_time read recommendation_payload.action on a dict -> 500."""
    monkeypatch.setattr(config, "TIME_AWARE_PLANNER", True)
    with get_db() as conn:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO road_closures (segment_id, status, reason, source, starts_at, ends_at, created_by, created_at) "
            "VALUES ('seg_03', 'one_way', 'Contract one-way test', 'BRO', ?, NULL, 'test', ?)",
            (now, now),
        )
    resp = client.get("/route-risk", params={
        "from_segment": "seg_01", "to_segment": "seg_05", "depart_time": _tomorrow_ist_8am(),
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["recommendation"]["action"] in ("CAUTION", "DELAY", "AVOID")


def test_route_risk_date_optional_and_taken_from_depart_time(monkeypatch):
    """The app derives `date` in UTC; the departure's IST date must win (00:00-05:30 IST case)."""
    monkeypatch.setattr(config, "TIME_AWARE_PLANNER", True)
    ist = timezone(timedelta(hours=5, minutes=30))
    depart_ist = (datetime.now(ist) + timedelta(days=1)).replace(hour=2, minute=0, second=0, microsecond=0)
    utc_date = depart_ist.astimezone(timezone.utc).strftime("%Y-%m-%d")  # previous day
    resp = client.get("/route-risk", params={
        "from_segment": "seg_01", "to_segment": "seg_03",
        "date": utc_date, "depart_time": depart_ist.isoformat(),
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["date"] == depart_ist.strftime("%Y-%m-%d")

    no_date = client.get("/route-risk", params={"from_segment": "seg_01", "to_segment": "seg_03"})
    assert no_date.status_code == 200, no_date.text


def test_post_trip_planner_matches_route_risk(monkeypatch):
    """Web postTripPlanner() POSTs JSON first; the endpoint used to 404/405."""
    monkeypatch.setattr(config, "TIME_AWARE_PLANNER", True)
    body = {"origin": "seg_01", "destination": "seg_04", "depart_time": _tomorrow_ist_8am(),
            "speed_kmph": 30, "lang": "en"}
    resp = client.post("/trip-planner", json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["from_segment"] == "seg_01" and data["to_segment"] == "seg_04"
    assert data["recommendation"]["best_departure_options"] is not None
    assert data["segments"][0]["terrain_score"] is not None


# --- /risk-map ---------------------------------------------------------------------------

def test_risk_map_exposes_client_fields():
    seg = client.get("/risk-map").json()["segments"][0]
    assert seg["terrain_score"] == seg["terrain_percentile"]
    assert seg["r3d_mm"] == seg["rain_mm_3d"]
    assert isinstance(seg["ground_report_count_24h"], int)
    # No escalation without validated reports: web treats any adjusted_risk_level as +1 step
    assert seg.get("adjusted_risk_level") is None


def test_validated_report_escalates_risk_map():
    """compute_segment passed an undefined name (`level`), so the flywheel never reached /risk-map."""
    with patch("app.risk_service.fetch_rainfall_with_metadata", return_value=_rain(0.0)):
        before = {s["id"]: s for s in client.get("/risk-map").json()["segments"]}
        assert before["seg_10"]["risk_level"] in ("Low", "Moderate")
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO field_reports (lat, lng, description, reporter_name, status, created_at, updated_at, segment_id) "
                "VALUES (30.28, 78.98, 'Contract fresh debris', 'Contract-Patrol', 'Validated', ?, ?, 'seg_10')",
                (now, now),
            )
        after = {s["id"]: s for s in client.get("/risk-map").json()["segments"]}
    assert after["seg_10"]["adjusted_risk_level"] is not None
    assert after["seg_10"]["adjusted_risk_level"] != after["seg_10"]["risk_level"]
    assert after["seg_10"]["ground_report_count_24h"] >= 1


# --- /closures ---------------------------------------------------------------------------

def test_closures_shape_matches_clients():
    created = client.post("/admin/closure", headers=ADMIN_HEADERS, json={
        "segment_id": "seg_08", "status": "closed", "reason": "Contract closure", "source": "BRO",
    })
    assert created.status_code == 201, created.text
    assert created.json()["segment_name"]

    data = client.get("/closures?active_only=true").json()
    assert data["active_closures_count"] == 1
    assert data["closures"][0]["segment_name"]

    seg = next(s for s in client.get("/risk-map").json()["segments"] if s["id"] == "seg_08")
    assert seg["closure"]["segment_name"]


# --- field reports -----------------------------------------------------------------------

def test_field_report_response_has_id_for_app():
    resp = client.post("/field-report", json={
        "lat": 30.12, "lng": 78.32, "reporter_name": "Contract-App", "description": "[Rockfall] stones on road",
    })
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["id"] == data["report_id"]
    assert data["segment_id"].startswith("seg_")


def test_field_reports_list_uses_client_status_words_and_fields():
    rep = client.post("/field-report", json={
        "lat": 30.13, "lng": 78.33, "reporter_name": "Contract-List", "description": "Debris near bend",
    }).json()
    rows = client.get("/field-reports").json()
    mine = next(r for r in rows if r["id"] == rep["report_id"])
    assert mine["status"] == "pending"
    assert mine["status_label"] == "Pending"
    assert mine["segment_id"].startswith("seg_")
    assert mine["reported_at"] == mine["created_at"]


@pytest.mark.parametrize("client_status,stored,listed", [
    ("verified", "Validated", "verified"),
    ("rejected", "Rejected", "rejected"),
])
def test_validate_report_accepts_client_payload(client_status, stored, listed):
    """Web and app send {report_id, status: 'verified'|'rejected', verified_by}; backend required `decision` -> 422."""
    rep = client.post("/field-report", json={
        "lat": 30.14, "lng": 78.34, "reporter_name": "Contract-Validate", "description": "Slope crack seen",
    }).json()
    resp = client.post("/admin/validate-report", headers=ADMIN_HEADERS, json={
        "report_id": rep["report_id"], "status": client_status, "verified_by": "Official",
    })
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == stored
    row = next(r for r in client.get("/field-reports").json() if r["id"] == rep["report_id"])
    assert row["status"] == listed
    assert "Official" in row["decision_notes"]


def test_validate_report_without_decision_or_status_is_422():
    resp = client.post("/admin/validate-report", headers=ADMIN_HEADERS, json={"report_id": 1})
    assert resp.status_code == 422


# --- subscriptions and alerts ------------------------------------------------------------

def test_subscribe_accepts_web_dashboard_payload():
    """Web Alerts page posts {phone_number, alert_channel: 'sms'} with no name or segment."""
    resp = client.post("/subscribe", json={"phone_number": "+919876543210", "alert_channel": "sms"})
    assert resp.status_code == 201, resp.text
    sub = resp.json()["subscription"]
    assert sub["channel"] == "SMS"
    assert sub["segment_id"] == "all"
    assert sub["phone_or_email"] == "+91*****3210"


def test_subscribe_all_segments_and_alerts_cover_corridor():
    resp = client.post("/subscribe", json={
        "name": "Contract All", "phone_or_email": "+919811122233", "segment_id": "all",
        "channel": "SMS", "consent": True,
    })
    assert resp.status_code == 201, resp.text
    token = resp.json()["token"]
    alerts = client.get(f"/alerts?token={token}").json()
    assert alerts["subscribed_segment"].startswith("all")
    assert alerts["active_alerts_count"] == len(alerts["alerts"]) > 1  # 120 mm on every segment


def test_alerts_without_token_is_public_feed_not_first_subscriber():
    client.post("/subscribe", json={
        "name": "Contract Private", "phone_or_email": "+919800000001", "segment_id": "seg_02", "channel": "SMS",
    })
    data = client.get("/alerts").json()
    assert data["user_id"] == 0
    assert data["subscriber_name"] == "Public corridor feed"
    assert "Contract" not in str(data)
    assert len(data["alerts"]) > 0


def test_alerts_user_id_without_token_still_401():
    assert client.get("/alerts?user_id=1").status_code == 401


# --- priority list, offline pack, CORS ---------------------------------------------------

def test_priority_list_aliases_for_both_clients():
    data = client.get("/priority-list").json()
    assert data["priority_list"] == data["segments"] == data["priority_segments"]
    top = data["priority_list"][0]
    assert top["segment_id"] == top["id"]
    assert top["segment_name"] == top["name"]
    assert top["hazard_risk_score"] == top["risk_index"]


def test_offline_pack_has_app_emergency_fields():
    data = client.get("/offline-pack").json()
    assert data["advisory_en"] and data["advisory_hi"]
    assert len(data["hospitals"]) > 0
    h = data["hospitals"][0]
    assert {"segment_id", "segment_name", "hospital_name", "distance_km"} <= set(h)


@pytest.mark.parametrize("worst,closure,expected", [
    ("Low", None, "LOW RISK"),
    ("Moderate", None, "CAUTION"),        # bot used to answer LOW RISK here (seen live 2026-10-23)
    ("Low", "one_way", "CAUTION"),
    ("High", None, "CAUTION / DELAY"),
    ("Moderate", "closed", "AVOID"),
])
def test_telegram_route_recommendation_matches_api_tiers(worst, closure, expected):
    from app.bot.telegram_bot import handle_telegram_command
    segs = [
        {"id": f"seg_{i:02d}", "name": n, "sequence_order": i, "risk_level": "Low", "closure": None}
        for i, n in ((1, "Rishikesh to Shivpuri"), (2, "Shivpuri to Byasi"), (3, "Byasi to Kaudiyala"))
    ]
    segs[1]["risk_level"] = worst
    if closure:
        segs[0]["closure"] = {"status": closure}  # "Byasi" matches seg_02, so the route is seg_01..seg_02
    with patch("app.bot.telegram_bot.get_live_risk_map_with_metadata", return_value=(segs, {})):
        reply = handle_telegram_command(999000111, "/route Rishikesh Byasi")
    rec = reply.split("Recommendation:")[1].strip()
    assert rec.startswith(expected), reply


def test_cors_exposes_etag_to_web_dashboard():
    resp = client.get("/offline-pack", headers={"Origin": "http://localhost:5173"})
    exposed = resp.headers.get("access-control-expose-headers", "")
    assert "ETag" in exposed
