"""Shared helpers for the Raah Node tools (mock_node, sim_fleet, mark_event, replay_session, serial_bridge)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

import requests

BACKEND_DIR = Path(__file__).resolve().parent.parent
# 127.0.0.1, not "localhost": on Windows "localhost" tries IPv6 first and each request waits ~2 s
# before falling back (measured 2054 ms vs 13 ms), which breaks the node's 1-per-second rhythm.
DEFAULT_URL = "http://127.0.0.1:8000"
STATE_NAMES = ["OK", "WATCH", "WARNING", "ALARM"]


def read_env_value(name: str) -> Optional[str]:
    """Value from the environment, else from Backend/.env (same file the server reads)."""
    if os.environ.get(name):
        return os.environ[name]
    env_file = BACKEND_DIR / ".env"
    if env_file.is_file():
        for raw in env_file.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def post_json(url: str, path: str, body: Dict[str, Any], headers: Dict[str, str], timeout: float = 3.5) -> int:
    """POST and return the HTTP status, or -1 when the server cannot be reached (like the firmware)."""
    try:
        return requests.post(f"{url.rstrip('/')}{path}", json=body, headers=headers, timeout=timeout).status_code
    except requests.RequestException:
        return -1


def parse_csv_line(line: str) -> Optional[Dict[str, Any]]:
    """
    One firmware serial line: CSV,millis,tilt,rate,vrms,vpk,moist,rain,state,model
    (the leading "CSV," is optional). Returns None for other lines (NET, CAL, READY, headers).
    """
    parts = [p.strip() for p in line.strip().split(",")]
    if parts and parts[0].upper() == "CSV":
        parts = parts[1:]
    if len(parts) < 8:
        return None
    try:
        millis = int(float(parts[0]))
        tilt, rate, vrms, vpk, moist = (float(x) for x in parts[1:6])
        rain = int(float(parts[6]))
        state_raw = parts[7]
        state = STATE_NAMES[int(float(state_raw))] if state_raw.replace(".", "").isdigit() else state_raw.upper()
    except (ValueError, IndexError):
        return None
    if state not in STATE_NAMES:
        return None
    return {
        "millis": millis, "tilt_deg": tilt, "tilt_rate_dpm": rate, "vib_rms_g": vrms, "vib_g": vpk,
        "moisture_pct": moist, "rain_wet": rain, "state": state,
        "model_state": parts[8] if len(parts) > 8 and parts[8] else None,
    }
