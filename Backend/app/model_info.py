"""
model_info.py - Model transparency metadata parser for GET /model-info
Parses outputs/validation_report.md directly without guessing numbers.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict

from app.config import (
    BASE_DIR,
    DRY_CAP_MAX_SCORE,
    DRY_CAP_MM,
    DRY_RAMP_HIGH_MM,
    DRY_RAMP_LOW_MM,
    K_RAIN,
    K_TERRAIN,
    RAIN_REF_MM,
    RISK_LEVEL_THRESHOLDS,
    TERRAIN_FLOOR,
)

logger = logging.getLogger("backend")

REPORT_PATH = BASE_DIR / "outputs" / "validation_report.md"
META_PATH = BASE_DIR / "model" / "pipeline_meta_static_v2.json"
CV_REPORT_PATH = BASE_DIR / "model" / "cv_report_static_v2.json"

CORRIDOR_SCOPE = "Rishikesh to Joshimath, 247.37 km"

LIMITATIONS = [
    "Single-season inventory: Trained on post-monsoon 2022 survey data (Mey et al. 2024); does not capture multi-year or decadal historical recurrence frequencies.",
    "18-segment evaluation: Spatial aggregation groups 990 station points into 18 highway segments (P90 worst-stretch rule), which can smooth out highly localized single-slope failures.",
    "Coarse rainfall grid: Open-Meteo numerical weather forecasts provide ~11 km spatial resolution, which cannot resolve micro-scale Himalayan cloudburst cells.",
    "Uncalibrated rain term: The rainfall weight (k_rain = 0.4) and 100 mm saturation reference are demo heuristics rather than empirical rainfall-landslide thresholds.",
    "Not an official warning: Advisory indices are physically motivated statistical relative risk indicators for research/demo purposes, not official alerts issued by the Geological Survey of India (GSI) or NDMA.",
]


def parse_validation_report() -> Dict[str, Any]:
    """
    Parses metrics directly from outputs/validation_report.md.
    Raises ValueError if any critical metric cannot be parsed reliably.
    """
    if not REPORT_PATH.exists():
        raise FileNotFoundError(f"Validation report not found at {REPORT_PATH}")

    content = REPORT_PATH.read_text(encoding="utf-8")

    # 1. Inventory & Positives
    m_inv = re.search(r"Inventory\*\*:\s*([^,]+),\s*\$N\s*=\s*(\d+)\$", content)
    if not m_inv:
        raise ValueError("Could not parse inventory name or sample size from validation report")
    inventory_title = m_inv.group(1).strip()
    positives = int(m_inv.group(2))

    # 2. Negatives from 250m baseline row
    negatives = None
    average_precision = None
    top_20_capture = None
    for line in content.splitlines():
        if "**250 m**" in line:
            parts = [p.strip() for p in line.split("|")]
            # e.g.: ['', '**250 m**', '927', '927', 'Complete (927 placed)', '0.486 [0.450, 0.523]', '**0.767**', '**0.533**', '**43.0%**', '0.664 \pm 0.043', '']
            if len(parts) >= 9:
                negatives = int(parts[3])
                average_precision = float(parts[7].replace("*", ""))
                top_20_capture = float(parts[8].replace("*", "").replace("%", "")) / 100.0
            break

    if negatives is None or average_precision is None or top_20_capture is None:
        raise ValueError("Could not parse 250m separation row metrics from validation report")

    # 3. Correlation metrics
    spearman_rho = None
    spearman_pval = None
    for line in content.splitlines():
        if "Spearman Rank Correlation" in line:
            m = re.search(r"\*\*([0-9.]+)\*\*", line)
            if m:
                spearman_rho = float(m.group(1))
        if "p-value**:" in line:
            m = re.search(r"\*\*([0-9.]+)\*\*", line)
            if m:
                spearman_pval = float(m.group(1))

    if spearman_rho is None or spearman_pval is None:
        raise ValueError("Could not parse Spearman correlation from validation report")

    # 4. AUC metrics with 95% CIs
    pooled_auc = None
    pooled_auc_ci = None
    block_auc_mean = None
    block_auc_ci = None

    for line in content.splitlines():
        if "Pooled AUC**:" in line:
            m = re.search(r"Pooled AUC\*\*:\s*`?([0-9.]+)`?\s*\|\s*\*\*95% CI:\s*\[([0-9.]+),\s*([0-9.]+)\]\*\*", line)
            if m:
                pooled_auc = float(m.group(1))
                pooled_auc_ci = [float(m.group(2)), float(m.group(3))]
        if "Block AUC Mean**:" in line:
            m = re.search(r"Block AUC Mean\*\*:\s*`?([0-9.]+)`?\s*\|\s*\*\*95% CI:\s*\[([0-9.]+),\s*([0-9.]+)\]\*\*", line)
            if m:
                block_auc_mean = float(m.group(1))
                block_auc_ci = [float(m.group(2)), float(m.group(3))]

    if pooled_auc is None or pooled_auc_ci is None or block_auc_mean is None or block_auc_ci is None:
        raise ValueError("Could not parse AUC and confidence intervals from validation report")

    # 5. Permutation importance
    perm_importances = {}
    for line in content.splitlines():
        if line.strip().startswith("| `dem_"):
            parts = [p.strip() for p in line.split("|")]
            feat = parts[1].replace("`", "")
            imp = float(parts[3].replace("*", ""))
            perm_importances[feat] = imp

    if not perm_importances:
        raise ValueError("Could not parse permutation importance table from validation report")

    return {
        "inventory_title": inventory_title,
        "positives": positives,
        "negatives": negatives,
        "spearman_rho": spearman_rho,
        "spearman_pval": spearman_pval,
        "pooled_auc": pooled_auc,
        "pooled_auc_ci": pooled_auc_ci,
        "block_auc_mean": block_auc_mean,
        "block_auc_ci": block_auc_ci,
        "average_precision": average_precision,
        "top_20_capture": top_20_capture,
        "permutation_importances": perm_importances,
    }


def parse_cv_report_fallback(meta: Dict[str, Any]) -> Dict[str, Any]:
    """
    Used when outputs/validation_report.md is absent (it is git-ignored, so fresh clones lack it).
    Reads only numbers present in the committed model/cv_report_static_v2.json and pipeline meta;
    metrics that exist only in the full report (Spearman, bootstrap CIs) are returned as None.
    """
    cv = json.loads(CV_REPORT_PATH.read_text(encoding="utf-8"))
    chosen = f"{meta.get('chosen_feature_set', 'B  Copernicus 30 m terrain')} | {meta.get('model', 'RF')}"
    row = cv[chosen]
    positives = int(meta.get("positives", 309))
    rows = int(meta.get("rows", row.get("n_scored", 0)))
    return {
        "inventory_title": None,
        "positives": positives,
        "negatives": rows - positives,
        "spearman_rho": None,
        "spearman_pval": None,
        "pooled_auc": round(row["pooled_auc"], 3),
        "pooled_auc_ci": None,
        "block_auc_mean": round(row["block_auc_mean"], 3),
        "block_auc_ci": None,
        "average_precision": round(row["pooled_ap"], 3),
        "top_20_capture": round(row["top20_capture"], 3),
        "permutation_importances": {k: round(v, 3) for k, v in meta.get("feature_importance", {}).items()},
    }


def get_model_info_payload() -> Dict[str, Any]:
    """Builds the comprehensive model metadata dictionary for GET /model-info."""
    meta = {}
    if META_PATH.exists():
        try:
            meta = json.loads(META_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Could not load {META_PATH}: {e}")

    notes = []
    if REPORT_PATH.exists():
        parsed = parse_validation_report()
        metrics_source = "validation_report"
        coefficients_source = "permutation_importance_heldout_blocks"
    else:
        logger.warning(f"{REPORT_PATH} missing; /model-info serving metrics from {CV_REPORT_PATH.name}")
        parsed = parse_cv_report_fallback(meta)
        metrics_source = "cv_report_fallback"
        coefficients_source = "random_forest_impurity_importance"
        notes.append(
            "outputs/validation_report.md is not present on this server, so Spearman correlation and "
            "bootstrap confidence intervals are omitted (null). Run scripts/validate_segments.py to restore them. "
            "Coefficients are Random Forest impurity importances, not held-out permutation importances."
        )

    feature_columns = meta.get("feature_columns", list(parsed["permutation_importances"].keys()))
    version_num = meta.get("version", 2)
    model_type = meta.get("model", "Random Forest")
    citation = meta.get(
        "citation",
        "Mey, J., Guntu, R. K., Plakias, A., Silva de Almeida, I., and Schwanghart, W. (2024). "
        "More than one landslide per road kilometer - surveying and modelling mass movements along the "
        "Rishikesh-Joshimath (NH-7) highway, Uttarakhand, India. Nat. Hazards Earth Syst. Sci., 24, 3207. "
        "https://doi.org/10.5194/nhess-24-3207-2024"
    )

    return {
        "model_version": f"v{version_num} ({model_type})",
        "features_used": feature_columns,
        "coefficients": parsed["permutation_importances"],
        "training_sample_sizes": {
            "presence_count": parsed["positives"],
            "absence_count": parsed["negatives"],
            "total_count": parsed["positives"] + parsed["negatives"],
            "sampling_ratio": f"1:{parsed['negatives'] // parsed['positives']}",
        },
        "validation_metrics": {
            "spearman_rank_correlation": parsed["spearman_rho"],
            "spearman_p_value": parsed["spearman_pval"],
            "pooled_auc": parsed["pooled_auc"],
            "pooled_auc_ci_95": parsed["pooled_auc_ci"],
            "block_auc_mean": parsed["block_auc_mean"],
            "block_auc_ci_95": parsed["block_auc_ci"],
            "average_precision": parsed["average_precision"],
            "top_20_percent_capture": parsed["top_20_capture"],
            "negative_separation_distance_m": 250,
            "spatial_evaluation": "6 spatial contiguous blocks with 2.0 km exclusion buffer (out-of-fold)",
        },
        "runtime_scoring_artifact": {
            "source_file": "app/segment_static_scores.json",
            "type": "final_refit_production_model",
            "description": "Fitted on the complete 1,236 point dataset across all 18 segments for live operational inference. Held-out generalization benchmarks are reported under validation_metrics (out-of-fold spatial CV).",
        },
        "thresholds": RISK_LEVEL_THRESHOLDS,
        "k": {
            "k_rain": K_RAIN,
            "k_terrain": K_TERRAIN,
            "rain_ref_mm": RAIN_REF_MM,
            "terrain_floor": TERRAIN_FLOOR,
        },
        "dry_cap": DRY_CAP_MM,
        "dry_ramp_low_mm": DRY_RAMP_LOW_MM,
        "dry_ramp_high_mm": DRY_RAMP_HIGH_MM,
        "dry_cap_max_score": DRY_CAP_MAX_SCORE,
        "limitations": LIMITATIONS,
        "data_sources": {
            "inventory": citation,
            "dem": "Copernicus 30 m Digital Elevation Model (GLO-30)",
            "weather": "Open-Meteo Global Numerical Weather Forecast API (ECMWF / GFS multi-model ensemble)",
            "highway_geometry": "OpenStreetMap highway centerline (UTM Zone 44N projected deduplicated points)",
        },
        "scope": CORRIDOR_SCOPE,
        "metrics_source": metrics_source,
        "coefficients_source": coefficients_source,
        "notes": notes,
    }
