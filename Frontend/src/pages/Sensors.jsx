import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Volume2, VolumeX, Flag, ShieldCheck, Radio, MapPin, AlertTriangle, Loader2,
  Mountain, Waves, Droplets, CloudRain, Cpu, Wifi,
} from 'lucide-react';
import {
  fetchNodeFleet, fetchNodeIncidents, fetchNodeHistory, fetchNodePlacement,
  fetchRiskMap, fetchRouteRisk, postNodeMark, postNodeAck,
} from '../api/client';
import { adaptSegment } from '../api/adapters';
import { InteractiveMap } from '../components/InteractiveMap';

// Raah Node (ESP32 slope sensor) console: Backend/docs/NODE_API.md §5.
// Four sensors per node (Raah Node build workflow §4.1): MPU6050 tilt + tilt rate + vibration,
// LM393 soil moisture (GPIO34), LM393 rain plate (GPIO35). Polls /node/fleet + /node/incidents every 2 s.

const POLL_MS = 2000;

// Thresholds (48 h workflow §4.2, recalibrated 2026-10-24; Backend/docs/SENSOR_THRESHOLDS.md).
// Only tilt can raise ALARM; vibration and soil moisture stop at WARNING. Bench values.
const T = {
  tiltWatch: 2, tiltWarn: 5, tiltAlarm: 8,
  rateWarn: 3, rateAlarm: 8,
  vibWarnRms: 0.10, impactPeak: 0.35,
  moistWatch: 50, moistSat: 70, wetFactor: 0.6,
};

const STATE_STYLE = {
  OK: { color: '#10b981', bg: '#ecfdf5' },
  WATCH: { color: '#d49a00', bg: '#fefce8' },
  WARNING: { color: '#f97316', bg: '#fff7ed' },
  ALARM: { color: '#dc2626', bg: '#fef2f2' },
};
const STATUS_STYLE = {
  ONLINE: '#10b981', STALE: '#d49a00', OFFLINE: '#64748b', SENSOR_LOST: '#a855f7',
};
const LOST_COLOR = '#a855f7';
const KIND_LABEL = { mock: 'MOCK DATA', replay: 'REPLAY', simulated: 'SIMULATED' };
const ACTION_COLOR = { AVOID: '#9B1C31', DELAY: '#C4470F', CAUTION: '#D49A00' };

const fmtSec = ms => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(d));

function useNodeLive() {
  const [data, setData] = useState({ fleet: null, incidents: [], error: null });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [fleet, inc] = await Promise.all([fetchNodeFleet(), fetchNodeIncidents(8)]);
        if (alive) setData({ fleet, incidents: inc.incidents || [], error: null });
      } catch (e) {
        if (alive) setData(d => ({ ...d, error: String(e.message || e) }));
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return data;
}

// Browsers only allow speech after a click, hence the "Enable voice" button
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-IN';
  window.speechSynthesis.speak(u);
}

// Per-sensor level, using the firmware's rules (wet soil lowers tilt/rate thresholds to 60 %)
function sensorLevels(r, h) {
  const wet = (r.moisture_pct ?? 0) >= T.moistSat;
  const f = wet ? T.wetFactor : 1;
  const tilt = r.tilt_deg ?? 0;
  const rate = r.tilt_rate_dpm ?? 0;
  const peak = r.vib_g ?? 0;
  const rms = h.vib_rms_g ?? 0;
  const tiltLevel = (tilt >= T.tiltAlarm * f || rate >= T.rateAlarm * f) ? 'ALARM'
    : (tilt >= T.tiltWarn * f || rate >= T.rateWarn * f) ? 'WARNING'
      : tilt >= T.tiltWatch * f ? 'WATCH' : 'OK';
  const vibLevel = (peak >= T.impactPeak || rms >= T.vibWarnRms) ? 'WARNING' : 'OK';
  const moistLevel = wet ? 'WARNING' : (r.moisture_pct ?? 0) >= T.moistWatch ? 'WATCH' : 'OK';
  const rainLevel = r.rain_wet ? 'WATCH' : 'OK';
  return { wet, f, tiltLevel, vibLevel, moistLevel, rainLevel };
}

