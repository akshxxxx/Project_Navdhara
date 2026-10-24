// Set VITE_API_URL (e.g. in Frontend/.env) to reach a backend on another machine; defaults to this laptop
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const TIMEOUT_MS = 10000;

// The whole dashboard is the officials' console: every admin call sends this key.
// Order: key saved on the Admin page (localStorage) > VITE_ADMIN_API_KEY in Frontend/.env.
// Must equal ADMIN_API_KEY in Backend/.env. It ships inside the page, so only run this dashboard on trusted machines.
export function getAdminKey() {
  try {
    const saved = localStorage.getItem('admin_key');
    if (saved) return saved;
  } catch { /* storage blocked */ }
  return import.meta.env.VITE_ADMIN_API_KEY || '';
}

export function setAdminKey(key) {
  try {
    if (key) localStorage.setItem('admin_key', key);
    else localStorage.removeItem('admin_key');
  } catch { /* storage blocked */ }
}

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = new Error(`API error ${res.status}`);
      err.status = res.status;
      try { err.detail = await res.json(); } catch {}
      throw err;
    }
    return res;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

export async function fetchRiskMap({ simulateRainMm, asOf, refreshWeather } = {}) {
  const params = new URLSearchParams();
  if (simulateRainMm != null) params.set('simulate_rain_mm', simulateRainMm);
  if (asOf) params.set('as_of', asOf);
  if (refreshWeather) params.set('refresh_weather', 'true');
  const res = await apiFetch(`/risk-map?${params}`);
  return res.json();
}

export async function fetchClosures({ activeOnly = true, segmentId } = {}) {
  const params = new URLSearchParams();
  if (activeOnly) params.set('active_only', 'true');
  if (segmentId) params.set('segment_id', segmentId);
  const res = await apiFetch(`/closures?${params}`);
  return res.json();
}

export async function fetchAlerts() {
  const res = await apiFetch('/alerts');
  return res.json();
}

export async function fetchRouteRisk({ fromSegment, toSegment, date, departTime, speedKmph = 30, simulateRainMm } = {}) {
  const params = new URLSearchParams({
    from_segment: fromSegment,
    to_segment: toSegment,
    date,
    speed_kmph: speedKmph,
  });
  if (departTime) params.set('depart_time', departTime);
  if (simulateRainMm != null) params.set('simulate_rain_mm', simulateRainMm);
  const res = await apiFetch(`/route-risk?${params}`);
  return res.json();
}

export async function postTripPlanner({ origin, destination, departTime, speedKmph = 30, simulateRainMm } = {}) {
  try {
    const body = { origin, destination, depart_time: departTime, speed_kmph: speedKmph };
    if (simulateRainMm != null) body.simulate_rain_mm = simulateRainMm;
    const res = await apiFetch('/trip-planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  } catch (err) {
    // If backend only has /route-risk (GET), use fetchRouteRisk
    const date = departTime ? departTime.split('T')[0] : new Date().toISOString().split('T')[0];
    return fetchRouteRisk({
      fromSegment: origin,
      toSegment: destination,
      date,
      departTime,
      speedKmph,
      simulateRainMm,
    });
  }
}

export async function fetchPriorityList({ sortBy = 'priority', simulateRainMm } = {}) {
  const params = new URLSearchParams({ sort_by: sortBy });
  if (simulateRainMm != null) params.set('simulate_rain_mm', simulateRainMm);
  const res = await apiFetch(`/priority-list?${params}`);
  return res.json();
}

export async function fetchOfflinePack(etag) {
  const headers = {};
  if (etag) headers['If-None-Match'] = etag;
  const res = await apiFetch('/offline-pack', { headers });
  if (res.status === 304) return { notModified: true };
  const newEtag = res.headers.get('ETag');
  const data = await res.json();
  return { data, etag: newEtag };
}

export async function postFieldReport({ lat, lng, reporterName, description }) {
  const res = await apiFetch('/field-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, reporter_name: reporterName, description }),
  });
  return res.json();
}

export async function fetchFieldReports() {
  const res = await apiFetch('/field-reports');
  return res.json();
}

