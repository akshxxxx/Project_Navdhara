import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ThemedText } from './ThemedText';
import { RiskIcon } from './RiskIcon';
import { RiskBadge } from './RiskBadge';
import { Chip } from './Chip';
import { colors, spacing, radii } from '../design/tokens';
import { fetchRouteRisk } from '../api/client';
import { useDemoStore } from '../api/demoStore';
import { parseLevel } from '../api/types';

interface DepartureStripProps {
  origin: string;
  destination: string;
  speedKmph: number;
  onSlotSelected: (slot: { departTime: string, maxRiskLevel: string, headline: string, closureCount: number, timeLabel: string }) => void;
}

const TIMES = [
  { label: '5:00 am', h: 5, m: 0 },
  { label: '6:00 am', h: 6, m: 0 },
  { label: '8:00 am', h: 8, m: 0 },
  { label: '10:00 am', h: 10, m: 0 },
  { label: '12:00 pm', h: 12, m: 0 },
  { label: '2:00 pm', h: 14, m: 0 },
];

export function DepartureStrip({ origin, destination, speedKmph, onSlotSelected }: DepartureStripProps) {
  const { t, i18n } = useTranslation();
  const { simulateRainMm } = useDemoStore();
  
  const [selectedDay, setSelectedDay] = useState<'today' | 'tomorrow'>('today');
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number>(0);
  
  // Build slots based on selected day
  const slots = React.useMemo(() => {
    const now = new Date();
    const isToday = selectedDay === 'today';
    const baseDate = new Date(now);
    if (!isToday) {
      baseDate.setDate(baseDate.getDate() + 1);
    }
    
    const results = [];
    if (isToday) {
      results.push({
        label: 'Now',
        iso: now.toISOString(),
        disabled: false
      });
    }
    
    for (const time of TIMES) {
      const d = new Date(baseDate);
      d.setHours(time.h, time.m, 0, 0);
      const isPast = isToday && d.getTime() < now.getTime();
      results.push({
        label: time.label,
        iso: d.toISOString(),
        disabled: isPast
      });
    }
    
    // We only take the first 6 non-disabled ones, or cap queries at 6
    return results;
  }, [selectedDay]);

  // Make parallel queries for up to 6 non-disabled slots
  const querySlots = slots.filter(s => !s.disabled).slice(0, 6);
  
  const queries = querySlots.map(slot => ({
    queryKey: ['trip-plan', origin, destination, slot.iso, speedKmph, i18n.language, simulateRainMm],
    queryFn: () => fetchRouteRisk({
      origin,
      destination,
      depart_time: slot.iso,
      speed_kmph: speedKmph,
    }),
    staleTime: 5 * 60 * 1000,
  }));

  // Fetch all manually or use useQueries. Since we can't use useQueries in a simple loop easily without the hook, 
  // actually @tanstack/react-query has useQueries.
  // Wait, I will just use `useQueries` from '@tanstack/react-query'. Let's import it.
  // ... Wait, let's just make it a single hook that handles the parallel requests if useQueries isn't available.
  // useQueries IS in @tanstack/react-query.
  // I'll import it at the top.
  return <DepartureStripInner 
    origin={origin} destination={destination} speedKmph={speedKmph} 
    onSlotSelected={onSlotSelected} 
    selectedDay={selectedDay} setSelectedDay={setSelectedDay}
    selectedSlotIdx={selectedSlotIdx} setSelectedSlotIdx={setSelectedSlotIdx}
    slots={slots} querySlots={querySlots}
    simulateRainMm={simulateRainMm}
  />
}

// Extracting to useQueries
import { useQueries } from '@tanstack/react-query';

