// Convert risk_score to a level number (0-3). Same cut-offs as the backend
// (config.RISK_LEVEL_THRESHOLDS: 0.75 / 0.50 / 0.25); they were 0.80 / 0.60 / 0.35.
export function scoreToLevel(score) {
  if (score >= 0.75) return 3;
  if (score >= 0.5) return 2;
  if (score >= 0.25) return 1;
  return 0;
}

// Convert text risk level to number
const LEVEL_TEXT_MAP = {
  'low': 0,
  'moderate': 1,
  'high': 2,
  'very high': 3,
  'severe': 3,
};
export function levelFromText(text) {
  if (!text) return 0;
  return LEVEL_TEXT_MAP[text.toLowerCase().trim()] ?? 0;
}

export function parseCoords(subpoints, startLat, startLng, endLat, endLng) {
  if (Array.isArray(subpoints) && subpoints.length > 0) {
    const parsed = subpoints.map(pt => {
      if (Array.isArray(pt) && pt.length >= 2) {
        const lat = Number(pt[0]);
        const lng = Number(pt[1]);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
      }
      if (typeof pt === 'string') {
        const parts = pt.trim().split(/[\s,]+/);
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0]);
          const lng = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
        }
      }
      if (pt && typeof pt === 'object' && ('lat' in pt || 'latitude' in pt)) {
        const lat = Number(pt.lat ?? pt.latitude);
        const lng = Number(pt.lng ?? pt.longitude);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
      }
      return null;
    }).filter(Boolean);

    if (parsed.length > 0) return parsed;
  }
  if (startLat != null && startLng != null && endLat != null && endLng != null) {
    const sLat = Number(startLat);
    const sLng = Number(startLng);
    const eLat = Number(endLat);
    const eLng = Number(endLng);
    if (!isNaN(sLat) && !isNaN(sLng) && !isNaN(eLat) && !isNaN(eLng)) {
      return [[sLat, sLng], [eLat, eLng]];
    }
  }
  return [];
}

// Determine the effective display level of a segment (may be 'closed')
export function toEffective(seg) {
  if (seg.closure?.status === 'closed') return 'closed';
  // Use the backend's own level: it already applies the dry-weather cap, ground reports and
  // live slope sensors (a sensor ALARM is "Very High", not "base + 1").
  const levelText = seg.adjusted_risk_level ?? seg.risk_level;
  if (levelText) return levelFromText(levelText);
  const score = seg.risk_score ?? seg.risk_index;
  return score != null && !isNaN(score) ? scoreToLevel(score) : 0;
}

// Level-to-UI mapping
export const LEVEL_META = {
  0: { label: 'Low', verdict: 'Good to go', color: '#2E7D57', tint: '#E3F1EA', textOnFill: 'white' },
  1: { label: 'Moderate', verdict: 'Go with care', color: '#D49A00', tint: '#FAF0D2', textOnFill: '#1B2A33' },
  2: { label: 'High', verdict: 'Delay if you can', color: '#C4470F', tint: '#F8E3D8', textOnFill: 'white' },
  3: { label: 'Severe', verdict: 'Not advised', color: '#9B1C31', tint: '#F3DADF', textOnFill: 'white' },
  'closed': { label: 'Closed', verdict: 'Road closed', color: '#1B2A33', tint: '#DDE3E6', textOnFill: 'white' },
};

export function getLevelMeta(level) {
  return LEVEL_META[level] ?? LEVEL_META[0];
}

// Adapt a raw segment from /risk-map to a UI model
export function adaptSegment(raw) {
  const level = toEffective(raw);
  const coords = parseCoords(raw.subpoints, raw.start_lat, raw.start_lng, raw.end_lat, raw.end_lng);
  return {
    id: raw.id,
    name: raw.name || raw.name_en,
    nameEn: raw.name_en || raw.name,
    seq: raw.sequence_order,
    coords,
    level,
    score: raw.risk_score ?? raw.risk_index ?? 0,
    terrainScore: raw.terrain_score ?? raw.terrain_percentile ?? 0.5,
    r3d: raw.r3d_mm ?? raw.rain_mm_3d ?? 0,
    rain24h: raw.rain_24h_mm ?? (raw.rain_mm_3d ? (raw.rain_mm_3d * 0.4) : null),
    forecast24h: raw.forecast_24h_mm ?? (raw.rain_mm_3d ? (raw.rain_mm_3d * 0.6) : null),
    forecast72h: raw.forecast_72h_mm ?? (raw.rain_mm_3d ? (raw.rain_mm_3d * 1.2) : null),
    driver: raw.main_driver || raw.main_driver_en || 'Monsoon rainfall impact',
    driverEn: raw.main_driver_en || raw.main_driver,
    closure: raw.closure,
    adjustedRisk: raw.adjusted_risk_level,
    nodeEscalation: raw.node_escalation || null,
    reports24h: raw.ground_report_count_24h ?? 0,
    nearestHospitalKm: raw.nearest_hospital_km,
    nearestTown: raw.nearest_town,
    updatedAt: raw.updated_at,
  };
}
