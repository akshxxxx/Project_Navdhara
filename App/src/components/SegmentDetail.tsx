import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CloudRain,
  Mountain,
  Activity,
  Clock,
  Bell,
  Flag,
  CheckCircle,
} from 'lucide-react-native';
import { ThemedText } from './ThemedText';
import { Button } from './Button';
import { ListenButton } from './ListenButton';
import { colors, spacing, radii, riskColourFor } from '../design/tokens';
import type { Segment } from '../api/types';

interface SegmentDetailProps {
  segment: Segment;
  updatedAt?: Date | string | number | null;
  onAlertMe?: () => void;
  onReport?: () => void;
}

export function SegmentDetail({ segment, updatedAt, onAlertMe, onReport }: SegmentDetailProps) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const isClosed = segment.effectiveLevel === 'closed';
  const level = segment.effectiveLevel;

  // Derive risk badge & verdict
  let badgeText = 'LOW RISK';
  let badgeBg = '#E3F1EA';
  let badgeTextCol = '#2E7D57';
  let verdictText = 'Good to go';
  let verdictCol = '#2E7D57';

  if (isClosed) {
    badgeText = 'ROAD CLOSED';
    badgeBg = '#1B2A33';
    badgeTextCol = '#FFFFFF';
    verdictText = 'Road is closed';
    verdictCol = '#1B2A33';
  } else if (level === 3) {
    badgeText = 'SEVERE RISK';
    badgeBg = '#F3DADF';
    badgeTextCol = '#9B1C31';
    verdictText = 'Not advised';
    verdictCol = '#9B1C31';
  } else if (level === 2) {
    badgeText = 'HIGH RISK';
    badgeBg = '#F8E3D8';
    badgeTextCol = '#C4470F';
    verdictText = 'Delay if you can';
    verdictCol = '#C4470F';
  } else if (level === 1) {
    badgeText = 'MODERATE RISK';
    badgeBg = '#FAF0D2';
    badgeTextCol = '#D49A00';
    verdictText = 'Go with care';
    verdictCol = '#D49A00';
  }

  // Calculate percentages for factors
  const rainPct = Math.min(Math.round(((segment.r3d_mm || segment.rain_24h_mm || 0) / 60) * 100), 100);
  const terrainPct = Math.min(Math.round((segment.terrain_score || 0.6) * 100), 100);
  const reportsPct = Math.min(Math.round(((segment.ground_report_count_24h || 0) / 5) * 100), 100);

  const last24h = (segment.rain_24h_mm ?? 0).toFixed(1);
  const next24h = (segment.forecast_24h_mm ?? 0).toFixed(1);
  const next72h = (segment.forecast_72h_mm ?? 0).toFixed(1);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Title & Badge */}
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: spacing.sm }}>
          <ThemedText variant="h2" color={colors.ink} style={{ fontWeight: '700' }}>
            {isHindi ? segment.name : segment.name_en}
          </ThemedText>
          <ThemedText variant="small" color={colors.granite} style={{ marginTop: 2 }}>
            NH-7 • km {segment.km_start} to {segment.km_end}
          </ThemedText>
        </View>

        <View style={[styles.badge, { backgroundColor: badgeBg }]}>
          <ThemedText variant="caption" color={badgeTextCol} style={{ fontWeight: '800', letterSpacing: 0.5 }}>
            {badgeText}
          </ThemedText>
        </View>
      </View>

      {/* Big Verdict and Audio Player */}
      <View style={styles.verdictRow}>
        <View style={styles.verdictLeft}>
          <AlertTriangle size={24} color={verdictCol} />
          <ThemedText variant="h2" color={verdictCol} style={{ fontWeight: '800', marginLeft: 6 }}>
            {verdictText}
          </ThemedText>
        </View>

        <ListenButton segmentId={segment.id} />
      </View>

      {/* Road Closure Card if closed */}
      {segment.closure && (
        <View style={styles.closureCard}>
          <View style={styles.closureHeader}>
            <ThemedText variant="h3" color="#991B1B">
              {segment.closure.status === 'closed' ? '🚨 Highway Sector Closed' : '⚠️ Travel Restriction'}
            </ThemedText>
          </View>
          <ThemedText variant="body" color={colors.ink} style={{ marginTop: 4 }}>
            {segment.closure.reason}
          </ThemedText>
          <View style={styles.closureMeta}>
            <ThemedText variant="caption" color={colors.granite}>
              Issued by: {segment.closure.source || 'Traffic Police'}
            </ThemedText>
            {segment.closure.starts_at && (
              <ThemedText variant="caption" color={colors.granite}>
                Started: {new Date(segment.closure.starts_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </ThemedText>
            )}
          </View>
        </View>
      )}

      {/* Why this stretch is risky */}
      <View style={styles.section}>
        <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>
          {t('why.title', 'Why this stretch is risky')}
        </ThemedText>

        {/* Rain bar */}
        <View style={styles.factorBlock}>
          <View style={styles.factorLabelRow}>
            <ThemedText variant="small" color={colors.granite}>
              Rain in last 3 days ({Math.round(segment.r3d_mm || 0)} mm)
            </ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '700' }}>
              {rainPct}%
            </ThemedText>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${rainPct}%`, backgroundColor: '#F97316' }]} />
          </View>
        </View>

        {/* Terrain bar */}
        <View style={styles.factorBlock}>
          <View style={styles.factorLabelRow}>
            <ThemedText variant="small" color={colors.granite}>
              Steep, vulnerable slope terrain
            </ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '700' }}>
              {terrainPct}%
            </ThemedText>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${terrainPct}%`, backgroundColor: '#D97706' }]} />
          </View>
        </View>

        {/* Driver reports bar */}
        <View style={styles.factorBlock}>
          <View style={styles.factorLabelRow}>
            <ThemedText variant="small" color={colors.granite}>
              Driver field reports ({segment.ground_report_count_24h || 0} in 24 h)
            </ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '700' }}>
              {reportsPct}%
            </ThemedText>
          </View>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${reportsPct}%`, backgroundColor: '#64748B' }]} />
          </View>
        </View>
      </View>

      {/* Rainfall mm Grid */}
      <View style={styles.section}>
        <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>
          Rainfall Statistics (mm)
        </ThemedText>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <ThemedText variant="caption" color={colors.granite}>Past 24 h</ThemedText>
            <ThemedText variant="h2" color={colors.ink} style={styles.statNum}>{last24h}</ThemedText>
          </View>
          <View style={styles.statBox}>
            <ThemedText variant="caption" color={colors.granite}>Next 24 h</ThemedText>
            <ThemedText variant="h2" color={colors.ink} style={styles.statNum}>{next24h}</ThemedText>
          </View>
          <View style={styles.statBox}>
            <ThemedText variant="caption" color={colors.granite}>Next 72 h</ThemedText>
            <ThemedText variant="h2" color={colors.ink} style={styles.statNum}>{next72h}</ThemedText>
          </View>
        </View>
      </View>

      {/* Metric chips */}
      <View style={styles.metricChipsRow}>
        <View style={styles.metricChip}>
          <CloudRain size={16} color="#D97706" />
          <View style={{ marginLeft: 6 }}>
            <ThemedText variant="caption" color={colors.granite}>Driver</ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '600' }} numberOfLines={1}>
              {segment.main_driver_en || 'Monsoon'}
            </ThemedText>
          </View>
        </View>

        <View style={styles.metricChip}>
          <Mountain size={16} color="#475569" />
          <View style={{ marginLeft: 6 }}>
            <ThemedText variant="caption" color={colors.granite}>Terrain</ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '600' }} numberOfLines={1}>
              Unstable Slope
            </ThemedText>
          </View>
        </View>

        <View style={styles.metricChip}>
          <Activity size={16} color="#1D5E6B" />
          <View style={{ marginLeft: 6 }}>
            <ThemedText variant="caption" color={colors.granite}>Risk Index</ThemedText>
            <ThemedText variant="small" color={colors.ink} style={{ fontWeight: '700' }}>
              {Math.round(segment.score * 100)} / 100
            </ThemedText>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <Button
          label={t('alerts.subscribe', 'Alert me about this stretch')}
          variant="primary"
          onPress={onAlertMe || (() => {})}
        />
        <Button
          label="Report a problem here"
          variant="secondary"
          onPress={onReport || (() => {})}
        />
      </View>

      {/* Footer fresh indicator */}
      <View style={styles.footer}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Clock size={12} color={colors.granite} />
          <ThemedText variant="caption" color={colors.granite}>
            {updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Live model feed'}
          </ThemedText>
        </View>
        <ThemedText variant="caption" color={colors.granite} style={{ marginTop: 2 }}>
          {t('disclaimer', 'Real-time estimate from satellite rainfall & terrain model. Follow BRO on the ground.')}
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.glacier,
    marginBottom: spacing.md,
  },
  verdictLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closureCard: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  closureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  closureMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#FEE2E2',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    fontWeight: '700',
  },
  factorBlock: {
    marginBottom: spacing.sm,
  },
  factorLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barBg: {
    height: 6,
    backgroundColor: colors.glacier,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.glacier,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.mist,
  },
  statNum: {
    fontWeight: '800',
    marginTop: 2,
  },
  metricChipsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  metricChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.snow,
    borderWidth: 1,
    borderColor: colors.mist,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  footer: {
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glacier,
  },
});
