import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  AlertTriangle, Camera, MapPin, Share2, Users, Shield,
  CheckCircle, PhoneCall, ChevronRight,
  Upload, Check, AlertCircle, Crosshair, Layers, Loader2,
  Navigation, Eye, Clock, ArrowRight
} from 'lucide-react';
import { postFieldReport, fetchFieldReports, fetchRiskMap, postAdminValidateReport } from '../api/client';
import { adaptSegment } from '../api/adapters';
import { InteractiveMap } from '../components/InteractiveMap';
import { SEGMENTS, TOWNS } from '../data/segments';
import { photoForDescription } from '../data/landslidePhotos';

const REPORT_INCIDENT_TYPES = [
  { id: 'landslide', label: 'Landslide', icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
  { id: 'blockage', label: 'Road Blockage', icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
  { id: 'rockfall', label: 'Rockfall', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'damaged_road', label: 'Damaged Road', icon: AlertTriangle, color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200' },
  { id: 'flooding', label: 'Flooding / Water', icon: Navigation, color: 'text-sky-500', bg: 'bg-sky-50', border: 'border-sky-200' },
  { id: 'other', label: 'Other', icon: AlertCircle, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
];

export const Report = () => {
  const ctx = useOutletContext() || {};
  const demo = ctx.demo || {};

  // Form State
  const [activeTab, setActiveTab] = useState('incident'); // 'incident' | 'condition' | 'other'
  const [selectedType, setSelectedType] = useState('landslide');
  const [locationCoords, setLocationCoords] = useState({ lat: 30.2223, lng: 78.7844 }); // Default near Srinagar
  const [locationName, setLocationName] = useState('Srinagar, km 62');
  const [kmMarker, setKmMarker] = useState('62');
  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [agreedTerms, setAgreedTerms] = useState(true);

  // Submission Status
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [locatingUser, setLocatingUser] = useState(false);

  // Backend Data State
  const [segments, setSegments] = useState([]);
  const [fieldReports, setFieldReports] = useState([]);
  const [recentFilter, setRecentFilter] = useState('all');
  const [loadingReports, setLoadingReports] = useState(true);
  const [verifying, setVerifying] = useState(null); // report id being verified / rejected
  const [verifyMsg, setVerifyMsg] = useState(null);

  const mapRef = useRef(null);

  // Load all segments for map display
  const loadCorridorData = useCallback(async () => {
    try {
      const riskData = await fetchRiskMap({ simulateRainMm: demo.simulateRainMm });
      const adapted = (riskData.segments || []).map(adaptSegment);
      const merged = adapted.map(seg => {
        const staticSeg = SEGMENTS.find(s => s.id === seg.id);
        return staticSeg ? { ...staticSeg, ...seg } : seg;
      });
      merged.sort((a, b) => (a.seq || 0) - (b.seq || 0));
      setSegments(merged);
    } catch (e) {
      console.warn('Could not preload corridor:', e);
    }
  }, [demo.simulateRainMm]);

  // Load real field reports from backend GET /field-reports
  const loadReports = useCallback(async () => {
    try {
      setLoadingReports(true);
      const data = await fetchFieldReports();
      setFieldReports(Array.isArray(data) ? data : (data.reports || []));
    } catch (e) {
      console.warn('Could not load field reports:', e);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    loadCorridorData();
    loadReports();
  }, [loadCorridorData, loadReports]);

  // Geolocation handler
  const handleAutoLocation = () => {
    setLocatingUser(true);
    setSubmitError('');
    if (!navigator.geolocation) {
      setLocationCoords({ lat: 30.2223, lng: 78.7844 });
      setLocationName('Srinagar, km 62');
      setLocatingUser(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLocationCoords({ lat, lng });
        setLocationName(`Current GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setLocatingUser(false);
      },
      () => {
        // Fallback to closest NH-7 point
        setLocationCoords({ lat: 30.2223, lng: 78.7844 });
        setLocationName('Srinagar, km 62 (GPS Fallback)');
        setLocatingUser(false);
      },
      { timeout: 7000 }
    );
  };

  // Submit report to backend POST /field-report
  const handleSubmitReport = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setSubmitError('Please enter a description for the incident.');
      return;
    }
    if (!agreedTerms) {
      setSubmitError('Please agree to share this information to help make NH-7 safer.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const typeLabel = REPORT_INCIDENT_TYPES.find(t => t.id === selectedType)?.label || 'Incident';
      const fullDescription = kmMarker ? `[${typeLabel}] km ${kmMarker}: ${description}` : `[${typeLabel}] ${description}`;

      await postFieldReport({
        lat: locationCoords.lat || 30.2223,
        lng: locationCoords.lng || 78.7844,
        reporterName: reporterName.trim() || 'Traveller',
        description: fullDescription,
      });

      setSubmitSuccess(true);
      setDescription('');
      loadReports();
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (err) {
      console.error('Submit report error:', err);
      if (err.status === 422) {
        setSubmitError('Location is too far from the NH-7 highway corridor.');
      } else if (err.status === 409) {
        setSubmitError('A report at this location was recently submitted. Thank you!');
      } else if (err.status === 429) {
        setSubmitError('Too many reports submitted. Please wait a minute and try again.');
      } else {
        setSubmitError('Could not submit report. Please check server connection.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Format backend reports for display matching the UI design
  const formattedReports = useMemo(() => {
    return fieldReports.map((r, i) => {
      const isLandslide = r.description?.toLowerCase().includes('landslide');
      const isRockfall = r.description?.toLowerCase().includes('rockfall') || r.description?.toLowerCase().includes('stone');
      const isBlockage = r.description?.toLowerCase().includes('block') || r.description?.toLowerCase().includes('tree');
      const isFlooding = r.description?.toLowerCase().includes('water') || r.description?.toLowerCase().includes('flood');

      let tag = 'LANDSLIDE';
      let tagBg = 'bg-rose-600 text-white';
      let category = 'landslides';

      if (isRockfall) {
        tag = 'ROCKFALL';
        tagBg = 'bg-amber-400 text-slate-900';
        category = 'rockfalls';
      } else if (isBlockage) {
        tag = 'ROAD BLOCKAGE';
        tagBg = 'bg-orange-500 text-white';
        category = 'blockages';
      } else if (isFlooding) {
        tag = 'FLOODING';
        tagBg = 'bg-sky-500 text-white';
        category = 'flooding';
      }

      // Status pill: GET /field-reports sends pending / verified / rejected
      const status = (r.status || 'pending').toLowerCase();
      const statusPill = status === 'verified'
        ? { label: 'Verified', bg: 'bg-emerald-100 text-emerald-800' }
        : status === 'rejected'
          ? { label: 'Rejected', bg: 'bg-slate-200 text-slate-700' }
          : { label: 'Pending', bg: 'bg-amber-100 text-amber-800' };

      // Image thumbnail
      const thumbnail = r.photo_url || photoForDescription(r.description, i);

      return {
        ...r,
        tag,
        tagBg,
        category,
        isPending: status === 'pending',
        statusPill,
        thumbnail,
        timeFormatted: new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        dateFormatted: new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      };
    });
  }, [fieldReports]);

  // Filtered reports
  const displayedReports = useMemo(() => {
    if (recentFilter === 'all') return formattedReports;
    return formattedReports.filter(r => r.category === recentFilter);
  }, [formattedReports, recentFilter]);

  // Official decision: a verified report can raise its stretch's risk level one step on the map
  const handleVerify = async (id, newStatus) => {
    setVerifying(id);
    setVerifyMsg(null);
    try {
      await postAdminValidateReport({ reportId: id, status: newStatus });
      setFieldReports(rs => rs.map(r => r.id === id ? { ...r, status: newStatus } : r));
      setVerifyMsg({ ok: true, text: `Report #${id} ${newStatus === 'verified' ? 'verified' : 'rejected'}.` });
    } catch (e) {
      setVerifyMsg({ ok: false, text: e.status === 401 ? 'Admin key rejected: check the key on the Admin page.' : `Could not update report #${id}.` });
    } finally {
      setVerifying(null);
    }
  };

  return (
    <div className="flex-1 w-full bg-slate-100 flex flex-col font-sans">
      {/* ── TOP HERO BANNER ── */}
      <section className="relative bg-[#0c1821] text-white pt-6 pb-9 px-4 md:px-8 border-b border-white/10 overflow-hidden shadow-lg">
        <div
          className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-luminosity pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=80')"
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c1821] via-[#0c1821]/80 to-transparent pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <span className="text-[11px] font-bold tracking-widest uppercase text-sky-400">FIELD REPORTS</span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-1 text-white">
              Log and verify road reports
            </h1>
            <p className="text-gray-300 text-sm mt-0.5 max-w-xl">
              Record landslides, blockages and road damage from patrols and the public, then verify or reject each report. Only verified reports raise a stretch's risk on the map.
            </p>
          </div>

          {/* 4 Feature Badges on right matching design */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
              <Camera className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold leading-none">Take a photo</div>
                <div className="text-[10px] text-gray-300 leading-tight mt-0.5">Share what you see</div>
              </div>
            </div>

            <div
              onClick={handleAutoLocation}
              className="flex items-center gap-2.5 bg-white/10 hover:bg-white/15 cursor-pointer backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 transition-colors"
            >
              <MapPin className="w-5 h-5 text-sky-300 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold leading-none">Auto location</div>
                <div className="text-[10px] text-gray-300 leading-tight mt-0.5">We detect your location</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
              <Share2 className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold leading-none">Real-time sharing</div>
                <div className="text-[10px] text-gray-300 leading-tight mt-0.5">Helps authorities and travellers</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10">
              <Users className="w-5 h-5 text-emerald-400 shrink-0" />
              <div className="text-left">
                <div className="text-xs font-bold leading-none">Verify before it counts</div>
                <div className="text-[10px] text-gray-300 leading-tight mt-0.5">Only verified reports change risk</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3-COLUMN DASHBOARD LAYOUT ── */}
      <main className="max-w-[1400px] mx-auto w-full p-4 md:p-6 lg:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT: Submit a Report Form (4 cols on lg) ── */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-sky-600" />
              <h2 className="text-base font-extrabold text-gray-900">Submit a Report</h2>
            </div>

            {/* Top 3 Tabs: Report an Incident, Road Condition, Other */}
            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setActiveTab('incident')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeTab === 'incident' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Report an Incident
              </button>
              <button
                onClick={() => setActiveTab('condition')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeTab === 'condition' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Road Condition
              </button>
              <button
                onClick={() => setActiveTab('other')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  activeTab === 'other' ? 'bg-sky-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Other
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-4 text-xs font-sans">
              {/* Report Type Selector (6 grid options) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Report type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {REPORT_INCIDENT_TYPES.map((t) => {
                    const isSelected = selectedType === t.id;
                    const Icon = t.icon;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedType(t.id)}
                        className={`p-2.5 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                          isSelected
                            ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-gray-700'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-1 ${t.color}`} />
                        <span className="text-[11px] font-bold leading-tight">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Location Input with Auto-detect */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Location <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleAutoLocation}
                    disabled={locatingUser}
                    className="flex-1 py-2 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl font-semibold text-gray-700 flex items-center justify-center gap-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                    <span>{locatingUser ? 'Detecting GPS...' : 'Use my current location'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAutoLocation}
                    className="p-2 border border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100 text-gray-600"
                    title="Get location"
                  >
                    <Crosshair className="w-4 h-4 text-sky-600" />
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search location (e.g. Srinagar, km 62)"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* NH-7 Kilometre Input */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  NH-7 Kilometre (if known)
                </label>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-sky-500">
                  <span className="px-3 text-xs font-bold text-gray-500 bg-slate-100 border-r border-slate-200 py-2">
                    km
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. 62"
                    value={kmMarker}
                    onChange={(e) => setKmMarker(e.target.value)}
                    className="w-full px-3 py-2 bg-transparent text-xs text-gray-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">
                    Description <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-gray-400">{description.length}/300</span>
                </div>
                <textarea
                  rows={3}
                  maxLength={300}
                  placeholder="Describe what you see (e.g. landslide blocking both lanes, small rockfall, water on road, etc.)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
              </div>

              {/* Photos / Videos upload dropzone */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Photos / Videos
                </label>
                <div className="border-2 border-dashed border-slate-200 hover:border-sky-400 rounded-xl p-4 text-center cursor-pointer bg-slate-50 transition-colors">
                  <Upload className="w-6 h-6 text-sky-500 mx-auto mb-1" />
                  <div className="font-bold text-xs text-gray-800">Click to upload or drag and drop</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">Supports JPG, PNG, MP4 (Max 10 MB each)</div>
                </div>
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={agreedTerms}
                  onChange={(e) => setAgreedTerms(e.target.checked)}
                  className="mt-0.5 rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5"
                />
                <span>I agree to share this information to help make NH-7 safer.</span>
              </label>

              {/* Error & Success Messages */}
              {submitError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              {submitSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Report submitted successfully! Thank you for helping NH-7 travellers.</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                ) : (
                  <><Navigation className="w-4 h-4" /> Submit Report</>
                )}
              </button>
            </form>
          </div>

          {/* ── CENTER: Report Location on Map & Recent Reports (5 cols on lg) ── */}
          <div className="lg:col-span-5 space-y-6">

            {/* 1. Report Location on Map */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-extrabold text-gray-900">
                  <MapPin className="w-4 h-4 text-sky-600" />
                  <span>Report Location on Map</span>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Landslide
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-orange-500" /> Blockage
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-amber-400" /> Rockfall
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-sky-500" /> Flooding
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-gray-600">
                    <span className="w-2 h-2 rounded-full bg-slate-800" /> Other
                  </span>
                </div>
              </div>

              {/* Map Viewer */}
              <div className="relative h-[280px] w-full bg-slate-200 overflow-hidden">
                <InteractiveMap
                  ref={mapRef}
                  segments={segments}
                  selectedSegment={null}
                  onSelectSegment={(seg) => {
                    setLocationCoords(seg.coords?.[0] ? { lat: seg.coords[0][0], lng: seg.coords[0][1] } : locationCoords);
                    setLocationName(seg.nameEn || seg.name);
                    setKmMarker(seg.kmStart?.toFixed(0) || '');
                  }}
                />
              </div>
            </div>

            {/* 2. Recent Reports List */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-extrabold text-base text-gray-900">
                  <Clock className="w-4 h-4 text-sky-600" />
                  <h3>Recent Reports</h3>
                </div>
                <span className="text-[11px] font-semibold text-amber-700">
                  {formattedReports.filter(r => r.isPending).length} awaiting verification
                </span>
              </div>
              {verifyMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 ${verifyMsg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                  {verifyMsg.text}
                </div>
              )}

              {/* Filter pills matching design */}
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                {[
                  { id: 'all', label: 'All Reports' },
                  { id: 'landslides', label: 'Landslides' },
                  { id: 'blockages', label: 'Blockages' },
                  { id: 'rockfalls', label: 'Rockfalls' },
                  { id: 'damaged_road', label: 'Road Damage' },
                  { id: 'flooding', label: 'Flooding' },
                  { id: 'other', label: 'Other' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setRecentFilter(f.id)}
                    className={`px-3 py-1 rounded-full transition-colors ${
                      recentFilter === f.id
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-50 text-gray-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* List of cards */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {displayedReports.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500">
                    No reports found for this category.
                  </div>
                ) : (
                  displayedReports.map((report) => (
                    <div
                      key={report.id}
                      className="p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-16 h-14 rounded-lg overflow-hidden bg-slate-200 shrink-0">
                          <img
                            src={report.thumbnail}
                            alt="Incident"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide uppercase ${report.tagBg}`}>
                              {report.tag}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {report.dateFormatted}, {report.timeFormatted}
                            </span>
                          </div>

                          <div className="font-bold text-xs text-gray-900 truncate">
                            {report.description.split(': ')[1] || report.description.slice(0, 40)}
                          </div>
                          <div className="text-[10px] text-gray-500">
                            {report.reporter_name} • Location: {report.lat.toFixed(3)}, {report.lng.toFixed(3)}
                          </div>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${report.statusPill.bg}`}>
                          {report.statusPill.label}
                        </span>
                      </div>

                      {/* Bottom actions: official Verify / Reject (pending only), View on map */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 text-xs text-gray-500">
                        {report.isPending ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleVerify(report.id, 'verified')}
                              disabled={verifying === report.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-60"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Verify
                            </button>
                            <button
                              onClick={() => handleVerify(report.id, 'rejected')}
                              disabled={verifying === report.id}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-300 hover:bg-slate-100 text-gray-700 text-[11px] font-bold disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">{report.decision_notes || 'Decision recorded'}</span>
                        )}

                        <button
                          onClick={() => {
                            if (mapRef.current?.resetRoute) {
                              mapRef.current.resetRoute();
                            }
                          }}
                          className="text-[11px] font-bold text-sky-600 hover:text-sky-800 flex items-center gap-1"
                        >
                          View on map <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Reports Impact, How It Helps, Emergency & Guidelines (3 cols on lg) ── */}
          <div className="lg:col-span-3 space-y-6">

            {/* 1. Reports Impact Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-sky-600" />
                  <h3 className="font-extrabold text-sm text-gray-900">Reports Impact</h3>
                </div>
                <span className="text-[10px] text-gray-400 font-semibold">Last 30 days</span>
              </div>

              {/* 6 Stat tiles matching design */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">128</div>
                    <div className="text-[10px] text-gray-500">Total Reports</div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">32</div>
                    <div className="text-[10px] text-gray-500">Landslides</div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">41</div>
                    <div className="text-[10px] text-gray-500">Road Blockages</div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">28</div>
                    <div className="text-[10px] text-gray-500">Rockfalls</div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <Navigation className="w-4 h-4 text-sky-500 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">17</div>
                    <div className="text-[10px] text-gray-500">Flooding / Water</div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-slate-700 shrink-0" />
                  <div>
                    <div className="font-black text-sm text-gray-900">10</div>
                    <div className="text-[10px] text-gray-500">Other</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. How Your Report Helps */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2 font-extrabold text-sm text-gray-900">
                <Users className="w-4 h-4 text-sky-600" />
                <h3>What verification does</h3>
              </div>

              <div className="space-y-3 text-xs text-gray-700">
                <div className="flex items-start gap-2.5">
                  <Users className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-gray-900">Raises the stretch's risk</div>
                    <div className="text-[11px] text-gray-500">A recent verified report lifts its stretch one level on the map.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-gray-900">Fades over time</div>
                    <div className="text-[11px] text-gray-500">Its weight halves every 48 hours.</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-gray-900">Rejected reports change nothing</div>
                    <div className="text-[11px] text-gray-500">They stay in the list with your decision for the record.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Emergency Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 font-extrabold text-sm text-rose-600">
                <PhoneCall className="w-4 h-4 text-rose-600" />
                <h3>Emergency?</h3>
              </div>
              <p className="text-[11px] text-gray-600">
                For immediate help or in case of a serious incident, contact emergency services.
              </p>
              <Link
                to="/emergency"
                className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
              >
                Emergency Contacts <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* 4. Reporting Guidelines */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3.5">
              <div className="flex items-center gap-2 font-extrabold text-sm text-gray-900">
                <CheckCircle className="w-4 h-4 text-sky-600" />
                <h3>Reporting Guidelines</h3>
              </div>

              <ul className="space-y-2 text-xs text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Share clear photos or videos if possible</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Mention exact location or nearest landmark</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Provide short and accurate description</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Do not report while driving</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>Use only for genuine road safety issues</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