export async function postSubscribe({ phoneNumber, segmentId, alertChannel }) {
  const body = { phone_number: phoneNumber, alert_channel: alertChannel };
  if (segmentId) body.segment_id = segmentId;
  const res = await apiFetch('/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function postAdminValidateReport({ reportId, status, verifiedBy = 'Control room', adminKey = getAdminKey() }) {
  const res = await apiFetch('/admin/validate-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify({ report_id: reportId, status, verified_by: verifiedBy }),
  });
  return res.json();
}

export async function postAdminClosure({ segmentId, status, reason, source, startsAt, endsAt, adminKey = getAdminKey() }) {
  const body = { segment_id: segmentId, status, reason, source: source || 'Control room' };
  if (startsAt) body.starts_at = startsAt;
  if (endsAt) body.ends_at = endsAt;
  const res = await apiFetch('/admin/closure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function deleteAdminClosure({ id, adminKey = getAdminKey() }) {
  const res = await apiFetch(`/admin/closure/${id}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Key': adminKey },
  });
  return res.json();
}

export function getVoiceAlertUrl({ segmentId }) {
  const params = new URLSearchParams();
  if (segmentId) params.set('segment_id', segmentId);
  return `${BASE_URL}/voice-alert?${params}`;
}

// "Alert All": broadcast to every consenting subscriber of a stretch (segmentId 'all' = everyone)
export async function postAlertAll({ segmentId, message, adminKey = getAdminKey() }) {
  const res = await apiFetch('/admin/alert-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
    body: JSON.stringify({ segment_id: segmentId, message: message || null }),
  });
  return res.json();
}

export async function fetchHistory() {
  const res = await apiFetch('/history');
  return res.json();
}

// --- Raah Node (slope sensors): see Backend/docs/NODE_API.md ---

export async function fetchNodeFleet() {
  const res = await apiFetch('/node/fleet');
  return res.json();
}

export async function fetchNodeIncidents(limit = 8) {
  const res = await apiFetch(`/node/incidents?limit=${limit}`);
  return res.json();
}

export async function fetchNodeHistory(nodeId, minutes = 5) {
  const res = await apiFetch(`/node/history?node_id=${encodeURIComponent(nodeId)}&minutes=${minutes}`);
  return res.json();
}

export async function fetchNodeAlerts() {
  const res = await apiFetch('/node/alerts');
  return res.json();
}

export async function fetchNodePlacement({ n = 10, minSpacingKm = 2 } = {}) {
  const res = await apiFetch(`/node/placement?n=${n}&min_spacing_km=${minSpacingKm}`);
  return res.json();
}

// Marks accept the node key or the admin key; the same value is sent in both headers
export async function postNodeMark({ label, key = getAdminKey() }) {
  const res = await apiFetch('/node/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Node-Key': key || '', 'X-Admin-Key': key || '' },
    body: JSON.stringify({ label }),
  });
  return res.json();
}

export async function postNodeAck({ nodeId, adminKey = getAdminKey() }) {
  const res = await apiFetch(`/node/ack/${encodeURIComponent(nodeId)}`, {
    method: 'POST',
    headers: { 'X-Admin-Key': adminKey || '' },
  });
  return res.json();
}

// Sensor log (Admin page): one CSV per IST day of every node reading (Backend/app/node_log.py)
export async function fetchNodeLogDays({ adminKey = getAdminKey() } = {}) {
  const res = await apiFetch('/admin/node-logs', { headers: { 'X-Admin-Key': adminKey || '' } });
  return res.json();
}

export async function fetchNodeLogRows({ date, nodeId, limit = 200, adminKey = getAdminKey() }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (nodeId) params.set('node_id', nodeId);
  const res = await apiFetch(`/admin/node-logs/${encodeURIComponent(date)}?${params}`, {
    headers: { 'X-Admin-Key': adminKey || '' },
  });
  return res.json();
}

// The CSV needs the admin key header, so it is fetched and saved through a temporary link
export async function downloadNodeLog({ date, adminKey = getAdminKey() }) {
  const res = await apiFetch(`/admin/node-logs/${encodeURIComponent(date)}?format=csv`, {
    headers: { 'X-Admin-Key': adminKey || '' },
  });
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `raah-sensor-log-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

