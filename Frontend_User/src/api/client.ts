import type { FieldReport, FieldReportCreated, OfflinePackResponse, RiskMapResponse, RouteRiskResponse } from './types';

// Backend address: VITE_API_URL when the site is built to talk to a backend directly; otherwise /api,
// which the Vite dev and preview servers forward to the backend (vite.config.ts).
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '/api';

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

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal });
  } catch {
    // Server not running, wrong address, or no network: status 0 means "never got an answer"
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
    // The dev proxy answers 502/504 when the backend is down: treat that as "unreachable" too
    if (res.status === 502 || res.status === 504) throw new ApiError(0, null, 'unreachable');
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

/** One sentence for "could not reach the server" */
export function connectionHelp(err: unknown): string {
  const e = err instanceof ApiError ? err : null;
  if (e?.network === 'timeout') return 'The Raah server did not answer in time.';
  if (e && e.status !== 0) return e.detail || `The Raah server answered with an error (${e.status}).`;
  return 'Cannot reach the Raah server. Check your connection.';
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  riskMap: () => request<RiskMapResponse>('/risk-map'),
  offlinePack: () => request<OfflinePackResponse>('/offline-pack'),
  fieldReports: () => request<FieldReport[]>('/field-reports'),
  // The planner may fetch weather first, so it gets longer than the other calls
  tripPlanner: (body: { origin: string; destination: string; depart_time: string; speed_kmph?: number }) =>
    request<RouteRiskResponse>('/trip-planner', json({ ...body, lang: 'en' }), 20000),
  sendReport: (body: { lat: number; lng: number; description: string; reporter_name: string; photo_url?: string }) =>
    request<FieldReportCreated>('/field-report', json(body)),
  /** Uploads one JPEG; the returned URL goes in the report's photo_url */
  uploadPhoto: (photo: Blob) => {
    const form = new FormData();
    form.append('photo', photo, 'report.jpg');
    return request<{ photo_url: string }>('/field-report/photo', { method: 'POST', body: form }, 30000);
  },
};

/**
 * The backend returns photo URLs on its own address (http://host:8000/report-photos/…). The page shows them
 * through its own origin, so they also load when the backend is only reachable through the proxy.
 */
export function photoSrc(url: string): string {
  const m = /\/report-photos\/[^/?#]+$/.exec(url);
  if (m && API_URL === '/api') return m[0];
  return url;
}
