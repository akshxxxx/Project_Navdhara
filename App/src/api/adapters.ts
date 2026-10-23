import type { BackendSegment, BackendRiskMapResponse } from './backend-types';
import { parseLevel, type Segment, type RiskMapResponse, type Level, type EffectiveLevel } from './types';
import { towns } from '../data/towns';

export function toLevel(riskLevelEn: string | null | undefined): Level {
  return parseLevel(riskLevelEn);
}

export function toEffectiveLevel(seg: BackendSegment): EffectiveLevel {
  if (seg.closure?.status === 'closed') return 'closed';
  const adjustedEn = seg.adjusted_risk_level_en ?? seg.risk_level_en ?? seg.adjusted_risk_level ?? seg.risk_level;
  return toLevel(adjustedEn);
}

// Approximate km calculation
const SEGMENT_KM: Record<string, { start: number; end: number }> = {
  seg_01: { start: 0,      end: 17.43 },
  seg_02: { start: 17.43,  end: 24.26 },
  seg_03: { start: 24.26,  end: 38.12 },
  seg_04: { start: 38.12,  end: 70.63 },
  seg_05: { start: 70.63,  end: 85.56 },
  seg_06: { start: 85.56,  end: 98.04 },
  seg_07: { start: 98.04,  end: 102.99 },
  seg_08: { start: 102.99, end: 112.42 },
  seg_09: { start: 112.42, end: 136.06 },
  seg_10: { start: 136.06, end: 158.55 },
  seg_11: { start: 158.55, end: 168.12 },
  seg_12: { start: 168.12, end: 174.18 },
  seg_13: { start: 174.18, end: 187.33 },
  seg_14: { start: 187.33, end: 200.39 },
  seg_15: { start: 200.39, end: 205.62 },
  seg_16: { start: 205.62, end: 212.36 },
  seg_17: { start: 212.36, end: 241.04 },
  seg_18: { start: 241.04, end: 247.37 },
};

const warnedSegments = new Set<string>();

export function toSegment(raw: BackendSegment): Segment {
  if (__DEV__ && raw.subpoints.length < 6 && !warnedSegments.has(raw.id)) {
    console.warn(`Segment ${raw.id} has fewer than 6 points (${raw.subpoints.length} points).`);
    warnedSegments.add(raw.id);
  }

  const km = SEGMENT_KM[raw.id] ?? { start: 0, end: 0 };
  const levelStr = raw.adjusted_risk_level_en ?? raw.risk_level_en ?? raw.adjusted_risk_level ?? raw.risk_level;
  const level = toLevel(levelStr);
  const effective = toEffectiveLevel(raw);

  return {
    id: raw.id,
    name: raw.name,
    name_en: raw.name_en ?? raw.name,
    sequence_order: raw.sequence_order,
    km_start: km.start,
    km_end: km.end,
    level,
    effectiveLevel: effective,
    score: raw.risk_score,
    main_driver: raw.main_driver,
    main_driver_en: raw.main_driver_en ?? raw.main_driver,
    rain_24h_mm: raw.rain_24h_mm,
    forecast_24h_mm: raw.forecast_24h_mm,
    forecast_72h_mm: raw.forecast_72h_mm,
    r3d_mm: raw.r3d_mm,
    terrain_score: raw.terrain_score,
    coordinates: raw.subpoints.map(([lat, lng]) => ({ latitude: lat, longitude: lng })),
    subpoints: raw.subpoints,
    closure: raw.closure,
    ground_report_count_24h: raw.ground_report_count_24h,
    has_adjusted_risk: !!raw.adjusted_risk_level,
    updated_at: raw.updated_at,
    eta_ist: raw.eta_ist,
    risk_level_at_eta: raw.risk_level_at_eta,
    rain_at_eta_mm: raw.rain_72h_at_eta_mm,
  };
}

export function toRiskMap(raw: BackendRiskMapResponse): RiskMapResponse {
  return {
    ...raw,
    segments: raw.segments.map(toSegment),
  };
}
