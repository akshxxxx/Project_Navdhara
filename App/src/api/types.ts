/**
 * API types matching the FastAPI backend.
 * Source: ANTIGRAVITY_BACKEND_CONTEXT.md and /openapi.json
 *
 * The corridor is Rishikesh to Joshimath (247.37 km, 18 segments).
 * Backend IDs are seg_01..seg_18 (underscore, not hyphen).
 */

// ---------------------------------------------------------------------------
// Risk levels
// ---------------------------------------------------------------------------

/** Numeric UI level: 0=Low, 1=Moderate, 2=High, 3=Severe (Very High) */
export type Level = 0 | 1 | 2 | 3;

/** Extended level that includes the closed state */
export type EffectiveLevel = Level | 'closed';

/**
 * Map backend risk_level_en string to our numeric Level.
 * "Very High" in the backend = Severe = 3 in our UI.
 */
export function parseLevel(riskLevelEn?: string | null): Level {
  if (!riskLevelEn) return 0;
  const normalized = riskLevelEn.trim().toLowerCase();
  switch (normalized) {
    case 'low': return 0;
    case 'moderate': case 'caution': return 1;
    case 'high': return 2;
    case 'very high': case 'very high / severe': case 'severe': return 3;
    default: return 0;
  }
}


/** Derive effective level from a segment, accounting for closures. */
export function effectiveLevel(seg: BackendSegment): EffectiveLevel {
  if (seg.closure?.status === 'closed') return 'closed';
  const adjustedEn = seg.adjusted_risk_level_en ?? seg.risk_level_en;
  return parseLevel(adjustedEn);
}

/**
 * Score-based fallback when only risk_score is available.
 * Thresholds: 0.35, 0.60, 0.80
 */
export function levelFromScore(score: number): Level {
  if (score >= 0.80) return 3;
  if (score >= 0.60) return 2;
  if (score >= 0.35) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Closure
// ---------------------------------------------------------------------------

export interface Closure {
  id: number;
  segment_id: string;
  segment_name?: string;
  status: 'closed' | 'one_way' | 'restricted';
  reason: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
}

// ---------------------------------------------------------------------------
// Backend Segment (raw from /risk-map)
// ---------------------------------------------------------------------------

export interface BackendSegment {
  id: string;
  name: string;
  name_en: string;
  sequence_order: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  /** Array of [lat, lng] pairs – matches react-native-maps directly */
  subpoints: [number, number][];
  risk_level: string;
  risk_level_en: string;
  risk_score: number;
  terrain_score: number;
  r3d_mm: number;
  rain_24h_mm: number;
  forecast_24h_mm: number;
  forecast_72h_mm: number;
  main_driver: string;
  main_driver_en: string;
  closure: Closure | null;
  adjusted_risk_level: string | null;
  adjusted_risk_level_en?: string | null;
  ground_report_count_24h: number;
  updated_at: string;
  eta_ist?: string;
  risk_level_at_eta?: string;
  rain_72h_at_eta_mm?: number;
}

// ---------------------------------------------------------------------------
// UI Segment (transformed for components)
// ---------------------------------------------------------------------------

/**
 * Segment shape used by all UI components.
 * Created by transforming BackendSegment in the client layer.
 */
export interface Segment {
  id: string;
  name: string;
  name_en: string;
  sequence_order: number;
  km_start: number;
  km_end: number;
  /** Numeric level for UI components */
  level: Level;
  /** Effective level including closed state */
  effectiveLevel: EffectiveLevel;
  /** 0..1 risk score */
  score: number;
  /** Main driver sentence (localized) */
  main_driver: string;
  main_driver_en: string;
  /** Rain data */
  rain_24h_mm: number;
  forecast_24h_mm: number;
  forecast_72h_mm: number;
  r3d_mm: number;
  terrain_score: number;
  /** Coordinates as [{latitude, longitude}] for react-native-maps */
  coordinates: { latitude: number; longitude: number }[];
  /** Raw subpoints [lat, lng] for distance calculations */
  subpoints: [number, number][];
  /** Closure info if any */
  closure: Closure | null;
  /** Number of verified ground reports in last 24h */
  ground_report_count_24h: number;
  /** Whether the risk was manually adjusted based on ground reports */
  has_adjusted_risk: boolean;
  updated_at: string;
  eta_ist?: string;
  risk_level_at_eta?: string;
  rain_at_eta_mm?: number;
}

// ---------------------------------------------------------------------------
// Risk Map Response
// ---------------------------------------------------------------------------

export interface RiskMapResponse {
  corridor: string;
  total_segments: number;
  high_or_very_high_risk_count: number;
  rain_status: 'live' | 'cached';
  as_of: string;
  is_simulated: boolean;
  segments: Segment[];
}

/** Raw response before transformation */
export interface BackendRiskMapResponse {
  corridor: string;
  total_segments: number;
  high_or_very_high_risk_count: number;
  rain_status: 'live' | 'cached';
  as_of: string;
  is_simulated: boolean;
  segments: BackendSegment[];
}

// ---------------------------------------------------------------------------
// Trip Planner
// ---------------------------------------------------------------------------

export interface TripPlanRequest {
  origin: string;       // segment ID e.g. "seg_01"
  destination: string;  // segment ID e.g. "seg_18"
  depart_time: string;  // UTC ISO string
  speed_kmph: number;
  simulate_rain_mm?: number | null;
  lang: string;
}

export interface TripRecommendation {
  action: 'RECOMMENDED' | 'CAUTION' | 'AVOID' | string;
  action_code: string;
  reason: string;
  best_departure_options: DepartureOption[];
  params?: any;
}

export interface DepartureOption {
  depart_time: string;
  max_risk_level: string;
  summary: string;
  total_risk_score?: number | null;
}

export interface TripPlanResponse {
  from_segment: string;
  to_segment: string;
  max_risk_level: string;
  average_risk_score: number;
  advisory: string;
  segments: Segment[];
  recommendation: TripRecommendation;
  total_segments: number;
  depart_time?: string;
  speed_kmph?: number;
}

// ---------------------------------------------------------------------------
// Field Report (backend schema)
// ---------------------------------------------------------------------------

export interface FieldReportSubmission {
  lat: number;
  lng: number;
  reporter_name: string;
  description: string;
  photo_url?: string;
}

export interface FieldReport {
  id: number;
  segment_id: string;
  lat: number;
  lng: number;
  reporter_name: string;
  description: string;
  status: 'pending' | 'verified' | 'rejected' | 'Pending' | 'Validated' | 'Rejected';
  photo_url?: string;
  reported_at: string;
  created_at?: string;
  decision_notes?: string;
}

// ---------------------------------------------------------------------------
// Closures list response
// ---------------------------------------------------------------------------

export interface ClosuresResponse {
  active_closures_count: number;
  closures: Closure[];
}

// ---------------------------------------------------------------------------
// Alert (derived from high-risk segments, not a separate endpoint for app)
// ---------------------------------------------------------------------------

export interface Alert {
  id: string;
  segment_id: string;
  level: Level;
  code: string;
  created_at: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Segment master (for trip planner dropdowns)
// ---------------------------------------------------------------------------

export interface SegmentOption {
  id: string;
  name: string;
  name_en: string;
  sequence_order: number;
  km_start: number;
}
