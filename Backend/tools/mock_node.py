"""
mock_node.py - A fake Raah Node that posts contract-v2 readings to the backend
===============================================================================
Use it to build and test everything before the ESP32 exists. It follows the firmware's
rules (48 h plan section 4.2; 30 h plan F5/F6/F7): four states, tilt rate over 30 s,
wet soil (moisture >= 70 %) gives WARNING and lowers tilt/rate thresholds to 60 %.
Only tilt can raise ALARM; vibration and soil moisture stop at WARNING (docs/SENSOR_THRESHOLDS.md).
Its node_id starts with MOCK- so every screen labels it "MOCK DATA"; it still escalates
the segment exactly like real hardware would.

Switching to live data later needs NO backend change: the real node simply posts as
NODE1 (or whatever id it is flashed with) with the same X-Node-Key.

Examples (run from the Backend folder):
    venv\\Scripts\\python tools\\mock_node.py --scenario demo
    venv\\Scripts\\python tools\\mock_node.py --scenario lost --segment seg_08
    venv\\Scripts\\python tools\\mock_node.py --scenario creep --speed 4
    venv\\Scripts\\python tools\\mock_node.py --scenario alarm --dry-run --csv-out tools\\sample_mock_session.csv

Scenarios:
    calm     60 s of normal readings (OK)
    creep    slow 6 deg lift over 120 s: WATCH, then WARNING (the E1 "slow" case)
    alarm    fast lift to 9 deg in 10 s: ALARM, then back to flat: incident closes
    impact   stone drop (severe knock): WARNING only (vibration never raises ALARM), then calm
    wet      soil saturates (WARNING on its own), then a 3.5 deg tilt: still WARNING, ALARM from 4.8 deg
    lost     ALARM, then the node goes silent: backend shows SENSOR_LOST after 15 s
    outage   link down for 20 s, then live + late outbox messages ("late": 1)
    demo     the 5-minute demo chain: calm, creep, fast lift to ALARM, then silent
"""
from __future__ import annotations

import argparse
import math
import random
import sys
import time
from collections import deque

from _common import DEFAULT_URL, STATE_NAMES, post_json, read_env_value

# Thresholds (dry soil), 48 h plan 4.2, recalibrated 2026-10-24; same as app/node_sensors.py
TILT_WATCH, TILT_WARN, TILT_ALARM = 2.0, 5.0, 8.0
RATE_WARN, RATE_ALARM = 3.0, 8.0
VIB_WARN_RMS, IMPACT_G = 0.10, 0.35
MOIST_WATCH, MOIST_SAT, WET_FACTOR = 50.0, 70.0, 0.6


def classify(tilt, rate, vrms, vpk, moist, rain_wet):
    f = WET_FACTOR if moist >= MOIST_SAT else 1.0
    if tilt >= TILT_ALARM * f or rate >= RATE_ALARM * f:  # only the tilt sensor raises ALARM
        return "ALARM"
    if (tilt >= TILT_WARN * f or rate >= RATE_WARN * f
            or vrms >= VIB_WARN_RMS or vpk >= IMPACT_G or moist >= MOIST_SAT):
        return "WARNING"
    if tilt >= TILT_WATCH * f or moist >= MOIST_WATCH or rain_wet:
        return "WATCH"
    return "OK"


def ramp(t, t0, t1, v0, v1):
    if t <= t0:
        return v0
    if t >= t1:
        return v1
    return v0 + (v1 - v0) * (t - t0) / (t1 - t0)


