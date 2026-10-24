"""
node_sensors.py - turn what a Raah Node sends into a complete reading
=====================================================================
The wired node (ESP32 + MPU6050 on D21/D22, LM393 soil board on D34, LM393 rain plate on D35)
can send finished values (tilt_deg, moisture_pct, rain_wet, state) or raw ones. This fills in
whatever is missing, so a bare-bones sketch works as well as the full firmware:

  soil_raw (ADC 0..4095)    -> moisture_pct   bench calibration: dry 4095, wet ~1250
  rain_raw (ADC 0..4095)    -> rain_pct, rain_wet   dry 4095, wet ~2400; wet at >= 50 %
  ax_g, ay_g, az_g          -> tilt_deg (angle from the node's first reading), vib_g
  tilt_deg over time        -> tilt_rate_dpm (change over the last ~10 s, in deg/min)
  vib_g over time           -> strikes_10s (readings >= 0.35 g in the last 10 s)
  no state                  -> state from the thresholds below (state_source "server")

Which sensor may raise what (calibration 2026-10-24, docs/SENSOR_THRESHOLDS.md):
  tilt angle / tilt rate    -> WATCH, WARNING or ALARM   (the only sensor that can raise ALARM)
  vibration (RMS or peak)   -> WARNING at most           (traffic and rockfall both shake the node)
  soil moisture             -> WATCH at 50 %, WARNING at 70 % (saturated); saturation also
                               lowers the tilt thresholds to 60 %, so tilt alarms sooner
  rain plate wet            -> WATCH at most

A state sent by the node is kept (state_source "node"): the firmware samples at 100 Hz and
sees far more than one message a second. The one exception: an ALARM without a tilt or tilt
rate at ALARM level is lowered to WARNING (state_capped_from "ALARM"), so older or third-party
firmware cannot raise an ALARM from vibration or soil alone.
"""
from __future__ import annotations

import math
import threading
from collections import deque
from typing import Any, Deque, Dict, Optional, Tuple

from app import config

# Thresholds (dry soil), 48 h plan 4.2, recalibrated 2026-10-24. Same numbers in
# tools/mock_node.py, Hardware/raah_node/raah_node.ino and Frontend/src/pages/Sensors.jsx.
TILT_WATCH, TILT_WARN, TILT_ALARM = 2.0, 5.0, 8.0     # degrees
RATE_WARN, RATE_ALARM = 3.0, 8.0                     # degrees per minute
VIB_WARN_RMS, IMPACT_G = 0.10, 0.35                  # g; vibration never goes above WARNING
MOIST_WATCH, MOIST_SAT, WET_FACTOR = 50.0, 70.0, 0.6  # %; saturated soil -> WARNING and tilt/rate thresholds x 0.6

RATE_WINDOW_MS = 10_000
RATE_MIN_SPAN_MS = 3_000
HISTORY_MS = 60_000

_lock = threading.Lock()
# node_id -> {"tilt": deque[(ms, tilt)], "vib": deque[(ms, g)], "base": (ax, ay, az) | None}
_mem: Dict[str, Dict[str, Any]] = {}


def reset() -> None:
    with _lock:
        _mem.clear()


def raw_to_pct(raw: Optional[float], dry: int, wet: int) -> Optional[float]:
    """0 % at the dry reading, 100 % at the wet one, clamped. None if no raw value."""
    if raw is None or dry == wet:
        return None
    pct = (dry - raw) / (dry - wet) * 100.0
    return round(min(100.0, max(0.0, pct)), 1)


def tilt_alarm(tilt: float, rate: float, moist: float) -> bool:
    """True when the tilt sensor alone justifies an ALARM (angle or rate, lowered on saturated soil)."""
    f = WET_FACTOR if moist >= MOIST_SAT else 1.0
    return tilt >= TILT_ALARM * f or rate >= RATE_ALARM * f


def classify(tilt: float, rate: float, vrms: float, vpk: float, moist: float, rain_wet: int) -> str:
    f = WET_FACTOR if moist >= MOIST_SAT else 1.0
    if tilt_alarm(tilt, rate, moist):
        return "ALARM"
    if (tilt >= TILT_WARN * f or rate >= RATE_WARN * f
            or vrms >= VIB_WARN_RMS or vpk >= IMPACT_G or moist >= MOIST_SAT):
        return "WARNING"
    if tilt >= TILT_WATCH * f or moist >= MOIST_WATCH or rain_wet:
        return "WATCH"
    return "OK"


