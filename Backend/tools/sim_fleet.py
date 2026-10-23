"""
sim_fleet.py - Labelled simulated nodes along NH-7 (plan F15, stretch)
=======================================================================
Posts calm readings from N nodes named SIM-01 .. SIM-NN spread over the 18 segments, with an
occasional WATCH. SIM- nodes are labelled SIMULATED everywhere and NEVER escalate a segment,
so this shows scale on the map without pretending to be a deployment.

    venv\\Scripts\\python tools\\sim_fleet.py --n 12 --seconds 120
"""
from __future__ import annotations

import argparse
import random
import sys
import time

from _common import DEFAULT_URL, post_json, read_env_value


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default=None)
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--seconds", type=int, default=120)
    args = ap.parse_args()

    key = args.key or read_env_value("NODE_API_KEY")
    if not key:
        sys.exit("No node key: set NODE_API_KEY in Backend/.env or pass --key.")
    headers = {"X-Node-Key": key}
    nodes = [(f"SIM-{i + 1:02d}", f"seg_{(i * 18 // args.n) + 1:02d}") for i in range(args.n)]
    print(f"sim_fleet: {args.n} SIMULATED nodes for {args.seconds} s (they never escalate)")
    seq = 0
    for _ in range(args.seconds):
        seq += 1
        ok = 0
        for node_id, seg in nodes:
            tilt = abs(random.gauss(0.3, 0.2))
            state = "WATCH" if random.random() < 0.03 else "OK"
            body = {"node_id": node_id, "segment_id": seg, "state": state, "tilt_deg": round(tilt, 2),
                    "tilt_rate_dpm": 0.0, "vib_g": round(abs(random.gauss(0.03, 0.01)), 3),
                    "moisture_pct": round(random.uniform(30, 55), 1), "rain_wet": 0, "seq": seq,
                    "ts_ms": int(time.time() * 1000), "fw": "sim", "link": "sim"}
            ok += 200 <= post_json(args.url, "/node/reading", body, headers) < 300
        print(f"  tick {seq}: {ok}/{len(nodes)} delivered", end="\r")
        time.sleep(1)
    print("\ndone")


if __name__ == "__main__":
    main()
