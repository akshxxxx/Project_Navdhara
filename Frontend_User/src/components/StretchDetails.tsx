import {
  ArrowLeft,
  CircleAlert,
  Clock,
  CloudRain,
  Construction,
  Flag,
  Mountain,
  Radio,
  Route,
  Users,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LEVELS } from '@/domain/levels';
import { planParamsFor, RAIN_REF_MM, spokenAdvisory, verdictSentence, type Stretch } from '@/domain/stretch';
import { whenLabel } from '@/domain/time';

import { Disclaimer, Notice, Stat } from './ui';

/** Reads the advisory aloud with the browser's own speech engine (no network needed) */
function useSpeech(text: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  // Stop when the text changes (another stretch) or the panel closes
  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
      setSpeaking(false);
    },
    [text, supported],
  );
  const toggle = () => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-IN';
    u.rate = 0.95;
    const voice = synth.getVoices().find((v) => v.lang === 'en-IN') ?? synth.getVoices().find((v) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  return { supported, speaking, toggle };
}

function Factor({ icon: Icon, label, value, display }: { icon: LucideIcon; label: string; value: number; display: string }) {
  return (
    <div className="factor">
      <div className="factor-head">
        <Icon size={20} aria-hidden />
        <span>{label}</span>
        <span className="val">{display}</span>
      </div>
      <div className="bar" aria-hidden>
        <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
    </div>
  );
}

const mm = (v: number | null) => (v == null ? '—' : String(Math.round(v)));

export function StretchDetails({ stretch: s, onBack }: { stretch: Stretch; onBack?: () => void }) {
  const navigate = useNavigate();
  const m = LEVELS[s.level];
  const speech = useSpeech(spokenAdvisory(s));
  const length = Math.abs(s.kmEnd - s.kmStart);
  const plan = planParamsFor(s);
  const updated = whenLabel(s.updatedAt);

  return (
    <div className="stack" style={{ gap: 22 }}>
      {onBack ? (
        <button type="button" className="link-back" onClick={onBack}>
          <ArrowLeft size={20} aria-hidden /> All stretches
        </button>
      ) : null}
      <div>
        <h2 style={{ fontSize: 34 }}>{s.name}</h2>
        <p className="muted" style={{ marginTop: 6, fontSize: 17 }}>
          NH-7 · km {Math.round(s.kmStart)} to {Math.round(s.kmEnd)} · {length.toFixed(1)} km
        </p>
      </div>

      <div className="verdict-box" style={{ background: m.tint }}>
        <div className="verdict-head">
          <CircleAlert size={44} color={m.color} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="eyebrow" style={{ color: m.ink }}>
              {s.level === 'closed' ? 'Official closure' : `${m.label} risk`}
            </div>
            <div className="title" style={{ color: m.ink }}>
              {m.verdict}
            </div>
          </div>
          {speech.supported ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={speech.toggle} aria-pressed={speech.speaking}>
              {speech.speaking ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
              {speech.speaking ? 'Stop' : 'Listen'}
            </button>
          ) : null}
        </div>
        <p style={{ marginTop: 14, fontSize: 17 }}>{verdictSentence(s)}</p>
      </div>

      {s.node?.reason ? (
        <Notice tone="warn" icon={Radio} title="Slope sensor alert">
          {s.node.reason}
        </Notice>
      ) : null}
      {s.closure && s.closure.status !== 'closed' ? (
        <Notice
          tone="warn"
          icon={Construction}
          title={s.closure.status === 'one_way' ? 'One-way traffic' : 'Traffic restricted'}
        >
          {s.closure.reason} · {s.closure.source}
        </Notice>
      ) : null}

      <div>
        <h3>Why this stretch is risky</h3>
        <Factor
          icon={CloudRain}
          label="Rain in the last 3 days"
          value={s.rain3d == null ? 0 : s.rain3d / RAIN_REF_MM}
          display={s.rain3d == null ? '—' : `${Math.round(s.rain3d)} mm`}
        />
        <Factor
          icon={Mountain}
          label="Steep, unstable terrain"
          value={s.terrain ?? 0}
          display={s.terrain == null ? '—' : `${Math.round(s.terrain * 100)}%`}
        />
        <Factor
          icon={Users}
          label="Verified driver reports (24 h)"
          value={Math.min(s.reports24h, 3) / 3}
          display={String(s.reports24h)}
        />
        <p className="small muted" style={{ marginTop: 10 }}>
          The rain bar is full at {RAIN_REF_MM} mm in 3 days. Terrain is how this stretch ranks for landslide-prone ground
          on NH-7. Reports are verified ones from the last 24 hours.
        </p>
      </div>

      <div>
        <h3>Rainfall</h3>
        <div className="stat-row">
          {s.rain24h != null ? (
            <Stat label="Last 24 h" value={mm(s.rain24h)} unit="mm" />
          ) : (
            <Stat label="Last 3 days" value={mm(s.rain3d)} unit={s.rain3d == null ? undefined : 'mm'} />
          )}
          <Stat label="Next 24 h" value={mm(s.next24h)} unit={s.next24h == null ? undefined : 'mm'} />
          <Stat label="Next 72 h" value={mm(s.next72h)} unit={s.next72h == null ? undefined : 'mm'} />
        </div>
        {s.next24h == null && s.next72h == null ? (
          <p className="small muted" style={{ marginTop: 8 }}>
            The server has no hourly forecast for this stretch right now.
          </p>
        ) : null}
        <p className="small muted row" style={{ marginTop: 10, gap: 8 }}>
          <Clock size={16} aria-hidden />
          {updated ? `Updated ${updated} IST` : 'Update time unknown'} · refreshes every 5 min
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={() => navigate(`/plan?from=${encodeURIComponent(plan.from)}&to=${encodeURIComponent(plan.to)}`)}
        >
          <Route size={20} aria-hidden /> Check a trip
        </button>
        <button
          type="button"
          className="btn btn-outline"
          style={{ flex: 1 }}
          onClick={() => navigate(`/reports?stretch=${s.id}`)}
        >
          <Flag size={20} aria-hidden /> Report a problem
        </button>
      </div>

      <Disclaimer />
    </div>
  );
}
