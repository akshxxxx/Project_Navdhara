import type { Closure, NodeEscalation, RawSegment } from '@/api/types';
import { placeName, townName, tr } from '@/i18n';

import { segmentInfo, splitName, townByName } from './corridor';
import { LEVELS, levelFromText, levelLabel, levelVerdict, type LevelKey } from './levels';

export type LatLng = [number, number];

export interface Stretch {
  id: string;
  seq: number;
  name: string;
  from: string;
  to: string;
  kmStart: number;
  kmEnd: number;
  coords: LatLng[];
  level: LevelKey;
  score: number;
  terrain: number | null;
  rain3d: number | null;
  rain24h: number | null;
  next24h: number | null;
  next72h: number | null;
  reports24h: number;
  closure: Closure | null;
  node: NodeEscalation | null;
  hospitalKm: number | null;
  updatedAt: string;
}

// 3-day rain at which the backend's rain term saturates (Backend/app/config.py RAIN_REF_MM)
export const RAIN_REF_MM = 150;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function adaptSegment(raw: RawSegment): Stretch {
  const info = segmentInfo(raw.id);
  const name = raw.name || info?.name || raw.id;
  const [from, to] = splitName(name);
  const coords: LatLng[] =
    raw.subpoints && raw.subpoints.length > 1
      ? raw.subpoints.map((p) => [p[0], p[1]] as LatLng)
      : [
          [raw.start_lat, raw.start_lng],
          [raw.end_lat, raw.end_lng],
        ];
  // The backend's adjusted level already includes verified reports and slope sensors;
  // an official closure always wins.
  const level: LevelKey =
    raw.closure?.status === 'closed' ? 'closed' : levelFromText(raw.adjusted_risk_level ?? raw.risk_level);
  return {
    id: raw.id,
    seq: raw.sequence_order,
    name,
    from,
    to,
    kmStart: info?.kmStart ?? 0,
    kmEnd: info?.kmEnd ?? 0,
    coords,
    level,
    score: raw.risk_index ?? raw.risk_score ?? 0,
    terrain: num(raw.terrain_percentile ?? raw.terrain_score),
    rain3d: num(raw.r3d_mm ?? raw.rain_mm_3d),
    rain24h: num(raw.rain_24h_mm),
    next24h: num(raw.forecast_24h_mm),
    next72h: num(raw.forecast_72h_mm),
    reports24h: raw.ground_report_count_24h ?? 0,
    closure: raw.closure ?? null,
    node: raw.node_escalation ?? null,
    hospitalKm: num(raw.nearest_hospital_km),
    updatedAt: raw.updated_at,
  };
}

/** Worst first; ties broken by the risk index */
export function byWorst(a: Stretch, b: Stretch): number {
  return LEVELS[b.level].rank - LEVELS[a.level].rank || b.score - a.score;
}

export const kmRange = (s: Stretch) => `km ${Math.round(s.kmStart)}–${Math.round(s.kmEnd)}`;

/** Stretch name in the app language: "Sirobagarh to Rudraprayag" / "सिरोबगड़ से रुद्रप्रयाग" */
export const stretchName = (s: Stretch) => placeName(s.name);

export const isHeavyRain = (s: Stretch) => (s.rain24h ?? 0) >= 20 || (s.rain3d ?? 0) >= 40;
export const isUnstable = (s: Stretch) => (s.terrain ?? 0) >= 0.6;

/** The one-line headline cause used on cards */
export function mainCause(s: Stretch): string {
  if (s.level === 'closed') return tr('Road closed');
  if (s.node?.level) return tr('Slope sensor alert');
  if (isHeavyRain(s)) return tr('Heavy rain');
  if (isUnstable(s)) return tr('Unstable slopes');
  if ((s.rain3d ?? 0) >= 5) return tr('Some rain');
  return tr('Dry weather');
}

/** Alert category from the client spec (frontend.md, Alerts) */
export function alertCategory(s: Stretch): string {
  if (s.level === 'closed') return tr('Road closure');
  if (s.level === 'severe') return tr('Critical alert');
  if (s.level === 'high') return s.reports24h > 0 ? tr('Rockfall activity') : tr('Landslide risk');
  return tr('Monitoring');
}

