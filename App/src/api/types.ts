// Shapes returned by the FastAPI backend (Backend/app/models.py). Only the fields the app reads.

export interface Closure {
  id: number;
  segment_id: string;
  status: 'closed' | 'one_way' | 'restricted' | string;
  reason: string;
  source: string;
  starts_at: string;
  ends_at?: string | null;
  segment_name?: string | null;
}

export interface NodeEscalation {
  level?: string;
  avoid?: boolean;
  reason?: string;
  node_id?: string;
  status?: string;
}

export interface RawSegment {
  id: string;
  name: string;
  sequence_order: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  subpoints?: number[][];
  risk_level: string;
  risk_score: number;
  risk_index?: number | null;
  updated_at: string;
  terrain_percentile?: number | null;
  terrain_score?: number | null;
  rain_mm_3d?: number | null;
  r3d_mm?: number | null;
  rain_24h_mm?: number | null;
  forecast_24h_mm?: number | null;
  forecast_72h_mm?: number | null;
  main_driver?: string | null;
  nearest_hospital_km?: number | null;
  nearest_town?: string | null;
  closure?: Closure | null;
  adjusted_risk_level?: string | null;
  ground_report_count_24h?: number | null;
  adjustment_reason?: string | null;
  node_escalation?: NodeEscalation | null;
}

export interface RiskMapResponse {
  total_segments: number;
  high_or_very_high_risk_count: number;
  segments: RawSegment[];
  weather_source?: string | null;
  weather_fetched_at?: string | null;
  is_simulated?: boolean | null;
  stale_warning?: string | null;
}

export interface DepartureOption {
  depart_time: string;
  max_risk_level: string;
  summary: string;
  total_risk_score?: number | null;
}

export interface TripRecommendation {
  action: string;
  action_code: string;
  reason: string;
  best_departure_options: DepartureOption[];
}

export interface RouteSegment extends RawSegment {
  eta_ist?: string | null;
  rain_72h_at_eta_mm?: number | null;
  forecast_rain_6h_around_eta_mm?: number | null;
  risk_level_at_eta?: string | null;
}

export interface RouteRiskResponse {
  from_segment: string;
  to_segment: string;
  date: string;
  total_segments: number;
  max_risk_level: string;
  advisory: string;
  segments: RouteSegment[];
  recommendation?: TripRecommendation | null;
  depart_time?: string | null;
  speed_kmph?: number | null;
  closure?: Closure | null;
  weather_source?: string | null;
  stale_warning?: string | null;
}

export interface FieldReport {
  id: number;
  segment_id: string | null;
  lat: number;
  lng: number;
  description: string;
  reporter_name: string;
  status: 'pending' | 'verified' | 'rejected' | string;
  created_at: string;
  photo_url?: string | null;
}

export interface FieldReportCreated {
  report_id: number;
  status: string;
  message: string;
  submitted_at: string;
  segment_id?: string | null;
}

export interface EmergencyContact {
  name: string;
  number: string;
  description?: string | null;
}

export interface OfflineHospital {
  segment_id: string;
  segment_name: string;
  hospital_name: string;
  distance_km?: number | null;
}

export interface OfflinePackResponse {
  version: string;
  generated_at: string;
  emergency_contacts: EmergencyContact[];
  segments: { id: string; name: string; nearest_hospital?: string | null }[];
  hospitals?: OfflineHospital[];
}
