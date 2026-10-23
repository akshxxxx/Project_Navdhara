import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchRiskMap,
  fetchClosures,
  fetchRouteRisk,
  postFieldReport,
  fetchAlerts,
  fetchPriorityList,
  fetchModelInfo,
  fetchBacktestSummary,
  fetchHistory,
} from './client';
import type { TripPlanRequest, FieldReportSubmission } from './types';
import { useDemoStore } from './demoStore';

export function useRiskMap() {
  const { i18n } = useTranslation();
  const { simulateRainMm, asOf } = useDemoStore();
  return useQuery({
    queryKey: ['risk-map', i18n.language, simulateRainMm, asOf],
    queryFn: fetchRiskMap,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useClosures() {
  const { i18n } = useTranslation();
  const { simulateRainMm, asOf } = useDemoStore();
  return useQuery({
    queryKey: ['closures', i18n.language, simulateRainMm, asOf],
    queryFn: fetchClosures,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useTripPlan(req: TripPlanRequest | null) {
  const { i18n } = useTranslation();
  const { simulateRainMm } = useDemoStore();
  return useQuery({
    queryKey: ['trip-plan', req?.origin, req?.destination, req?.depart_time, i18n.language, simulateRainMm],
    queryFn: () => fetchRouteRisk(req!),
    enabled: !!req,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useSubmitReport() {
  return useMutation({
    mutationFn: (submission: FieldReportSubmission) => postFieldReport(submission),
  });
}

export function useAlerts() {
  const { i18n } = useTranslation();
  const { simulateRainMm, asOf } = useDemoStore();
  
  return useQuery({
    queryKey: ['alerts', i18n.language, simulateRainMm, asOf],
    queryFn: async () => {
      try {
        const res = await fetchAlerts();
        // Assuming fetchAlerts returns { alerts: [...] }
        const alertsList = res.alerts || [];
        
        // Map backend AlertItem to app UI format
        return alertsList.map((a: any) => ({
          id: a.alert_id,
          segment_id: a.segment_id,
          level: a.severity === 'Severe' ? 3 : a.severity === 'High' ? 2 : a.severity === 'Moderate' ? 1 : 0,
          effectiveLevel: a.severity === 'Severe' ? 3 : a.severity === 'High' ? 2 : a.severity === 'Moderate' ? 1 : 0,
          segment: { id: a.segment_id, name: a.segment_name, main_driver: a.message }, // minimal stub for UI
          created_at: a.issued_at,
        }));
      } catch (error) {
        // Fallback to deriving from risk map on network error
        const riskData = await fetchRiskMap();
        return riskData.segments
          .filter(s => s.effectiveLevel === 'closed' || s.level >= 2)
          .map(s => ({
            id: `alert-${s.id}`,
            segment_id: s.id,
            level: s.level,
            effectiveLevel: s.effectiveLevel,
            segment: s,
            created_at: s.updated_at,
          }));
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function usePriorityList() {
  return useQuery({
    queryKey: ['priority-list'],
    queryFn: fetchPriorityList,
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useModelInfo() {
  return useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBacktestSummary() {
  return useQuery({
    queryKey: ['backtest-summary'],
    queryFn: fetchBacktestSummary,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
