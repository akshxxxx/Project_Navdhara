import type { OfflineHospital, OfflinePackResponse } from '@/api/types';

import { segmentInfo } from './corridor';
import type { Stretch } from './stretch';

/**
 * Nearest hospital for each stretch, in road order. Newer backends send `hospitals`; older offline
 * packs only name the hospital per segment, so the distance then comes from the live risk map.
 */
export function hospitalList(
  pack: OfflinePackResponse,
  stretches: Stretch[] | undefined,
  kmById: Record<string, number | null>,
): OfflineHospital[] {
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
