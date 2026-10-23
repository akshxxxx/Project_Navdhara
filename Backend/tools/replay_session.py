"""
replay_session.py - Replay a recorded node session as REPLAY1 (plan F4, backup demo)
======================================================================================
Reads the firmware's serial CSV (as saved by logger.py, or written by mock_node.py --csv-out)
and posts it at the original pace. The node id starts with REPLAY, so it escalates the segment
like the real node did, but every screen and message says it is a replay.

    venv\\Scripts\\python tools\\replay_session.py data\\golden.csv --segment seg_05
    venv\\Scripts\\python tools\\replay_session.py tools\\sample_mock_session.csv --speed 4
"""
from __future__ import annotations

import argparse
import sys
import time

from _common import DEFAULT_URL, parse_csv_line, post_json, read_env_value


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv_file")
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default=None)
    ap.add_argument("--node", default="REPLAY1")
    ap.add_argument("--segment", default="seg_05")
    ap.add_argument("--speed", type=float, default=1.0)
    args = ap.parse_args()

    if not args.node.upper().startswith("REPLAY"):
        sys.exit("Replay node ids must start with REPLAY so screens label them as a replay.")
    key = args.key or read_env_value("NODE_API_KEY")
    if not key:
        sys.exit("No node key: set NODE_API_KEY in Backend/.env or pass --key.")
    headers = {"X-Node-Key": key}

    with open(args.csv_file, "r", encoding="utf-8") as f:
        rows = [r for r in (parse_csv_line(line) for line in f if not line.startswith("#")) if r]
    if not rows:
        sys.exit("No CSV,... lines found in the file.")
    print(f"replay: {len(rows)} readings from {args.csv_file} as {args.node} on {args.segment} (x{args.speed})")

    prev_millis, seq, prev_state, event_ts = rows[0]["millis"], 0, None, None
    for r in rows:
        time.sleep(max(0.0, (r["millis"] - prev_millis) / 1000.0 / args.speed))
        prev_millis = r["millis"]
        seq += 1
        now_ms = int(time.time() * 1000)
        if r["state"] != prev_state:
            prev_state, event_ts = r["state"], now_ms
        body = {"node_id": args.node, "segment_id": args.segment, "seq": seq, "ts_ms": now_ms,
                "event_ts_ms": event_ts, "fw": "replay", "link": "replay",
                **{k: v for k, v in r.items() if k != "millis"}}
        code = post_json(args.url, "/node/reading", body, headers)
        print(f"  seq={seq:<4} {r['state']:<8} tilt={r['tilt_deg']:>6} -> {code}")
        if code in (401, 503):
            sys.exit("Stopping: wrong key (401) or the server has no NODE_API_KEY (503).")
    print("replay finished; the node is now silent (SENSOR_LOST if it ended in WARNING/ALARM)")


if __name__ == "__main__":
    main()