def scenario_frames(name):
    """Yield (t_s, tilt, vrms, vpk, moist, rain, impact_confirmed, link_up, event) once per second."""
    calm_moist = 38.0

    def calm(t):
        return (0.15 + 0.05 * math.sin(t / 7), 0.02, 0.04, calm_moist, 0, False)

    if name == "calm":
        for t in range(60):
            yield (t, *calm(t), True, None)
    elif name == "creep":
        for t in range(170):
            tilt, vr, vp, m, r, imp = calm(t)
            tilt += ramp(t, 20, 140, 0.0, 6.0)
            yield (t, tilt, vr, vp, m, r, imp, True, "slow lift starts" if t == 20 else None)
    elif name == "alarm":
        for t in range(90):
            tilt, vr, vp, m, r, imp = calm(t)
            tilt += ramp(t, 10, 20, 0.0, 9.0) if t < 40 else ramp(t, 40, 50, 9.0, 0.0)
            yield (t, tilt, vr, vp, m, r, imp, True, "fast lift starts" if t == 10 else None)
    elif name == "impact":
        for t in range(60):
            tilt, vr, vp, m, r, imp = calm(t)
            if t == 10:
                vr, vp = 0.30, 0.95  # severe knock -> confirmed at once (two-stage impact, F5)
                imp = True
            elif 10 < t <= 20:
                vr, vp, imp = 0.05, 0.08, True  # ALARM holds while the node's persistence runs
            yield (t, tilt, vr, vp, m, r, imp, True, "stone drop" if t == 10 else None)
    elif name == "wet":
        for t in range(100):
            tilt, vr, vp, m, r, imp = calm(t)
            m = ramp(t, 5, 40, calm_moist, 82.0)
            r = 1 if 5 <= t <= 40 else 0
            tilt += ramp(t, 50, 80, 0.0, 3.5)
            yield (t, tilt, vr, vp, m, r, imp, True, "slow lift on saturated soil" if t == 50 else None)
    elif name == "lost":
        for t in range(30):
            tilt, vr, vp, m, r, imp = calm(t)
            tilt += ramp(t, 10, 18, 0.0, 9.0)
            yield (t, tilt, vr, vp, m, r, imp, True, "fast lift starts" if t == 10 else None)
        yield (30, None, None, None, None, None, None, None, "NODE DESTROYED: going silent")
    elif name == "outage":
        for t in range(60):
            tilt, vr, vp, m, r, imp = calm(t)
            tilt += ramp(t, 15, 25, 0.0, 3.0)  # a WATCH episode while the link is down
            link_up = not (10 <= t < 30)
            ev = "hotspot off" if t == 10 else ("hotspot back" if t == 30 else None)
            yield (t, tilt, vr, vp, m, r, imp, link_up, ev)
    elif name == "demo":
        for t in range(120):
            tilt, vr, vp, m, r, imp = calm(t)
            if t < 15:
                pass
            elif t < 75:
                tilt += ramp(t, 15, 75, 0.0, 4.0)
            else:
                tilt += ramp(t, 75, 82, 4.0, 10.0)
            ev = {15: "slow creep starts", 75: "fast lift starts"}.get(t)
            yield (t, tilt, vr, vp, m, r, imp, True, ev)
        yield (120, None, None, None, None, None, None, None, "NODE DESTROYED: going silent")
    else:
        raise SystemExit(f"Unknown scenario '{name}'")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--scenario", default="demo",
                    choices=["calm", "creep", "alarm", "impact", "wet", "lost", "outage", "demo"])
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default=None, help="X-Node-Key (default: NODE_API_KEY from env or Backend/.env)")
    ap.add_argument("--node", default="MOCK-NODE1", help="node_id; keep the MOCK- prefix for generated data")
    ap.add_argument("--segment", default="seg_05")
    ap.add_argument("--speed", type=float, default=1.0, help="time compression, e.g. 4 = four times faster")
    ap.add_argument("--auto-mark", action="store_true", help="POST /node/mark at each event, like pressing ENTER")
    ap.add_argument("--dry-run", action="store_true", help="print, do not send")
    ap.add_argument("--csv-out", default=None, help="also write firmware-style CSV lines (for replay_session.py)")
    args = ap.parse_args()

    key = args.key or read_env_value("NODE_API_KEY")
    if not key and not args.dry_run:
        sys.exit("No node key: set NODE_API_KEY in Backend/.env or pass --key.")
    headers = {"X-Node-Key": key or ""}
    if not args.node.upper().startswith("MOCK-"):
        print(f"WARNING: node id {args.node} has no MOCK- prefix; screens will treat it as REAL hardware.")

    csv_file = open(args.csv_out, "w", encoding="utf-8") if args.csv_out else None
    if csv_file:
        csv_file.write("# MOCK session generated by tools/mock_node.py, not a real sensor recording\n")

    seq, boot = 0, time.time()
    history = deque(maxlen=31)  # tilt over the last 30 s for the rate
    prev_state, event_ts_ms = "OK", int(time.time() * 1000)
    outbox = []
    sent = failed = 0
    print(f"mock_node: {args.node} on {args.segment}, scenario '{args.scenario}', {args.url}")

    for (t, tilt, vrms, vpk, moist, rain, imp, link_up, event) in scenario_frames(args.scenario):
        if event:
            print(f"  t={t:>3}s  >>> {event}")
            if args.auto_mark and not args.dry_run and tilt is not None:
                post_json(args.url, "/node/mark", {"label": f"mock: {event}", "node_id": args.node,
                                                   "segment_id": args.segment}, headers)
        if tilt is None:  # node destroyed / unplugged: stop sending
            print("  node is silent now. Watch /node/fleet: SENSOR_LOST after 15 s while it was alarming.")
            break

        history.append(tilt)
        rate = (tilt - history[0]) * 2.0 if len(history) > 1 else 0.0
        rate = max(rate, 0.0)
        state = classify(tilt, rate, vrms, vpk, moist, rain)
        now_ms = int(time.time() * 1000)
        if state != prev_state:
            event_ts_ms = now_ms
            prev_state = state
        seq += 1
        msg = {
            "node_id": args.node, "segment_id": args.segment, "state": state,
            "tilt_deg": round(tilt, 2), "tilt_rate_dpm": round(rate, 2), "vib_g": round(vpk, 3),
            "moisture_pct": round(moist, 1), "rain_wet": rain,
            "model_state": {"OK": "stable", "WATCH": "stable", "WARNING": "creep", "ALARM": "failure"}[state],
            "seq": seq, "ts_ms": now_ms, "event_ts_ms": event_ts_ms,
            "fw": "mock-2.0.0", "rssi_dbm": random.randint(-66, -54), "uptime_s": int(time.time() - boot),
            "heap_free": 182000 - random.randint(0, 3000), "rtt_ms": random.randint(80, 190),
            "buffered": len(outbox), "overwritten": 0, "strikes_10s": 1 if vpk >= IMPACT_G else 0,
            "vib_thr_g": VIB_WARN_RMS, "vib_rms_g": round(vrms, 3), "link": "wifi",
        }
        if csv_file:
            csv_file.write(f"CSV,{int((time.time() - boot) * 1000)},{msg['tilt_deg']},{msg['tilt_rate_dpm']},"
                           f"{msg['vib_rms_g']},{msg['vib_g']},{msg['moisture_pct']},{rain},"
                           f"{STATE_NAMES.index(state)},{msg['model_state']}\n")

        if args.dry_run:
            print(f"  t={t:>3}s seq={seq:<4} {state:<8} tilt={msg['tilt_deg']:>5} rate={msg['tilt_rate_dpm']:>5} "
                  f"vpk={msg['vib_g']:<5} moist={msg['moisture_pct']}")
        elif not link_up:
            # F7 outbox: keep non-OK messages, state changes and one calm message in ten
            if state != "OK" or seq % 10 == 0 or (outbox and outbox[-1]["state"] != state):
                outbox.append(msg)
            print(f"  t={t:>3}s seq={seq:<4} {state:<8} NET,POST_FAIL,-1,buffered={len(outbox)}")
        else:
            code = post_json(args.url, "/node/reading", msg, headers)
            if 200 <= code < 300:
                sent += 1
                # Link back: the live message went first, now up to 3 old ones per second, tagged late
                for _ in range(min(3, len(outbox))):
                    old = dict(outbox.pop(0), late=1)
                    if 200 <= post_json(args.url, "/node/reading", old, headers) < 300:
                        sent += 1
                print(f"  t={t:>3}s seq={seq:<4} {state:<8} tilt={msg['tilt_deg']:>5} rate={msg['tilt_rate_dpm']:>5} "
                      f"vpk={msg['vib_g']:<5} -> {code}" + (f"  (outbox {len(outbox)} left)" if outbox else ""))
            else:
                failed += 1
                print(f"  t={t:>3}s seq={seq:<4} {state:<8} NET,POST_FAIL,{code}")
                if code in (401, 503):
                    sys.exit("Stopping: wrong key (401) or the server has no NODE_API_KEY (503).")
        time.sleep(1.0 / args.speed)

    if csv_file:
        csv_file.close()
        print(f"CSV written to {args.csv_out}")
    print(f"done: {sent} sent, {failed} failed, {len(outbox)} never delivered")


if __name__ == "__main__":
    main()
