import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  Plus, Minus, Navigation, Layers, RefreshCw, AlertTriangle,
  ChevronRight, Volume2, Bell, ShieldAlert, CloudRain,
  Clock, CheckCircle, Info, ExternalLink, Mountain, Activity, MapPin,
  RotateCcw, Sliders, Play
} from 'lucide-react';
import { fetchRiskMap, fetchClosures, postAlertAll } from '../api/client';
import { adaptSegment, getLevelMeta } from '../api/adapters';
import { RiskIcon, RiskBadge } from '../components/RiskIcon';
import { ListenButton } from '../components/ListenButton';
import { InteractiveMap, MAP_LAYERS } from '../components/InteractiveMap';
import { SEGMENTS } from '../data/segments';

// Right sidebar segment detail matching reference design
function SegmentDetailPanel({ segment, onClose }) {
  const [alertState, setAlertState] = useState({ sending: false, result: null, error: null });
  if (!segment) return null;
  const meta = getLevelMeta(segment.level);

  // "Alert All": official broadcast to every consenting subscriber of this stretch (and of the whole corridor)
  const handleAlertAll = async () => {
    const name = segment.nameEn || segment.name;
    if (!window.confirm(`Send an official alert for ${name} to every subscriber of this stretch?`)) return;
    setAlertState({ sending: true, result: null, error: null });
    try {
      const res = await postAlertAll({ segmentId: segment.id });
      setAlertState({ sending: false, result: res, error: null });
    } catch (e) {
      setAlertState({
        sending: false, result: null,
        error: e.status === 401 ? 'Admin key rejected: check VITE_ADMIN_API_KEY (Frontend/.env) or the key on the Admin page.' : 'Could not send the alert.',
      });
    }
  };

  // Derive risk badge label and color
  let riskBadgeText = "LOW RISK";
  let riskBadgeBg = "bg-emerald-100 text-emerald-800 border-emerald-200";
  let verdictColor = "text-emerald-700";
  let verdictText = "Good to go";

  if (segment.level === 'closed') {
    riskBadgeText = "ROAD CLOSED";
    riskBadgeBg = "bg-slate-800 text-white border-slate-900";
    verdictColor = "text-slate-900";
    verdictText = "Road is closed";
  } else if (segment.level === 3) {
    riskBadgeText = "SEVERE RISK";
    riskBadgeBg = "bg-rose-100 text-rose-800 border-rose-200";
    verdictColor = "text-rose-700";
    verdictText = "Not advised";
  } else if (segment.level === 2) {
    riskBadgeText = "HIGH RISK";
    riskBadgeBg = "bg-orange-100 text-orange-800 border-orange-200";
    verdictColor = "text-orange-700";
    verdictText = "Delay if you can";
  } else if (segment.level === 1) {
    riskBadgeText = "MODERATE RISK";
    riskBadgeBg = "bg-amber-100 text-amber-800 border-amber-200";
    verdictColor = "text-amber-700";
    verdictText = "Go with care";
  }

  // Accurate values from backend data
  const rainVal = segment.r3d ?? segment.rain24h ?? 0;
  const rainPct = Math.min(Math.round((rainVal / 50) * 100), 100);
  const terrainPct = Math.min(Math.round((segment.terrainScore ?? 0.5) * 100), 100);
  const reportsPct = Math.min(Math.round(((segment.reports24h ?? 0) / 5) * 100), 100);

  // Rainfall stats
  const last24h = (segment.rain24h ?? (rainVal * 0.4)).toFixed(1);
  const next24h = (segment.forecast24h ?? (rainVal * 0.6)).toFixed(1);
  const next72h = (segment.forecast72h ?? (rainVal * 1.2)).toFixed(1);

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5 bg-white font-sans text-gray-800 text-sm">
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors"
      >
        <ChevronRight className="w-4 h-4 rotate-180" /> All stretches
      </button>

      {/* Stretch title & Risk pill */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900 leading-snug">
            {segment.nameEn || segment.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            NH-7, km {segment.kmStart != null ? segment.kmStart.toFixed(0) : '—'} to {segment.kmEnd != null ? segment.kmEnd.toFixed(0) : '—'}
          </p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide uppercase shrink-0 ${riskBadgeBg}`}>
          {riskBadgeText}
        </span>
      </div>

      {/* Big Verdict and Listen button */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-6 h-6 ${verdictColor}`} />
          <span className={`text-2xl font-bold tracking-tight ${verdictColor}`}>
            {verdictText}
          </span>
        </div>

        <ListenButton segmentId={segment.id} />
      </div>

      {/* Why this stretch is risky */}
      <div className="pt-2 border-t border-gray-100 space-y-3.5">
        <h3 className="font-bold text-sm text-gray-900">Why this stretch is risky</h3>

        {/* Progress bar 1: Heavy rainfall */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Heavy rainfall in last 3 days</span>
            <span className="font-semibold text-gray-800">{rainPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-orange-400 to-orange-600"
              style={{ width: `${rainPct}%` }}
            />
          </div>
        </div>

        {/* Progress bar 2: Steep terrain */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Steep, unstable terrain</span>
            <span className="font-semibold text-gray-800">{terrainPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-amber-400 to-amber-600"
              style={{ width: `${terrainPct}%` }}
            />
          </div>
        </div>

        {/* Progress bar 3: Reports */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Reports from drivers ({segment.reports24h || 0} in 24 h)</span>
            <span className="font-semibold text-gray-800">{reportsPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 bg-slate-400"
              style={{ width: `${reportsPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Rainfall (mm) card */}
      <div className="pt-2 border-t border-gray-100 space-y-2">
        <h3 className="font-bold text-sm text-gray-900">Rainfall (mm)</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <div className="text-[11px] text-gray-500 mb-1">Last 24 h</div>
            <div className="text-lg font-black text-gray-900">{last24h}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <div className="text-[11px] text-gray-500 mb-1">Next 24 h</div>
            <div className="text-lg font-black text-gray-900">{next24h}</div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <div className="text-[11px] text-gray-500 mb-1">Next 72 h</div>
            <div className="text-lg font-black text-gray-900">{next72h}</div>
          </div>
        </div>
      </div>

      {/* Driver and Terrain summary chips */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-xs">
        <div className="flex items-center gap-2">
          <CloudRain className="w-4 h-4 text-amber-500 shrink-0" />
          <div>
            <div className="text-[10px] text-gray-400">Main driver</div>
            <div className="font-semibold text-gray-800 truncate">{segment.driver ? 'Heavy rain' : 'Monsoon'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Mountain className="w-4 h-4 text-slate-600 shrink-0" />
          <div>
            <div className="text-[10px] text-gray-400">Terrain</div>
            <div className="font-semibold text-gray-800 truncate">Unstable slope</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
          <div>
            <div className="text-[10px] text-gray-400">Risk score</div>
            <div className="font-bold text-gray-900">{Math.round((segment.score || 0.63) * 100)} / 100</div>
          </div>
        </div>
      </div>

      {/* Last updated timestamp */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t border-gray-100">
        <Clock className="w-3.5 h-3.5" />
        <span>Last updated: {segment.updatedAt ? new Date(segment.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : 'Live'}</span>
      </div>

      {/* Alert All (official broadcast) & Report a problem */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <button
          onClick={handleAlertAll}
          disabled={alertState.sending}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 font-semibold text-xs transition-colors shadow-sm disabled:opacity-60"
        >
          <Bell className="w-3.5 h-3.5" /> {alertState.sending ? 'Sending…' : 'Alert All'}
        </button>
        <Link
          to="/report"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shadow-sm"
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Report a problem
        </Link>
      </div>
      {alertState.result && (
        <div className="text-xs rounded-lg p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800">
          Alert sent to {alertState.result.sent} of {alertState.result.recipients} subscriber{alertState.result.recipients === 1 ? '' : 's'}
          {Object.keys(alertState.result.channels || {}).length > 0 && ` (${Object.entries(alertState.result.channels).map(([c, n]) => `${c} ${n}`).join(', ')})`}.
          {alertState.result.dry_run && ' Test mode (DRY_RUN): messages were logged, not delivered.'}
          {alertState.result.recipients === 0 && ' Nobody is subscribed to this stretch yet.'}
        </div>
      )}
      {alertState.error && (
        <div className="text-xs rounded-lg p-2.5 bg-rose-50 border border-rose-200 text-rose-800">{alertState.error}</div>
      )}
    </div>
  );
}

export const LiveMap = () => {
  const ctx = useOutletContext() || {};
  const demo = ctx.demo || {};

  const [segments, setSegments] = useState([]);
  const [closures, setClosures] = useState([]);
  const [riskMeta, setRiskMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [error, setError] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const mapRef = useRef(null);

  const loadData = useCallback(async (refreshWeather = false) => {
    try {
      setLoading(true);
      setError(null);
      const [riskData, closureData] = await Promise.all([
        fetchRiskMap({
          simulateRainMm: demo.simulateRainMm,
          asOf: demo.asOf,
          refreshWeather: refreshWeather,
        }),
        fetchClosures({ activeOnly: true }),
      ]);

      const adapted = (riskData.segments || []).map(adaptSegment);
      const merged = adapted.map(seg => {
        const staticSeg = SEGMENTS.find(s => s.id === seg.id);
        return staticSeg ? { ...staticSeg, ...seg } : seg;
      });
      merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));

      setSegments(merged);
      setClosures(Array.isArray(closureData) ? closureData : (closureData?.closures || []));
      setRiskMeta({
        weatherSource: riskData.weather_source,
        asOf: riskData.as_of,
        isSimulated: riskData.is_simulated,
        highCount: riskData.high_or_very_high_risk_count,
        updatedAt: adapted[0]?.updatedAt,
      });

      // Default select Shivpuri to Byasi (seg_02) or keep current selected updated
      setSelectedSegment(prev => {
        if (!prev) return merged.find(s => s.id === 'seg_02') || merged[1] || merged[0] || null;
        return merged.find(s => s.id === prev.id) || prev;
      });
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Failed to load risk data:', e);
      setError('Could not load risk data from backend. Please ensure backend server is active.');
    } finally {
      setLoading(false);
    }
  }, [demo.simulateRainMm, demo.asOf]);

  const handleLiveFetch = async () => {
    try {
      setIsFetchingLive(true);
      if (demo.simulateRainMm != null) {
        ctx.deactivate?.();
      }
      await loadData(true);
      setToastMsg('Live weather updated from Open-Meteo API (Source: LIVE)');
      setTimeout(() => setToastMsg(null), 4000);
    } catch (e) {
      setToastMsg('Failed to refresh live weather. Check backend connection.');
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsFetchingLive(false);
    }
  };

  const handleResetSim = async () => {
    ctx.deactivate?.();
    setIsFetchingLive(true);
    try {
      await loadData(true);
      setToastMsg('Rainfall simulation cleared. Restored live Open-Meteo meteorology.');
      setTimeout(() => setToastMsg(null), 4000);
    } catch (e) {
      setToastMsg('Reset complete.');
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsFetchingLive(false);
    }
  };

  const [tileMode, setTileMode] = useState('terrain');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  const handleToggleLayer = () => {
    const modes = ['terrain', 'carto', 'satellite'];
    const nextIdx = (modes.indexOf(tileMode) + 1) % modes.length;
    const nextMode = modes[nextIdx];
    setTileMode(nextMode);
    const labels = {
      terrain: '🏔️ Mountain Terrain (Topographic)',
      carto: '🗺️ Clean Streets (Roads & Towns)',
      satellite: '🛰️ Satellite Imagery (Himalayas)',
    };
    setToastMsg(`Map Style: ${labels[nextMode]}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSelectTileMode = (mode) => {
    setTileMode(mode);
    setShowLayerMenu(false);
    const labels = {
      terrain: '🏔️ Mountain Terrain (Topographic)',
      carto: '🗺️ Clean Streets (Roads & Towns)',
      satellite: '🛰️ Satellite Imagery (Himalayas)',
    };
    setToastMsg(`Map Style: ${labels[mode]}`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Derived counts
  const highOrSevereCount = segments.filter(s => s.level === 2 || s.level === 3).length;
  const closedCount = segments.filter(s => s.level === 'closed').length;

  // Stretches needing attention today (sorted by highest risk)
  const attentionStretches = segments
    .filter(s => s.level === 'closed' || s.level === 3 || s.level === 2 || s.level === 1)
    .sort((a, b) => {
      const order = { closed: 0, 3: 1, 2: 2, 1: 3 };
      return (order[a.level] ?? 4) - (order[b.level] ?? 4);
    })
    .slice(0, 3);

  const displayAttentionCards = attentionStretches.length > 0
    ? attentionStretches
    : segments.slice(0, 3);

  return (
    <div className="flex-1 w-full flex flex-col bg-slate-100 min-h-[calc(100dvh-60px)]">
      {/* Error banner if backend has connection issues */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between text-xs text-rose-800 font-sans z-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Upper main view: Map with floating controls, status pills, and right detail panel */}
      <div className="flex-1 flex flex-col lg:flex-row relative min-h-[540px] xl:min-h-[580px]">

        {/* ── MAP AREA ── */}
        {/* Below lg the map stacks above the details panel; without a min height the panel took all the
            space and the map collapsed to 0 px on phones and tablets */}
        <div className="flex-1 relative overflow-hidden bg-slate-200 min-h-[60vh] lg:min-h-0">
          <div className="absolute inset-0 w-full h-full">
            <InteractiveMap
              ref={mapRef}
              segments={segments}
              selectedSegment={selectedSegment}
              onSelectSegment={setSelectedSegment}
              tileMode={tileMode}
              onTileModeChange={setTileMode}
            />
          </div>

          {/* Floating Live Corridor Status Pill in top-left of map */}
          <div className="absolute top-4 left-16 z-[400] flex flex-wrap items-center gap-2.5 bg-[#0c1821]/95 backdrop-blur-md text-white px-3.5 py-2 rounded-full shadow-2xl border border-white/10 text-xs font-sans max-w-[calc(100vw-80px)] sm:max-w-none">
            {demo.simulateRainMm != null ? (
              <div className="flex items-center gap-1.5 font-bold tracking-wider text-amber-300 bg-amber-950/80 border border-amber-500/50 px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.3)]">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                SIMULATED ({demo.simulateRainMm} mm)
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-bold tracking-wider text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                LIVE
              </div>
            )}

            <span className="text-gray-300 font-semibold hidden md:inline">NH-7 (247 km)</span>
            <span className="text-gray-500 hidden md:inline">|</span>
            <span className="text-gray-300 hidden sm:inline">Segments: <strong className="text-white">{segments.length || 18}</strong></span>
            <span className="text-gray-500 hidden sm:inline">|</span>
            <span className="text-orange-400">High/Severe: <strong className="text-white">{highOrSevereCount}</strong></span>
            <span className="text-gray-500">|</span>
            
            <span className="text-gray-300 flex items-center gap-1">
              Weather:{' '}
              <strong className={
                demo.simulateRainMm != null
                  ? 'text-amber-400 font-bold'
                  : riskMeta?.weatherSource === 'live'
                  ? 'text-emerald-400 font-bold'
                  : 'text-sky-300 font-bold'
              }>
                {demo.simulateRainMm != null ? 'SIMULATED' : (riskMeta?.weatherSource ? riskMeta.weatherSource.toUpperCase() : 'LIVE')}
              </strong>
            </span>

            <span className="text-gray-500 hidden sm:inline">|</span>
            <span className="flex items-center gap-1 text-sky-300 hidden sm:inline-flex">
              <CloudRain className="w-3.5 h-3.5" /> 12°C
            </span>

            {/* Live Fetch & Simulate interactive buttons */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-white/20">
              <button
                onClick={handleLiveFetch}
                disabled={isFetchingLive}
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 hover:text-white border border-emerald-500/40 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                title="Bypass cache and force live weather fetch from Open-Meteo API"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingLive ? 'animate-spin text-emerald-400' : ''}`} />
                <span>{isFetchingLive ? 'Fetching...' : 'Live Fetch'}</span>
              </button>

              <button
                onClick={() => ctx.openSimModal?.()}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-sm cursor-pointer ${
                  demo.simulateRainMm != null
                    ? 'bg-amber-500/30 hover:bg-amber-500/40 border-amber-400 text-amber-200'
                    : 'bg-sky-950/80 hover:bg-sky-800 border-sky-500/40 text-sky-300 hover:text-white'
                }`}
                title="Open Rainfall Simulation Studio"
              >
                <CloudRain className="w-3 h-3 text-sky-400" />
                <span>Simulate</span>
              </button>

              {demo.simulateRainMm != null && (
                <button
                  onClick={handleResetSim}
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-rose-950/80 hover:bg-rose-900 border border-rose-500/50 text-rose-300 hover:text-white transition-all cursor-pointer"
                  title="Reset simulation to live weather"
                >
                  <RotateCcw className="w-3 h-3 text-rose-400" />
                  <span className="hidden lg:inline">Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Floating Map Controls on Top-Left */}
          <div className="absolute top-4 left-4 z-[400] flex flex-col gap-2">
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col overflow-hidden">
              <button
                onClick={() => mapRef.current?.zoomIn()}
                className="p-2 text-slate-700 hover:bg-slate-100 transition-colors border-b border-slate-100"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <Plus className="w-4 h-4 font-bold" />
              </button>
              <button
                onClick={() => mapRef.current?.zoomOut()}
                className="p-2 text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="w-4 h-4 font-bold" />
              </button>
            </div>
            <button
              onClick={() => mapRef.current?.resetRoute()}
              className="p-2 bg-white rounded-lg shadow-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Reset route view"
              title="Fit whole NH-7 corridor"
            >
              <Navigation className="w-4 h-4" />
            </button>
            {/* Map Styles Selector Button with Dropdown & Click-Cycle */}
            <div className="relative">
              <button
                onClick={handleToggleLayer}
                onContextMenu={(e) => { e.preventDefault(); setShowLayerMenu(m => !m); }}
                className={`p-2 rounded-lg shadow-lg border transition-all flex items-center justify-center ${
                  showLayerMenu || tileMode !== 'terrain'
                    ? 'bg-sky-50 text-sky-600 border-sky-400 ring-2 ring-sky-200'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
                aria-label="Toggle map view"
                title={`Map Style: ${MAP_LAYERS[tileMode]?.label || 'Map'} (Click to cycle, right-click/arrow to choose)`}
              >
                <Layers className="w-4 h-4" />
              </button>

              {/* Little dropdown trigger badge */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowLayerMenu(m => !m); }}
                className="absolute -right-1.5 -top-1 w-4 h-4 rounded-full bg-slate-800 text-[9px] text-white flex items-center justify-center hover:bg-black transition-colors shadow"
                title="Select map style"
              >
                ▾
              </button>

              {/* Interactive Layer Selection Flyout */}
              {showLayerMenu && (
                <div className="absolute left-12 top-0 z-[600] bg-[#0c1821]/95 text-white backdrop-blur-md rounded-xl p-2 shadow-2xl border border-white/15 w-48 space-y-1 font-sans text-xs animate-fadeIn">
                  <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 tracking-wider border-b border-white/10 flex items-center justify-between">
                    <span>Map Styles</span>
                    <button
                      onClick={() => setShowLayerMenu(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  {Object.values(MAP_LAYERS).map(layer => (
                    <button
                      key={layer.id}
                      onClick={() => handleSelectTileMode(layer.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        tileMode === layer.id
                          ? 'bg-sky-500/25 text-sky-300 font-bold border border-sky-400/40'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{layer.icon}</span>
                        <span>{layer.label}</span>
                      </span>
                      {tileMode === layer.id && <CheckCircle className="w-3.5 h-3.5 text-sky-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Quick Map Controls for Live Fetch & Simulation */}
            <div className="bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col overflow-hidden">
              <button
                onClick={handleLiveFetch}
                disabled={isFetchingLive}
                className="p-2 text-emerald-700 hover:bg-emerald-50 transition-colors border-b border-slate-100"
                aria-label="Live Fetch Weather"
                title="Live Fetch: Force fresh Open-Meteo weather"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingLive ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => ctx.openSimModal?.()}
                className={`p-2 transition-colors ${
                  demo.simulateRainMm != null ? 'bg-amber-100 text-amber-700' : 'text-sky-700 hover:bg-sky-50'
                }`}
                aria-label="Rainfall Simulation Studio"
                title="Simulate Rain: Stress-test highway under storm conditions"
              >
                <CloudRain className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Floating Road Risk Level Legend in bottom-left of map */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm rounded-xl p-3 shadow-lg border border-slate-200 text-xs font-sans">
            <div className="font-bold text-gray-800 text-[11px] mb-2 uppercase tracking-wide">Road Risk Level</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#10b981]"></span>
                <span className="text-gray-700 text-xs font-medium">Low</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#eab308]"></span>
                <span className="text-gray-700 text-xs font-medium">Moderate</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#f97316]"></span>
                <span className="text-gray-700 text-xs font-medium">High</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#ef4444]"></span>
                <span className="text-gray-700 text-xs font-medium">Severe</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#0f172a]"></span>
                <span className="text-gray-700 text-xs font-medium">Closed</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT DETAIL SIDEBAR (Desktop) ── */}
        <div className="w-full lg:w-[380px] xl:w-[410px] bg-white border-l border-slate-200 shrink-0 shadow-lg z-10 flex flex-col">
          {selectedSegment ? (
            <SegmentDetailPanel
              key={selectedSegment.id}
              segment={selectedSegment}
              onClose={() => setSelectedSegment(null)}
            />
          ) : (
            <div className="p-6 text-center text-gray-500">
              <p>Select any stretch on the map to see real-time rainfall, terrain scores, and advisories.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM SECTION: "Stretches needing attention today" ── */}
      <div className="bg-white border-t border-slate-200 p-4 md:px-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h2 className="font-bold text-gray-900 text-base">Stretches needing attention today</h2>
              <span className="bg-rose-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {attentionStretches.length}
              </span>
            </div>
            <button
              onClick={() => mapRef.current?.resetRoute()}
              className="text-xs font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1"
            >
              View all stretches <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Cards carousel dynamically driven by real backend segments */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {displayAttentionCards.map(seg => {
              const meta = getLevelMeta(seg.level);
              const isSelected = selectedSegment?.id === seg.id;
              let badgeColor = "bg-emerald-500 text-white";
              let badgeText = "LOW";
              let strokeColor = "#10b981";

              if (seg.level === 'closed') {
                badgeColor = "bg-slate-800 text-white";
                badgeText = "CLOSED";
                strokeColor = "#0f172a";
              } else if (seg.level === 3) {
                badgeColor = "bg-rose-600 text-white";
                badgeText = "SEVERE";
                strokeColor = "#ef4444";
              } else if (seg.level === 2) {
                badgeColor = "bg-orange-500 text-white";
                badgeText = "HIGH";
                strokeColor = "#f97316";
              } else if (seg.level === 1) {
                badgeColor = "bg-amber-400 text-slate-900";
                badgeText = "MODERATE";
                strokeColor = "#eab308";
              }

              return (
                <div
                  key={seg.id}
                  onClick={() => {
                    setSelectedSegment(seg);
                    mapRef.current?.flyToSegment(seg);
                  }}
                  className={`bg-slate-50 hover:bg-slate-100 border rounded-xl p-3.5 cursor-pointer transition-all shadow-sm flex items-center justify-between ${
                    isSelected ? 'ring-2 ring-sky-500 border-sky-400 bg-sky-50/50' : 'border-slate-200'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`${badgeColor} font-black text-[10px] px-2 py-0.5 rounded shrink-0`}>
                        {badgeText}
                      </span>
                      <span className="font-bold text-sm text-gray-900 truncate">
                        {seg.nameEn || seg.name}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      km {(seg.kmStart || 0).toFixed(0)} – {(seg.kmEnd || 0).toFixed(0)}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-600">
                      <span className="flex items-center gap-1 truncate">
                        <CloudRain className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        {seg.rain24h ? `${seg.rain24h.toFixed(1)} mm rain` : 'Rain monitored'}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <Mountain className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        {seg.driver || 'Terrain slope'}
                      </span>
                    </div>
                  </div>
                  <svg width="60" height="30" viewBox="0 0 60 30" fill="none" className="shrink-0">
                    <path
                      d="M2 28 C 15 25, 25 15, 38 12 C 48 10, 52 4, 58 2"
                      stroke={strokeColor}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={seg.level === 'closed' ? "4 4" : undefined}
                    />
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── BOTTOM STATS BAR ── */}
      <footer className="bg-slate-50 border-t border-slate-200 px-4 md:px-6 py-3 shrink-0">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs font-sans text-gray-700">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Navigation className="w-4 h-4 text-gray-500" />
              <div>
                <div className="font-black text-gray-900">247 km</div>
                <div className="text-[10px] text-gray-400">Total corridor</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <div>
                <div className="font-black text-gray-900">18</div>
                <div className="text-[10px] text-gray-400">Total segments</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold">!</span>
              <div>
                <div className="font-black text-gray-900">{highOrSevereCount}</div>
                <div className="text-[10px] text-gray-400">High/Severe</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-800" />
              <div>
                <div className="font-black text-gray-900">{closedCount}</div>
                <div className="text-[10px] text-gray-400">Closed</div>
              </div>
            </div>

            <button
              onClick={handleLiveFetch}
              disabled={isFetchingLive}
              className="flex items-center gap-2 hover:bg-slate-200/60 p-1 rounded-lg transition-colors cursor-pointer text-left"
              title="Click to force live Open-Meteo refresh"
            >
              <CloudRain className={`w-4 h-4 ${demo.simulateRainMm != null ? 'text-amber-500' : 'text-sky-500'}`} />
              <div>
                <div className="font-black text-gray-900 flex items-center gap-1">
                  <span>{demo.simulateRainMm != null ? `SIM (${demo.simulateRainMm}mm)` : (riskMeta?.weatherSource ? riskMeta.weatherSource.toUpperCase() : 'LIVE')}</span>
                  <RefreshCw className={`w-2.5 h-2.5 text-gray-400 ${isFetchingLive ? 'animate-spin text-emerald-500' : ''}`} />
                </div>
                <div className="text-[10px] text-gray-400">Weather feed (Click to refresh)</div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <div>
                <div className="font-black text-gray-900">
                  {lastUpdated ? lastUpdated.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                </div>
                <div className="text-[10px] text-gray-400">Last updated</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-1.5 rounded-xl">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <div className="font-bold text-xs">Drive Safe</div>
              <div className="text-[10px] text-emerald-700">Check latest updates before you travel.</div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Action Feedback Toast */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[1100] bg-[#0c1821]/95 text-white border border-sky-500/40 px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-2.5 text-xs font-medium backdrop-blur-md animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
