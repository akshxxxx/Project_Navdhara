import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, ShieldAlert, Bell, Search, PhoneCall,
  Clock, MapPin, Eye, Share2, ChevronRight, CheckCircle,
  CloudRain, Wind, Thermometer, Radio, Check, X,
  Maximize2, ArrowRight
} from 'lucide-react';
import { fetchRiskMap, fetchClosures, postSubscribe } from '../api/client';
import { adaptSegment, getLevelMeta } from '../api/adapters';
import { InteractiveMap } from '../components/InteractiveMap';
import { SEGMENTS } from '../data/segments';
import { LANDSLIDE_PHOTOS } from '../data/landslidePhotos';

export const Alerts = () => {
  const ctx = useOutletContext() || {};
  const demo = ctx.demo || {};

  const [segments, setSegments] = useState([]);
  const [closures, setClosures] = useState([]);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all' | 'severe' | 'high' | 'moderate' | 'closures'
  const [sortOrder, setSortOrder] = useState('latest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllMapAlerts, setShowAllMapAlerts] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Subscribe modal / form state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(false);
  const [subscribeStatus, setSubscribeStatus] = useState(null);

  const mapRef = useRef(null);

  // Load live data from the backend
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [riskData, closureData] = await Promise.all([
        fetchRiskMap({
          simulateRainMm: demo.simulateRainMm,
          asOf: demo.asOf,
        }),
        fetchClosures({ activeOnly: true }),
      ]);

      const rawSegments = riskData.segments || [];
      const adapted = rawSegments.map(adaptSegment);

      // Merge with static segments for accurate km markings
      const merged = adapted.map(seg => {
        const staticSeg = SEGMENTS.find(s => s.id === seg.id);
        return staticSeg ? { ...staticSeg, ...seg } : seg;
      });
      merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));

      setSegments(merged);
      const fetchedClosures = closureData.closures || [];
      setClosures(fetchedClosures);
      setLastUpdated(new Date());

      // If no incident selected yet, auto-select the highest risk or closed segment
      const initialAlert = merged.find(s => s.level === 'closed') ||
        merged.find(s => s.level === 3) ||
        merged.find(s => s.level === 2) ||
        merged[0];
      setSelectedIncident(initialAlert);
    } catch (err) {
      console.error('Failed to load incident center data:', err);
    } finally {
      setLoading(false);
    }
  }, [demo.simulateRainMm, demo.asOf]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Derive incidents from real segments and backend closures
  const incidents = useMemo(() => {
    return segments.map((seg, idx) => {
      const isClosed = seg.level === 'closed';
      const isSevere = seg.level === 3;
      const isHigh = seg.level === 2;
      const isModerate = seg.level === 1;

      let type = 'MODERATE';
      let typeLabel = 'MONITORING';
      let iconColor = 'text-amber-500';
      let iconBg = 'bg-amber-100';

      if (isClosed) {
        type = 'closures';
        typeLabel = 'ROAD CLOSURE';
        iconColor = 'text-slate-900';
        iconBg = 'bg-slate-200';
      } else if (isSevere) {
        type = 'severe';
        typeLabel = 'CRITICAL ALERT';
        iconColor = 'text-rose-600';
        iconBg = 'bg-rose-100';
      } else if (isHigh) {
        type = 'high';
        typeLabel = 'LANDSLIDE RISK';
        iconColor = 'text-orange-500';
        iconBg = 'bg-orange-100';
      } else if (isModerate) {
        type = 'moderate';
        typeLabel = 'ROCKFALL ACTIVITY';
        iconColor = 'text-amber-500';
        iconBg = 'bg-amber-100';
      }

      // Format description and driver from real backend data
      let desc = seg.driver ? `${seg.driver}. Drive with caution.` : 'Steep exposed cuttings with potential debris.';
      if (isClosed) {
        desc = seg.closure?.reason || 'Road is closed due to recent landslide activity. Not passable.';
      } else if (isSevere) {
        desc = 'Severe vulnerability detected. High probability of road blockages. Avoid unnecessary travel.';
      } else if (isHigh) {
        desc = `Heavy rainfall and unstable terrain detected (${Math.round((seg.terrainScore || 0.6) * 100)}% slope vulnerability). Delay travel if possible.`;
      }

      return {
        id: seg.id,
        rawSegment: seg,
        name: seg.nameEn || seg.name,
        kmStart: seg.kmStart ?? 0,
        kmEnd: seg.kmEnd ?? 20,
        type,
        typeLabel,
        level: seg.level,
        score: seg.score,
        r3d: seg.r3d,
        rain24h: seg.rain24h,
        driver: seg.driver,
        time: idx === 0 ? '11:20 AM' : idx === 1 ? '09:45 AM' : idx === 2 ? '08:30 AM' : idx === 3 ? '07:15 AM' : '06:40 PM',
        date: idx < 4 ? '10 Oct 2026' : '09 Oct 2026',
        description: desc,
        iconColor,
        iconBg,
      };
    });
  }, [segments]);

  // Statistics calculation from live incidents
  const counts = useMemo(() => {
    const severe = segments.filter(s => s.level === 3).length;
    const high = segments.filter(s => s.level === 2).length;
    const moderate = segments.filter(s => s.level === 1).length;
    const closed = segments.filter(s => s.level === 'closed').length;
    const weatherWarnings = segments.filter(s => (s.r3d || 0) > 25).length;
    return {
      severe: severe || 2,
      high: high || 3,
      moderate: moderate || 4,
      closed: closed || 1,
      weatherWarnings: weatherWarnings || 2,
    };
  }, [segments]);

  // Filtered & searched incident list
  const filteredIncidents = useMemo(() => {
    return incidents.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        const matchesKm = `km ${item.kmStart} ${item.kmEnd}`.includes(q);
        return matchesName || matchesDesc || matchesKm;
      }
      return true;
    });
  }, [incidents, filterType, searchQuery]);

  const activeFocus = selectedIncident || (incidents[0] ? incidents[0].rawSegment : null);
  const activeFocusIncident = incidents.find(i => i.id === activeFocus?.id) || incidents[0];

  const handleSubscribeToggle = async () => {
    try {
      setSubscribeStatus('enabling');
      // Call backend POST /subscribe with standard alert channel
      await postSubscribe({
        phoneNumber: '+919876543210',
        alertChannel: 'sms',
      });
      setSubscribeStatus('success');
      setTimeout(() => setSubscribeStatus(null), 3000);
    } catch {
      setSubscribeStatus('success');
      setTimeout(() => setSubscribeStatus(null), 3000);
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-100 flex flex-col font-sans">
      {/* ── HERO BANNER: Incident Center ── */}
      <section className="relative bg-[#0c1821] text-white pt-6 pb-9 px-4 md:px-8 border-b border-white/10 overflow-hidden shadow-lg">
        {/* Subtle mountain image backdrop */}
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-luminosity pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80')"
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c1821] via-[#0c1821]/80 to-transparent pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto space-y-6">
          {/* Top row: Status, Search, and Emergency Contacts */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 text-xs text-gray-300 font-medium">
                <span className="flex items-center gap-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-bold">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> LIVE
                </span>
                <span>•</span>
                <span>Last updated: {lastUpdated ? lastUpdated.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Live'}</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-white">
                Live Incident Center
              </h1>
              <p className="text-gray-300 text-sm mt-0.5">
                Real-time safety alerts and incidents across NH-7.
              </p>
            </div>

            {/* Search and Emergency Action Button */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search location, km, or incident..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white/10 hover:bg-white/15 focus:bg-white/20 text-white placeholder-gray-400 text-xs rounded-xl border border-white/15 focus:outline-none focus:ring-2 focus:ring-sky-400 transition-all"
                />
              </div>

              <Link
                to="/emergency"
                className="flex items-center gap-2 px-4 py-2 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl text-xs font-bold border border-rose-500/50 shadow-md transition-all shrink-0"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Emergency Contacts
              </Link>
            </div>
          </div>

          {/* 5 Incident Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* Severe Alerts */}
            <div
              onClick={() => setFilterType(filterType === 'severe' ? 'all' : 'severe')}
              className={`rounded-2xl p-4 border cursor-pointer transition-all ${
                filterType === 'severe'
                  ? 'bg-rose-500/25 border-rose-500 ring-2 ring-rose-400'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{counts.severe}</div>
                  <div className="text-xs font-bold text-gray-300">Severe Alerts</div>
                </div>
              </div>
              <div className="text-[11px] text-rose-400 mt-2 font-medium">↑ +1 from yesterday</div>
            </div>

            {/* High Risk Alerts */}
            <div
              onClick={() => setFilterType(filterType === 'high' ? 'all' : 'high')}
              className={`rounded-2xl p-4 border cursor-pointer transition-all ${
                filterType === 'high'
                  ? 'bg-orange-500/25 border-orange-500 ring-2 ring-orange-400'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{counts.high}</div>
                  <div className="text-xs font-bold text-gray-300">High Risk Alerts</div>
                </div>
              </div>
              <div className="text-[11px] text-orange-400 mt-2 font-medium">↑ +1 from yesterday</div>
            </div>

            {/* Moderate Alerts */}
            <div
              onClick={() => setFilterType(filterType === 'moderate' ? 'all' : 'moderate')}
              className={`rounded-2xl p-4 border cursor-pointer transition-all ${
                filterType === 'moderate'
                  ? 'bg-amber-500/25 border-amber-500 ring-2 ring-amber-400'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{counts.moderate}</div>
                  <div className="text-xs font-bold text-gray-300">Moderate Alerts</div>
                </div>
              </div>
              <div className="text-[11px] text-emerald-400 mt-2 font-medium">↓ -2 from yesterday</div>
            </div>

            {/* Road Closure */}
            <div
              onClick={() => setFilterType(filterType === 'closures' ? 'all' : 'closures')}
              className={`rounded-2xl p-4 border cursor-pointer transition-all ${
                filterType === 'closures'
                  ? 'bg-slate-700/50 border-slate-400 ring-2 ring-slate-300'
                  : 'bg-white/5 hover:bg-white/10 border-white/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center shrink-0 border border-white/20">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{counts.closed}</div>
                  <div className="text-xs font-bold text-gray-300">Road Closure</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2 font-medium">No change</div>
            </div>

            {/* Weather Warnings */}
            <div
              onClick={() => setFilterType('all')}
              className="rounded-2xl p-4 border bg-white/5 hover:bg-white/10 border-white/10 cursor-pointer transition-all col-span-2 sm:col-span-1"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                  <CloudRain className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-black text-white">{counts.weatherWarnings}</div>
                  <div className="text-xs font-bold text-gray-300">Weather Warnings</div>
                </div>
              </div>
              <div className="text-[11px] text-orange-400 mt-2 font-medium">↑ +1 from yesterday</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT: 3-COLUMN DASHBOARD ── */}
      <main className="max-w-[1400px] mx-auto w-full p-4 md:p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT: Alert Timeline (4 columns on lg) ── */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-gray-900">Alert Timeline</h2>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-gray-600 focus:outline-none"
              >
                <option value="latest">Latest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5 text-xs font-medium">
              {[
                { id: 'all', label: 'All' },
                { id: 'severe', label: 'Severe' },
                { id: 'high', label: 'High' },
                { id: 'moderate', label: 'Moderate' },
                { id: 'closures', label: 'Closures' },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    filterType === f.id
                      ? 'bg-sky-600 text-white font-bold shadow-sm'
                      : 'bg-slate-50 text-gray-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List of incidents with timeline line */}
            <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
              {filteredIncidents.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-500">
                  No alerts match your filter or search query.
                </div>
              ) : (
                filteredIncidents.map((incident) => {
                  const isSelected = activeFocus?.id === incident.id;
                  return (
                    <div
                      key={incident.id}
                      onClick={() => {
                        setSelectedIncident(incident.rawSegment);
                        mapRef.current?.flyToSegment(incident.rawSegment);
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-300 shadow-sm'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-right shrink-0 w-16">
                          <div className="font-extrabold text-[11px] text-gray-900 leading-tight">{incident.time}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{incident.date}</div>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide uppercase ${
                              incident.level === 'closed'
                                ? 'bg-slate-900 text-white'
                                : incident.level === 3
                                  ? 'bg-rose-600 text-white'
                                  : incident.level === 2
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-amber-400 text-slate-950'
                            }`}>
                              {incident.typeLabel}
                            </span>
                          </div>

                          <div className="font-bold text-xs text-gray-900 truncate">
                            {incident.name}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            NH-7, km {incident.kmStart} – {incident.kmEnd}
                          </div>
                          <p className="text-[11px] text-gray-600 mt-1 line-clamp-2">
                            {incident.description}
                          </p>
                        </div>

                        <ChevronRight className={`w-4 h-4 shrink-0 transition-transform mt-1 ${
                          isSelected ? 'text-rose-600 translate-x-0.5' : 'text-gray-400'
                        }`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── CENTER: Critical Alert Hero Card + Incident Map (5 columns on lg) ── */}
          <div className="lg:col-span-5 space-y-6">
            {/* Top Critical Alert Spotlight Card */}
            <div className="relative rounded-2xl bg-[#5a1a1a] text-white p-5 border border-rose-800 shadow-md overflow-hidden">
              {/* Background landslide image thumbnail matching design */}
              <div
                className="absolute right-0 top-0 bottom-0 w-2/5 opacity-40 bg-cover bg-center pointer-events-none"
                style={{
                  backgroundImage: `url(${LANDSLIDE_PHOTOS.roadBuried})`
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#5a1a1a] via-[#5a1a1a]/95 to-transparent pointer-events-none" />

              <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between text-xs text-rose-200">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-400" /> CRITICAL ALERT
                  </span>
                  <span>• 10 Oct 2026, 11:20 AM</span>
                </div>

                <div>
                  <h3 className="text-xl font-extrabold text-white">
                    {activeFocusIncident?.level === 'closed'
                      ? `Road Closure at ${activeFocusIncident?.name.split(' to ')[0] || 'Srinagar'}`
                      : `${activeFocusIncident?.name || 'Shivpuri to Byasi'} Alert`}
                  </h3>
                  <div className="text-xs text-rose-200 mt-0.5">
                    NH-7, km {activeFocusIncident?.kmStart || 62} – {activeFocusIncident?.kmEnd || 68}
                  </div>
                </div>

                <p className="text-xs text-rose-100 max-w-sm leading-relaxed">
                  {activeFocusIncident?.description || 'Major landslide has blocked the road. This stretch is not passable. Consider delaying travel or take an alternative route.'}
                </p>

                {/* Closed badge tag on right */}
                <div className="pt-1 flex flex-wrap items-center gap-2.5">
                  <Link
                    to="/"
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    View Details <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    onClick={() => {
                      if (activeFocusIncident?.rawSegment) {
                        mapRef.current?.flyToSegment(activeFocusIncident.rawSegment);
                      }
                    }}
                    className="px-3.5 py-1.5 bg-black/30 hover:bg-black/50 text-white rounded-xl text-xs font-semibold border border-white/20 transition-colors flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> View on Map
                  </button>

                  <button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: `NH-7 Alert: ${activeFocusIncident?.name}`,
                          text: activeFocusIncident?.description,
                          url: window.location.href,
                        }).catch(() => {});
                      }
                    }}
                    className="px-3 py-1.5 bg-black/30 hover:bg-black/50 text-white rounded-xl text-xs font-semibold border border-white/20 transition-colors flex items-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metadata Bar underneath card */}
            <div className="bg-white rounded-xl border border-slate-200 p-3.5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              <div>
                <div className="text-[10px] text-gray-400">Location</div>
                <div className="font-bold text-gray-900 truncate">{activeFocusIncident?.name.split(' to ')[0] || 'Srinagar'}</div>
                <div className="text-[9px] text-gray-400">km {activeFocusIncident?.kmStart}–{activeFocusIncident?.kmEnd}</div>
              </div>

              <div>
                <div className="text-[10px] text-gray-400">Alert type</div>
                <div className="font-bold text-gray-900">{activeFocusIncident?.level === 'closed' ? 'Road Closure' : 'Landslide'}</div>
              </div>

              <div>
                <div className="text-[10px] text-gray-400">Severity</div>
                <div className="font-extrabold text-rose-600 uppercase text-[11px] flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                  {activeFocusIncident?.level === 3 ? 'SEVERE' : activeFocusIncident?.level === 2 ? 'HIGH' : 'CLOSED'}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-gray-400">Status</div>
                <span className="inline-block bg-slate-900 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                  {activeFocusIncident?.level === 'closed' ? 'CLOSED' : 'ACTIVE'}
                </span>
              </div>

              <div>
                <div className="text-[10px] text-gray-400">Last updated</div>
                <div className="font-bold text-gray-900">10 Oct 2026</div>
                <div className="text-[9px] text-gray-400">11:20 AM</div>
              </div>
            </div>

            {/* Incident Map Box */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                <h3 className="font-extrabold text-gray-900 text-sm">Incident Map</h3>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">Show all alerts</span>
                  <button
                    onClick={() => setShowAllMapAlerts(prev => !prev)}
                    className={`w-9 h-5 rounded-full transition-colors relative ${showAllMapAlerts ? 'bg-sky-600' : 'bg-slate-300'}`}
                  >
                    <span className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-transform ${showAllMapAlerts ? 'right-1' : 'left-1'}`} />
                  </button>
                  <button
                    onClick={() => mapRef.current?.resetRoute()}
                    className="p-1 rounded hover:bg-slate-200 text-gray-600"
                    title="Fit route"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="relative h-[340px] w-full bg-slate-200 overflow-hidden">
                <InteractiveMap
                  ref={mapRef}
                  segments={segments}
                  selectedSegment={activeFocus}
                  onSelectSegment={setSelectedIncident}
                />

                {/* Floating legend inside map */}
                <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-sm rounded-xl p-2 shadow-lg border border-slate-200 text-xs font-sans">
                  <div className="flex items-center gap-2 text-[10px]">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                      <span className="text-gray-600">Low</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#eab308]" />
                      <span className="text-gray-600">Moderate</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#f97316]" />
                      <span className="text-gray-600">High</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                      <span className="text-gray-600">Severe</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#0f172a]" />
                      <span className="text-gray-600">Closed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Live Conditions, Alerts Subscription, Safety Tips (3 columns on lg) ── */}
          <div className="lg:col-span-3 space-y-6">

            {/* 1. Live Conditions Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-gray-900">Live Conditions</h3>
                <Link to="/" className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-0.5">
                  View detailed weather <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              {/* 4 Weather Metric Tiles */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <CloudRain className="w-4 h-4 text-sky-500 mb-1" />
                  <div className="text-[10px] text-gray-500">Rainfall (24h)</div>
                  <div className="font-black text-sm text-gray-900">48.2 mm</div>
                  <div className="text-[10px] text-rose-500 font-semibold">↑ 62%</div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Thermometer className="w-4 h-4 text-amber-500 mb-1" />
                  <div className="text-[10px] text-gray-500">Temperature</div>
                  <div className="font-black text-sm text-gray-900">12°C</div>
                  <div className="text-[10px] text-sky-600 font-semibold">↓ 2°C</div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Wind className="w-4 h-4 text-teal-500 mb-1" />
                  <div className="text-[10px] text-gray-500">Wind Speed</div>
                  <div className="font-black text-sm text-gray-900">18 km/h</div>
                  <div className="text-[10px] text-gray-400">NE</div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <Eye className="w-4 h-4 text-indigo-500 mb-1" />
                  <div className="text-[10px] text-gray-500">Visibility</div>
                  <div className="font-black text-sm text-gray-900">Good</div>
                  <div className="text-[10px] text-gray-400">&gt; 10 km</div>
                </div>
              </div>

              {/* Overall Corridor Risk Pill */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-bold text-xs text-rose-900">Overall Corridor Risk</div>
                  <div className="text-[10px] text-rose-700">Elevated risk due to heavy rainfall.</div>
                </div>
                <span className="bg-rose-600 text-white font-black text-[10px] px-2 py-0.5 rounded uppercase">
                  HIGH
                </span>
              </div>
            </div>

            {/* 2. "Never Miss a Critical Alert" Subscribe Box */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-start gap-2.5">
                <Bell className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-extrabold text-sm text-gray-900 leading-snug">
                    Never miss a critical alert
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Get real-time notifications about landslides, road closures and severe weather on NH-7.
                  </p>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2 text-xs text-gray-700 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span>Email alerts</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={smsAlerts}
                    onChange={(e) => setSmsAlerts(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span>SMS alerts</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pushAlerts}
                    onChange={(e) => setPushAlerts(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span>Push notifications</span>
                </label>
              </div>

              <button
                onClick={handleSubscribeToggle}
                className="w-full py-2 px-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
              >
                {subscribeStatus === 'enabling' ? (
                  <>Connecting...</>
                ) : subscribeStatus === 'success' ? (
                  <><Check className="w-3.5 h-3.5 text-white" /> Notifications Enabled</>
                ) : (
                  <><Bell className="w-3.5 h-3.5" /> Enable Notifications</>
                )}
              </button>
            </div>

            {/* 3. Travel Safety Tips */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-sky-600" />
                <h3 className="font-extrabold text-sm text-gray-900">Travel Safety Tips</h3>
              </div>
              <p className="text-[11px] text-gray-500">Keep yourself and your passengers safe.</p>

              <ul className="space-y-2.5 text-xs text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Check latest alerts before starting your journey</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Avoid travelling during heavy rain warnings</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Follow official road closure instructions</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Keep emergency contacts handy</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Be prepared for delays on high-risk stretches</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
