"""
node_log.py - daily sensor log files for the control room
=========================================================
Every reading from a real, mock or replayed node (simulated SIM- nodes are skipped) is
appended to one CSV file per day (IST) in NODE_LOG_DIR, default Backend/logs/node_readings/:

    2026-10-24.csv   time_ist, node_id, kind, segment_id, state, state_source, ...

The database keeps the same readings for the live screens; these files are the plain record
an official can download from the Admin page (GET /admin/node-logs), open in Excel, or attach
to an incident report. Writing never blocks or breaks ingest: a failed write is logged and the
reading is still stored.
"""
from __future__ import annotations

import csv
import logging
import re
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from app import config

log = logging.getLogger("backend")

IST = timezone(timedelta(hours=5, minutes=30))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

COLUMNS = (
    "time_ist", "server_ms", "node_id", "kind", "segment_id", "state", "state_source",
    "state_capped_from", "late", "tilt_deg", "tilt_rate_dpm", "vib_g", "vib_rms_g", "strikes_10s",
    "moisture_pct", "soil_raw", "rain_wet", "rain_pct", "rain_raw", "link", "rssi_dbm", "seq", "fw",
)

_lock = threading.Lock()


def log_dir() -> Path:
    return Path(config.NODE_LOG_DIR)


def day_of(server_ms: int) -> str:
    return datetime.fromtimestamp(server_ms / 1000, IST).strftime("%Y-%m-%d")


def append(reading: Dict[str, Any], kind: str, now: int, late: bool) -> None:
    """Add one reading to today's file. Simulated nodes are not logged."""
    if not config.NODE_LOG_ENABLED or kind == "simulated":
        return
    row = {k: reading.get(k) for k in COLUMNS}
    row.update({
        "time_ist": datetime.fromtimestamp(now / 1000, IST).strftime("%Y-%m-%d %H:%M:%S"),
        "server_ms": now, "kind": kind, "late": 1 if late else 0,
    })
    path = log_dir() / f"{day_of(now)}.csv"
    try:
        with _lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            new = not path.exists()
            with path.open("a", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
                if new:
                    w.writeheader()
                w.writerow({k: "" if v is None else v for k, v in row.items()})
    except OSError as e:
        log.warning("node_log: could not write %s: %s", path, e)


def list_days() -> List[Dict[str, Any]]:
    """Newest first: date, rows, size and the nodes seen that day."""
    out = []
    d = log_dir()
    if not d.is_dir():
        return out
    for p in sorted(d.glob("*.csv"), reverse=True):
        if not DATE_RE.match(p.stem):
            continue
        nodes, rows = set(), 0
        with p.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows += 1
                nodes.add(r.get("node_id") or "")
        out.append({"date": p.stem, "rows": rows, "size_bytes": p.stat().st_size,
                    "nodes": sorted(n for n in nodes if n)})
    return out


def path_for(date: str) -> Optional[Path]:
    """The file for YYYY-MM-DD, or None. The date pattern keeps requests inside the log folder."""
    if not DATE_RE.match(date or ""):
        return None
    p = log_dir() / f"{date}.csv"
    return p if p.is_file() else None


def read_rows(date: str, node_id: Optional[str] = None, limit: int = 200) -> Optional[List[Dict[str, str]]]:
    """The last `limit` rows of a day (optionally one node), newest first; None if no file."""
    p = path_for(date)
    if p is None:
        return None
    with p.open(newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if not node_id or r.get("node_id") == node_id]
    return list(reversed(rows[-limit:]))
