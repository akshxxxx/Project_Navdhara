import type { Closure, NodeEscalation, RawSegment } from '@/api/types';

import { segmentInfo, splitName, townByName } from './corridor';
import { LEVELS, levelFromText, type LevelKey } from './levels';

// English version of App/src/domain/stretch.ts: one road stretch as the pages use it, and the
// plain-words sentences built only from what the backend sent.

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

/** "Pipalkoti to Helang (Tangani)" -> "Helang" (the town name, without the place in brackets) */
export const toTown = (s: Stretch) => s.to.replace(/ \(.*\)$/, '');

export const isHeavyRain = (s: Stretch) => (s.rain24h ?? 0) >= 20 || (s.rain3d ?? 0) >= 40;
export const isUnstable = (s: Stretch) => (s.terrain ?? 0) >= 0.6;

/** The one-line headline cause used on cards */
export function mainCause(s: Stretch): string {
  if (s.level === 'closed') return 'Road closed';
  if (s.node?.level) return 'Slope sensor alert';
  if (isHeavyRain(s) && isUnstable(s)) return 'Heavy rain on steep, unstable slopes';
  if (isHeavyRain(s)) return 'Heavy rain';
  if (isUnstable(s)) return 'Steep, unstable slopes';
  if ((s.rain3d ?? 0) >= 5) return 'Some rain';
  return 'Dry weather';
}

/** Alert category from the client spec (frontend.md, Alerts) */
export function alertCategory(s: Stretch): string {
  if (s.level === 'closed') return 'Road closure';
  if (s.level === 'severe') return 'Critical alert';
  if (s.level === 'high') return s.reports24h > 0 ? 'Rockfall activity' : 'Landslide risk';
  return 'Monitoring';
}

export function rainText(s: Stretch): string | null {
  if (s.rain24h != null) return `${Math.round(s.rain24h)} mm in 24 h`;
  if (s.rain3d != null) return s.rain3d < 1 ? 'no rain in 3 days' : `${Math.round(s.rain3d)} mm in 3 days`;
  return null;
}

export function reportsText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? '1 driver report' : `${n} driver reports`;
}

/** "Heavy rain · 38 mm in 24 h · 2 driver reports" */
export function cardSubtitle(s: Stretch): string {
  if (s.level === 'closed' && s.closure) return s.closure.reason;
  return [mainCause(s), rainText(s), reportsText(s.reports24h)].filter(Boolean).join(' · ');
}

const ADVICE: Record<LevelKey, string> = {
  low: 'Low risk does not mean safe. Drive with care.',
  moderate: 'Watch for falling stones.',
  high: 'Delay your trip if you can, or check a safer departure time in Plan trip.',
  severe: 'Delay your trip if you can, or check a safer departure time in Plan trip.',
  closed: 'Follow police and BRO instructions at the barrier.',
};

function causeOf(s: Stretch): string {
  if (isHeavyRain(s) && isUnstable(s)) return 'Heavy rain on steep, unstable slopes';
  if (isHeavyRain(s)) return 'Heavy rain in the last few days';
  if (isUnstable(s)) return 'Steep, unstable slopes';
  if ((s.rain3d ?? 0) >= 5) return 'Some rain in the last 3 days';
  return 'Little rain recently';
}

/** Plain-words reason under the verdict */
export function verdictSentence(s: Stretch): string {
  if (s.level === 'closed') {
    const head = s.closure?.reason ? `Road closed: ${s.closure.reason}.` : 'Road closed.';
    return `${head} ${ADVICE.closed}`;
  }
  return `${causeOf(s)}. ${ADVICE[s.level]}`;
}

/** Longer paragraph on the alert details panel */
export function alertParagraph(s: Stretch): string {
  if (s.level === 'closed') return verdictSentence(s);
  const parts: string[] = [];
  let cause = causeOf(s);
  if (s.reports24h > 0) {
    cause +=
      s.reports24h === 1
        ? ', and 1 verified driver report in the last 24 hours'
        : `, and ${s.reports24h} verified driver reports in the last 24 hours`;
  }
  parts.push(`${cause}.`);
  if (s.node?.reason) parts.push(s.node.reason);
  if (s.closure && s.closure.status !== 'closed') {
    parts.push(
      s.closure.status === 'one_way'
        ? `Traffic is one way: ${s.closure.reason}.`
        : `Traffic is restricted: ${s.closure.reason}.`,
    );
  }
  parts.push(ADVICE[s.level]);
  return parts.join(' ');
}

/** Text for Listen (read by the browser's own speech engine) */
export function spokenAdvisory(s: Stretch): string {
  const head = s.level === 'closed' ? 'Road closed' : `${LEVELS[s.level].label} risk. ${LEVELS[s.level].verdict}`;
  return (
    `${s.name}, National Highway 7, kilometre ${Math.round(s.kmStart)} to ${Math.round(s.kmEnd)}. ` +
    `${head}. ${verdictSentence(s)} ` +
    'This is not an official warning. In an emergency call 1 1 2.'
  );
}

/** Plan-trip form values that cover this stretch */
export function planParamsFor(s: Stretch) {
  const to = toTown(s);
  return { from: s.from, to: townByName(to) ? to : 'Joshimath' };
}
