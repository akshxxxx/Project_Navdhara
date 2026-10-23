import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  PhoneCall,
  Volume2,
  Navigation2,
  AlertTriangle,
  ShieldAlert,
  Compass,
  ArrowRight,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText, Chip } from '../src/components';
import { ListenButton } from '../src/components/ListenButton';
import { useRiskMap } from '../src/api/hooks';
import { colors, spacing, radii, riskColourFor, riskName } from '../src/design/tokens';

export default function DriveScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const { data: riskMapData } = useRiskMap();
  const segments = riskMapData?.segments || [];

  const [currentSegIndex, setCurrentSegIndex] = useState(0);
  const [speed, setSpeed] = useState(38);

  const currentSegment = segments[currentSegIndex] || segments[0];
  const nextSegment = segments[currentSegIndex + 1];

  // Look ahead for upcoming high/severe hazard
  const upcomingHazard = segments.slice(currentSegIndex + 1).find(s => s.effectiveLevel === 'closed' || s.level >= 2);

  const currentLevel = currentSegment?.effectiveLevel ?? 0;
  const currentRiskMeta = riskColourFor(currentLevel);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Top HUD Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <ThemedText variant="caption" color="#94A3B8" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
            NH-7 HIGHWAY COCKPIT
          </ThemedText>
          <ThemedText variant="h3" color="#FFFFFF">
            Driver HUD Mode
          </ThemedText>
        </View>

        <TouchableOpacity
          style={styles.sosBtn}
          onPress={() => router.push('/emergency')}
          accessibilityLabel="Emergency SOS"
        >
          <PhoneCall size={20} color="#EF4444" />
          <ThemedText variant="caption" color="#EF4444" style={{ fontWeight: '800', marginLeft: 4 }}>
            SOS
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Main Telemetry Cluster */}
        <View style={styles.telemetryCard}>
          {/* Speedometer */}
          <View style={styles.speedCluster}>
            <ThemedText variant="caption" color="#64748B" style={{ letterSpacing: 1 }}>
              SPEED
            </ThemedText>
            <View style={styles.speedRow}>
              <ThemedText variant="h1" color="#38BDF8" style={styles.speedVal}>
                {speed}
              </ThemedText>
              <ThemedText variant="caption" color="#64748B" style={{ marginLeft: 6, fontWeight: '700' }}>
                KM/H
              </ThemedText>
            </View>

            {/* Quick Speed adjust buttons for presentation */}
            <View style={styles.speedBtns}>
              {[25, 40, 55].map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.speedPill, speed === s && styles.speedPillActive]}
                  onPress={() => setSpeed(s)}
                >
                  <ThemedText variant="caption" color={speed === s ? '#FFFFFF' : '#94A3B8'}>
                    {s}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.vertDivider} />

          {/* Current Sector Status */}
          <View style={styles.sectorCluster}>
            <ThemedText variant="caption" color="#64748B" style={{ letterSpacing: 1 }}>
              CURRENT SECTOR
            </ThemedText>

            <ThemedText variant="h2" color="#FFFFFF" numberOfLines={1} style={{ marginTop: 2 }}>
              {currentSegment ? (isHindi ? currentSegment.name : currentSegment.name_en) : 'NH-7 Corridor'}
            </ThemedText>

            <ThemedText variant="caption" color="#94A3B8" style={{ marginTop: 2 }}>
              km {currentSegment?.km_start ?? 0} — km {currentSegment?.km_end ?? 0}
            </ThemedText>

            {/* Risk Indicator Pill */}
            <View style={[styles.riskPill, { backgroundColor: currentRiskMeta.fill }]}>
              <ThemedText variant="caption" color={currentRiskMeta.textOnFill} style={{ fontWeight: '800' }}>
                {currentLevel === 'closed' ? 'ROAD CLOSED' : `RISK LEVEL ${currentLevel}`}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Neural Voice Advisory Quick Player */}
        {currentSegment && (
          <View style={styles.voiceAdvisoryCard}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="caption" color="#38BDF8" style={{ fontWeight: '700' }}>
                AUDIO SAFETY ADVISORY
              </ThemedText>
              <ThemedText variant="small" color="#E2E8F0" style={{ marginTop: 2 }}>
                {currentSegment.main_driver_en || 'Live terrain & rainfall alert broadcast'}
              </ThemedText>
            </View>
            <ListenButton segmentId={currentSegment.id} />
          </View>
        )}

        {/* Hazard Alert Banner (Next hazard ahead) */}
        {upcomingHazard ? (
          <View style={styles.hazardAheadCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={24} color="#F97316" />
              <View style={{ flex: 1 }}>
                <ThemedText variant="h3" color="#FFFFFF">
                  Caution: {upcomingHazard.name_en}
                </ThemedText>
                <ThemedText variant="small" color="#FDBA74">
                  {upcomingHazard.effectiveLevel === 'closed'
                    ? 'Road closure ahead! Delay trip or use diversion.'
                    : `High landslide hazard (${riskName.en[upcomingHazard.level]}). Expect slow traffic.`}
                </ThemedText>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.safeAheadCard}>
            <Navigation2 size={20} color="#10B981" />
            <ThemedText variant="small" color="#6EE7B7" style={{ marginLeft: 8 }}>
              Corridor ahead is clear and open for travel.
            </ThemedText>
          </View>
        )}

        {/* Next Segment Preview */}
        {nextSegment && (
          <View style={styles.nextSegCard}>
            <ThemedText variant="caption" color="#64748B" style={{ letterSpacing: 1 }}>
              NEXT UPCOMING SECTOR
            </ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <View>
                <ThemedText variant="h3" color="#FFFFFF">
                  {nextSegment.name_en}
                </ThemedText>
                <ThemedText variant="caption" color="#94A3B8">
                  km {nextSegment.km_start} to {nextSegment.km_end}
                </ThemedText>
              </View>
              <View style={[styles.miniRiskDot, { backgroundColor: riskColourFor(nextSegment.effectiveLevel).fill }]} />
            </View>
          </View>
        )}

        {/* Sector Simulator Slider (Interactive for presentation) */}
        <View style={styles.simCard}>
          <ThemedText variant="caption" color="#64748B" style={{ letterSpacing: 1, marginBottom: 8 }}>
            ROUTE SIMULATOR (TAP TO PROGRESS ALONG NH-7)
          </ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {segments.map((seg, idx) => (
              <TouchableOpacity
                key={seg.id}
                style={[
                  styles.segChip,
                  currentSegIndex === idx && styles.segChipActive,
                  { borderLeftColor: riskColourFor(seg.effectiveLevel).fill, borderLeftWidth: 3 },
                ]}
                onPress={() => setCurrentSegIndex(idx)}
              >
                <ThemedText
                  variant="caption"
                  color={currentSegIndex === idx ? '#FFFFFF' : '#94A3B8'}
                  style={{ fontWeight: currentSegIndex === idx ? '700' : '400' }}
                >
                  {seg.name_en.split(' ')[0]}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0B1319', // Cockpit Deep Slate
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    gap: spacing.md,
  },
  telemetryCard: {
    flexDirection: 'row',
    backgroundColor: '#131F28',
    borderRadius: radii.lg,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: '#1E2E3B',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  speedCluster: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  speedVal: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'IBMPlexSansCondensed_700Bold',
  },
  speedBtns: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  speedPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#1E293B',
  },
  speedPillActive: {
    backgroundColor: '#0284C7',
  },
  vertDivider: {
    width: 1,
    backgroundColor: '#1E2E3B',
    marginHorizontal: spacing.sm,
  },
  sectorCluster: {
    flex: 1.5,
    justifyContent: 'center',
    paddingLeft: spacing.xs,
  },
  riskPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    marginTop: 6,
  },
  voiceAdvisoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#131F28',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#0284C7',
  },
  hazardAheadCard: {
    backgroundColor: '#7C2D12',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EA580C',
  },
  safeAheadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  nextSegCard: {
    backgroundColor: '#131F28',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#1E2E3B',
  },
  miniRiskDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  simCard: {
    backgroundColor: '#131F28',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#1E2E3B',
  },
  segChip: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segChipActive: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
});
