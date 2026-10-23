import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { KEYS, readJson, writeJson } from './storage';
import type { FieldReport, FieldReportCreated, OfflinePackResponse, RiskMapResponse, RouteRiskResponse } from './types';

// Backend address, in this order:
// 1. an address typed in the app (Server address sheet), saved on the device;
// 2. EXPO_PUBLIC_API_URL (App/.env), for a backend on another machine;
// 3. on web, the same host as the page on port 8000;
// 4. on a phone, the laptop running `expo start` (its LAN address from hostUri) on port 8000,
//    because "localhost" on a phone is the phone itself.
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const AUTO_API_URL = resolveBaseUrl();
let apiUrl = AUTO_API_URL;

export const getApiUrl = () => apiUrl;

/** Read a saved address before the first request (called once at start-up) */
export async function loadSavedApiUrl(): Promise<void> {
  const saved = await readJson<string>(KEYS.apiUrl);
  if (saved) apiUrl = saved;
}

/** Normalise what a person typed: "192.168.1.5" -> "http://192.168.1.5:8000" */
export function normaliseApiUrl(input: string): string | null {
  // Regex, not URL(): React Native's URL is only partly implemented
  const m = /^(?:(https?):\/\/)?([a-z0-9.-]+)(?::(\d{1,5}))?\/?$/i.exec(input.trim());
  if (!m) return null;
  const scheme = (m[1] ?? 'http').toLowerCase();
  const host = m[2];
  // A bare LAN address means the backend's default port; a domain name (tunnel) keeps its own
  const isIpOrLocal = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
  const port = m[3] ?? (scheme === 'http' && isIpOrLocal ? '8000' : '');
  return `${scheme}://${host}${port ? `:${port}` : ''}`;
}

/** null goes back to the automatic address */
export async function setApiUrl(url: string | null): Promise<void> {
  apiUrl = url ?? AUTO_API_URL;
  await writeJson(KEYS.apiUrl, url);
}

export class ApiError extends Error {
  status: number;
  detail: string | null;
  /** status 0 only: 'timeout' when the server never answered, 'unreachable' when the connection failed */
  network: 'timeout' | 'unreachable' | null;
  constructor(status: number, detail: string | null, network: ApiError['network'] = null) {
    super(detail || (status ? `Request failed (${status})` : 'Cannot reach the server'));
    this.status = status;
    this.detail = detail;
    this.network = network;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 10000, base = apiUrl): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { ...init, signal: controller.signal });
  } catch {
    // Wrong address, server not running, firewall, or no network: status 0 means "never got an answer"
    throw new ApiError(0, null, timedOut ? 'timeout' : 'unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : (body?.error ?? null);
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

/** One sentence for "could not reach the server", naming the address that was tried */
export function connectionHelp(err: unknown): string {
  const e = err instanceof ApiError ? err : null;
  const where = getApiUrl();
  if (e?.network === 'timeout') return `The Raah server at ${where} did not answer in time.`;
  return `Cannot reach the Raah server at ${where}.`;
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  health: (base: string) => request<{ status: string }>('/health', {}, 6000, base),
  riskMap: () => request<RiskMapResponse>('/risk-map'),
  offlinePack: () => request<OfflinePackResponse>('/offline-pack'),
  fieldReports: () => request<FieldReport[]>('/field-reports'),
  // The planner may fetch weather first, so it gets longer than the other calls
  tripPlanner: (body: { origin: string; destination: string; depart_time: string; speed_kmph?: number }) =>
    request<RouteRiskResponse>('/trip-planner', json({ ...body, lang: 'en' }), 20000),
  sendReport: (body: { lat: number; lng: number; description: string; reporter_name: string }) =>
    request<FieldReportCreated>('/field-report', json(body)),
};
