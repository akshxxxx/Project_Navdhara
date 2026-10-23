"""
app/routes/node.py - Raah Node (ESP32 slope sensor) endpoints
==============================================================
POST /node/reading          node message, contract v1 + v2       (X-Node-Key)
GET  /node/fleet            every node: state, status, age, health, delivery
GET  /node/latest           latest reading per node (48 h plan shape)
GET  /node/history          readings in time order, for charts
GET  /node/alerts           active escalations by segment
GET  /node/incidents        alert episodes, timed on the server clock
POST /node/mark             event mark on the laptop clock         (X-Node-Key or X-Admin-Key when keys are set)
GET  /node/marks            recent marks
POST /node/ack/{node_id}    crew checked the site: release a SENSOR_LOST hold   (admin key)
GET  /node/placement        proposed node sites from the terrain model
GET  /node/serial           USB link to a plugged-in node (app/serial_ingest.py)
POST /node/serial/pause     free the USB port for flashing; /node/serial/resume takes it back   (admin key)
See Backend/docs/NODE_API.md.
"""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app import config, node_service
from app.logger import logger
from app.models import NodeMarkRequest, NodeReading
from app.routes.reports import verify_admin_key

router = APIRouter(tags=["Raah Node (slope sensors)"])


def verify_node_key(x_node_key: Optional[str] = Header(None, alias="X-Node-Key")) -> str:
    # 503 / 401 match the firmware troubleshooting table (NET,POST_FAIL,503 / 401)
    if not config.NODE_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Server has no NODE_API_KEY. Set NODE_API_KEY in Backend/.env and restart the backend."
        )
    if not x_node_key or not secrets.compare_digest(x_node_key.strip(), config.NODE_API_KEY):
        raise HTTPException(status_code=401, detail="Wrong or missing X-Node-Key.")
    return x_node_key


def verify_mark_key(
    x_node_key: Optional[str] = Header(None, alias="X-Node-Key"),
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
) -> None:
    keys = [k for k in (config.NODE_API_KEY, config.ADMIN_API_KEY) if k]
    if not keys:
        return
    for given in (x_node_key, x_admin_key):
        if given and any(secrets.compare_digest(given.strip(), k) for k in keys):
            return
    raise HTTPException(status_code=401, detail="Marks need X-Node-Key or X-Admin-Key.")


@router.post("/node/reading", status_code=status.HTTP_201_CREATED)
def post_node_reading(reading: NodeReading, _key: str = Depends(verify_node_key)):
    """
    One message from a node. Late messages (late=1, or an NTP-valid ts_ms older than
    NODE_LATE_S) are stored as history and never change the live state.
    """
    result = node_service.ingest(reading.model_dump())
    return {"ok": True, **{k: v for k, v in result.items() if k != "alarm_started"},
            "sensor_alarm_sent": result["alarm_started"]}


@router.get("/node/fleet")
def get_node_fleet():
    """Every node with state, status (ONLINE / STALE / OFFLINE / SENSOR_LOST), age, kind, health and delivery."""
    return node_service.get_fleet()


@router.get("/node/latest")
def get_node_latest():
    """Latest reading per node, with age in seconds and whether its alert is active."""
    return {"nodes": node_service.get_latest()}


@router.get("/node/history")
def get_node_history(
    node_id: str = Query(..., description="e.g. NODE1"),
    minutes: float = Query(15.0, gt=0, le=24 * 60),
):
    """Readings in time order (late ones included and flagged), for charts."""
    return {"node_id": node_id, "minutes": minutes, "readings": node_service.get_history(node_id, minutes)}


@router.get("/node/alerts")
def get_node_alerts():
    """Active sensor escalations by segment, e.g. {"seg_05": {"level": "Very High", "avoid": true, ...}}."""
    return {"alerts": node_service.get_active_alerts()}


@router.get("/node/incidents")
def get_node_incidents(limit: int = Query(10, ge=1, le=200)):
    """Newest first: mark -> server, mark -> ALARM, ALARM -> alert sent, duration. Server clock only."""
    return node_service.get_incidents(limit)


@router.post("/node/mark")
def post_node_mark(body: Optional[NodeMarkRequest] = None, _auth: None = Depends(verify_mark_key)):
    """Store an event mark at the instant it arrives (press ENTER / the dashboard button at the event)."""
    body = body or NodeMarkRequest()
    mark = node_service.add_mark(body.label, body.node_id, body.segment_id)
    logger.info(f"Node event mark #{mark['mark_id']} '{body.label or ''}' at {mark['server_ms']}")
    return mark


@router.get("/node/marks")
def get_node_marks(limit: int = Query(20, ge=1, le=200)):
    return {"marks": node_service.list_marks(limit)}


@router.post("/node/ack/{node_id}")
def post_node_ack(node_id: str, _admin: str = Depends(verify_admin_key)):
    """A crew has checked the site: release the SENSOR_LOST hold and close the open incident."""
    res = node_service.acknowledge(node_id)
    if res is None:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' has never reported.")
    logger.info(f"Node {node_id} acknowledged; status now {res['status']}")
    return res


@router.get("/node/serial")
def get_node_serial():
    """USB link to a plugged-in node: searching / connected / port_busy / paused / off, counters, recent boot lines."""
    from app import serial_ingest
    return serial_ingest.get_status()


@router.post("/node/serial/pause")
def post_node_serial_pause(_admin: str = Depends(verify_admin_key)):
    """Free the USB port (to flash the board or use the Arduino Serial Monitor)."""
    from app import serial_ingest
    logger.info("Node USB link paused")
    return serial_ingest.pause()


@router.post("/node/serial/resume")
def post_node_serial_resume(_admin: str = Depends(verify_admin_key)):
    """Take the USB port back after flashing."""
    from app import serial_ingest
    logger.info("Node USB link resumed")
    return serial_ingest.resume()


@router.get("/node/placement")
def get_node_placement(
    n: int = Query(10, ge=1, le=50),
    min_spacing_km: float = Query(2.0, ge=0.0, le=50.0),
    per_segment_max: Optional[int] = Query(None, ge=1, le=20),
):
    """Proposed node sites from the terrain model (mock until data/point_scores.csv exists)."""
    from app.placement import get_placement
    return get_placement(n=n, min_spacing_km=min_spacing_km, per_segment_max=per_segment_max)
