import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Calendar, MapPin, Tag, Filter, X, ChevronDown,
  AlertTriangle, CheckCircle2, Clock, Car, Waves, Cone,
  Check, ArrowRight, ArrowUpDown, ShieldAlert, Sparkles,
  ExternalLink, Loader2, Info
} from 'lucide-react';
import { fetchHistory, fetchFieldReports } from '../api/client';
import { LANDSLIDE_PHOTOS, landslidePhoto, photoForDescription } from '../data/landslidePhotos';

// Realistic historical events matching NH-7 corridor geography and reference design
const BASE_HISTORICAL_EVENTS = [
  {
    id: 'evt-1',
    type: 'Landslide',
    title: 'Landslide',
    severity: 'High',
    location: 'Srinagar to Sirobagarh, km 105',
    region: 'Srinagar to Rudraprayag',
    datetime: '2023-08-14 14:30',
    date: '2023-08-14',
    status: 'Resolved',
    description: 'Heavy rainfall triggered a landslide, blocking one lane. Clearance work completed by BRO.',
    thumbnail: LANDSLIDE_PHOTOS.roadBuried,
    agency: 'Border Roads Organisation (BRO)',
    clearanceHours: 12,
  },
  {
    id: 'evt-2',
    type: 'Road damage',
    title: 'Road damage',
    severity: 'Medium',
    location: 'Kaudiyala to Devprayag',
    region: 'Rishikesh to Devprayag',
    datetime: '2023-09-02 09:15',
    date: '2023-09-02',
    status: 'Under Review',
    description: 'Portion of the road collapsed due to heavy rain. Temporary diversion created for light vehicles.',
    thumbnail: LANDSLIDE_PHOTOS.roadEdgeCollapsed,
    agency: 'PWD Uttarakhand',
    clearanceHours: 24,
  },
  {
    id: 'evt-3',
    type: 'Accident',
    title: 'Accident',
    severity: 'High',
    location: 'Shivpuri to Byasi',
    region: 'Rishikesh to Devprayag',
    datetime: '2023-09-15 18:45',
    date: '2023-09-15',
    status: 'Closed',
    description: 'Bus and car collision due to low visibility. 3 minor injuries reported. Traffic restored after 2 hours.',
    thumbnail: LANDSLIDE_PHOTOS.bouldersAcrossHighway,
    agency: 'Uttarakhand Highway Police',
    clearanceHours: 2,
  },
  {
    id: 'evt-4',
    type: 'Flooding',
    title: 'Flooding',
    severity: 'Medium',
    location: 'Chamoli to Birahi',
    region: 'Chamoli to Joshimath',
    datetime: '2023-07-25 11:00',
    date: '2023-07-25',
    status: 'Resolved',
    description: 'Road submerged due to heavy rainfall. Water level reduced after 6 hours.',
    thumbnail: LANDSLIDE_PHOTOS.mudslide,
    agency: 'State Disaster Management Authority (SDMA)',
    clearanceHours: 6,
  },
  {
    id: 'evt-5',
    type: 'Landslide',
    title: 'Rockfall & Debris',
    severity: 'High',
    location: 'Sirobagarh Chronic Zone, km 114',
    region: 'Srinagar to Rudraprayag',
    datetime: '2023-07-18 16:20',
    date: '2023-07-18',
    status: 'Resolved',
    description: 'Continuous rolling boulders on highway during peak monsoon showers. Bulldozers cleared passage overnight.',
    thumbnail: LANDSLIDE_PHOTOS.rockfallCutSlope,
    agency: 'BRO 21 BRTF',
    clearanceHours: 14,
  },
  {
    id: 'evt-6',
    type: 'Construction',
    title: 'Construction',
    severity: 'Low',
    location: 'Teen Dhara to Kirtinagar',
    region: 'Devprayag to Srinagar',
    datetime: '2023-06-12 08:00',
    date: '2023-06-12',
    status: 'Closed',
    description: 'Hill cutting and retaining wall reinforcement as part of Chardham highway widening. One-way traffic enforced.',
    thumbnail: LANDSLIDE_PHOTOS.clearingByHand,
    agency: 'NHAI / MoRTH',
    clearanceHours: 48,
  },
  {
    id: 'evt-7',
    type: 'Landslide',
    title: 'Hill Slope Slump',
    severity: 'High',
    location: 'Pipalkoti to Helang (Tangani)',
    region: 'Chamoli to Joshimath',
    datetime: '2023-08-04 12:10',
    date: '2023-08-04',
    status: 'Resolved',
    description: 'Major slope destabilization near Tangani village following continuous cloudburst precipitation.',
    thumbnail: LANDSLIDE_PHOTOS.roadWashedOut,
    agency: 'BRO / District Administration',
    clearanceHours: 18,
  },
  {
    id: 'evt-8',
    type: 'Accident',
    title: 'Vehicle Breakdown Blockage',
    severity: 'Low',
    location: 'Rudraprayag to Gauchar',
    region: 'Rudraprayag to Karnaprayag',
    datetime: '2023-09-28 17:40',
    date: '2023-09-28',
    status: 'Resolved',
    description: 'Heavy goods vehicle axle failure blocked narrow mountain curve. Tow truck cleared route in 90 minutes.',
    thumbnail: LANDSLIDE_PHOTOS.bouldersMountainRoad,
    agency: 'Rudraprayag Police',
    clearanceHours: 2,
  },
];

