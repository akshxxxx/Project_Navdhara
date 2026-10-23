import React, { useState, useEffect } from 'react';
import { X, CloudRain, RotateCcw, Check, Zap, Info, ShieldAlert, Sparkles, Sliders } from 'lucide-react';

const PRESETS = [
  { label: 'Live API', value: -1, desc: 'Real-time meteorology via Open-Meteo API' },
  { label: 'Dry (0 mm)', value: 0, desc: 'Dry cap active: max risk 0.49 (Moderate)' },
  { label: 'Dry Cap (15 mm)', value: 15, desc: 'Linear safety ramp lower bound' },
  { label: 'Moderate (35 mm)', value: 35, desc: 'Full dynamic physical model calculation' },
  { label: 'Severe (85 mm)', value: 85, desc: 'Slope pore-pressure escalation (4 High/Severe)' },
  { label: 'Monsoon Downpour (100 mm)', value: 100, desc: 'Widespread warnings (16/18 High/Severe)' },
  { label: 'Extreme rainfall (140 mm / 3 days)', value: 140, desc: '10 Very High, all others High' },
  { label: 'Peak Storm (150 mm)', value: 150, desc: 'Corridor-wide saturation emergency' },
];

export function RainSimulationModal({
  isOpen,
  onClose,
  currentRainMm,
  onApply,
  onReset,
}) {
  const [sliderValue, setSliderValue] = useState(
    currentRainMm != null ? currentRainMm : -1
  );

  useEffect(() => {
    setSliderValue(currentRainMm != null ? currentRainMm : -1);
  }, [currentRainMm, isOpen]);

  if (!isOpen) return null;

  const isLive = sliderValue === -1 || sliderValue === null;
  const isOverridden = !isLive;

  const activePreset = PRESETS.find(p => p.value === sliderValue);

  const handleApply = () => {
    if (sliderValue === -1) {
      onReset();
    } else {
      onApply(Number(sliderValue));
    }
    onClose();
  };

  const handleReset = () => {
    setSliderValue(-1);
    onReset();
    onClose();
  };

  const handlePresetClick = (val) => {
    setSliderValue(val);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Simulation card matching backend UI exactly */}
      <div
        className="w-full max-w-[620px] bg-[#0c1821] text-white border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden font-sans relative"
        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)' }}
      >
        {/* Top Header */}
        <div className="p-5 md:p-6 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <CloudRain className="w-4 h-4" />
              </div>
              <h2 className="text-sm md:text-base font-black tracking-wider uppercase font-condensed text-slate-100">
                Rainfall Simulation Override
              </h2>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] md:text-xs text-[#38bdf8] bg-sky-950/80 border border-sky-500/40 px-2.5 py-1 rounded-md tracking-tight">
                ?SIMULATE_RAIN_MM=...
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Inject arbitrary 72h rainfall across all 18 segments to test hydraulic triggers and the{' '}
            <code className="bg-slate-800 text-sky-300 px-1.5 py-0.5 rounded font-mono text-[11px] border border-slate-700">
              DRY_CAP_MM = 25.0
            </code>{' '}
            safety cap.
          </p>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6 space-y-5">
          {/* Slider Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" /> Rainfall Injection
              </span>
              <span className="font-mono font-bold text-sm md:text-base text-[#38bdf8]">
                {isLive ? 'Live Weather (No Override)' : `${sliderValue} mm (Overridden)`}
              </span>
            </div>

            {/* Slider */}
            <div className="relative pt-2">
              <input
                type="range"
                min="-1"
                max="180"
                step="1"
                value={sliderValue}
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-[#0284c7] focus:outline-none"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>Live API (-1)</span>
                <span>Dry (0 mm)</span>
                <span>Dry Cap (25 mm)</span>
                <span>Monsoon (100 mm)</span>
                <span>Peak (180 mm)</span>
              </div>
            </div>
          </div>

          {/* Quick Presets matching screenshot */}
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Quick Presets
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => {
                const isSelected = sliderValue === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => handlePresetClick(preset.value)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all text-left ${
                      isSelected
                        ? 'bg-[#0284c7]/25 border-[#38bdf8] text-[#38bdf8] font-bold shadow-[0_0_12px_rgba(56,189,248,0.25)] ring-1 ring-[#38bdf8]'
                        : 'bg-[#1e293b]/70 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white hover:bg-[#1e293b]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preset Context Card */}
          {activePreset && (
            <div className="bg-[#111e2e] border border-sky-900/50 rounded-xl p-3 text-xs text-slate-300 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-sky-300">{activePreset.label}: </span>
                <span>{activePreset.desc}</span>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleApply}
              className="w-full sm:flex-1 bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs md:text-sm py-2.5 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer border border-sky-400/30"
            >
              <Check className="w-4 h-4" /> Apply Simulation to Active View
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="w-full sm:w-auto bg-[#1e293b] hover:bg-[#334155] border border-white/10 text-slate-200 font-semibold text-xs md:text-sm py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4 text-slate-400" /> Reset to Live Weather
            </button>
          </div>

          {/* Resilience & Cache details from backend spec */}
          <div className="border-t border-white/10 pt-3 text-[11px] text-slate-400 space-y-1">
            <div className="flex justify-between">
              <span>Hydraulic Thresholds:</span>
              <span className="font-mono text-slate-300">RAIN_REF = 150 mm | DRY_CAP = 25 mm</span>
            </div>
            <div className="flex justify-between">
              <span>Active Meteorology Feed:</span>
              <span className="font-mono text-sky-400">
                {isLive ? 'Open-Meteo 18-Segment Hourly Batch' : `Simulated Synthetic Storm (${sliderValue} mm)`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
