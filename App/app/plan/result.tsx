import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Share, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { 
  ThemedText, 
  Button, 
  RiskIcon,
  RiskBadge,
  BottomSheet,
  SegmentDetail,
  ListenButton,
  SubscribeSheet,
  type BottomSheetRef
} from '../../src/components';
import { towns, segmentIdForFrom, segmentIdForTo } from '../../src/data/towns';
import { useRiskMap } from '../../src/api/hooks';
import { fetchRouteRisk } from '../../src/api/client';
import { useDemoStore } from '../../src/api/demoStore';
import { colors, spacing, radii } from '../../src/design/tokens';
import { parseLevel } from '../../src/api/types';

export default function TripResultScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ origin: string; destination: string; departTime: string; speedKmph: string }>();
  
  const { origin, destination, departTime, speedKmph } = params;
  const isHindi = i18n.language === 'hi';
  const locale = isHindi ? 'hi-IN' : 'en-IN';
  const { simulateRainMm } = useDemoStore();
  
  const { data: riskMapData } = useRiskMap();
  
  const { data: planResult, isLoading, error, refetch } = useQuery({
    queryKey: ['trip-plan', origin, destination, departTime, speedKmph, i18n.language, simulateRainMm],
    queryFn: () => fetchRouteRisk({
      origin: origin as string,
      destination: destination as string,
      depart_time: departTime as string,
      speed_kmph: Number(speedKmph) || 30,
    })
  });
  
  const [expandedLow, setExpandedLow] = useState<boolean>(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const sheetRef = React.useRef<BottomSheetRef>(null);
  const subscribeSheetRef = React.useRef<BottomSheetRef>(null);
  const [subscribeTarget, setSubscribeTarget] = useState<{ id: string; name: string } | null>(null);

  // Find corresponding towns to display names
  // In a real app we might lookup the segment ID from towns
  const fromTown = towns.find(t => segmentIdForFrom(t.id) === origin || segmentIdForTo(t.id) === origin);
  const toTown = towns.find(t => segmentIdForTo(t.id) === destination || segmentIdForFrom(t.id) === destination);
  
  const fromName = fromTown ? (isHindi ? fromTown.name_hi : fromTown.name_en) : 'Origin';
  const toName = toTown ? (isHindi ? toTown.name_hi : toTown.name_en) : 'Destination';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ChevronLeft size={24} color={colors.ink} /></TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.river} />
          <ThemedText variant="body" color={colors.granite} style={{ marginTop: spacing.md }}>Loading your trip...</ThemedText>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !planResult) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ChevronLeft size={24} color={colors.ink} /></TouchableOpacity>
        </View>
        <View style={styles.center}>
          <ThemedText variant="h3" color={colors.ink}>Trip planner unavailable</ThemedText>
          <ThemedText variant="body" color={colors.granite} style={{ marginVertical: spacing.md, textAlign: 'center' }}>
            We could not fetch your route. Please try again.
          </ThemedText>
          <Button label="Try again" variant="primary" onPress={() => refetch()} />
        </View>
      </SafeAreaView>
    );
  }

  const { recommendation, segments: route_segments, advisory: headline, max_risk_level: overallRiskLevel } = planResult;
  const isClosed = route_segments.some((s: any) => s.closure?.status === 'closed');
  const maxRisk = isClosed ? 'closed' : parseLevel(overallRiskLevel);
  const departure_timeline = recommendation?.best_departure_options || [];
  
  // Format Date
  const d = new Date(departTime as string);
  const formattedDate = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const departTimeOnly = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

  // Get Verdict
  let verdictTitle = '';
  if (isClosed) verdictTitle = 'Not advised';
  else if (maxRisk === 0) verdictTitle = 'Good to go';
  else if (maxRisk === 1) verdictTitle = 'Go with care';
  else if (maxRisk === 2) verdictTitle = 'Delay if you can';
  else verdictTitle = 'Not advised';

  // Duration
  const totalDistance = route_segments.length > 0 ? Math.abs(route_segments[route_segments.length - 1].km_end - route_segments[0].km_start) : 0;
  const durationHours = totalDistance / (Number(speedKmph) || 30);
  const h = Math.floor(durationHours);
  const m = Math.round((durationHours - h) * 60);
  
  const safestWindow = departure_timeline.length > 0 
    ? new Date(departure_timeline[0].depart_time).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) 
    : departTimeOnly;

  const handleShare = async () => {
    const msg = `${fromName} to ${toName}, ${formattedDate}, leaving ${departTimeOnly}: ${verdictTitle}. Safest window: ${safestWindow}. ${headline} Check live: https://raah.app/`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    try {
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) await Linking.openURL(waUrl);
      else await Share.share({ message: msg });
    } catch {
      await Share.share({ message: msg });
    }
  };

  const selectedSegment = riskMapData?.segments.find(s => s.id === selectedSegmentId);

  // Group consecutive low risks
  const processedSegments: any[] = [];
  let currentLowGroup: any[] = [];
  
  route_segments.forEach((seg: any) => {
    const risk = seg.risk_level_at_eta ? parseLevel(seg.risk_level_at_eta) : seg.level;
    if (risk === 0) {
      currentLowGroup.push(seg);
    } else {
      if (currentLowGroup.length > 0) {
        processedSegments.push({ type: 'low_group', count: currentLowGroup.length, segments: currentLowGroup });
        currentLowGroup = [];
      }
      processedSegments.push({ type: 'segment', ...seg });
    }
  });
  if (currentLowGroup.length > 0) {
    processedSegments.push({ type: 'low_group', count: currentLowGroup.length, segments: currentLowGroup });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <ThemedText variant="h3" color={colors.ink} numberOfLines={1}>
            {fromName} to {toName}
          </ThemedText>
          <ThemedText variant="small" color={colors.granite}>
            {Math.round(totalDistance)} km, about {h} h {m} min
          </ThemedText>
        </View>
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <ThemedText variant="h2" color={colors.ink} style={styles.dateText}>
          {formattedDate}, leaving {departTimeOnly}
        </ThemedText>
        
        <View style={styles.verdictSection}>
          <RiskIcon level={maxRisk} size={32} />
          <ThemedText variant="verdict" color={colors.ink} style={styles.verdictString}>
            {verdictTitle}
          </ThemedText>
        </View>
        
        <ThemedText variant="body" color={colors.ink} style={{ marginBottom: spacing.sm, fontWeight: 'bold' }}>
          {headline}
        </ThemedText>
        <ThemedText variant="small" color={colors.granite} style={{ marginBottom: spacing.md }}>
          Safest window to leave: {safestWindow}
        </ThemedText>

        {isClosed && (
          <View style={styles.closureBanner}>
            <ThemedText variant="small" color={colors.snow}>
              Road is currently closed along this route.
            </ThemedText>
          </View>
        )}

        <View style={styles.actionRow}>
          <Button
            label="Alert me on this trip"
            variant="primary"
            onPress={() => {
              const targetSeg = route_segments[0];
              setSubscribeTarget({
                id: targetSeg?.id || (origin as string) || 'seg_01',
                name: `${fromName} to ${toName}`,
              });
              subscribeSheetRef.current?.snapToIndex(1);
            }}
            style={{ flex: 1 }}
          />
          <View style={{ width: spacing.sm }} />
          <ListenButton segmentId={route_segments.find((s: any) => s.level === parseLevel(overallRiskLevel))?.id || route_segments[0]?.id || 'seg_01'} />
        </View>

        {departure_timeline && departure_timeline.length > 0 && (
          <View style={styles.section}>
            <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>When to leave</ThemedText>
            {departure_timeline.map((opt: any, i: number) => {
              const d = new Date(opt.depart_time);
              const isBest = opt.max_risk_level === 'Low';
              return (
                <View key={i} style={[styles.timelineRow, isBest && styles.timelineRowBest]}>
                  <View style={{ width: 60 }}>
                    <ThemedText variant="small" color={colors.ink}>{d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</ThemedText>
                  </View>
                  <RiskIcon level={parseLevel(opt.max_risk_level)} size={20} />
                  <ThemedText variant="small" color={colors.ink} style={{ marginLeft: spacing.sm, flexShrink: 1 }}>
                    {opt.summary}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>Along your route</ThemedText>
          <ThemedText variant="small" color={colors.granite} style={{ marginBottom: spacing.lg }}>
            Based on forecast rain at the time you reach each stretch.
          </ThemedText>
          
          <View style={styles.timeline}>
            <View style={styles.timelineLine} />
            
            {processedSegments.map((item, idx) => {
              if (item.type === 'low_group') {
                if (expandedLow) {
                  return item.segments.map((seg: any) => (
                    <RouteSegmentNode key={seg.id} seg={seg} onTap={() => { setSelectedSegmentId(seg.id); sheetRef.current?.snapToIndex(1); }} />
                  ));
                } else {
                  return (
                    <TouchableOpacity key={`group-${idx}`} style={styles.timelineNode} onPress={() => setExpandedLow(true)}>
                      <View style={styles.timelineIconWrapper}>
                        <RiskIcon level={0} size={12} />
                      </View>
                      <View style={styles.timelineNodeContent}>
                        <ThemedText variant="body" color={colors.ink}>{item.count} stretches, all Low risk</ThemedText>
                        <ThemedText variant="caption" color={colors.granite}>Tap to expand</ThemedText>
                      </View>
                    </TouchableOpacity>
                  );
                }
              } else {
                return (
                  <RouteSegmentNode key={item.id} seg={item} onTap={() => { setSelectedSegmentId(item.id); sheetRef.current?.snapToIndex(1); }} />
                );
              }
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Button label={t('plan.share', 'Share on WhatsApp')} variant="secondary" onPress={handleShare} />
        </View>
      </ScrollView>
      
      <BottomSheet ref={sheetRef} initialIndex={-1}>
        {selectedSegment && riskMapData && (
          <SegmentDetail 
            segment={selectedSegment} 
            updatedAt={riskMapData.as_of}
            onAlertMe={() => {
              setSubscribeTarget({ id: selectedSegment.id, name: selectedSegment.name });
              subscribeSheetRef.current?.snapToIndex(1);
            }}
            onReport={() => router.push('/report')}
          />
        )}
      </BottomSheet>

      <BottomSheet ref={subscribeSheetRef} initialIndex={-1}>
        {subscribeTarget && (
          <SubscribeSheet
            itemId={subscribeTarget.id}
            itemName={subscribeTarget.name}
            onClose={() => subscribeSheetRef.current?.snapToIndex(-1)}
            onSuccess={(name) => {
              // User subscribed
            }}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function RouteSegmentNode({ seg, onTap }: { seg: any, onTap: () => void }) {
  const rLvl = seg.risk_level_at_eta ? parseLevel(seg.risk_level_at_eta) : seg.level;
  const isClosed = seg.closure?.status === 'closed';
  return (
    <TouchableOpacity style={styles.timelineNode} onPress={onTap}>
      <View style={styles.timelineIconWrapper}>
        <RiskIcon level={isClosed ? 'closed' : rLvl} size={16} />
      </View>
      <View style={styles.timelineNodeContent}>
        <ThemedText variant="body" color={colors.ink}>{seg.name}</ThemedText>
        <View style={styles.etaRow}>
          <ThemedText variant="caption" color={colors.ink}>Reach at: {seg.eta_ist ? new Date(seg.eta_ist).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '--'}</ThemedText>
          {seg.rain_at_eta_mm !== undefined && (
            <ThemedText variant="caption" color={colors.granite} style={{ marginLeft: spacing.sm }}>Rain expected then: {Math.round(seg.rain_at_eta_mm)} mm</ThemedText>
          )}
        </View>
        {rLvl > 0 && <ThemedText variant="caption" color={colors.granite}>Risk shape: {seg.risk_level_at_eta || 'Unknown'}</ThemedText>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderBottomWidth: 1, borderBottomColor: colors.mist,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerText: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  content: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  dateText: { marginBottom: spacing.md },
  verdictSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  verdictString: { flexShrink: 1 },
  closureBanner: { backgroundColor: colors.ink, padding: spacing.sm, borderRadius: radii.sm, marginBottom: spacing.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
  section: { marginTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.sm },
  timelineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.mist
  },
  timelineRowBest: { backgroundColor: colors.riverTint, borderRadius: radii.sm, marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm },
  timeline: { paddingLeft: 8, position: 'relative', marginTop: spacing.sm },
  timelineLine: { position: 'absolute', left: 15, top: 12, bottom: 12, width: 2, backgroundColor: colors.mist },
  timelineNode: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  timelineIconWrapper: { width: 16, alignItems: 'center', marginTop: 4, zIndex: 2, backgroundColor: colors.snow },
  timelineNodeContent: { flex: 1, marginLeft: spacing.md },
  etaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  actions: { marginTop: spacing.xl }
});
