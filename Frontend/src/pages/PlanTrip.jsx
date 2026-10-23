import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  MapPin, Calendar, Clock, ArrowRightLeft, Search, Shield,
  CloudRain, Navigation, CheckCircle, AlertTriangle, ChevronRight,
  TrendingUp, Activity, Check, Share2, Loader2, Sparkles, X,
  Plus, Minus, RotateCcw, Layers, RefreshCw
} from 'lucide-react';
import { fetchRouteRisk, fetchRiskMap } from '../api/client';
import { scoreToLevel, levelFromText, getLevelMeta, adaptSegment, parseCoords } from '../api/adapters';
import { RiskIcon, RiskBadge } from '../components/RiskIcon';
import { InteractiveMap, MAP_LAYERS } from '../components/InteractiveMap';
import { SEGMENTS, TOWNS, townToFromSegment, townToToSegment } from '../data/segments';

// Resolve from town to segment ID (handles north-to-south reverse journey)
function resolveFromSegment(townName) {
  if (townName?.toLowerCase() === 'joshimath') return 'seg_18';
  const segId = townToFromSegment(townName);
  if (segId) return segId;
  const town = TOWNS.find(t => t.name.toLowerCase() === townName.toLowerCase());
  if (town?.segmentId) return town.segmentId;
  return 'seg_01';
}

// Resolve to town to segment ID (handles south-to-north reverse destination)
function resolveToSegment(townName) {
  if (townName?.toLowerCase() === 'rishikesh') return 'seg_01';
  const segId = townToToSegment(townName);
  if (segId) return segId;
  const town = TOWNS.find(t => t.name.toLowerCase() === townName.toLowerCase());
  if (town) {
    const seg = SEGMENTS.find(s => Math.abs(s.kmEnd - town.km) < 0.1);
    if (seg) return seg.id;
  }
  return 'seg_18';
}

const POPULAR_ROUTES = [
  { from: 'Rishikesh', to: 'Joshimath', label: 'Rishikesh → Joshimath' },
  { from: 'Rishikesh', to: 'Srinagar', label: 'Rishikesh → Srinagar' },
  { from: 'Srinagar', to: 'Joshimath', label: 'Srinagar → Joshimath' },
  { from: 'Rishikesh', to: 'Devprayag', label: 'Rishikesh → Devprayag' },
  { from: 'Joshimath', to: 'Rishikesh', label: 'Joshimath → Rishikesh (Return)' },
];

