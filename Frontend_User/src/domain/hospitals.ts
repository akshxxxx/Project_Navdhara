import type { OfflineHospital, OfflinePackResponse } from '@/api/types';

import { segmentInfo } from './corridor';
import type { Stretch } from './stretch';

// Spelling mistakes in the backend's hospital data (Backend/data/segment_consequence.csv, log.md L-047).
// Fixed for display only; the data team should fix the CSV.
const SPELLING: [RegExp, string][] = [
  [/Governement/g, 'Government'],
  [/Governnment/g, 'Government'],
];

export const hospitalName = (name: string) => SPELLING.reduce((n, [bad, good]) => n.replace(bad, good), name);

/**
 * Nearest hospital for each stretch, in road order (as App/src/domain/hospitals.ts). Newer backends send
 * `hospitals`; older offline packs only name the hospital per segment, so the distance then comes from the
 * live risk map.
 */
export function hospitalList(pack: OfflinePackResponse, stretches: Stretch[] | undefined): OfflineHospital[] {
  const kmById = Object.fromEntries((stretches ?? []).map((s) => [s.id, s.hospitalKm]));
  const rows: OfflineHospital[] = pack.hospitals?.length
    ? pack.hospitals
    : pack.segments
        .filter((s) => s.nearest_hospital)
        .map((s) => ({
          segment_id: s.id,
          segment_name: s.name,
          hospital_name: s.nearest_hospital as string,
          distance_km: kmById[s.id] ?? null,
        }));
  const order = (id: string) => segmentInfo(id)?.seq ?? stretches?.find((s) => s.id === id)?.seq ?? 99;
  return [...rows].sort((a, b) => order(a.segment_id) - order(b.segment_id));
}
