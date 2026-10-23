"""
serial_bridge.py - USB serial -> a backend over HTTP (48 h plan section 9)
==========================================================================
The backend already reads a node plugged into ITS OWN laptop (app/serial_ingest.py,
NODE_SERIAL=auto). Use this tool when the node is plugged into a different laptop than the
one running the backend, or to test with a saved log. It posts each reading as the node would.

Reads the same lines as the backend: JSON readings (lines starting with "{", "posted":1 ones
skipped because they already went over Wi-Fi) and the older
CSV,millis,tilt,rate,vrms,vpk,moist,rain,state[,model] lines.

    venv\\Scripts\\python tools\\serial_bridge.py --port auto --segment seg_05
    venv\\Scripts\\python tools\\serial_bridge.py --port COM5 --url http://192.168.1.20:8000
    venv\\Scripts\\python tools\\serial_bridge.py --file tools\\sample_mock_session.csv --dry-run   (no hardware)

If the backend runs on this same laptop, set NODE_SERIAL=off in Backend/.env first (one port, one reader).
Needs pyserial for --port:  venv\\Scripts\\pip install pyserial
"""
from __future__ import annotations

import argparse
import sys
import time

from _common import BACKEND_DIR, DEFAULT_URL, post_json, read_env_value

sys.path.insert(0, str(BACKEND_DIR))
from app.serial_ingest import find_esp32_port, parse_line  # noqa: E402


def lines_from_port(port: str, baud: int):
    try:
        import serial  # pyserial
    except ImportError:
        sys.exit("pyserial is not installed: venv\\Scripts\\pip install pyserial")
    if port.lower() == "auto":
        port, chip = find_esp32_port()
        if not port:
            sys.exit("No ESP32 USB port found (CP210x / CH340 / FTDI / Espressif). Plug it in or pass --port COM5.")
        print(f"serial_bridge: found {chip} on {port}")
    ser = serial.Serial()
    ser.port, ser.baudrate, ser.timeout = port, baud, 1
    ser.dtr = ser.rts = False  # don't reset the board when opening
    ser.open()
    with ser:
        print(f"serial_bridge: reading {port} at {baud} baud (Ctrl+C to stop)")
        while True:
            raw = ser.readline()
            if raw:
                yield raw.decode("utf-8", errors="replace")


def lines_from_file(path: str):
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            yield line
            time.sleep(0.02)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--port", help="'auto' or e.g. COM5")
    src.add_argument("--file", help="read lines from a saved log instead of a port (testing)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--key", default=None)
    ap.add_argument("--node", default="NODE1", help="used when a line has no node_id")
    ap.add_argument("--segment", default="seg_05", help="used when a line has no segment_id")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    key = args.key or read_env_value("NODE_API_KEY")
    if not key and not args.dry_run:
        sys.exit("No node key: set NODE_API_KEY in Backend/.env or pass --key.")
    headers = {"X-Node-Key": key or ""}
    source = lines_from_port(args.port, args.baud) if args.port else lines_from_file(args.file)

    seq = 0
    for line in source:
        kind, r = parse_line(line)
        if kind == "log":
            if line.strip():
                print(f"  (node) {line.strip()}")
            continue
        if kind == "wifi_dupe":
            print("  (already sent over Wi-Fi)")
            continue
        if kind == "bad":
            print(f"  (unreadable) {line.strip()[:80]}")
            continue
        seq += 1
        body = {"node_id": args.node, "segment_id": args.segment, "seq": seq, **r, "link": "serial"}
        if args.dry_run:
            print(f"  would post seq={body['seq']} state={body.get('state') or '(server decides)'} tilt={body.get('tilt_deg')}")
            continue
        code = post_json(args.url, "/node/reading", body, headers)
        print(f"  seq={body['seq']:<5} {body.get('state') or '-':<8} tilt={body.get('tilt_deg')} -> {code}")
        if code in (401, 503):
            sys.exit("Stopping: wrong key (401) or the server has no NODE_API_KEY (503).")


if __name__ == "__main__":
    main()