export const PlanTrip = () => {
  const ctx = useOutletContext() || {};
  const demo = ctx.demo || {};

  const [fromTown, setFromTown] = useState('Rishikesh');
  const [toTown, setToTown] = useState('Joshimath');
  const [travelDate, setTravelDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [departureTime, setDepartureTime] = useState('08:00');
  const [activeTab, setActiveTab] = useState('recommended'); // 'recommended' | 'alternative'

  const [allSegments, setAllSegments] = useState([]);
  const [routeSegments, setRouteSegments] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [backendData, setBackendData] = useState(null);
  const [error, setError] = useState(null);

  // Map controls state
  const [tileMode, setTileMode] = useState('terrain');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [isFetchingLive, setIsFetchingLive] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const mapRef = useRef(null);
  const corridorSegmentsRef = useRef([]);

  // Load all segments across the whole corridor with dense mountain coordinates
  const loadCorridorData = useCallback(async () => {
    try {
      const riskData = await fetchRiskMap({ simulateRainMm: demo.simulateRainMm });
      const adapted = (riskData.segments || []).map(adaptSegment);
      const merged = adapted.map(seg => {
        const staticSeg = SEGMENTS.find(s => s.id === seg.id);
        return staticSeg ? { ...staticSeg, ...seg } : seg;
      });
      merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      corridorSegmentsRef.current = merged;
      setAllSegments(merged);
      return merged;
    } catch (e) {
      console.warn('Could not preload corridor:', e);
      return [];
    }
  }, [demo.simulateRainMm]);

  useEffect(() => {
    loadCorridorData();
  }, [loadCorridorData]);

  // Execute trip planner query via real backend GET /route-risk
  const executePlan = useCallback(async (originTown, destTown, dateStr, timeStr) => {
    setLoading(true);
    setError(null);

    const fromSegId = resolveFromSegment(originTown);
    const toSegId = resolveToSegment(destTown);

    // Format depart_time like '2026-10-10T08:00:00'
    const fullDepartTime = `${dateStr || new Date().toISOString().split('T')[0]}T${(timeStr || '08:00')}:00`;

    try {
      // Ensure corridor dense geometry is loaded in parallel with route risk
      const corridorPromise = corridorSegmentsRef.current.length > 0
        ? Promise.resolve(corridorSegmentsRef.current)
        : loadCorridorData();

      const [data, corridorSegs] = await Promise.all([
        fetchRouteRisk({
          fromSegment: fromSegId,
          toSegment: toSegId,
          date: dateStr || new Date().toISOString().split('T')[0],
          departTime: fullDepartTime,
          speedKmph: 30,
          simulateRainMm: demo.simulateRainMm,
        }),
        corridorPromise,
      ]);

      setBackendData(data);

      const corridorList = corridorSegs && corridorSegs.length > 0 ? corridorSegs : corridorSegmentsRef.current;
      const corridorMap = new Map((corridorList || []).map(s => [s.id, s]));

      // Filter and adapt route segments for the map with DENSE NH-7 geometry
      const returnedSegs = data.segments || [];
      const adaptedRoute = returnedSegs.map(seg => {
        const staticSeg = SEGMENTS.find(s => s.id === seg.id);
        const denseSeg = corridorMap.get(seg.id);

        // Crucial: Use dense road curve coordinates from corridor (/risk-map) instead of 4 coarse waypoints
        const coords = (denseSeg?.coords && denseSeg.coords.length > 5)
          ? denseSeg.coords
          : parseCoords(seg.subpoints, seg.start_lat, seg.start_lng, seg.end_lat, seg.end_lng);

        // Effective level: check closure, backend risk_level_at_eta, risk_level, and score
        const effectiveLevel = seg.closure?.status === 'closed'
          ? 'closed'
          : Math.max(
              scoreToLevel(seg.risk_score ?? seg.risk_index ?? 0),
              levelFromText(seg.risk_level_at_eta || seg.risk_level || '')
            );

        return {
          id: seg.id,
          name: seg.name,
          nameEn: seg.name_en || denseSeg?.nameEn || seg.name,
          seq: seg.sequence_order,
          coords,
          level: effectiveLevel,
          score: seg.risk_score ?? seg.risk_index ?? denseSeg?.score ?? 0,
          terrainScore: seg.terrain_percentile ?? denseSeg?.terrainScore ?? 0.5,
          r3d: seg.rain_mm_3d ?? seg.r3d_mm ?? denseSeg?.r3d ?? 0,
          rain24h: denseSeg?.rain24h ?? 0,
          forecast24h: denseSeg?.forecast24h ?? 0,
          forecast72h: denseSeg?.forecast72h ?? 0,
          driver: seg.main_driver || denseSeg?.driver || 'Monsoon rainfall impact',
          closure: seg.closure || denseSeg?.closure,
          etaIst: seg.eta_ist,
          rainAtEtaMm: seg.forecast_rain_6h_around_eta_mm ?? seg.rain_72h_at_eta_mm ?? 0,
          kmStart: staticSeg?.kmStart ?? denseSeg?.kmStart ?? 0,
          kmEnd: staticSeg?.kmEnd ?? denseSeg?.kmEnd ?? 0,
          length: staticSeg?.length ?? denseSeg?.length ?? 10,
        };
      });

      setRouteSegments(adaptedRoute);

      // Fit map to the route segments
      if (adaptedRoute.length > 0 && mapRef.current?.resetRoute) {
        setTimeout(() => {
          mapRef.current?.resetRoute();
        }, 150);
      }
    } catch (err) {
      console.error('Trip planner error:', err);
      setError(err.message || 'Could not fetch route from backend');
    } finally {
      setLoading(false);
    }
  }, [demo.simulateRainMm, loadCorridorData]);

  // Initial plan load on mount
  useEffect(() => {
    executePlan(fromTown, toTown, travelDate, departureTime);
  }, []);

  const handleSwap = () => {
    const temp = fromTown;
    setFromTown(toTown);
    setToTown(temp);
    executePlan(toTown, temp, travelDate, departureTime);
  };

  const handlePopularSelect = (route) => {
    setFromTown(route.from);
    setToTown(route.to);
    executePlan(route.from, route.to, travelDate, departureTime);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    executePlan(fromTown, toTown, travelDate, departureTime);
  };

  const handleLiveFetch = async () => {
    try {
      setIsFetchingLive(true);
      if (demo.simulateRainMm != null) {
        ctx.deactivate?.();
      }
      corridorSegmentsRef.current = [];
      await executePlan(fromTown, toTown, travelDate, departureTime);
      setToastMsg('Live weather updated from Open-Meteo API');
      setTimeout(() => setToastMsg(null), 4000);
    } catch (e) {
      setToastMsg('Failed to refresh live weather. Check backend connection.');
      setTimeout(() => setToastMsg(null), 4000);
    } finally {
      setIsFetchingLive(false);
    }
  };

  const handleSelectAlternativeTime = (departIso) => {
    try {
      const parts = departIso.split('T');
      const newDate = parts[0];
      const newTime = parts[1]?.slice(0, 5) || departureTime;
      setTravelDate(newDate);
      setDepartureTime(newTime);
      executePlan(fromTown, toTown, newDate, newTime);
      setActiveTab('recommended');
      setToastMsg(`Departure rescheduled to ${newTime} IST`);
      setTimeout(() => setToastMsg(null), 4000);
    } catch (e) {
      console.error('Error selecting alternative time:', e);
    }
  };

  // Compute metrics from real backend response
  const segmentsInRoute = routeSegments.length > 0 ? routeSegments : allSegments;
  const totalKm = segmentsInRoute.reduce((sum, s) => sum + (s.length || 0), 0);
  const totalHours = totalKm > 0 ? (totalKm / (backendData?.speed_kmph || 30)) : 7.75;
  const durationH = Math.floor(totalHours);
  const durationM = Math.round((totalHours % 1) * 60);

  const highRiskStretches = segmentsInRoute.filter(s => s.level === 2 || s.level === 3);
  const closedStretches = segmentsInRoute.filter(s => s.level === 'closed');
  const maxRisk = backendData?.max_risk_level || (highRiskStretches.length > 0 ? 'High' : 'Moderate');

  // Realistic rainfall calculations from route segments
  const rainLast24h = demo.simulateRainMm != null
    ? (demo.simulateRainMm * 0.4).toFixed(1)
    : (segmentsInRoute.reduce((sum, s) => sum + (s.rain24h || (s.r3d ? s.r3d * 0.4 : 0)), 0) / (segmentsInRoute.length || 1)).toFixed(1);
  const rainNext24h = demo.simulateRainMm != null
    ? (demo.simulateRainMm * 0.6).toFixed(1)
    : (segmentsInRoute.reduce((sum, s) => sum + (s.forecast24h || (s.r3d ? s.r3d * 0.6 : 0)), 0) / (segmentsInRoute.length || 1)).toFixed(1);
  const rainNext72h = demo.simulateRainMm != null
    ? (demo.simulateRainMm * 1.2).toFixed(1)
    : (segmentsInRoute.reduce((sum, s) => sum + (s.forecast72h || (s.r3d ? s.r3d * 1.2 : 0)), 0) / (segmentsInRoute.length || 1)).toFixed(1);

  // Compute breakdown stops from towns along the route
  const fromTownObj = TOWNS.find(t => t.name.toLowerCase() === fromTown.toLowerCase()) || TOWNS[0];
  const toTownObj = TOWNS.find(t => t.name.toLowerCase() === toTown.toLowerCase()) || TOWNS[TOWNS.length - 1];
  const minKm = Math.min(fromTownObj.km, toTownObj.km);
  const maxKm = Math.max(fromTownObj.km, toTownObj.km);
  const isReverse = fromTownObj.km > toTownObj.km;

  const routeTowns = TOWNS
    .filter(t => t.km >= minKm && t.km <= maxKm)
    .sort((a, b) => isReverse ? (b.km - a.km) : (a.km - b.km));

  const startHour = parseInt((departureTime || '08:00').split(':')[0], 10) || 8;
  const startMin = parseInt((departureTime || '08:00').split(':')[1], 10) || 0;

  return (
    <div className="flex-1 w-full bg-slate-100 flex flex-col font-sans">
      {/* ── HERO HEADER WITH MOUNTAIN BACKDROP ── */}
      <section className="relative bg-[#0c1821] text-white pt-8 pb-10 px-4 md:px-8 border-b border-white/10 overflow-hidden shadow-lg">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-luminosity pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80')"
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c1821] via-[#0c1821]/80 to-transparent pointer-events-none" />

        <div className="relative max-w-[1360px] mx-auto">
          {/* Top title and feature badges */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-7">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold tracking-widest uppercase text-sky-400">ROUTE PLANNER</span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  demo.simulateRainMm != null
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${demo.simulateRainMm != null ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  {demo.simulateRainMm != null ? `SIMULATED: ${demo.simulateRainMm}mm` : 'LIVE WEATHER'}
                </span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                Plan your journey on NH-7
              </h1>
              <p className="text-gray-300 text-sm mt-1 max-w-xl">
                Check real-time landslide risk, road curves, weather and ML-optimized travel windows.
              </p>
            </div>

            {/* Feature info pills */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
                <Shield className="w-5 h-5 text-sky-400 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-bold leading-none">Real-time risk</div>
                  <div className="text-[10px] text-gray-300 leading-tight mt-0.5">Live landslide & road condition data</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
                <CloudRain className="w-5 h-5 text-sky-300 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-bold leading-none">Weather aware</div>
                  <div className="text-[10px] text-gray-300 leading-tight mt-0.5">Rainfall & forecast along the route</div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
                <Navigation className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-bold leading-none">Safer travel</div>
                  <div className="text-[10px] text-gray-300 leading-tight mt-0.5">ML departure windows & alternatives</div>
                </div>
              </div>
            </div>
          </div>

          {/* Search Inputs Card */}
          <form
            onSubmit={handleFormSubmit}
            className="bg-white rounded-2xl p-4 md:p-5 shadow-2xl border border-slate-200 text-gray-800"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              {/* From input */}
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">From</label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-3.5 w-4 h-4 text-emerald-600" />
                  <select
                    value={fromTown}
                    onChange={(e) => setFromTown(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none"
                  >
                    {TOWNS.map(t => (
                      <option key={t.name} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Swap Button + To Input */}
              <div className="relative flex items-end gap-2">
                <button
                  type="button"
                  onClick={handleSwap}
                  className="hidden md:flex p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-gray-600 transition-colors mb-0.5"
                  title="Swap From and To"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                </button>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">To</label>
                  <div className="relative flex items-center">
                    <MapPin className="absolute left-3.5 w-4 h-4 text-rose-500" />
                    <select
                      value={toTown}
                      onChange={(e) => setToTown(e.target.value)}
                      className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none"
                    >
                      {TOWNS.map(t => (
                        <option key={t.name} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Travel date */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Travel date</label>
                <div className="relative flex items-center">
                  <Calendar className="absolute left-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Departure time */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Departure time</label>
                <div className="relative flex items-center">
                  <Clock className="absolute left-3.5 w-4 h-4 text-gray-400" />
                  <input
                    type="time"
                    value={departureTime}
                    onChange={(e) => setDepartureTime(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Check Route Button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</>
                  ) : (
                    <><Search className="w-4 h-4" /> Check Route</>
                  )}
                </button>
              </div>
            </div>

            {/* Popular routes quick tags */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-slate-100 text-xs">
              <span className="text-gray-500 font-semibold">Popular routes:</span>
              {POPULAR_ROUTES.map(r => (
                <button
                  key={r.label}
                  type="button"
                  onClick={() => handlePopularSelect(r)}
                  className={`px-3 py-1 rounded-full border transition-colors ${
                    fromTown === r.from && toTown === r.to
                      ? 'bg-sky-50 border-sky-400 text-sky-700 font-bold'
                      : 'bg-slate-50 border-slate-200 text-gray-700 hover:bg-slate-100'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </form>
        </div>
      </section>

      {/* ── MAIN CONTENT: MAP + ROUTE SUMMARY ── */}
      <main className="max-w-[1360px] mx-auto w-full p-4 md:p-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT 2 COLUMNS: Map with Route Selection & Details */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              {/* Map header bar with Route toggle & Distance info */}
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Route Switcher Buttons */}
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                  <button
                    onClick={() => setActiveTab('recommended')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors ${
                      activeTab === 'recommended'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" /> Recommended Route
                  </button>
                  <button
                    onClick={() => setActiveTab('alternative')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-colors ${
                      activeTab === 'alternative'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Alternative Windows ({backendData?.recommendation?.best_departure_options?.length || 0})
                  </button>
                </div>

                {/* Route statistics badge from live backend data */}
                <div className="flex items-center gap-3 bg-[#0c1821] text-white px-3.5 py-1.5 rounded-xl shadow-sm">
                  <span>Distance: <strong className="text-white">{Math.round(totalKm)} km</strong></span>
                  <span className="text-gray-500">•</span>
                  <span>Est. time: <strong className="text-white">~ {durationH}h {durationM}m</strong></span>
                  <span className="text-gray-500">•</span>
                  <span className="flex items-center gap-1.5">
                    Overall risk:
                    <span className={`font-black text-[10px] px-2 py-0.5 rounded uppercase ${
                      maxRisk === 'High' || maxRisk === 'Severe'
                        ? 'bg-rose-500 text-white'
                        : maxRisk === 'Moderate'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-emerald-500 text-white'
                    }`}>
                      {maxRisk}
                    </span>
                  </span>
                </div>
              </div>

              {/* Interactive Topographic Map Area with Road Curves */}
              <div className="relative h-[420px] md:h-[480px] w-full bg-slate-200 overflow-hidden">
                <InteractiveMap
                  ref={mapRef}
                  segments={segmentsInRoute}
                  selectedSegment={selectedSegment}
                  onSelectSegment={setSelectedSegment}
                  tileMode={tileMode}
                  onTileModeChange={setTileMode}
                  originTown={fromTown}
                  destTown={toTown}
                />

                {/* Floating map controls in top-right */}
                <div className="absolute top-3 right-3 z-[400] flex flex-col gap-2">
                  {/* Zoom Controls */}
                  <div className="bg-white rounded-lg shadow-lg border border-slate-200 flex flex-col overflow-hidden">
                    <button
                      onClick={() => mapRef.current?.zoomIn()}
                      className="p-2 text-gray-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                      aria-label="Zoom in"
                      title="Zoom In"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => mapRef.current?.zoomOut()}
                      className="p-2 text-gray-700 hover:bg-slate-50 transition-colors border-b border-slate-100"
                      aria-label="Zoom out"
                      title="Zoom Out"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => mapRef.current?.resetRoute()}
                      className="p-2 text-gray-700 hover:bg-slate-50 transition-colors"
                      title="Fit route bounds"
                      aria-label="Fit route"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Map Layer Style Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => setShowLayerPicker(prev => !prev)}
                      className="p-2 bg-white rounded-lg shadow-lg border border-slate-200 text-gray-700 hover:bg-slate-50 transition-colors flex items-center justify-center"
                      title="Toggle Map Style"
                      aria-label="Toggle map style"
                    >
                      <Layers className="w-4 h-4" />
                    </button>

                    {showLayerPicker && (
                      <div className="absolute right-0 top-10 bg-slate-900/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-700 p-1.5 w-48 space-y-1 text-xs z-[500]">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Map Style
                        </div>
                        {Object.values(MAP_LAYERS).map((layer) => (
                          <button
                            key={layer.id}
                            onClick={() => {
                              setTileMode(layer.id);
                              setShowLayerPicker(false);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
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

                {/* Road Risk Level Legend in bottom-left */}
                <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm rounded-xl p-2.5 shadow-lg border border-slate-200 text-xs font-sans">
                  <div className="font-bold text-gray-800 text-[10px] mb-1.5 uppercase tracking-wide">Road Risk Level</div>
                  <div className="flex items-center gap-2.5 text-[11px]">
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                      <span className="text-gray-700">Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#eab308]"></span>
                      <span className="text-gray-700">Moderate</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#f97316]"></span>
                      <span className="text-gray-700">High</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></span>
                      <span className="text-gray-700">Severe</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0f172a]"></span>
                      <span className="text-gray-700">Closed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Route Summary & Weather Cards */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-gray-900">Route Summary</h2>
                <span className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full uppercase border ${
                  maxRisk === 'High' || maxRisk === 'Severe'
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>
                  {maxRisk} RISK
                </span>
              </div>

              {/* 4 Stat Boxes (Dynamically calculated) */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Navigation className="w-4 h-4 text-sky-600 mx-auto mb-1" />
                  <div className="font-extrabold text-sm text-gray-900">{Math.round(totalKm)} km</div>
                  <div className="text-[10px] text-gray-500">Distance</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Clock className="w-4 h-4 text-sky-600 mx-auto mb-1" />
                  <div className="font-extrabold text-sm text-gray-900">~{durationH}h {durationM}m</div>
                  <div className="text-[10px] text-gray-500">Est. travel time</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Activity className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                  <div className="font-extrabold text-sm text-gray-900">{highRiskStretches.length}</div>
                  <div className="text-[10px] text-gray-500">High risk stretches</div>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mx-auto mb-1" />
                  <div className="font-extrabold text-sm text-gray-900">{closedStretches.length}</div>
                  <div className="text-[10px] text-gray-500">Closure on route</div>
                </div>
              </div>

              {/* Dynamic Caution Banner from live recommendation */}
              <div className={`rounded-xl p-3.5 flex items-start gap-3 border ${
                closedStretches.length > 0 || highRiskStretches.length > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}>
                <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${
                  closedStretches.length > 0 || highRiskStretches.length > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`} />
                <div>
                  <div className={`font-bold text-xs ${
                    closedStretches.length > 0 || highRiskStretches.length > 0 ? 'text-amber-900' : 'text-emerald-900'
                  }`}>
                    {backendData?.recommendation?.action
                      ? `${backendData.recommendation.action}: ${closedStretches.length > 0 ? 'Road Closures on Route' : highRiskStretches.length > 0 ? 'Caution advised' : 'Good to travel'}`
                      : (closedStretches.length > 0 ? 'Road Closures on Route' : highRiskStretches.length > 0 ? 'Caution advised' : 'Good to travel')}
                  </div>
                  <div className={`text-[11px] mt-0.5 leading-relaxed ${
                    closedStretches.length > 0 || highRiskStretches.length > 0 ? 'text-amber-800' : 'text-emerald-800'
                  }`}>
                    {backendData?.recommendation?.reason || backendData?.advisory || `Route from ${fromTown} to ${toTown} has ${highRiskStretches.length} high-risk stretches.`}
                  </div>
                </div>
              </div>

              {/* Weather Along Route card */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <h3 className="font-bold text-xs text-gray-900 uppercase tracking-wider">Weather Along Route</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <CloudRain className="w-5 h-5 text-sky-500 mx-auto mb-1" />
                    <div className="text-base font-black text-gray-900">{rainLast24h} mm</div>
                    <div className="text-[10px] text-gray-500">Last 24 hours</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <CloudRain className="w-5 h-5 text-sky-500 mx-auto mb-1" />
                    <div className="text-base font-black text-gray-900">{rainNext24h} mm</div>
                    <div className="text-[10px] text-gray-500">Next 24 hours</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                    <CloudRain className="w-5 h-5 text-sky-500 mx-auto mb-1" />
                    <div className="text-base font-black text-gray-900">{rainNext72h} mm</div>
                    <div className="text-[10px] text-gray-500">Next 72 hours</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── LOWER SECTION: TABS SWITCHER (RECOMMENDED TIMELINE vs ALTERNATIVE ML DEPARTURE WINDOWS) ── */}
        {activeTab === 'alternative' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: ML Departure Windows */}
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div>
                  <span className="text-[10px] font-bold tracking-wider uppercase text-sky-600">MACHINE LEARNING RECOMMENDATION</span>
                  <h3 className="text-lg font-extrabold text-gray-900 mt-0.5">Optimal Departure Windows for NH-7</h3>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    NH-7 is the primary mountain highway corridor connecting the Alaknanda valley. The AI system forecasts hourly rainfall peaks and rockfall probabilities along mountain slopes to calculate the safest departure hours.
                  </p>
                </div>

                {backendData?.recommendation?.params?.hours_delay > 0 && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-xs text-amber-900">
                        Recommended Delay: +{backendData.recommendation.params.hours_delay} Hours
                      </div>
                      <div className="text-[11px] text-amber-800 mt-0.5">
                        Delaying departure until {backendData.recommendation.params.best_depart_time ? new Date(backendData.recommendation.params.best_depart_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'a later hour'} reduces corridor landslide risk to {backendData.recommendation.params.best_max_risk}.
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3 pt-2">
                  {(backendData?.recommendation?.best_departure_options || []).map((opt, idx) => {
                    const optDate = new Date(opt.depart_time);
                    const timeLabel = isNaN(optDate.getTime())
                      ? opt.depart_time
                      : optDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                    const dateLabel = isNaN(optDate.getTime())
                      ? ''
                      : optDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
                    const isCurrentlySelected = departureTime === (opt.depart_time.includes('T') ? opt.depart_time.split('T')[1].slice(0, 5) : departureTime);

                    const isLow = opt.max_risk_level?.toLowerCase() === 'low';
                    const isMod = opt.max_risk_level?.toLowerCase() === 'moderate';

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isCurrentlySelected
                            ? 'bg-sky-50/80 border-sky-300 ring-1 ring-sky-300'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-extrabold text-gray-900">{timeLabel}</span>
                            <span className="text-xs text-gray-500 font-medium">({dateLabel})</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              isLow ? 'bg-emerald-100 text-emerald-800' : isMod ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {opt.max_risk_level} Risk
                            </span>
                            {idx === 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-sky-100 text-sky-800">
                                Best Window
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600">{opt.summary}</p>
                          <div className="text-[10px] text-gray-500">
                            Route Risk Score: <strong className="text-gray-700">{(opt.total_risk_score ?? 0).toFixed(2)}</strong>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectAlternativeTime(opt.depart_time)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center justify-center gap-1.5 ${
                            isCurrentlySelected
                              ? 'bg-sky-600 text-white shadow-sm'
                              : 'bg-white hover:bg-sky-50 text-sky-700 border border-slate-200 hover:border-sky-300'
                          }`}
                        >
                          {isCurrentlySelected ? <Check className="w-3.5 h-3.5" /> : null}
                          {isCurrentlySelected ? 'Current Departure' : 'Select This Time'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Corridor Staging / Waypoints Guidance */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <h3 className="text-base font-extrabold text-gray-900">Recommended Valley Staging Towns</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  NH-7 winds through steep gorges without parallel bypass highways. If driving after 3:00 PM or during active rain alerts, plan an overnight stop at designated staging towns with emergency shelters:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-bold text-gray-900">Srinagar (km 103)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">Medical college, major hotels, valley elevation</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-bold text-gray-900">Rudraprayag (km 136)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">Confluence hub, disaster management base</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <div className="font-bold text-gray-900">Karnaprayag (km 168)</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">Civil hospital, fuel stations, river transit point</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: Alternative Guidelines */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-extrabold text-gray-900">Himalayan Travel Protocol</h3>
                </div>
                <ul className="space-y-3 text-xs text-gray-700">
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Avoid night driving between 8:00 PM and 5:00 AM on NH-7 mountain stretches</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>If rainfall exceeds 30mm/h, halt immediately at the nearest staging town</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Do not stop vehicles in rockfall hazard zones (Sirobagarh, Helang)</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>Keep police control room 112 and SDRF 1070 on speed dial</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          /* Standard Recommended Route View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

            {/* 1. Dynamic Route Breakdown (Timeline of towns and ETA) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h3 className="text-base font-extrabold text-gray-900">Route Breakdown</h3>
              <div className="space-y-4 relative before:absolute before:inset-y-2 before:left-[7px] before:w-0.5 before:bg-slate-200">
                {routeTowns.map((town, idx) => {
                  const isStart = idx === 0;
                  const isEnd = idx === routeTowns.length - 1;
                  const offsetKm = Math.abs(town.km - fromTownObj.km);
                  const travelMinutes = Math.round((offsetKm / (backendData?.speed_kmph || 30)) * 60);

                  const currentHour = (startHour + Math.floor((startMin + travelMinutes) / 60)) % 24;
                  const currentMinute = (startMin + travelMinutes) % 60;
                  const ampm = currentHour >= 12 ? 'PM' : 'AM';
                  const displayH = currentHour % 12 || 12;
                  const displayM = currentMinute < 10 ? `0${currentMinute}` : currentMinute;
                  const timeLabel = `${displayH}:${displayM} ${ampm}`;

                  // Find matching segment
                  const matchedSeg = segmentsInRoute.find(s => s.id === town.segmentId) || segmentsInRoute[idx % segmentsInRoute.length];
                  const lvl = matchedSeg?.level ?? 0;
                  const lvlMeta = getLevelMeta(lvl);

                  return (
                    <div key={town.name} className="flex items-center justify-between text-xs relative pl-6">
                      <span
                        className="w-3.5 h-3.5 rounded-full border-2 border-white absolute left-0 shadow-sm"
                        style={{ backgroundColor: isStart ? '#10b981' : isEnd ? '#ef4444' : lvlMeta.color }}
                      />
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{town.name}</span>
                        {isStart && <span className="text-[10px] text-gray-400">Start point</span>}
                        {isEnd && <span className="text-[10px] text-gray-400">Destination</span>}
                        {!isStart && !isEnd && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                            style={{ backgroundColor: lvlMeta.tint, color: lvlMeta.color }}
                          >
                            {lvlMeta.label}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-600">{Math.round(offsetKm)} km</div>
                        <div className="font-bold text-gray-900">{timeLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Dynamic High-Risk Stretches & Road Closures */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <h3 className="text-base font-extrabold text-gray-900">
                    High-Risk Stretches ({highRiskStretches.length})
                  </h3>
                </div>

                {highRiskStretches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500 bg-slate-50 rounded-xl">
                    No high-risk stretches detected on this segment.
                  </div>
                ) : (
                  highRiskStretches.slice(0, 3).map((seg) => {
                    const meta = getLevelMeta(seg.level);
                    return (
                      <div
                        key={seg.id}
                        onClick={() => {
                          setSelectedSegment(seg);
                          mapRef.current?.flyToSegment(seg);
                        }}
                        className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3 cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span
                              className="text-white font-black text-[9px] px-1.5 py-0.5 rounded uppercase"
                              style={{ backgroundColor: meta.color }}
                            >
                              {meta.label}
                            </span>
                            <span className="font-bold text-xs text-gray-900">{seg.nameEn || seg.name}</span>
                          </div>
                          <div className="text-[10px] text-gray-500 mb-1">
                            km {(seg.kmStart || 0).toFixed(0)} – {(seg.kmEnd || 0).toFixed(0)}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-600">
                            <span className="flex items-center gap-1">
                              <CloudRain className="w-3 h-3 text-orange-500" /> {seg.driver}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <svg width="45" height="22" viewBox="0 0 60 30" fill="none">
                            <path d="M2 28 C 15 25, 25 15, 38 12 C 48 10, 52 4, 58 2" stroke={meta.color} strokeWidth="3" strokeLinecap="round" />
                          </svg>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Road Closure on Route */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black">−</span>
                  <h3 className="text-base font-extrabold text-gray-900">
                    Road Closure on Route ({closedStretches.length})
                  </h3>
                </div>

                {closedStretches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500 bg-slate-50 rounded-xl">
                    No active closures on this route.
                  </div>
                ) : (
                  closedStretches.map((seg) => (
                    <div
                      key={seg.id}
                      onClick={() => {
                        setSelectedSegment(seg);
                        mapRef.current?.flyToSegment(seg);
                      }}
                      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl p-3 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="bg-slate-800 text-white font-black text-[9px] px-1.5 py-0.5 rounded">CLOSED</span>
                          <span className="font-bold text-xs text-gray-900">{seg.nameEn || seg.name}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mb-1">
                          km {(seg.kmStart || 0).toFixed(0)} – {(seg.kmEnd || 0).toFixed(0)}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-gray-600">
                          <span className="flex items-center gap-1 text-rose-600 font-bold">
                            <AlertTriangle className="w-3 h-3" /> Landslide
                          </span>
                          <span className="text-gray-500">Not passable</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg width="45" height="22" viewBox="0 0 60 30" fill="none">
                          <path d="M2 28 L 20 20 L 35 24 L 58 4" stroke="#0f172a" strokeWidth="3" strokeLinecap="round" strokeDasharray="4 4" />
                        </svg>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Safety Recommendations Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-extrabold text-gray-900">Safety Recommendations</h3>
              </div>

              <ul className="space-y-3 text-xs text-gray-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Check latest weather updates before you travel</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Consider delaying travel on high-risk stretches</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Keep emergency contacts handy</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Carry essential supplies (water, food, medicines)</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Follow official road closure instructions</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Prefer daytime travel and avoid heavy rain periods</span>
                </li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Toast notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[9999] bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 text-xs flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