export function rainText(s: Stretch): string | null {
  if (s.rain24h != null) return tr('{mm} mm in 24 h', { mm: Math.round(s.rain24h) });
  if (s.rain3d != null)
    return s.rain3d < 1 ? tr('no rain in 3 days') : tr('{mm} mm in 3 days', { mm: Math.round(s.rain3d) });
  return null;
}

export function reportsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? tr('1 report') : tr('{n} reports', { n });
}

/** "Heavy rain · 38 mm in 24 h · 2 reports" */
export function cardSubtitle(s: Stretch): string {
  if (s.level === 'closed' && s.closure) return s.closure.reason;
  return [mainCause(s), rainText(s), reportsText(s.reports24h)].filter(Boolean).join(' · ');
}

const ADVICE: Record<LevelKey, string> = {
  low: 'Low risk does not mean safe. Drive with care.',
  moderate: 'Watch for falling stones.',
  high: 'Delay your trip if you can.',
  severe: 'Delay your trip if you can.',
  closed: 'Follow police and BRO instructions at the barrier.',
};

function causeOf(s: Stretch): string {
  if (isHeavyRain(s) && isUnstable(s)) return tr('Heavy rain on steep, unstable slopes');
  if (isHeavyRain(s)) return tr('Heavy rain in the last few days');
  if (isUnstable(s)) return tr('Steep, unstable slopes');
  if ((s.rain3d ?? 0) >= 5) return tr('Some rain in the last 3 days');
  return tr('Little rain recently');
}

/** Plain-words reason under the verdict, built only from the data the backend sent */
export function verdictSentence(s: Stretch): string {
  if (s.level === 'closed') {
    const head = s.closure?.reason ? tr('Road closed: {reason}.', { reason: s.closure.reason }) : tr('Road closed.');
    return `${head} ${tr(ADVICE.closed)}`;
  }
  return `${causeOf(s)}. ${tr(ADVICE[s.level])}`;
}

/** Longer paragraph on the alert details page */
export function alertParagraph(s: Stretch): string {
  if (s.level === 'closed') return verdictSentence(s);
  const parts: string[] = [];
  let cause = causeOf(s);
  if (s.reports24h > 0) {
    cause +=
      s.reports24h === 1
        ? tr(', and 1 verified driver report in the last 24 hours')
        : tr(', and {n} verified driver reports in the last 24 hours', { n: s.reports24h });
  }
  parts.push(`${cause}.`);
  if (s.node?.reason) parts.push(s.node.reason);
  if (s.closure && s.closure.status !== 'closed') {
    parts.push(
      s.closure.status === 'one_way'
        ? tr('Traffic is one way: {reason}.', { reason: s.closure.reason })
        : tr('Traffic is restricted: {reason}.', { reason: s.closure.reason }),
    );
  }
  parts.push(tr(ADVICE[s.level]));
  return parts.join(' ');
}

/** Text for Listen, in the app language */
export function spokenAdvisory(s: Stretch): string {
  const head =
    s.level === 'closed'
      ? tr('Road closed')
      : tr('{level} risk. {verdict}', { level: levelLabel(s.level), verdict: levelVerdict(s.level) });
  return (
    tr('{name}, National Highway 7, kilometre {from} to {to}.', {
      name: stretchName(s),
      from: Math.round(s.kmStart),
      to: Math.round(s.kmEnd),
    }) +
    ` ${head}. ${verdictSentence(s)} ` +
    tr('This is not an official warning. In an emergency call 1 1 2.')
  );
}

/** Plan-trip form values that cover this stretch */
export function planParamsFor(s: Stretch) {
  const to = s.to.replace(/ (.*)$/, '');
  return { from: s.from, to: townByName(to) ? to : 'Joshimath' };
}

export function onRoadTips(s: Stretch): string[] {
  const tips = [
    tr('Do not stop below steep slopes or fresh cuttings.'),
    tr('Watch for falling stones or cracks on the road.'),
  ];
  if (isHeavyRain(s)) tips.push(tr('Keep away from streams and drains: water can bring debris down fast.'));
  tips.push(tr('Wait in {a} or {b} if you can.', { a: townName(s.from), b: townName(s.to.replace(/ (.*)$/, '')) }));
  return tips;
}
