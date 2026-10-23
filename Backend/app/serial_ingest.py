"""
serial_ingest.py - live readings from a Raah Node plugged into this laptop by USB
=================================================================================
Started by the backend (app/main.py) unless NODE_SERIAL=off. It looks for an ESP32 USB
bridge every 3 s (CP210x, CH340/CH9102, FTDI or the ESP32's own USB), opens it at
NODE_SERIAL_BAUD and feeds every reading line into the same path as POST /node/reading
(node_service.ingest): same escalation, SENSOR_LOST rule, incidents and Telegram alarm.
Unplug the cable and it goes back to searching; plug it in again and data flows again.

Lines the node may print (anything else is kept in `recent_log` for debugging):
  {"node_id":"NODE1","segment_id":"seg_05","tilt_deg":0.4,"soil_raw":3900,...,"posted":0}
      JSON, contract v2 plus raw fields. "posted":1 means the node already delivered this
      reading over Wi-Fi, so it is counted but not stored twice.
  CSV,millis,tilt,rate,vrms,vpk,moist,rain,state[,model]
      the older firmware line (tools/serial_bridge.py format).

GET /node/serial shows the link; POST /node/serial/pause frees the port for the Arduino IDE
(flashing, Serial Monitor) and /resume takes it back. See Backend/docs/NODE_API.md.
"""
from __future__ import annotations

import json
import logging
import sys
import threading
import time
from collections import deque
from typing import Any, Dict, Optional, Tuple

from app import config

log = logging.getLogger("backend")

# USB-to-serial chips found on ESP32 boards (vendor id -> name)
ESP32_USB_VIDS = {0x10C4: "CP210x", 0x1A86: "CH340/CH9102", 0x0403: "FTDI", 0x303A: "Espressif USB"}
STATE_NAMES = ("OK", "WATCH", "WARNING", "ALARM")
SCAN_EVERY_S = 3.0

_lock = threading.Lock()
_thread: Optional[threading.Thread] = None
_stop = threading.Event()
_paused = threading.Event()
_status: Dict[str, Any] = {}
_log_lines: deque = deque(maxlen=30)


def _reset_status() -> None:
    _status.clear()
    _status.update({
        "mode": config.NODE_SERIAL, "baud": config.NODE_SERIAL_BAUD, "state": "off", "port": None,
        "chip": None, "connected_since_ms": None, "lines": 0, "readings": 0, "skipped_wifi_dupes": 0,
        "bad_lines": 0, "last_reading_ms": None, "last_node_id": None, "last_error": None,
    })
    _log_lines.clear()


_reset_status()


# --------------------------------------------------------------------------------------
# Parsing (also used by tools/serial_bridge.py)
# --------------------------------------------------------------------------------------

def parse_csv(line: str) -> Optional[Dict[str, Any]]:
    """CSV,millis,tilt,rate,vrms,vpk,moist,rain,state[,model] (the leading CSV, is optional)."""
    parts = [p.strip() for p in line.strip().split(",")]
    if parts and parts[0].upper() == "CSV":
        parts = parts[1:]
    if len(parts) < 8:
        return None
    try:
        tilt, rate, vrms, vpk, moist = (float(x) for x in parts[1:6])
        rain = int(float(parts[6]))
        st = parts[7].upper()
        if st.replace(".", "").isdigit():
            st = STATE_NAMES[int(float(st))]
    except (ValueError, IndexError):
        return None
    if st not in STATE_NAMES:
        return None
    return {
        "tilt_deg": tilt, "tilt_rate_dpm": rate, "vib_rms_g": vrms, "vib_g": vpk,
        "moisture_pct": moist, "rain_wet": rain, "state": st,
        "model_state": parts[8] if len(parts) > 8 and parts[8] else None,
    }