function DepartureStripInner({ origin, destination, speedKmph, onSlotSelected, selectedDay, setSelectedDay, selectedSlotIdx, setSelectedSlotIdx, slots, querySlots, simulateRainMm }: any) {
  const { i18n, t } = useTranslation();
  
  const results = useQueries({
    queries: querySlots.map((slot: any) => ({
      queryKey: ['trip-plan', origin, destination, slot.iso, speedKmph, i18n.language, simulateRainMm],
      queryFn: async () => {
        const res = await fetchRouteRisk({
          origin,
          destination,
          depart_time: slot.iso,
          speed_kmph: speedKmph,
        });
        return res as any; // Escape hatch for TS since useQueries return type inference can be tricky
      },
      staleTime: 5 * 60 * 1000,
    }))
  });

  const selectedSlot = slots[selectedSlotIdx];
  const queryIdx = querySlots.findIndex((q: any) => q.iso === selectedSlot?.iso);
  const selectedResult = queryIdx >= 0 ? results[queryIdx] : null;

  useEffect(() => {
    if (selectedResult?.data && selectedSlot) {
      const data = selectedResult.data as any;
      const isClosed = (data.segments && data.segments.some((s: any) => s.closure?.status === 'closed')) || !!data.closure;
      const rawLevel = data.recommendation?.params?.current_max_risk || data.max_risk_level || data.recommendation?.max_risk_level || 'Low';
      const closureCount = data.segments?.filter((s: any) => s.closure?.status === 'closed').length || (data.closure ? 1 : 0);
      const headline = data.advisory || data.recommendation?.reason || '';

      onSlotSelected({
        departTime: selectedSlot.iso,
        timeLabel: selectedSlot.label,
        maxRiskLevel: rawLevel,
        headline: headline,
        closureCount: closureCount,
      });
    }
  }, [selectedResult?.data, selectedSlot]);

  // Ensure selected slot is not disabled when switching days
  useEffect(() => {
    if (slots[selectedSlotIdx]?.disabled) {
      const firstValid = slots.findIndex((s: any) => !s.disabled);
      if (firstValid >= 0) setSelectedSlotIdx(firstValid);
    }
  }, [slots]);

  return (
    <View style={styles.container}>
      <View style={styles.dayRow}>
        <Chip label="Today" selected={selectedDay === 'today'} onPress={() => setSelectedDay('today')} />
        <Chip label="Tomorrow" selected={selectedDay === 'tomorrow'} onPress={() => setSelectedDay('tomorrow')} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
        {slots.map((slot: any, idx: number) => {
          const isSelected = idx === selectedSlotIdx;
          const qIdx = querySlots.findIndex((q: any) => q.iso === slot.iso);
          const res = qIdx >= 0 ? results[qIdx] : null;

          if (slot.disabled) {
            return (
              <View key={idx} style={[styles.timeChip, styles.timeChipDisabled]}>
                <ThemedText variant="small" color={colors.mist} style={styles.timeText}>{slot.label}</ThemedText>
                <ThemedText variant="caption" color={colors.mist} style={{ fontSize: 10 }}>Already passed</ThemedText>
              </View>
            );
          }

          let shapeContent = <ActivityIndicator size="small" color={colors.river} />;
          if (res?.data) {
            const data = res.data as any;
            const hasClosure = (data.segments && data.segments.some((s: any) => s.closure?.status === 'closed')) || !!data.closure;
            const rawLevel = data.recommendation?.params?.current_max_risk || data.max_risk_level || data.recommendation?.max_risk_level || 'Low';
            const level = hasClosure ? 'closed' : parseLevel(rawLevel);
            shapeContent = <RiskIcon level={level} size={24} />;
          }

          return (
            <TouchableOpacity 
              key={idx} 
              style={[styles.timeChip, isSelected && styles.timeChipSelected]}
              onPress={() => setSelectedSlotIdx(idx)}
            >
              <ThemedText variant="small" color={isSelected ? colors.river : colors.ink} style={styles.timeText}>
                {slot.label}
              </ThemedText>
              <View style={styles.shapeContainer}>
                <>{shapeContent}</>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {(() => {
        if (!selectedResult?.data) return null;
        const data = selectedResult.data as any;
        const isClosed = (data.segments && data.segments.some((s: any) => s.closure?.status === 'closed')) || !!data.closure;
        const rawLevel = data.recommendation?.params?.current_max_risk || data.max_risk_level || data.recommendation?.max_risk_level || 'Low';
        const level = isClosed ? 'closed' : parseLevel(rawLevel);

        const bestDepart = data.recommendation?.params?.best_depart_time || data.recommendation?.best_departure_options?.[0]?.depart_time;
        const safestWindowText = bestDepart
          ? new Date(bestDepart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : (data.recommendation?.safe_departure_window || data.recommendation?.reason || (i18n.language === 'hi' ? 'दिन का समय उपयुक्त' : 'Daytime recommended'));

        return (
          <View style={styles.preview}>
            <RiskBadge 
              level={level} 
              showVerdict 
            />
            <ThemedText variant="small" color={colors.ink} style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
              {i18n.language === 'hi' ? 'सुरक्षित समय: ' : 'Safest window: '}{safestWindowText}
            </ThemedText>
          </View>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.md,
  },
  dayRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  timeScroll: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  timeChip: {
    width: 80,
    height: 70,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.snow,
    padding: spacing.xs,
  },
  timeChipSelected: {
    borderColor: colors.river,
    backgroundColor: colors.riverTint,
    borderWidth: 2,
  },
  timeChipDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.7,
  },
  timeText: {
    fontFamily: 'IBMPlexSansCondensed_600SemiBold',
    marginBottom: 4,
  },
  shapeContainer: {
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  preview: {
    marginTop: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.mist + '40', // light tint
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
  }
});
