import React, { useState, useEffect } from 'react';
import {
  Phone, ShieldAlert, AlertTriangle, Shield, Mountain,
  Clock, Check, Lightbulb, MapPin, ArrowRight,
  WifiOff, HeartPulse
} from 'lucide-react';
import { fetchOfflinePack } from '../api/client';

export const Emergency = () => {
  const [packData, setPackData] = useState(null);
  const [cached, setCached] = useState(false);

  useEffect(() => {
    async function loadPack() {
      try {
        const storedEtag = localStorage.getItem('offline_pack_etag');
        const result = await fetchOfflinePack(storedEtag);
        if (result?.notModified) {
          const stored = localStorage.getItem('offline_pack_data');
          if (stored) setPackData(JSON.parse(stored));
          setCached(true);
        } else if (result?.data) {
          setPackData(result.data);
          localStorage.setItem('offline_pack_data', JSON.stringify(result.data));
          if (result.etag) localStorage.setItem('offline_pack_etag', result.etag);
        }
      } catch {
        const stored = localStorage.getItem('offline_pack_data');
        if (stored) {
          setPackData(JSON.parse(stored));
          setCached(true);
        }
      }
    }
    loadPack();
  }, []);

  // Primary Emergency Services matching design
  const emergencyServices = [
    {
      id: 'national',
      title: 'National Emergency Helpline',
      subtitle: 'For any emergency situation',
      number: '112',
      displayNumber: '112',
      tel: '112',
      bg: 'bg-[#f0f9ff]',
      border: 'border-sky-100',
      iconBg: 'bg-sky-100 text-sky-600',
      numColor: 'text-sky-700',
      btnBg: 'bg-sky-100 hover:bg-sky-200 text-sky-700',
      icon: Phone,
    },
    {
      id: 'sdma',
      title: 'State Disaster Management (SDMA Uttarakhand)',
      subtitle: 'For natural disasters, landslides, floods',
      number: '1070',
      displayNumber: '1070',
      tel: '1070',
      bg: 'bg-[#fef2f2]',
      border: 'border-rose-100',
      iconBg: 'bg-rose-100 text-rose-600',
      numColor: 'text-rose-800',
      btnBg: 'bg-rose-100 hover:bg-rose-200 text-rose-800',
      icon: AlertTriangle,
    },
    {
      id: 'police',
      title: 'Highway Police Control Room',
      subtitle: 'For road accidents, traffic help',
      number: '1090',
      displayNumber: '1090',
      tel: '1090',
      bg: 'bg-[#fffbeb]',
      border: 'border-amber-100',
      iconBg: 'bg-amber-100 text-amber-700',
      numColor: 'text-amber-800',
      btnBg: 'bg-amber-100 hover:bg-amber-200 text-amber-800',
      icon: Shield,
    },
    {
      id: 'bro',
      title: 'Border Roads Organisation (BRO) Control Room',
      subtitle: 'For road clearance, blocked routes',
      number: '0135-2744064',
      displayNumber: '0135-2744064',
      tel: '01352744064',
      bg: 'bg-[#f0fdf4]',
      border: 'border-emerald-100',
      iconBg: 'bg-emerald-100 text-emerald-700',
      numColor: 'text-emerald-800',
      btnBg: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800',
      icon: Mountain,
    },
  ];

  return (
    <div className="flex-1 w-full bg-slate-50 flex flex-col font-sans pb-16">
      {/* ── TOP HERO BANNER ── */}
      <section className="relative bg-[#0c1821] text-white overflow-hidden shadow-lg border-b border-white/10">
        {/* Mountain Highway Backdrop matching design */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=2200&q=80')",
          }}
        />
        {/* Gradients to match the lighting and left-side readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b1720]/95 via-[#0b1720]/80 to-transparent pointer-events-none" />

        <div className="relative max-w-[1400px] mx-auto px-4 md:px-8 py-8 md:py-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          {/* Left Column */}
          <div className="space-y-3 max-w-xl">
            <div className="flex items-center gap-2 text-rose-500 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              <span>Emergency Assistance</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              Help is just a <span className="text-rose-500">call away</span>
            </h1>

            <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
              In case of any emergency on NH-7, contact the relevant authorities immediately. Stay safe, stay informed.
            </p>

            <div className="pt-1">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/15 text-white/90 text-xs font-semibold backdrop-blur-sm shadow-sm">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                NH-7 | Uttarakhand
              </span>
            </div>
          </div>

          {/* Right Column: Hero 112 Card */}
          <div className="w-full lg:max-w-[440px]">
            <div className="bg-gradient-to-br from-[#991b1b] to-[#7f1d1d] text-white p-5 md:p-6 rounded-2xl shadow-2xl border border-red-500/30">
              <div className="flex items-center gap-4">
                {/* Large circular phone icon */}
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-900/90 border border-red-400/30 flex items-center justify-center shrink-0 shadow-inner">
                  <Phone className="w-6 h-6 md:w-7 md:h-7 fill-white text-white" />
                </div>

                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-red-200 uppercase tracking-wider">
                    National Emergency Number
                  </div>
                  <div className="text-4xl md:text-5xl font-black text-white tracking-tight leading-none my-1">
                    112
                  </div>
                  <div className="text-[11px] text-red-200/90 font-medium">
                    Police &nbsp;|&nbsp; Ambulance &nbsp;|&nbsp; Fire &nbsp;|&nbsp; Disaster
                  </div>
                </div>
              </div>

              {/* Call 112 Now button */}
              <a
                href="tel:112"
                className="mt-5 w-full py-2.5 px-4 bg-white hover:bg-slate-100 text-red-800 font-bold text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 group"
              >
                <Phone className="w-4 h-4 fill-red-800 text-red-800 group-hover:scale-110 transition-transform" />
                <span>Call 112 Now</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── MAIN CONTENT CONTAINER ── */}
      <main className="max-w-[1400px] mx-auto w-full px-4 md:px-8 pt-8 space-y-6">
        {/* Offline cache notice if applicable */}
        {cached && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg w-fit">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Emergency directory loaded from offline cache</span>
          </div>
        )}

        {/* Section Header */}
        <div className="flex items-center justify-between pb-1 border-b border-transparent">
          <div className="flex items-center gap-2.5">
            <span className="w-5 h-1.5 rounded-full bg-rose-600 inline-block" />
            <h2 className="text-xl md:text-2xl font-black text-gray-900">
              Emergency Services
            </h2>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
            <Clock className="w-4 h-4" />
            <span>Available 24 × 7</span>
          </div>
        </div>

        {/* 4 Emergency Services Grid (2x2) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {emergencyServices.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                className={`${service.bg} border ${service.border} rounded-2xl p-5 flex items-center justify-between gap-4 shadow-sm hover:shadow-md transition-shadow`}
              >
                {/* Left info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl ${service.iconBg} flex items-center justify-center shrink-0`}>
                    <Icon className="w-6 h-6 md:w-7 md:h-7" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm md:text-base text-gray-900 leading-snug">
                      {service.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {service.subtitle}
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-200">
                      24 × 7
                    </span>
                  </div>
                </div>

                {/* Right Call Action */}
                <div className="flex flex-col items-end shrink-0">
                  <div className={`flex items-center gap-1.5 font-black text-lg md:text-xl ${service.numColor}`}>
                    <Phone className="w-4 h-4" />
                    <span>{service.displayNumber}</span>
                  </div>

                  <a
                    href={`tel:${service.tel}`}
                    className={`mt-2.5 inline-flex items-center gap-1 text-xs font-bold ${service.btnBg} px-3.5 py-1.5 rounded-full transition-colors shadow-xs`}
                  >
                    <span>Call Now</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Two Cards Grid: When to Call? & Safety Tips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Card 1: When to Call? */}
          <div className="bg-[#fef2f2]/60 border border-rose-200/70 rounded-2xl p-5 md:p-6 shadow-sm space-y-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <h3 className="font-black text-base text-gray-900">
                When to Call?
              </h3>
            </div>

            <ul className="space-y-2.5 text-xs text-gray-700 font-medium">
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-rose-800 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Road accidents or vehicle breakdown</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-rose-800 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Landslides, rockfalls or blocked roads</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-rose-800 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Medical emergency or need for ambulance</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-rose-800 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Any threat to life or property</span>
              </li>
            </ul>
          </div>

          {/* Card 2: Safety Tips */}
          <div className="bg-[#f0f9ff]/70 border border-sky-200/70 rounded-2xl p-5 md:p-6 shadow-sm space-y-3.5">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-sky-600" />
              <h3 className="font-black text-base text-gray-900">
                Safety Tips
              </h3>
            </div>

            <ul className="space-y-2.5 text-xs text-gray-700 font-medium">
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Keep emergency numbers saved</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Share your current location while calling</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Provide clear and accurate information</span>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </div>
                <span>Stay at a safe place until help arrives</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Backend Corridor Hospital Directory (collapsible / auxiliary if available) */}
        {packData?.segments?.length > 0 && (
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-600" />
                <h3 className="font-bold text-sm text-gray-900">
                  Nearest Hospital Along Your Stretch
                </h3>
              </div>
              <span className="text-[11px] text-gray-400">
                Verified NH-7 Medical Assistance
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {packData.segments.slice(0, 6).map((s, idx) => (
                <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                  <div className="font-bold text-gray-900 truncate">{s.name}</div>
                  <div className="text-gray-500 text-[11px] mt-0.5">{s.nearest_hospital || 'District Hospital'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