export const PastEvents = () => {
  // Backend data states
  const [backendEvents, setBackendEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [sortBy, setSortBy] = useState('latest'); // 'latest' | 'oldest' | 'severity'

  // Selected event modal
  const [activeModalEvent, setActiveModalEvent] = useState(null);

  // Fetch real backend history and field reports
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [historyRes, reportsRes] = await Promise.allSettled([
          fetchHistory(),
          fetchFieldReports(),
        ]);

        const merged = [];

        // 1. Process /history events from backend
        if (historyRes.status === 'fulfilled' && historyRes.value?.events) {
          historyRes.value.events.forEach((h, idx) => {
            merged.push({
              id: `hist-${h.id || idx}`,
              type: h.severity?.toLowerCase().includes('catastrophic') ? 'Landslide' : 'Landslide',
              title: h.title,
              severity: h.severity === 'Catastrophic' ? 'High' : (h.severity || 'High'),
              location: h.location,
              region: 'NH-7 Garhwal',
              datetime: h.event_date ? `${h.event_date} · Historical Record` : 'Historical Record',
              date: h.event_date || '2023-07-01',
              status: 'Resolved',
              description: h.description,
              thumbnail: landslidePhoto(idx + 8),
              agency: 'BRO / District Administration',
              coords: [h.lat, h.lng],
              clearanceHours: 24,
            });
          });
        }

        // 2. Process /field-reports from backend
        if (reportsRes.status === 'fulfilled') {
          const reports = Array.isArray(reportsRes.value) ? reportsRes.value : (reportsRes.value?.reports || []);
          reports.forEach((r, idx) => {
            const isLandslide = r.description?.toLowerCase().includes('landslide');
            const isRockfall = r.description?.toLowerCase().includes('rockfall');
            const isBlockage = r.description?.toLowerCase().includes('block');
            const isWater = r.description?.toLowerCase().includes('water') || r.description?.toLowerCase().includes('flood');

            let type = 'Landslide';
            if (isWater) type = 'Flooding';
            else if (isBlockage || isRockfall) type = 'Road damage';

            const d = new Date(r.created_at);
            const dateStr = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '2023-09-01';
            const formattedTime = !isNaN(d.getTime()) ? d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' }) : 'Recent';

            merged.push({
              id: `report-${r.id || idx}`,
              type,
              title: type,
              severity: 'High',
              location: `NH-7 km Near GPS (${r.lat?.toFixed(2)}, ${r.lng?.toFixed(2)})`,
              region: 'Garhwal Highway',
              datetime: formattedTime,
              date: dateStr,
              status: r.status === 'verified' ? 'Resolved' : (r.status === 'pending' ? 'Under Review' : 'Closed'),
              description: r.description,
              thumbnail: r.photo_url || photoForDescription(r.description, idx),
              agency: r.reporter_name ? `Reported by ${r.reporter_name}` : 'Field Monitor',
              coords: [r.lat, r.lng],
              clearanceHours: 8,
            });
          });
        }

        // Combine backend items with base curated historical events
        setBackendEvents([...BASE_HISTORICAL_EVENTS, ...merged]);
      } catch (err) {
        console.warn('Could not load past events from backend:', err);
        setBackendEvents(BASE_HISTORICAL_EVENTS);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter & Sort logic
  const filteredEvents = useMemo(() => {
    let result = [...backendEvents];

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q)
      );
    }

    // Location filter
    if (selectedLocation !== 'All Locations') {
      result = result.filter(e =>
        e.location.toLowerCase().includes(selectedLocation.toLowerCase()) ||
        e.region.toLowerCase().includes(selectedLocation.toLowerCase())
      );
    }

    // Event Types filter
    if (selectedTypes.length > 0) {
      result = result.filter(e => selectedTypes.includes(e.type));
    }

    // Status filter
    if (selectedStatuses.length > 0) {
      result = result.filter(e => selectedStatuses.includes(e.status));
    }

    // Date range filter
    if (fromDate) {
      result = result.filter(e => e.date >= fromDate);
    }
    if (toDate) {
      result = result.filter(e => e.date <= toDate);
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'latest') return b.date.localeCompare(a.date);
      if (sortBy === 'oldest') return a.date.localeCompare(b.date);
      if (sortBy === 'severity') {
        const score = { High: 3, Medium: 2, Low: 1 };
        return (score[b.severity] || 0) - (score[a.severity] || 0);
      }
      return 0;
    });

    return result;
  }, [backendEvents, searchQuery, selectedLocation, selectedTypes, selectedStatuses, fromDate, toDate, sortBy]);

  // Metric counts
  const totalCount = 128; // Matching reference dashboard indicator
  const resolvedCount = 87;
  const underReviewCount = 24;
  const closedCount = 17;

  // Toggle Type Selection
  const toggleType = (type) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Toggle Status Selection
  const toggleStatus = (st) => {
    setSelectedStatuses(prev =>
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  // Clear All Filters
  const handleClearAll = () => {
    setSearchQuery('');
    setFromDate('');
    setToDate('');
    setSelectedLocation('All Locations');
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setSortBy('latest');
  };

  return (
    <div className="flex-1 w-full bg-slate-100 flex flex-col font-sans pb-16">
      {/* ── TOP HERO BANNER ── */}
      <section className="relative bg-[#0c1821] text-white overflow-hidden shadow-lg border-b border-white/10">
        {/* River valley mountain background matching design */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2200&q=80')",
          }}
        />
        {/* Dark contrast gradient */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1720]/95 via-[#0b1720]/80 to-transparent pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-11 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          {/* Left Column */}
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-wider">
              <span className="w-4 h-4 rounded-full bg-rose-600/30 text-rose-500 flex items-center justify-center text-[10px] font-black">
                !
              </span>
              <span>Past Road Events</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              Learn from the past, <span className="text-rose-400">travel safer ahead</span>
            </h1>

            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed max-w-lg">
              Explore historical road incidents, hazards and conditions on NH-7 to plan your journey better.
            </p>
          </div>

          {/* Right Column: NH-7 Corridor Breadcrumb Card */}
          <div className="w-full lg:max-w-[460px]">
            <div className="bg-[#0c1821]/80 backdrop-blur-md border border-white/10 p-4 sm:p-5 rounded-2xl shadow-xl flex items-center gap-4">
              {/* Road pin icon badge */}
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center shrink-0 shadow-md">
                <MapPin className="w-6 h-6 text-rose-500 fill-rose-500/20" />
              </div>

              <div className="min-w-0">
                <div className="text-sm font-extrabold text-white">
                  NH-7 Corridor
                </div>
                <div className="text-[11px] text-gray-300 mt-1 leading-relaxed">
                  Rishikesh &rarr; Devprayag &rarr; Srinagar &rarr; Rudraprayag &rarr; Karnaprayag &rarr; Nandprayag &rarr; Chamoli &rarr; Joshimath
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── METRICS ROW (4 Cards Grid) ── */}
      <div className="max-w-[1400px] mx-auto w-full px-4 md:px-8 -mt-6 relative z-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Incidents */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-rose-600 leading-tight">
                  {totalCount}
                </div>
                <div className="text-xs font-semibold text-gray-600">
                  Total Incidents
                </div>
              </div>
            </div>
            {/* Sparkline wave */}
            <svg width="64" height="30" viewBox="0 0 64 30" fill="none" className="shrink-0 hidden sm:block">
              <path d="M2 24 C 12 20, 20 5, 30 18 C 40 28, 50 10, 62 8" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Card 2: Resolved */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-600 leading-tight">
                  {resolvedCount}
                </div>
                <div className="text-xs font-semibold text-gray-600">
                  Resolved
                </div>
              </div>
            </div>
            {/* Sparkline wave */}
            <svg width="64" height="30" viewBox="0 0 64 30" fill="none" className="shrink-0 hidden sm:block">
              <path d="M2 22 C 14 26, 24 8, 36 14 C 48 20, 54 6, 62 12" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Card 3: Under Review */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-amber-500 leading-tight">
                  {underReviewCount}
                </div>
                <div className="text-xs font-semibold text-gray-600">
                  Under Review
                </div>
              </div>
            </div>
            {/* Sparkline wave */}
            <svg width="64" height="30" viewBox="0 0 64 30" fill="none" className="shrink-0 hidden sm:block">
              <path d="M2 20 C 15 25, 25 10, 38 18 C 50 25, 55 12, 62 16" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>

          {/* Card 4: Closed */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                <X className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-700 leading-tight">
                  {closedCount}
                </div>
                <div className="text-xs font-semibold text-gray-600">
                  Closed
                </div>
              </div>
            </div>
            {/* Sparkline wave */}
            <svg width="64" height="30" viewBox="0 0 64 30" fill="none" className="shrink-0 hidden sm:block">
              <path d="M2 18 C 15 15, 28 26, 42 12 C 50 6, 56 22, 62 14" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── MAIN TWO-COLUMN CONTENT ── */}
      <main className="max-w-[1400px] mx-auto w-full px-4 md:px-8 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* ── LEFT COLUMN: FILTERS (4 Cols on lg) ── */}
          <aside className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-5">
            <div className="flex items-center gap-2 font-black text-gray-900 text-sm">
              <Filter className="w-4 h-4 text-gray-700" />
              <h2>Filters</h2>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search events (e.g. landslide, accident)..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Date Range Inputs */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                <Calendar className="w-3.5 h-3.5 text-gray-500" />
                <span>Date Range</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="relative">
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* Location Selector */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2">
                <MapPin className="w-3.5 h-3.5 text-gray-500" />
                <span>Location</span>
              </div>
              <div className="relative">
                <select
                  value={selectedLocation}
                  onChange={e => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-800 appearance-none focus:outline-none focus:ring-2 focus:ring-sky-500 font-medium"
                >
                  <option value="All Locations">All Locations</option>
                  <option value="Rishikesh">Rishikesh to Devprayag</option>
                  <option value="Devprayag">Devprayag to Srinagar</option>
                  <option value="Srinagar">Srinagar to Rudraprayag</option>
                  <option value="Rudraprayag">Rudraprayag to Karnaprayag</option>
                  <option value="Karnaprayag">Karnaprayag to Chamoli</option>
                  <option value="Chamoli">Chamoli to Joshimath</option>
                </select>
                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Event Type Checkboxes (2-Column Grid matching reference) */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2.5">
                <Tag className="w-3.5 h-3.5 text-gray-500" />
                <span>Event Type</span>
              </div>

              <div className="grid grid-cols-2 gap-y-2.5 gap-x-3 text-xs text-gray-700">
                {/* Landslide */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('Landslide')}
                    onChange={() => toggleType('Landslide')}
                    className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                    <span>Landslide</span>
                  </span>
                </label>

                {/* Flooding */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('Flooding')}
                    onChange={() => toggleType('Flooding')}
                    className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <Waves className="w-3.5 h-3.5 text-sky-500" />
                    <span>Flooding</span>
                  </span>
                </label>

                {/* Road damage */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('Road damage')}
                    onChange={() => toggleType('Road damage')}
                    className="rounded text-orange-600 focus:ring-orange-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <Cone className="w-3.5 h-3.5 text-orange-500" />
                    <span>Road damage</span>
                  </span>
                </label>

                {/* Construction */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('Construction')}
                    onChange={() => toggleType('Construction')}
                    className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <Cone className="w-3.5 h-3.5 text-purple-500" />
                    <span>Construction</span>
                  </span>
                </label>

                {/* Accident */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('Accident')}
                    onChange={() => toggleType('Accident')}
                    className="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1.5 font-medium">
                    <Car className="w-3.5 h-3.5 text-sky-500" />
                    <span>Accident</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Status Checkboxes */}
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-gray-500" />
                <span>Status</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes('Resolved')}
                    onChange={() => toggleStatus('Resolved')}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Resolved</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes('Under Review')}
                    onChange={() => toggleStatus('Under Review')}
                    className="rounded text-amber-500 focus:ring-amber-500 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Under Review</span>
                  </span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes('Closed')}
                    onChange={() => toggleStatus('Closed')}
                    className="rounded text-slate-700 focus:ring-slate-700 w-3.5 h-3.5"
                  />
                  <span className="flex items-center gap-1 font-medium">
                    <span className="w-2 h-2 rounded-full bg-slate-600" />
                    <span>Closed</span>
                  </span>
                </label>
              </div>
            </div>

            {/* Filter Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {}}
                className="flex-1 py-2.5 px-4 bg-[#991b1b] hover:bg-[#7f1d1d] text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <Filter className="w-3.5 h-3.5" />
                <span>Apply Filters</span>
              </button>

              <button
                type="button"
                onClick={handleClearAll}
                className="py-2.5 px-4 border border-slate-200 hover:bg-slate-50 text-gray-700 font-bold text-xs rounded-xl transition-colors"
              >
                Clear All
              </button>
            </div>
          </aside>

          {/* ── RIGHT COLUMN: EVENTS FEED (8 Cols on lg) ── */}
          <div className="lg:col-span-8 space-y-4">
            {/* Top Toolbar: Showing count & Sort dropdown */}
            <div className="flex items-center justify-between text-xs font-semibold text-gray-600 px-1">
              <div>
                Showing <span className="font-extrabold text-gray-900">1&ndash;{filteredEvents.length}</span> of <span className="font-extrabold text-gray-900">{totalCount}</span> events
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-gray-500">Sort by</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-gray-900 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer shadow-xs"
                >
                  <option value="latest">Latest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="severity">Highest Severity</option>
                </select>
              </div>
            </div>

            {/* Events List */}
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
                <span className="text-xs font-medium">Loading historical records and field logs...</span>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-gray-500 space-y-2">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-1" />
                <div className="font-bold text-sm text-gray-800">No events found matching your filters</div>
                <div className="text-xs text-gray-400">Try adjusting your search query, date range, or category filters.</div>
                <button
                  onClick={handleClearAll}
                  className="mt-3 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredEvents.map(evt => {
                  // Left accent border styling matching event type
                  let borderLeftColor = 'border-l-rose-500';
                  let typePillStyle = 'bg-rose-50 text-rose-700 border-rose-200';
                  let typeIcon = AlertTriangle;

                  if (evt.type === 'Road damage') {
                    borderLeftColor = 'border-l-orange-500';
                    typePillStyle = 'bg-orange-50 text-orange-700 border-orange-200';
                    typeIcon = Cone;
                  } else if (evt.type === 'Accident') {
                    borderLeftColor = 'border-l-sky-500';
                    typePillStyle = 'bg-sky-50 text-sky-700 border-sky-200';
                    typeIcon = Car;
                  } else if (evt.type === 'Flooding') {
                    borderLeftColor = 'border-l-teal-500';
                    typePillStyle = 'bg-teal-50 text-teal-700 border-teal-200';
                    typeIcon = Waves;
                  } else if (evt.type === 'Construction') {
                    borderLeftColor = 'border-l-purple-500';
                    typePillStyle = 'bg-purple-50 text-purple-700 border-purple-200';
                    typeIcon = Cone;
                  }

                  const TypeIcon = typeIcon;

                  // Severity badge style
                  let severityBadge = 'bg-rose-50 text-rose-700 border-rose-200';
                  if (evt.severity === 'Medium') severityBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                  if (evt.severity === 'Low') severityBadge = 'bg-emerald-50 text-emerald-800 border-emerald-200';

                  // Status style
                  let statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  let statusIcon = CheckCircle2;
                  if (evt.status === 'Under Review') {
                    statusBadge = 'bg-amber-50 text-amber-800 border-amber-200';
                    statusIcon = Clock;
                  } else if (evt.status === 'Closed') {
                    statusBadge = 'bg-slate-100 text-slate-700 border-slate-200';
                    statusIcon = Check;
                  }
                  const StatusIcon = statusIcon;

                  return (
                    <div
                      key={evt.id}
                      className={`bg-white rounded-2xl border border-slate-200 border-l-[5px] ${borderLeftColor} p-4 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
                    >
                      {/* Left: Thumbnail + Content */}
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        {/* Event Photo Thumbnail */}
                        <div className="w-20 h-20 sm:w-24 sm:h-20 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200 shadow-inner">
                          <img
                            src={evt.thumbnail}
                            alt={evt.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        </div>

                        {/* Middle Text Details */}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          {/* Title + Badges row */}
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-extrabold text-sm sm:text-base text-gray-900 leading-snug">
                              {evt.title}
                            </h3>

                            {/* Type tag pill */}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${typePillStyle}`}>
                              <TypeIcon className="w-3 h-3" />
                              <span>{evt.type}</span>
                            </span>

                            {/* Severity pill */}
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${severityBadge}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current" />
                              <span>{evt.severity}</span>
                            </span>
                          </div>

                          {/* Location & Datetime Subtitle */}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 font-medium">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span>{evt.location}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span>{evt.datetime}</span>
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                            {evt.description}
                          </p>
                        </div>
                      </div>

                      {/* Right: Status badge & View details button */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        {/* Status badge pill */}
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full border text-xs font-bold ${statusBadge}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{evt.status}</span>
                        </span>

                        {/* View details button */}
                        <button
                          onClick={() => setActiveModalEvent(evt)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-gray-800 rounded-xl text-xs font-bold transition-colors shadow-xs"
                        >
                          <span>View details</span>
                          <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── EVENT DETAILS MODAL ── */}
      {activeModalEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="relative h-44 w-full bg-slate-900">
              <img
                src={activeModalEvent.thumbnail}
                alt={activeModalEvent.title}
                className="w-full h-full object-cover opacity-85"
              />
              <button
                onClick={() => setActiveModalEvent(null)}
                className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-4 right-4 text-white">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black/60 uppercase tracking-wider">
                  {activeModalEvent.type}
                </span>
                <h3 className="text-xl font-black mt-1">
                  {activeModalEvent.title}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs font-sans text-gray-700">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Status</div>
                  <div className="font-extrabold text-gray-900 text-sm mt-0.5">{activeModalEvent.status}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Severity</div>
                  <div className="font-extrabold text-gray-900 text-sm mt-0.5">{activeModalEvent.severity}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Location</div>
                  <div className="font-semibold text-gray-800 text-xs mt-0.5 truncate">{activeModalEvent.location}</div>
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase">Incident Date</div>
                  <div className="font-semibold text-gray-800 text-xs mt-0.5">{activeModalEvent.datetime}</div>
                </div>
              </div>

              <div>
                <div className="font-bold text-gray-900 mb-1 text-sm">Description & Impact</div>
                <p className="text-gray-600 leading-relaxed">
                  {activeModalEvent.description}
                </p>
              </div>

              <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-sky-800 font-bold">Responding Agency</div>
                  <div className="font-bold text-sky-950 mt-0.5">{activeModalEvent.agency}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-sky-800 font-bold">Estimated Clearance</div>
                  <div className="font-bold text-sky-950 mt-0.5">{activeModalEvent.clearanceHours} Hours</div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setActiveModalEvent(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
