"""
placement.py - Where to put Raah Nodes, from the terrain model (plan F8)
=========================================================================
Greedy choice: take the highest-scoring road point, then the next highest that is at least
`min_spacing_km` away along the road, and so on.

Point source, in order of preference:
  1. data/point_scores.csv (config.POINT_SCORES_CSV) exported by S3 from score_segments.py:
     columns lat, lon, segment_id, score and optionally chainage_km.
  2. MOCK fallback until that file exists: every display vertex of each segment, scored with
     its segment's terrain percentile. Segment-level, not point-level, and labelled as mock.
"""
from __future__ import annotations

import csv
from typing import Any, Dict, List, Optional

from app import config
from app.flywheel_service import haversine_km


def choose_sites(points: List[Dict[str, Any]], n: int = 10, min_spacing_km: float = 2.0,
                 per_segment_max: Optional[int] = None) -> List[Dict[str, Any]]:
    """points: dicts with at least chainage_km and score. Returns the chosen ones, ranked."""
    chosen, per_seg = [], {}
    for p in sorted(points, key=lambda q: q["score"], reverse=True):
        if len(chosen) >= n:
            break
        if any(abs(p["chainage_km"] - c["chainage_km"]) < min_spacing_km for c in chosen):
            continue
        seg = p.get("segment_id")
        if per_segment_max and seg is not None and per_seg.get(seg, 0) >= per_segment_max:
            continue
        per_seg[seg] = per_seg.get(seg, 0) + 1
        chosen.append(dict(p, rank=len(chosen) + 1))
    return chosen


def _add_chainage(points: List[Dict[str, Any]]) -> None:
    """Cumulative distance along the given (already ordered) points, in km."""
    total, prev = 0.0, None
    for p in points:
        if prev is not None:
            total += haversine_km(prev["lat"], prev["lon"], p["lat"], p["lon"])
        p["chainage_km"] = round(total, 3)
        prev = p


def _points_from_csv() -> List[Dict[str, Any]]:
    pts = []
    with open(config.POINT_SCORES_CSV, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            pts.append({
                "lat": float(row["lat"]),
                "lon": float(row.get("lon") or row.get("lng")),
                "segment_id": row.get("segment_id") or row.get("segment"),
                "score": float(row["score"]),
                "chainage_km": float(row["chainage_km"]) if row.get("chainage_km") else None,
            })
    if any(p["chainage_km"] is None for p in pts):
        _add_chainage(pts)
    return pts


def _mock_points() -> List[Dict[str, Any]]:
    from app.risk_service import load_segments, SUBPOINTS_MAP

    pts = []
    for s in sorted(load_segments(), key=lambda x: x["sequence_order"]):
        verts = s.get("subpoints") or SUBPOINTS_MAP.get(s["id"]) or [
            [s["start_lat"], s["start_lng"]], [s["end_lat"], s["end_lng"]]
        ]
        score = s.get("terrain_percentile")
        score = 0.5 if score is None else float(score)
        for lat, lon in verts:
            pts.append({"lat": float(lat), "lon": float(lon), "segment_id": s["id"], "score": score})
    _add_chainage(pts)
    return pts


def get_placement(n: int = 10, min_spacing_km: float = 2.0, per_segment_max: Optional[int] = None) -> Dict[str, Any]:
    from app.risk_service import load_segments

    names = {s["id"]: s["name"] for s in load_segments()}
    if config.POINT_SCORES_CSV.is_file():
        points, source, is_mock = _points_from_csv(), config.POINT_SCORES_CSV.name, False
        note = "Point scores from the terrain model. Coverage of the 2022 survey is in-sample (the model has seen it)."
    else:
        points, source, is_mock = _mock_points(), "mock_segment_terrain_percentile", True
        note = ("MOCK placement: each road vertex carries its segment's terrain percentile, not a point score. "
                "Replace by putting point_scores.csv (lat, lon, segment_id, score) in Backend/data/.")
    sites = choose_sites(points, n=n, min_spacing_km=min_spacing_km, per_segment_max=per_segment_max)
    for s in sites:
        s["segment_name"] = names.get(s.get("segment_id"))
        s["lat"], s["lon"] = round(s["lat"], 5), round(s["lon"], 5)
        s["score"] = round(s["score"], 3)
    return {
        "source": source,
        "is_mock": is_mock,
        "note": note,
        "n_requested": n,
        "min_spacing_km": min_spacing_km,
        "per_segment_max": per_segment_max,
        "points_considered": len(points),
        "sites": sites,
    }
