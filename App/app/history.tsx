import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  Calendar,
  MapPin,
  AlertTriangle,
  Flame,
  Archive,
  ArrowRight,
} from 'lucide-react-native';
import { ThemedText, Chip } from '../src/components';
import { fetchHistory } from '../src/api/client';
import { colors, spacing, radii } from '../src/design/tokens';

export default function HistoryScreen() {
  const router = useRouter();
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');

  const {
    data: historyData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['history'],
    queryFn: fetchHistory,
  });

  const events = historyData?.events || [];
  const filteredEvents = selectedSeverity === 'all'
    ? events
    : events.filter((e: any) => e.severity?.toLowerCase().includes(selectedSeverity.toLowerCase()));

  const getSeverityBadge = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'catastrophic':
        return { bg: '#450A0A', text: '#FCA5A5', label: 'Catastrophic' };
      case 'very high':
        return { bg: '#FEF2F2', text: '#DC2626', label: 'Very High' };
      case 'high':
        return { bg: '#FFF7ED', text: '#EA580C', label: 'High' };
      case 'moderate':
        return { bg: '#FEFCE8', text: '#CA8A04', label: 'Moderate' };
      default:
        return { bg: colors.mist, text: colors.ink, label: severity || 'Normal' };
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Archive size={20} color={colors.river} />
            <ThemedText variant="h3" color={colors.ink}>Historical Landslides</ThemedText>
          </View>
          <ThemedText variant="caption" color={colors.granite}>NH-7 Major Geological Archive</ThemedText>
        </View>
      </View>

      {/* Summary Banner */}
      <View style={styles.summaryCard}>
        <ThemedText variant="h2" color={colors.snow}>
          {historyData?.total_events || 7} Documented Geological Incidents
        </ThemedText>
        <ThemedText variant="small" color="#94A3B8" style={{ marginTop: 4 }}>
          Comprehensive historical record of slope failures, cloudburst washouts, and rock avalanches documented along the Rishikesh–Joshimath corridor.
        </ThemedText>
      </View>

      {/* Severity Filter */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.base }}>
          <Chip label="All Events" selected={selectedSeverity === 'all'} onPress={() => setSelectedSeverity('all')} />
          <Chip label="Catastrophic" selected={selectedSeverity === 'catastrophic'} onPress={() => setSelectedSeverity('catastrophic')} />
          <Chip label="Very High" selected={selectedSeverity === 'very high'} onPress={() => setSelectedSeverity('very high')} />
          <Chip label="High" selected={selectedSeverity === 'high'} onPress={() => setSelectedSeverity('high')} />
          <Chip label="Moderate" selected={selectedSeverity === 'moderate'} onPress={() => setSelectedSeverity('moderate')} />
        </ScrollView>
      </View>

      {/* List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.river} style={{ marginTop: spacing.xl }} />
        ) : filteredEvents.length === 0 ? (
          <View style={styles.emptyCard}>
            <ThemedText variant="body" color={colors.granite}>No events match this filter.</ThemedText>
          </View>
        ) : (
          filteredEvents.map((ev: any) => {
            const badge = getSeverityBadge(ev.severity);
            return (
              <View key={ev.id} style={styles.eventCard}>
                <View style={styles.eventHeader}>
                  <ThemedText variant="h3" color={colors.ink} style={{ flex: 1 }}>
                    {ev.title}
                  </ThemedText>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <ThemedText variant="caption" color={badge.text} style={{ fontWeight: '700' }}>
                      {badge.label}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Calendar size={14} color={colors.granite} />
                    <ThemedText variant="caption" color={colors.granite}>{ev.event_date}</ThemedText>
                  </View>
                  <View style={styles.metaItem}>
                    <MapPin size={14} color={colors.granite} />
                    <ThemedText variant="caption" color={colors.granite} numberOfLines={1}>
                      {ev.location}
                    </ThemedText>
                  </View>
                </View>

                <ThemedText variant="body" color={colors.ink} style={styles.description}>
                  {ev.description}
                </ThemedText>

                <View style={styles.cardFooter}>
                  <ThemedText variant="caption" color={colors.granite}>
                    GPS: {ev.lat?.toFixed(4)}, {ev.lng?.toFixed(4)}
                  </ThemedText>
                  <TouchableOpacity
                    style={styles.mapBtn}
                    onPress={() => router.push('/(tabs)')}
                  >
                    <ThemedText variant="small" color={colors.river} style={{ fontWeight: '600' }}>
                      View corridor
                    </ThemedText>
                    <ArrowRight size={14} color={colors.river} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  headerTitleWrap: { flex: 1 },
  summaryCard: {
    backgroundColor: '#0F172A',
    margin: spacing.base,
    padding: spacing.lg,
    borderRadius: radii.md,
  },
  filterRow: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  },
  content: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'], gap: spacing.md },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.mist,
    borderRadius: radii.md,
  },
  eventCard: {
    backgroundColor: colors.snow,
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.mist,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 6,
    marginBottom: spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  description: {
    lineHeight: 22,
    marginVertical: spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mist,
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