def _angle_deg(a: Tuple[float, float, float], b: Tuple[float, float, float]) -> Optional[float]:
    na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
    if na < 0.2 or nb < 0.2:  # free fall or a dead sensor: no usable gravity vector
        return None
    cos = max(-1.0, min(1.0, sum(x * y for x, y in zip(a, b)) / (na * nb)))
    return math.degrees(math.acos(cos))


def _trim(dq: Deque[Tuple[int, float]], now: int) -> None:
    while dq and now - dq[0][0] > HISTORY_MS:
        dq.popleft()


def complete(reading: Dict[str, Any], now: int, remember: bool = True) -> Dict[str, Any]:
    """
    Return a copy of `reading` with derived fields filled in. `remember=False` (late outbox
    messages) derives values without adding them to the node's recent history.
    """
    r = dict(reading)
    node_id = r["node_id"]
    with _lock:
        mem = _mem.setdefault(node_id, {"tilt": deque(), "vib": deque(), "base": None})

        # Raw analog boards -> percentages
        if r.get("moisture_pct") is None and r.get("soil_raw") is not None:
            r["moisture_pct"] = raw_to_pct(r["soil_raw"], config.NODE_SOIL_DRY_RAW, config.NODE_SOIL_WET_RAW)
        if r.get("rain_raw") is not None:
            if r.get("rain_pct") is None:
                r["rain_pct"] = raw_to_pct(r["rain_raw"], config.NODE_RAIN_DRY_RAW, config.NODE_RAIN_WET_RAW)
            if r.get("rain_wet") is None and r.get("rain_pct") is not None:
                r["rain_wet"] = 1 if r["rain_pct"] >= config.NODE_RAIN_WET_PCT else 0

        # Raw accelerometer -> tilt from the first vector seen, and a crude vibration value
        acc = tuple(r.get(k) for k in ("ax_g", "ay_g", "az_g"))
        if all(isinstance(v, (int, float)) for v in acc):
            if mem["base"] is None and remember:
                mem["base"] = acc
            if r.get("tilt_deg") is None and mem["base"] is not None:
                ang = _angle_deg(mem["base"], acc)
                if ang is not None:
                    r["tilt_deg"] = round(ang, 2)
            if r.get("vib_g") is None:
                r["vib_g"] = round(abs(math.sqrt(sum(v * v for v in acc)) - 1.0), 3)

        tilt_hist, vib_hist = mem["tilt"], mem["vib"]
        _trim(tilt_hist, now)
        _trim(vib_hist, now)

        # Tilt rate from the reading ~10 s ago (needs at least 3 s of history)
        if r.get("tilt_rate_dpm") is None and r.get("tilt_deg") is not None:
            old = None
            for ms, t in tilt_hist:
                if now - ms <= RATE_WINDOW_MS:
                    old = (ms, t)
                    break
            if old and now - old[0] >= RATE_MIN_SPAN_MS:
                r["tilt_rate_dpm"] = round(abs(r["tilt_deg"] - old[1]) / ((now - old[0]) / 60_000), 2)

        vib = r.get("vib_g")
        if r.get("strikes_10s") is None and vib is not None:
            r["strikes_10s"] = sum(1 for ms, g in vib_hist if now - ms <= 10_000 and g >= IMPACT_G) + (1 if vib >= IMPACT_G else 0)

        if remember:
            if r.get("tilt_deg") is not None:
                tilt_hist.append((now, float(r["tilt_deg"])))
            if vib is not None:
                vib_hist.append((now, float(vib)))

    tilt = r.get("tilt_deg") or 0.0
    rate = r.get("tilt_rate_dpm") or 0.0
    moist = r.get("moisture_pct") or 0.0
    if r.get("state"):
        r["state_source"] = "node"
        # Only the tilt sensor may raise an ALARM, whatever the firmware decided
        if r["state"] == "ALARM" and not tilt_alarm(tilt, rate, moist):
            r["state"] = "WARNING"
            r["state_capped_from"] = "ALARM"
    else:
        r["state"] = classify(tilt, rate, r.get("vib_rms_g") or 0.0, r.get("vib_g") or 0.0,
                              moist, r.get("rain_wet") or 0)
        r["state_source"] = "server"
    return r
