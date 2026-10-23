export interface BackendClosure {
  id: number;
  segment_id: string;
  segment_name?: string;
  status: 'closed' | 'one_way' | 'restricted';
  reason: string;
  source: string;
  starts_at: string;
  ends_at: string | null;
}

export interface BackendSegment {
  id: string;
  name: string;
  name_en: string;
  sequence_order: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
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
  closure: BackendClosure | null;
  adjusted_risk_level: string | null;
  adjusted_risk_level_en?: string | null;
  ground_report_count_24h: number;
  updated_at: string;
  eta_ist?: string;
  risk_level_at_eta?: string;
  rain_72h_at_eta_mm?: number;
}

export interface BackendRiskMapResponse {
  corridor: string;
  total_segments: number;
  high_or_very_high_risk_count: number;
  rain_status: 'live' | 'cached';
  as_of: string;
  is_simulated: boolean;
  segments: BackendSegment[];
}

export interface BackendDepartureOption {
  depart_time: string;
  max_risk_level: string;
  summary: string;
  total_risk_score?: number | null;
}

export interface BackendTripRecommendation {
  action: 'RECOMMENDED' | 'CAUTION' | 'AVOID' | string;
  action_code: string;
  reason: string;
  best_departure_options: BackendDepartureOption[];
  params?: any;
}

export interface BackendTripPlanResponse {
  from_segment: string;
  to_segment: string;
  max_risk_level: string;
  average_risk_score: number;
  advisory: string;
  segments: BackendSegment[];
  recommendation: BackendTripRecommendation;
  total_segments: number;
  depart_time?: string;
  speed_kmph?: number;
}

export interface BackendTripPlanRequest {
  origin: string;
  destination: string;
  depart_time: string;
  speed_kmph: number;
  simulate_rain_mm?: number | null;
  lang: string;
}

export interface BackendFieldReportSubmission {
  lat: number;
  lng: number;
  reporter_name: string;
  description: string;
  photo_url?: string;
}

export interface BackendFieldReport {
  id: number;
  segment_id: string;
  lat: number;
  lng: number;
  reporter_name: string;
  description: string;
  status: 'pending' | 'verified' | 'rejected';
  photo_url?: string;
  reported_at: string;
}

export interface BackendClosuresResponse {
  active_closures_count: number;
  closures: BackendClosure[];
}
