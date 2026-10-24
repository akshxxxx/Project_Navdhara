// Browser storage can be unavailable (private window, blocked site data, full disk): never let it break a page.

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  riskMap: 'raah.web.cache.risk-map.v1',
  offlinePack: 'raah.web.cache.offline-pack.v1',
  myReports: 'raah.web.my-reports.v1',
  mapStyle: 'raah.web.map-style.v1',
} as const;
