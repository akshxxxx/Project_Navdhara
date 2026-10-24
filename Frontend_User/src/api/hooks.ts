import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import offlinePackFixture from '@/data/fixtures/offline-pack.json';
import riskMapFixture from '@/data/fixtures/risk-map.json';
import { adaptSegment, byWorst, type Stretch } from '@/domain/stretch';

import { api } from './client';
import { KEYS, readJson, writeJson } from './storage';
import type { OfflinePackResponse, RiskMapResponse, RouteRiskResponse } from './types';

/** live = fresh from the backend; saved = last good copy in this browser; demo = bundled sample, not real */
export type Source = 'live' | 'saved' | 'demo';

export interface Sourced<T> {
  data: T;
  source: Source;
  savedAt: string | null;
}

export const REFRESH_MS = 5 * 60 * 1000;

async function withFallback<T>(key: string, fetcher: () => Promise<T>, fixture: T): Promise<Sourced<T>> {
  try {
    const data = await fetcher();
    const savedAt = new Date().toISOString();
    writeJson(key, { data, savedAt });
    return { data, source: 'live', savedAt };
  } catch {
    const saved = readJson<{ data: T; savedAt: string }>(key);
    if (saved) return { data: saved.data, source: 'saved', savedAt: saved.savedAt };
    return { data: fixture, source: 'demo', savedAt: null };
  }
}

export interface Corridor {
  stretches: Stretch[];
  byId: Record<string, Stretch>;
  worstFirst: Stretch[];
  highOrSevere: number;
  closed: number;
  weatherSource: string | null;
  updatedAt: string | null;
  source: Source;
  savedAt: string | null;
}

export function useCorridor() {
  const query = useQuery({
    queryKey: ['risk-map'],
    queryFn: () => withFallback(KEYS.riskMap, api.riskMap, riskMapFixture as unknown as RiskMapResponse),
    refetchInterval: REFRESH_MS,
    staleTime: 60 * 1000,
  });
  const corridor = useMemo<Corridor | null>(() => {
    const res = query.data;
    if (!res) return null;
    const stretches = res.data.segments.map(adaptSegment).sort((a, b) => a.seq - b.seq);
    return {
      stretches,
      byId: Object.fromEntries(stretches.map((s) => [s.id, s])),
      worstFirst: [...stretches].sort(byWorst),
      highOrSevere: stretches.filter((s) => s.level === 'high' || s.level === 'severe').length,
      closed: stretches.filter((s) => s.level === 'closed').length,
      weatherSource: res.data.weather_source ?? null,
      updatedAt: res.data.weather_fetched_at ?? stretches[0]?.updatedAt ?? null,
      source: res.source,
      savedAt: res.savedAt,
    };
  }, [query.data]);
  return { ...query, corridor };
}

export function useOfflinePack() {
  return useQuery({
    queryKey: ['offline-pack'],
    queryFn: () =>
      withFallback(KEYS.offlinePack, api.offlinePack, offlinePackFixture as unknown as OfflinePackResponse),
    staleTime: 10 * 60 * 1000,
  });
}

export function useFieldReports() {
  return useQuery({
    queryKey: ['field-reports'],
    queryFn: api.fieldReports,
    refetchInterval: REFRESH_MS,
    retry: 1,
  });
}

export interface TripParams {
  origin: string;
  destination: string;
  departTime: string; // YYYY-MM-DDTHH:MM:00, IST
}

export function useTrip(p: TripParams | null) {
  return useQuery<RouteRiskResponse>({
    queryKey: ['trip', p?.origin, p?.destination, p?.departTime],
    queryFn: () => api.tripPlanner({ origin: p!.origin, destination: p!.destination, depart_time: p!.departTime }),
    enabled: !!p,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });
}
