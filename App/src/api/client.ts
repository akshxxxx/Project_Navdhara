import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../locales/i18n';
import type {
  TripPlanResponse,
  FieldReportSubmission,
  FieldReport,
  ClosuresResponse,
  RiskMapResponse,
  SegmentOption,
} from './types';
import type {
  BackendRiskMapResponse,
  BackendClosuresResponse,
  BackendTripPlanResponse,
  BackendFieldReport,
} from './backend-types';
import { toRiskMap, toSegment } from './adapters';
import { useDemoStore } from './demoStore';
import { getFixtureForUrl } from './fixturesStore';

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function getApiBaseUrl(): string {
  const envUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL ?? process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;
  if (Platform.OS === 'android') {
    const hostUri = Constants.expoConfig?.hostUri 
      || (Constants as any).manifest2?.extra?.expoClient?.hostUri 
      || (Constants as any).manifest?.debuggerHost;
    if (hostUri) {
      const hostIp = hostUri.split(':')[0];
      if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
        return `http://${hostIp}:8000`;
      }
    }
    return 'http://10.0.2.2:8000';
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return 'http://localhost:8000';
}

export const API_URL = getApiBaseUrl();

console.log('App/.env config: process.env.EXPO_PUBLIC_API_URL =', process.env.EXPO_PUBLIC_API_URL);
console.log('Resolved API_URL =', API_URL);

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const { useSavedData, userForcedSavedData } = useDemoStore.getState();

  const serveFixture = (fixture: any) => {
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Is-Fixture': 'true' }
    });
  };

  // Only bypass network proactively if the user manually forced saved data in Demo mode
  if (useSavedData && userForcedSavedData) {
    const fixture = getFixtureForUrl(url);
    if (fixture) return serveFixture(fixture);
  }

  const timeout = 10000;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) throw new HttpError(res.status, `HTTP Error ${res.status} on ${url}`);
    
    // Live request succeeded: clear transient fallback saved data
    if (useDemoStore.getState().useSavedData && !useDemoStore.getState().userForcedSavedData) {
      useDemoStore.getState().setUseSavedData(false);
    }
    return res;
  } catch (error: any) {
    clearTimeout(id);
    console.warn(`[fetchWithTimeout] Failed to fetch ${url}: ${error?.message || error}`);
    
    // Only fall back to fixture on network errors or 5xx server errors
    const isNetworkOr5xx = error.name === 'AbortError' || (error instanceof HttpError && error.status >= 500) || !(error instanceof HttpError);
    if (isNetworkOr5xx) {
      const fixture = getFixtureForUrl(url);
      if (fixture) {
        useDemoStore.getState().setUseSavedData(true);
        return serveFixture(fixture);
      }
    }

    if (error.name === 'AbortError') {
      throw new NetworkError(`Request timeout after ${timeout}ms`);
    }
    if (error instanceof HttpError) {
      throw error;
    }
    throw new NetworkError(error.message || 'Network error');
  }
}

function getLang(): string {
  return i18n.language === 'hi' ? 'hi' : 'en';
}

function applyDemoParams(params: URLSearchParams) {
  const { simulateRainMm, asOf } = useDemoStore.getState();
  if (simulateRainMm !== null) params.set('simulate_rain_mm', String(simulateRainMm));
  if (asOf) params.set('as_of', asOf);
}

export async function fetchRiskMap(): Promise<RiskMapResponse> {
  const params = new URLSearchParams({ lang: getLang() });
  applyDemoParams(params);

  const res = await fetchWithTimeout(`${API_URL}/risk-map?${params}`);
  const raw: BackendRiskMapResponse = await res.json();
  return toRiskMap(raw);
}

export async function fetchClosures(): Promise<ClosuresResponse> {
  const res = await fetchWithTimeout(`${API_URL}/closures?active_only=true`);
  const raw: BackendClosuresResponse = await res.json();
  return raw as ClosuresResponse; // Schema matches
}

