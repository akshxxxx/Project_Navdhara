"""
mark_event.py - Press ENTER at the instant of each physical event (plan F2, experiment E5)
==========================================================================================
Each ENTER stores a mark on the LAPTOP clock (POST /node/mark). The next incident that opens
within 3 minutes is linked to it, and /node/incidents reports mark -> first server message,
mark -> ALARM and ALARM -> alert sent, all on one clock.

    venv\\Scripts\\python tools\\mark_event.py --label "E3 20cm"
Type a new label and press ENTER to change it; an empty line reuses the current label; q quits.
"""
from __future__ import annotations

import argparse
import time

import requests

from _common import DEFAULT_URL, read_env_value


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default=None, help="X-Node-Key (default from Backend/.env); admin key also works")
    ap.add_argument("--label", default="event")
    ap.add_argument("--node", default=None, help="only link marks to this node (optional)")
    ap.add_argument("--segment", default=None)
    args = ap.parse_args()

    key = args.key or read_env_value("NODE_API_KEY")
    headers = {"X-Node-Key": key} if key else {}
    label, n = args.label, 0
    print("Press ENTER at the instant of the event. Type a label then ENTER to rename. q to quit.")
    while True:
        line = input(f"[{label}] > ").strip()
        if line.lower() == "q":
            break
        if line:
            label = line
        t0 = time.time()
        n += 1
        try:
            r = requests.post(f"{args.url.rstrip('/')}/node/mark", headers=headers, timeout=5,
                              json={"label": f"{label} #{n}", "node_id": args.node, "segment_id": args.segment})
            if r.ok:
                print(f"  mark #{r.json()['mark_id']} stored at server_ms={r.json()['server_ms']} "
                      f"(round trip {int((time.time() - t0) * 1000)} ms)")
            else:
                print(f"  failed: HTTP {r.status_code} {r.text[:120]}")
        except requests.RequestException as e:
            print(f"  failed: {e}")


if __name__ == "__main__":
    main()