def parse_line(line: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Classify one serial line. Returns (kind, body):
      ("reading", dict)  a reading to store
      ("wifi_dupe", dict) a reading the node already posted over Wi-Fi
      ("log", None)      boot / NET / CAL text
      ("bad", None)      looked like a reading but could not be read
    """
    s = line.strip()
    if not s:
        return "log", None
    if s.startswith("{"):
        try:
            body = json.loads(s)
        except ValueError:
            return "bad", None
        if not isinstance(body, dict):
            return "bad", None
        if body.pop("posted", 0) in (1, True, "1"):
            return "wifi_dupe", body
        return "reading", body
    if s.upper().startswith("CSV,") or s[:1].isdigit():
        body = parse_csv(s)
        return ("reading", body) if body else ("bad", None)
    return "log", None


def to_reading(body: Dict[str, Any]) -> Dict[str, Any]:
    """Fill node_id / segment_id from settings, mark the link, and validate like the HTTP route."""
    from app.models import NodeReading

    body = {**body}
    body.setdefault("node_id", config.NODE_SERIAL_NODE_ID)
    body.setdefault("segment_id", config.NODE_SERIAL_SEGMENT)
    body["link"] = "serial"
    return NodeReading(**body).model_dump()


def handle_line(line: str) -> Optional[Dict[str, Any]]:
    """Process one line from the node. Returns the ingest result for stored readings."""
    from pydantic import ValidationError
    from app import node_service

    kind, body = parse_line(line)
    with _lock:
        _status["lines"] += 1
    if kind == "log":
        if line.strip():
            _log_lines.append({"ms": int(time.time() * 1000), "line": line.strip()[:200]})
        return None
    if kind == "bad":
        with _lock:
            _status["bad_lines"] += 1
        return None
    if kind == "wifi_dupe":
        with _lock:
            _status["skipped_wifi_dupes"] += 1
            _status["last_node_id"] = body.get("node_id") or config.NODE_SERIAL_NODE_ID
        return None
    try:
        reading = to_reading(body)
    except ValidationError as e:
        with _lock:
            _status["bad_lines"] += 1
            _status["last_error"] = f"bad reading: {e.errors()[0].get('loc')} {e.errors()[0].get('msg')}"
        return None
    result = node_service.ingest(reading)
    with _lock:
        _status["readings"] += 1
        _status["last_reading_ms"] = result["server_ms"]
        _status["last_node_id"] = reading["node_id"]
    return result


# --------------------------------------------------------------------------------------
# Port handling
# --------------------------------------------------------------------------------------

def find_esp32_port() -> Tuple[Optional[str], Optional[str]]:
    """(device, chip name) of the first plugged-in ESP32 USB bridge, else (None, None)."""
    try:
        from serial.tools import list_ports
    except ImportError:
        return None, None
    for p in list_ports.comports():
        if p.vid in ESP32_USB_VIDS:
            return p.device, ESP32_USB_VIDS[p.vid]
    return None, None


def _open(port: str):
    import serial

    ser = serial.Serial()
    ser.port, ser.baudrate, ser.timeout = port, config.NODE_SERIAL_BAUD, 1
    # Keep DTR/RTS released so opening the port does not reset the board or hold it in boot mode
    ser.dtr = False
    ser.rts = False
    ser.open()
    return ser


def _set(**kw) -> None:
    with _lock:
        _status.update(kw)


def _run() -> None:
    try:
        import serial  # noqa: F401
    except ImportError:
        _set(state="error", last_error="pyserial is not installed: venv\\Scripts\\pip install pyserial")
        log.warning("serial_ingest: pyserial not installed; USB node link disabled")
        return
    from serial import SerialException

    auto = config.NODE_SERIAL.lower() == "auto"
    last_err = None
    while not _stop.is_set():
        if _paused.is_set():
            _set(state="paused", port=None, chip=None, connected_since_ms=None)
            _stop.wait(1.0)
            continue
        port, chip = find_esp32_port() if auto else (config.NODE_SERIAL, None)
        if not port:
            _set(state="searching", port=None, chip=None, connected_since_ms=None)
            _stop.wait(SCAN_EVERY_S)
            continue
        try:
            ser = _open(port)
        except (SerialException, OSError) as e:
            msg = f"{port}: {e}"
            if msg != last_err:  # e.g. the Arduino IDE Serial Monitor has the port
                log.warning("serial_ingest: cannot open %s", msg)
                last_err = msg
            _set(state="port_busy", port=port, chip=chip, last_error=msg)
            _stop.wait(SCAN_EVERY_S)
            continue
        last_err = None
        log.info("serial_ingest: Raah Node connected on %s (%s) at %d baud", port, chip or "port set in NODE_SERIAL", config.NODE_SERIAL_BAUD)
        _set(state="connected", port=port, chip=chip, connected_since_ms=int(time.time() * 1000), last_error=None)
        try:
            while not _stop.is_set() and not _paused.is_set():
                raw = ser.readline()
                if raw:
                    try:
                        handle_line(raw.decode("utf-8", errors="replace"))
                    except Exception as e:  # one bad line must never stop the link
                        log.error("serial_ingest: line failed: %s", e)
                        _set(last_error=f"line failed: {e}")
        except (SerialException, OSError) as e:
            log.warning("serial_ingest: %s disconnected (%s); searching again", port, e)
            _set(last_error=f"{port} disconnected: {e}")
        finally:
            try:
                ser.close()
            except Exception:
                pass
        _set(state="searching", port=None, chip=None, connected_since_ms=None)


# --------------------------------------------------------------------------------------
# Control
# --------------------------------------------------------------------------------------

def start() -> bool:
    """Start the USB watcher (no-op under pytest or with NODE_SERIAL=off). True if started."""
    global _thread
    if config.NODE_SERIAL.lower() == "off" or "pytest" in sys.modules:
        _set(state="off")
        return False
    if _thread and _thread.is_alive():
        return True
    _stop.clear()
    _thread = threading.Thread(target=_run, name="node-serial", daemon=True)
    _thread.start()
    return True


def stop() -> None:
    _stop.set()
    if _thread:
        _thread.join(timeout=3)


def pause() -> Dict[str, Any]:
    _paused.set()
    return get_status()


def resume() -> Dict[str, Any]:
    _paused.clear()
    return get_status()


def get_status() -> Dict[str, Any]:
    with _lock:
        s = dict(_status)
    now = int(time.time() * 1000)
    s["paused"] = _paused.is_set()
    s["last_reading_age_s"] = round((now - s["last_reading_ms"]) / 1000, 1) if s["last_reading_ms"] else None
    s["recent_log"] = list(_log_lines)[-15:]
    return s