export async function fetchRouteRisk(
  req: { origin: string; destination: string; depart_time: string; speed_kmph: number }
): Promise<TripPlanResponse> {
  const d = new Date(req.depart_time);
  const dateStr = d.toISOString().split('T')[0];
  const params = new URLSearchParams({
    from_segment: req.origin,
    to_segment: req.destination,
    date: dateStr,
    depart_time: req.depart_time,
    speed_kmph: String(req.speed_kmph),
    lang: getLang(),
  });
  
  const { simulateRainMm } = useDemoStore.getState();
  if (simulateRainMm !== null) params.set('simulate_rain_mm', String(simulateRainMm));

  const res = await fetchWithTimeout(`${API_URL}/route-risk?${params}`);
  const raw: BackendTripPlanResponse = await res.json();
  return {
    ...raw,
    segments: raw.segments.map(toSegment),
  } as TripPlanResponse;
}

export async function postFieldReport(
  submission: FieldReportSubmission,
): Promise<FieldReport> {
  const res = await fetchWithTimeout(`${API_URL}/field-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submission),
  });
  const raw: BackendFieldReport = await res.json();
  return raw as unknown as FieldReport;
}

export async function fetchFieldReports(): Promise<FieldReport[]> {
  const res = await fetchWithTimeout(`${API_URL}/field-reports`);
  const raw = await res.json();
  return (raw.value || raw) as unknown as FieldReport[];
}

export async function fetchAlerts(userId?: number): Promise<{alerts: any[]}> {
  const params = new URLSearchParams({ lang: getLang() });
  if (userId !== undefined) params.set('user_id', String(userId));
  try {
    const savedToken = await AsyncStorage.getItem('raah_subscription_token');
    if (savedToken) params.set('token', savedToken);
  } catch {}
  applyDemoParams(params);
  const res = await fetchWithTimeout(`${API_URL}/alerts?${params}`);
  const raw = await res.json();
  return raw;
}

export async function postSubscribe(req: any): Promise<any> {
  const res = await fetchWithTimeout(`${API_URL}/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function fetchPriorityList(): Promise<any[]> {
  const res = await fetchWithTimeout(`${API_URL}/priority-list`);
  const raw = await res.json();
  return raw.priority_segments || raw;
}

export async function fetchModelInfo(): Promise<any> {
  const res = await fetchWithTimeout(`${API_URL}/model-info`);
  return await res.json();
}

export async function fetchBacktestSummary(): Promise<any> {
  const res = await fetchWithTimeout(`${API_URL}/backtest-summary`);
  return await res.json();
}

export async function fetchHistory(): Promise<any> {
  const res = await fetchWithTimeout(`${API_URL}/history`);
  return await res.json();
}

export async function postAdminValidateReport(params: {
  reportId: number;
  status: 'verified' | 'rejected';
  verifiedBy?: string;
  adminKey?: string;
}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.adminKey) headers['X-Admin-Key'] = params.adminKey;
  const res = await fetchWithTimeout(`${API_URL}/admin/validate-report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      report_id: params.reportId,
      status: params.status,
      verified_by: params.verifiedBy || 'NH-7 Control Room Operator',
    }),
  });
  return await res.json();
}

export async function postAdminClosure(params: {
  segmentId: string;
  status: 'closed' | 'one_way' | 'restricted';
  reason: string;
  source?: string;
  startsAt?: string;
  endsAt?: string;
  adminKey?: string;
}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (params.adminKey) headers['X-Admin-Key'] = params.adminKey;
  const res = await fetchWithTimeout(`${API_URL}/admin/closure`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      segment_id: params.segmentId,
      status: params.status,
      reason: params.reason,
      source: params.source || 'NH-7 Traffic Control',
      starts_at: params.startsAt,
      ends_at: params.endsAt,
    }),
  });
  return await res.json();
}

export async function deleteAdminClosure(closureId: number, adminKey?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  const res = await fetchWithTimeout(`${API_URL}/admin/closure/${closureId}`, {
    method: 'DELETE',
    headers,
  });
  return await res.json();
}

export async function fetchHealth(): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error: any) {
    clearTimeout(id);
    console.warn(`[fetchHealth] Error: ${error.message} - URL: ${API_URL}/health - Status: ${error.status || 'unknown'}`);
    throw error;
  }
}