function Sparkline({ points, field, max, color, step = false }) {
  const pts = (points || []).filter(p => !p.late && p[field] != null);
  if (pts.length < 2) return <div className="h-10 text-[10px] text-granite flex items-end">no history yet</div>;
  const t0 = pts[0].server_ms;
  const t1 = pts[pts.length - 1].server_ms || t0 + 1;
  const x = t => (200 * (t - t0)) / Math.max(1, t1 - t0);
  const y = v => 38 - Math.min(36, (Math.max(0, v) / max) * 36);
  let d = '';
  pts.forEach((p, i) => {
    const px = x(p.server_ms).toFixed(1);
    const py = y(Number(p[field])).toFixed(1);
    if (i === 0) d = `M${px},${py}`;
    else d += step ? ` H${px} V${py}` : ` L${px},${py}`;
  });
  return (
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="w-full h-10">
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Horizontal gauge with threshold ticks
function Gauge({ value, max, ticks, color }) {
  const pct = Math.min(100, (Math.max(0, value || 0) / max) * 100);
  return (
    <div className="relative h-2.5 bg-glacier rounded-full mt-2">
      {/* No transition: a sensor readout must never show a stale animated value */}
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      {ticks.map(tk => (
        <div key={tk.label} className="absolute -top-1 h-4.5 w-px bg-ink/50" style={{ left: `${Math.min(100, (tk.at / max) * 100)}%` }} title={tk.label}>
          <span className="absolute top-4 -translate-x-1/2 text-[9px] text-granite whitespace-nowrap">{tk.short}</span>
        </div>
      ))}
    </div>
  );
}

function SensorTile({ icon: Icon, title, level, children, footer }) {
  const st = STATE_STYLE[level] || STATE_STYLE.OK;
  return (
    <div className="rounded-lg border-2 p-3 bg-white flex flex-col" style={{ borderColor: level === 'OK' ? '#e2e8f0' : st.color }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-granite">
          <Icon className="w-4 h-4" style={{ color: st.color }} /> {title}
        </div>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: st.color, background: st.bg }}>{level}</span>
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-2 pt-2 border-t border-mist">{footer}</div>}
    </div>
  );
}

function SensorReadout({ node, history, segName, onAck, acking }) {
  const r = node.reading || {};
  const h = node.health || {};
  const lv = sensorLevels(r, h);
  const lost = node.status === 'SENSOR_LOST';
  const online = node.status === 'ONLINE';
  const st = STATE_STYLE[node.state] || STATE_STYLE.OK;
  const stale = !online && !lost;

  return (
    <section className="bg-snow border border-mist rounded-md shadow-sm p-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-condensed font-bold text-xl text-ink">{node.node_id}</span>
            {KIND_LABEL[node.kind] && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">{KIND_LABEL[node.kind]}</span>}
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
              style={{ color: STATUS_STYLE[node.status], borderColor: STATUS_STYLE[node.status] }}>
              {node.status.replace('_', ' ')} · {node.age_s}s ago
            </span>
          </div>
          <div className="text-sm text-granite">{node.segment_id} · {segName || '—'}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] uppercase tracking-wide text-granite font-semibold">{stale ? 'Last state' : 'Node state'}</div>
          <div className="font-condensed font-black text-4xl leading-none" style={{ color: stale ? '#64748b' : st.color }}>{node.state}</div>
          {r.model_state && <div className="text-[11px] text-granite mt-1 flex items-center gap-1 justify-end"><Cpu className="w-3 h-3" /> edge model: {r.model_state} (advisory)</div>}
        </div>
      </div>

      {lost && (
        <div className="mt-3 rounded-md p-3 text-sm font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          style={{ background: 'rgba(168,85,247,.12)', color: '#6b21a8' }}>
          <span>Sensor lost: went silent after {node.state}. The alert is held until the site is checked.</span>
          <button onClick={() => onAck(node.node_id)} disabled={acking}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#6b21a8] text-white text-xs font-semibold disabled:opacity-60 shrink-0">
            <ShieldCheck className="w-3.5 h-3.5" /> Site checked (release)
          </button>
        </div>
      )}
      {node.acked_ms && stale && <div className="mt-3 text-xs text-granite">Site checked by an official; hold released.</div>}

      <div className={`grid gap-3 mt-4 grid-cols-1 sm:grid-cols-2 ${stale ? 'opacity-70' : ''}`}>
        <SensorTile icon={Mountain} title="Tilt (MPU6050)" level={lv.tiltLevel}
          footer={<Sparkline points={history} field="tilt_deg" max={12} color="#1D5E6B" />}>
          <div className="flex items-end gap-4 mt-1">
            <div><span className="font-condensed font-bold text-3xl text-ink tabular-nums">{fmt(r.tilt_deg, 1)}</span><span className="text-sm text-granite">°</span></div>
            <div className="text-xs text-granite pb-1">rate <span className="font-semibold text-ink tabular-nums">{fmt(r.tilt_rate_dpm, 1)}</span> °/min</div>
          </div>
          <Gauge value={r.tilt_deg} max={12} color={STATE_STYLE[lv.tiltLevel].color}
            ticks={[{ at: T.tiltWatch * lv.f, short: 'W', label: 'WATCH' }, { at: T.tiltWarn * lv.f, short: 'WR', label: 'WARNING' }, { at: T.tiltAlarm * lv.f, short: 'AL', label: 'ALARM' }]} />
          <div className="text-[10px] text-granite mt-5">
            WATCH {fmt(T.tiltWatch * lv.f, 1)}° · WARNING {fmt(T.tiltWarn * lv.f, 1)}° or {fmt(T.rateWarn * lv.f, 1)}°/min · ALARM {fmt(T.tiltAlarm * lv.f, 1)}° or {fmt(T.rateAlarm * lv.f, 1)}°/min
            {lv.wet && <span className="font-semibold text-amber-700"> · lowered for wet soil</span>}
          </div>
        </SensorTile>

        <SensorTile icon={Waves} title="Vibration (MPU6050)" level={lv.vibLevel}
          footer={<Sparkline points={history} field="vib_g" max={0.6} color="#db2777" />}>
          <div className="flex items-end gap-4 mt-1">
            <div><span className="font-condensed font-bold text-3xl text-ink tabular-nums">{fmt(r.vib_g, 2)}</span><span className="text-sm text-granite"> g peak</span></div>
            <div className="text-xs text-granite pb-1">RMS <span className="font-semibold text-ink tabular-nums">{fmt(h.vib_rms_g, 3)}</span> g</div>
          </div>
          <Gauge value={r.vib_g} max={0.6} color={STATE_STYLE[lv.vibLevel].color}
            ticks={[{ at: T.vibWarnRms, short: 'RMS', label: 'WARNING (RMS)' }, { at: T.impactPeak, short: 'IMP', label: 'Impact (peak)' }]} />
          <div className="text-[10px] text-granite mt-5">
            WARNING at RMS ≥ {T.vibWarnRms} g or a knock ≥ {T.impactPeak} g · never ALARM on its own (traffic shakes the road too)
            {h.strikes_10s ? <span className="font-semibold text-ink"> · {h.strikes_10s} knock(s) in 10 s</span> : null}
          </div>
        </SensorTile>

        <SensorTile icon={Droplets} title="Soil moisture" level={lv.moistLevel}
          footer={<Sparkline points={history} field="moisture_pct" max={100} color="#0284c7" />}>
          <div className="mt-1"><span className="font-condensed font-bold text-3xl text-ink tabular-nums">{fmt(r.moisture_pct, 0)}</span><span className="text-sm text-granite">%</span></div>
          <Gauge value={r.moisture_pct} max={100} color={lv.wet ? '#d49a00' : '#0284c7'}
            ticks={[{ at: T.moistWatch, short: 'W', label: 'WATCH' }, { at: T.moistSat, short: 'SAT', label: 'Saturated: WARNING' }]} />
          <div className="text-[10px] text-granite mt-5">
            {lv.wet
              ? <span className="font-semibold text-amber-700">Saturated (≥ {T.moistSat}%): WARNING, and tilt thresholds lowered to 60%.</span>
              : <>WATCH from {T.moistWatch}%, WARNING when saturated (≥ {T.moistSat}%), never ALARM on its own.</>}
            {h.soil_raw != null && <span className="block tabular-nums">LM393 on GPIO34 · ADC {Math.round(h.soil_raw)} (dry 4095, wet ~1250)</span>}
          </div>
        </SensorTile>

        <SensorTile icon={CloudRain} title="Rain plate" level={lv.rainLevel}
          footer={<Sparkline points={history} field="rain_wet" max={1} color="#0ea5e9" step />}>
          <div className="mt-1 flex items-center gap-3">
            <span className={`font-condensed font-black text-3xl ${r.rain_wet ? 'text-sky-600' : 'text-ink'}`}>
              {r.rain_wet == null ? '—' : r.rain_wet ? 'WET' : 'DRY'}
            </span>
            <span className="text-xs text-granite">{r.rain_wet ? 'Rain on the plate now' : 'No rain on the plate'}</span>
          </div>
          <div className="text-[10px] text-granite mt-3">
            Rain on the plate raises the node to at least WATCH. Chart: 1 = wet, 0 = dry.
            {h.rain_raw != null && <span className="block tabular-nums">LM393 on GPIO35 · ADC {Math.round(h.rain_raw)}{h.rain_pct != null ? ` · ${Math.round(h.rain_pct)}% wet` : ''} (dry 4095, wet ~2400)</span>}
          </div>
        </SensorTile>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-granite">
        <span className="flex items-center gap-1"><Wifi className="w-3 h-3" /> {h.link || '—'} · RSSI {h.rssi_dbm ?? '—'} dBm</span>
        <span>RTT {h.rtt_ms ?? '—'} ms</span>
        <span>outbox {h.buffered ?? '—'}</span>
        <span>uptime {h.uptime_s != null ? `${Math.round(h.uptime_s / 60)} min` : '—'}</span>
        <span>fw {h.fw ?? '—'}</span>
        {h.state_source && <span>state decided by {h.state_source === 'server' ? 'the backend (raw data)' : 'the node'}</span>}
        {h.state_capped_from && <span className="font-semibold text-risk-high">node sent {h.state_capped_from} without a tilt reason: shown as WARNING</span>}
        <span>delivered {node.delivery?.delivered_pct ?? '—'}%{node.delivery?.late_recovered ? ` (${node.delivery.late_recovered} late)` : ''}</span>
      </div>
      <p className="text-[10px] text-granite mt-2">Thresholds shown are the firmware defaults from the bench workflow; the node decides its state with its flashed values.</p>
    </section>
  );
}

function NodeChip({ node, active, onClick }) {
  const r = node.reading || {};
  const lost = node.status === 'SENSOR_LOST';
  const online = node.status === 'ONLINE';
  const color = lost ? LOST_COLOR : online ? (STATE_STYLE[node.state]?.color || '#10b981') : '#94a3b8';
  return (
    <button onClick={onClick}
      className={`text-left rounded-md border-2 p-2.5 bg-snow transition-colors min-w-0 ${active ? 'ring-2 ring-river ring-offset-1' : 'hover:bg-glacier'}`}
      style={{ borderColor: color }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-condensed font-bold text-sm text-ink truncate">{node.node_id}</span>
        <span className="text-[10px] font-bold" style={{ color }}>{lost ? 'LOST' : online ? node.state : node.status}</span>
      </div>
      <div className="text-[10px] text-granite truncate">{node.segment_id}{KIND_LABEL[node.kind] ? ` · ${KIND_LABEL[node.kind]}` : ''}</div>
      <div className="text-[10px] text-granite mt-1 tabular-nums">
        {fmt(r.tilt_deg, 1)}° · {fmt(r.vib_g, 2)} g · {fmt(r.moisture_pct, 0)}% · {r.rain_wet ? 'wet' : 'dry'}
      </div>
    </button>
  );
}

export const Sensors = () => {
  const { fleet, incidents, error } = useNodeLive();

  const [segments, setSegments] = useState([]);
  const [route, setRoute] = useState(null);
  const [history, setHistory] = useState([]);
  const [placement, setPlacement] = useState(null);
  const [showSites, setShowSites] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [markLabel, setMarkLabel] = useState('event');
  const [toast, setToast] = useState(null);
  const [acking, setAcking] = useState(false);
  const [pickedId, setPickedId] = useState(null);
  const prevRef = useRef({});

  const nodes = useMemo(() => fleet?.nodes || [], [fleet]);
  // Follow the node that matters now (escalating, else online, else most recently heard from),
  // unless the official picked one
  const real = nodes.filter(n => !n.is_simulated).sort((a, b) => a.age_s - b.age_s);
  const auto = real.find(n => n.escalates) || real.find(n => n.status === 'ONLINE') || real[0] || null;
  const focus = nodes.find(n => n.node_id === pickedId) || auto;
  const segById = useMemo(() => Object.fromEntries(segments.map(s => [s.id, s])), [segments]);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  // Segment names and live levels for the map (includes the sensor escalation)
  useEffect(() => {
    let alive = true;
    const load = () => fetchRiskMap()
      .then(d => { if (alive) setSegments((d.segments || []).map(adaptSegment)); })
      .catch(() => {});
    load();
    const id = setInterval(load, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [fleet?.nodes?.map(n => `${n.node_id}:${n.state}:${n.status}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trip planner and sensor history for the focused node
  const focusId = focus?.node_id;
  const focusSeg = focus?.segment_id;
  useEffect(() => {
    if (!focusId) return;
    let alive = true;
    const n = parseInt(focusSeg.slice(4), 10);
    const from = `seg_${String(Math.max(1, n - 1)).padStart(2, '0')}`;
    const to = `seg_${String(Math.min(18, n + 1)).padStart(2, '0')}`;
    const today = new Date().toISOString().split('T')[0];
    const load = () => {
      fetchRouteRisk({ fromSegment: from, toSegment: to, date: today })
        .then(d => { if (alive) setRoute({ from, to, data: d }); }).catch(() => {});
      fetchNodeHistory(focusId, 5).then(d => { if (alive) setHistory(d.readings || []); }).catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [focusId, focusSeg]);

  useEffect(() => {
    if (showSites && !placement) fetchNodePlacement({ n: 10, minSpacingKm: 2 }).then(setPlacement).catch(() => {});
  }, [showSites, placement]);

  // Speak once when a node enters ALARM or goes SENSOR_LOST (never for simulated nodes)
  useEffect(() => {
    const prev = prevRef.current;
    const next = {};
    for (const n of nodes) {
      next[n.node_id] = `${n.state}|${n.status}`;
      if (!voiceOn || n.is_simulated || !(n.node_id in prev)) continue;
      const [pState, pStatus] = prev[n.node_id].split('|');
      const name = segById[n.segment_id]?.nameEn || n.segment_id;
      const prefix = n.kind === 'mock' ? 'Test data. ' : n.kind === 'replay' ? 'Replay. ' : '';
      if (n.status === 'ONLINE' && n.state === 'ALARM' && pState !== 'ALARM') {
        speak(`${prefix}Warning. The slope sensor on ${name} reports alarm. Avoid this stretch.`);
      } else if (n.status === 'SENSOR_LOST' && pStatus !== 'SENSOR_LOST') {
        speak(`${prefix}The sensor on ${name} went silent after an alert. Treat this stretch as dangerous until it is checked.`);
      }
    }
    prevRef.current = next;
  }, [nodes, voiceOn, segById]);

  const handleMark = useCallback(async () => {
    try {
      const m = await postNodeMark({ label: markLabel || 'event' });
      showToast(`Mark #${m.mark_id} stored on the laptop clock.`);
    } catch (e) {
      showToast(e.status === 401 ? 'Mark failed: admin key rejected (see the Admin page).' : 'Mark failed.');
    }
  }, [markLabel]);

  const handleAck = async nodeId => {
    if (!window.confirm(`Confirm the site of ${nodeId} has been checked and release its alert?`)) return;
    setAcking(true);
    try {
      await postNodeAck({ nodeId });
      showToast(`${nodeId} released: site checked.`);
    } catch (e) {
      showToast(e.status === 401 ? 'Release failed: admin key rejected (see the Admin page).' : 'Release failed.');
    } finally {
      setAcking(false);
    }
  };

  const enableVoice = () => {
    const on = !voiceOn;
    setVoiceOn(on);
    if (on) speak('Voice alerts are on.');
  };

  // Map: node dots at the middle of their segment, plus proposed sites
  const extraMarkers = useMemo(() => {
    const marks = [];
    nodes.forEach((n, i) => {
      const coords = segById[n.segment_id]?.coords;
      if (!coords?.length) return;
      const [lat, lng] = coords[Math.floor(coords.length / 2)];
      const color = n.status === 'SENSOR_LOST' ? LOST_COLOR
        : n.status === 'ONLINE' ? (STATE_STYLE[n.state]?.color || '#10b981') : '#64748b';
      marks.push({ id: `node-${n.node_id}`, lat: lat + i * 0.004, lng, color, radius: 10,
        label: `${n.node_id} · ${n.state} · ${n.status}${KIND_LABEL[n.kind] ? ` (${KIND_LABEL[n.kind]})` : ''}` });
    });
    if (showSites && placement?.sites) {
      placement.sites.forEach(s => marks.push({
        id: `site-${s.rank}`, lat: s.lat, lng: s.lon, color: '#334155', radius: 6, dashed: true,
        label: `Proposed site #${s.rank} · ${s.segment_name}${placement.is_mock ? ' (mock)' : ''}`,
      }));
    }
    return marks;
  }, [nodes, segById, showSites, placement]);

  const alerting = real.filter(n => n.escalates);
  const rec = route?.data?.recommendation;
  const action = rec?.action || (route?.data ? route.data.max_risk_level : null);
  const counts = {
    online: nodes.filter(n => n.status === 'ONLINE').length,
    alerting: alerting.length,
    lost: nodes.filter(n => n.status === 'SENSOR_LOST').length,
    offline: nodes.filter(n => n.status === 'OFFLINE' || n.status === 'STALE').length,
  };

  return (
    <div className="flex-1 w-full max-w-[1320px] mx-auto p-4 lg:p-6 pb-24">
      {toast && (
        <div className="fixed bottom-20 lg:bottom-8 left-1/2 -translate-x-1/2 bg-ink text-white px-5 py-3 rounded-md shadow-pop z-50 text-sm">{toast}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-condensed text-[24px] leading-[30px] md:text-[28px] md:leading-[34px] font-semibold text-ink flex items-center gap-2">
            <Activity className="w-6 h-6 md:w-7 md:h-7 text-river shrink-0" /> Slope sensors (Raah Node)
          </h1>
          <p className="text-granite text-sm mt-1">Tilt, vibration, soil moisture and rain from each node. Bench-calibrated prototype; sensor warnings are not official closures.</p>
        </div>
        {/* Phones: 3 controls in a grid; tablets and up: one row */}
        <div className="grid grid-cols-2 gap-2 w-full md:flex md:flex-wrap md:items-center md:w-auto">
          <button onClick={enableVoice}
            className={`flex items-center justify-center gap-1.5 h-10 px-3 rounded-md border text-sm font-medium col-span-2 md:col-span-1 ${voiceOn ? 'bg-river text-white border-river' : 'bg-snow text-ink border-mist hover:bg-glacier'}`}>
            {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {voiceOn ? 'Voice on' : 'Enable voice'}
          </button>
          <input value={markLabel} onChange={e => setMarkLabel(e.target.value)}
            className="h-10 w-full md:w-32 min-w-0 px-3 rounded-md border border-mist bg-white text-sm" aria-label="Mark label" />
          <button onClick={handleMark}
            className="flex items-center justify-center gap-1.5 h-10 px-4 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-semibold whitespace-nowrap"
            title="Press at the instant of the physical event">
            <Flag className="w-4 h-4" /> Mark event now
          </button>
        </div>
      </div>

      {error && !fleet && (
        <div className="mb-4 p-3 rounded-md bg-tint-severe text-risk-severe text-sm">Backend not reachable: {error}</div>
      )}

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Online', value: counts.online, color: '#10b981' },
          { label: 'Alerting', value: counts.alerting, color: '#dc2626' },
          { label: 'Sensor lost', value: counts.lost, color: LOST_COLOR },
          { label: 'Stale / offline', value: counts.offline, color: '#64748b' },
        ].map(c => (
          <div key={c.label} className="bg-snow border border-mist rounded-md px-4 py-3 shadow-sm">
            <div className="text-[11px] uppercase tracking-wide font-semibold text-granite">{c.label}</div>
            <div className="font-condensed font-bold text-3xl tabular-nums" style={{ color: c.value ? c.color : '#94a3b8' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {alerting.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerting.map(n => {
            const lost = n.status === 'SENSOR_LOST';
            return (
              <button key={n.node_id} onClick={() => setPickedId(n.node_id)}
                className="w-full text-left rounded-md p-4 text-white shadow-pop flex items-start gap-3"
                style={{ background: lost ? LOST_COLOR : (n.state === 'ALARM' ? '#9B1C31' : '#C4470F') }}>
                <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                <div>
                  <div className="font-condensed font-bold text-xl">
                    {lost ? 'SENSOR LOST' : n.state} · {segById[n.segment_id]?.nameEn || n.segment_id}
                    {KIND_LABEL[n.kind] && <span className="ml-2 text-xs font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 align-middle">{KIND_LABEL[n.kind]}</span>}
                  </div>
                  <div className="text-sm opacity-95">{segById[n.segment_id]?.nodeEscalation?.reason || segById[n.segment_id]?.driver}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* minmax(0, …) + min-w-0 let columns shrink below their content (the incident table) on small screens */}
      <div className="grid gap-5 grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-5 min-w-0">
          {!fleet ? (
            <div className="flex items-center gap-2 text-granite text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : nodes.length === 0 ? (
            <div className="bg-snow border border-mist rounded-md p-4 text-sm text-granite">
              No node has reported yet. Start the ESP32, or for test data run the "Raah: mock node" task (tools\mock_node.py).
            </div>
          ) : (
            <>
              <section>
                <h2 className="font-condensed text-lg font-semibold text-ink mb-2">Nodes <span className="text-sm font-normal text-granite">(select one to inspect)</span></h2>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {nodes.map(n => (
                    <NodeChip key={n.node_id} node={n} active={focus?.node_id === n.node_id} onClick={() => setPickedId(n.node_id)} />
                  ))}
                </div>
              </section>
              {focus && (
                <SensorReadout key={focus.node_id} node={focus} history={history} segName={segById[focus.segment_id]?.nameEn} onAck={handleAck} acking={acking} />
              )}
            </>
          )}

          <section className="bg-snow border border-mist rounded-md p-4 shadow-sm">
            <h2 className="font-condensed text-lg font-semibold text-ink">Incidents</h2>
            <p className="text-xs text-granite mb-3">All times on the laptop clock (one clock, no node clock).</p>

            {/* Phones: one card per incident instead of an 8-column table */}
            <div className="md:hidden space-y-2">
              {incidents.length === 0 && <p className="text-sm text-granite">No incidents yet.</p>}
              {incidents.map(i => (
                <div key={i.id} className="border border-mist rounded-md p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      #{i.id} {i.node_id}
                      {i.label && <span className="ml-1 text-[10px] font-bold px-1 rounded bg-amber-200 text-amber-900">{i.label}</span>}
                    </span>
                    <span className="font-semibold" style={{ color: STATE_STYLE[i.peak_state]?.color }}>{i.peak_state}</span>
                  </div>
                  <div className="text-xs text-granite">
                    {i.segment_id} · {i.open ? (i.node_status === 'SENSOR_LOST' ? 'sensor lost' : 'open') : i.close_reason}
                    {i.mark_label ? ` · ${i.mark_label}` : ''}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-granite">
                    <div>Mark → server<div className="text-ink font-semibold text-sm tabular-nums">{fmtSec(i.mark_to_server_ms)}</div></div>
                    <div>Mark → ALARM<div className="text-ink font-semibold text-sm tabular-nums">{fmtSec(i.mark_to_alarm_ms)}</div></div>
                    <div>ALARM → alert<div className="text-ink font-semibold text-sm tabular-nums">{fmtSec(i.alarm_to_alert_ms)}</div></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-granite border-b border-mist">
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">Node</th>
                    <th className="py-2 pr-3 font-semibold">Peak</th>
                    <th className="py-2 pr-3 font-semibold">Mark</th>
                    <th className="py-2 pr-3 font-semibold">Mark → server</th>
                    <th className="py-2 pr-3 font-semibold">Mark → ALARM</th>
                    <th className="py-2 pr-3 font-semibold">ALARM → alert</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.length === 0 && (
                    <tr><td colSpan="8" className="py-3 text-granite">No incidents yet.</td></tr>
                  )}
                  {incidents.map(i => (
                    <tr key={i.id} className="border-b border-mist">
                      <td className="py-2 pr-3 tabular-nums">{i.id}</td>
                      <td className="py-2 pr-3">
                        {i.node_id} <span className="text-granite">{i.segment_id}</span>
                        {i.label && <span className="ml-1 text-[10px] font-bold px-1 rounded bg-amber-200 text-amber-900">{i.label}</span>}
                      </td>
                      <td className="py-2 pr-3 font-semibold" style={{ color: STATE_STYLE[i.peak_state]?.color }}>{i.peak_state}</td>
                      <td className="py-2 pr-3 text-granite">{i.mark_label || '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{fmtSec(i.mark_to_server_ms)}</td>
                      <td className="py-2 pr-3 tabular-nums">{fmtSec(i.mark_to_alarm_ms)}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {fmtSec(i.alarm_to_alert_ms)} {i.alert_channel && <span className="text-[11px] text-granite">{i.alert_channel}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {i.open ? (i.node_status === 'SENSOR_LOST' ? 'sensor lost' : 'open') : i.close_reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-5 min-w-0">
          <section className="bg-snow border border-mist rounded-md shadow-sm overflow-hidden">
            <div className="h-[280px] md:h-[340px]">
              <InteractiveMap segments={segments} selectedSegment={focus ? segById[focus.segment_id] : null}
                onSelectSegment={() => {}} extraMarkers={extraMarkers} />
            </div>
            <label className="flex items-center gap-2 px-4 py-2 text-xs text-granite border-t border-mist cursor-pointer">
              <input type="checkbox" checked={showSites} onChange={e => setShowSites(e.target.checked)} />
              <MapPin className="w-3.5 h-3.5" /> Show proposed node sites (terrain model)
              {showSites && placement?.is_mock && <span className="font-bold text-amber-700">mock</span>}
            </label>
          </section>

          <section className="bg-snow border border-mist rounded-md p-4 shadow-sm">
            <h2 className="font-condensed text-lg font-semibold text-ink flex items-center gap-2">
              <Radio className="w-4 h-4 text-river" /> Trip planner for the node's stretch
            </h2>
            {!focus ? (
              <p className="text-sm text-granite mt-2">—</p>
            ) : !route ? (
              <p className="text-sm text-granite mt-2"><Loader2 className="w-4 h-4 animate-spin inline" /></p>
            ) : (
              <>
                <div className="font-condensed font-black text-2xl md:text-3xl mt-2 break-words" style={{ color: ACTION_COLOR[rec?.action] || '#2E7D57' }}>
                  {route.from} → {route.to}: {action}
                </div>
                <p className="text-sm text-granite mt-1">{rec?.reason || route.data.advisory}</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
