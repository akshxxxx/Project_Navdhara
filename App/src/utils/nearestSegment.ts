import { Segment } from '../api/types';

/**
 * Calculates distance between two coordinates in km using Haversine formula
 */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface NearestResult {
  segment: Segment;
  km: number;
  distanceKm: number;
}

/**
 * Given lat/lng, find the nearest stretch by distance to its polyline.
 * Returns the segment, distance to it, and estimated km along the route.
 */
export function nearestSegment(lat: number, lng: number, segments: Segment[]): NearestResult | null {
  if (segments.length === 0) return null;

  let minDistance = Infinity;
  let bestSegment: Segment | null = null;
  let bestKm = 0;

  for (const seg of segments) {
    const coords = seg.coordinates; // {latitude, longitude}
    for (let i = 0; i < coords.length; i++) {
      const { latitude: ptLat, longitude: ptLng } = coords[i];
      const d = getDistance(lat, lng, ptLat, ptLng);
      if (d < minDistance) {
        minDistance = d;
        bestSegment = seg;
        
        // Estimate km
        if (coords.length > 1) {
          const ratio = i / (coords.length - 1);
          bestKm = seg.km_start + ratio * (seg.km_end - seg.km_start);
        } else {
          bestKm = seg.km_start;
        }
      }
    }
  }

  if (!bestSegment) return null;

  return {
    segment: bestSegment,
    km: Math.round(bestKm),
    distanceKm: minDistance,
  };
}
