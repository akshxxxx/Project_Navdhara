import { nearestTown, SEGMENTS } from './corridor';
import type { LatLng, Stretch } from './stretch';

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export interface RoadPosition {
  stretchId: string;
  km: number;
  offRoadKm: number;
  town: string;
}

/** Where a GPS point is on NH-7: nearest stretch, km mark and distance from the road */
export function locateOnRoad(point: LatLng, stretches: Stretch[]): RoadPosition | null {
  let best: { s: Stretch; i: number; d: number } | null = null;
  for (const s of stretches) {
    s.coords.forEach((c, i) => {
      const d = distanceKm(point, c);
      if (!best || d < best.d) best = { s, i, d };
    });
  }
  if (!best) return null;
  const { s, i, d } = best as { s: Stretch; i: number; d: number };
  const km = kmAtIndex(s, i);
  return { stretchId: s.id, km, offRoadKm: d, town: nearestTown(km).name };
}

/** The point at a km mark (used when a traveller types the km stone instead of using GPS) */
export function pointAtKm(km: number, stretches: Stretch[]): LatLng | null {
  const info = SEGMENTS.find((s) => km >= s.kmStart && km <= s.kmEnd);
  const s = info && stretches.find((x) => x.id === info.id);
  if (!s || s.coords.length < 2) return null;
  const lengths = cumulative(s.coords);
  const target = ((km - s.kmStart) / (s.kmEnd - s.kmStart)) * lengths[lengths.length - 1];
  const i = lengths.findIndex((l) => l >= target);
  return s.coords[Math.max(0, i)];
}

export const midpoint = (s: Stretch): LatLng => s.coords[Math.floor(s.coords.length / 2)];

function cumulative(coords: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + distanceKm(coords[i - 1], coords[i]));
  return out;
}

// The polyline is longer or shorter than the official chainage; scale it to the stretch's km range
function kmAtIndex(s: Stretch, i: number): number {
  const lengths = cumulative(s.coords);
  const total = lengths[lengths.length - 1] || 1;
  return s.kmStart + (lengths[i] / total) * (s.kmEnd - s.kmStart);
}
