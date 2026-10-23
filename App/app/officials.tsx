import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Ban,
  Activity,
  Plus,
  Trash2,
} from 'lucide-react-native';
import { ThemedText, Button, Chip } from '../src/components';
import {
  fetchFieldReports,
  fetchClosures,
  fetchPriorityList,
  postAdminValidateReport,
  postAdminClosure,
  deleteAdminClosure,
} from '../src/api/client';
import { colors, spacing, radii } from '../src/design/tokens';
import { towns } from '../src/data/towns';

export default function OfficialsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'reports' | 'closures' | 'priority'>('reports');

  // Queries
  const {
    data: reports,
    isLoading: loadingReports,
    refetch: refetchReports,
    isRefetching: refreshingReports,
  } = useQuery({
    queryKey: ['field-reports'],
    queryFn: fetchFieldReports,
  });

  const {
    data: closures,
    isLoading: loadingClosures,
    refetch: refetchClosures,
    isRefetching: refreshingClosures,
  } = useQuery({
    queryKey: ['closures'],
    queryFn: () => fetchClosures(),
  });

  const {
    data: priorityList,
    isLoading: loadingPriority,
    refetch: refetchPriority,
    isRefetching: refreshingPriority,
  } = useQuery({
    queryKey: ['priority-list'],
    queryFn: fetchPriorityList,
  });

  // Closure form state
  const [selectedSegmentId, setSelectedSegmentId] = useState('seg_05');
  const [closureStatus, setClosureStatus] = useState<'closed' | 'one_way' | 'restricted'>('closed');
  const [closureReason, setClosureReason] = useState('Active rockfall hazard & debris clearance in progress');
  const [isSubmittingClosure, setIsSubmittingClosure] = useState(false);

  // Validate report mutation
  const validateMutation = useMutation({
    mutationFn: postAdminValidateReport,
    onSuccess: (_, vars) => {
      Alert.alert('Report Updated', `Report #${vars.reportId} marked as ${vars.status}.`);
      queryClient.invalidateQueries({ queryKey: ['field-reports'] });
      queryClient.invalidateQueries({ queryKey: ['risk-map'] });
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.message || 'Could not validate report.');
    },
  });

  // Declare closure
  const handleDeclareClosure = async () => {
    if (!closureReason.trim()) {
      Alert.alert('Missing Field', 'Please provide a closure reason.');
      return;
    }
    setIsSubmittingClosure(true);
    try {
      await postAdminClosure({
        segmentId: selectedSegmentId,
        status: closureStatus,
        reason: closureReason,
      });
      Alert.alert('Success', `Road restriction successfully imposed on ${selectedSegmentId}.`);
      setClosureReason('');
      queryClient.invalidateQueries({ queryKey: ['closures'] });
      queryClient.invalidateQueries({ queryKey: ['risk-map'] });
    } catch (e: any) {
      Alert.alert('Failed', e?.message || 'Could not impose road closure.');
    } finally {
      setIsSubmittingClosure(false);
    }
  };

  // Lift closure
  const handleLiftClosure = async (closureId: number) => {
    Alert.alert('Lift Restriction', 'Are you sure you want to reopen this highway stretch?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reopen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAdminClosure(closureId);
            Alert.alert('Reopened', 'Highway sector restored to normal traffic.');
            queryClient.invalidateQueries({ queryKey: ['closures'] });
            queryClient.invalidateQueries({ queryKey: ['risk-map'] });
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to lift closure.');
          }
        },
      },
    ]);
  };

  const isRefreshing = refreshingReports || refreshingClosures || refreshingPriority;
  const onRefreshAll = () => {
    refetchReports();
    refetchClosures();
    refetchPriority();
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
            <Shield size={20} color={colors.river} />
            <ThemedText variant="h3" color={colors.ink}>Control Room Portal</ThemedText>
          </View>
          <ThemedText variant="caption" color={colors.granite}>NH-7 Highway Operations & Response</ThemedText>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reports' && styles.tabActive]}
          onPress={() => setActiveTab('reports')}
        >
          <ThemedText variant="body" color={activeTab === 'reports' ? colors.river : colors.granite} style={{ fontWeight: '600' }}>
            Field Reports ({reports?.length || 0})
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'closures' && styles.tabActive]}
          onPress={() => setActiveTab('closures')}
        >
          <ThemedText variant="body" color={activeTab === 'closures' ? colors.river : colors.granite} style={{ fontWeight: '600' }}>
            Closures ({closures?.closures?.length ?? closures?.active_closures_count ?? 0})
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'priority' && styles.tabActive]}
          onPress={() => setActiveTab('priority')}
        >
          <ThemedText variant="body" color={activeTab === 'priority' ? colors.river : colors.granite} style={{ fontWeight: '600' }}>
            Priority List
          </ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefreshAll} />}
      >
        {/* TAB 1: FIELD REPORTS */}
        {activeTab === 'reports' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="h2" color={colors.ink}>Crowd-sourced Reports</ThemedText>
              <ThemedText variant="small" color={colors.granite}>
                Review citizen hazard reports and dispatch response teams
              </ThemedText>
            </View>

            {loadingReports ? (
              <ActivityIndicator size="large" color={colors.river} style={{ marginTop: spacing.xl }} />
            ) : !reports || reports.length === 0 ? (
              <View style={styles.emptyCard}>
                <ThemedText variant="body" color={colors.granite}>No citizen field reports pending.</ThemedText>
              </View>
            ) : (
              reports.map((r: any) => (
                <View key={r.id} style={styles.reportCard}>
                  <View style={styles.reportTop}>
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="h3" color={colors.ink}>
                        Report #{r.id} • {r.status ? r.status.toUpperCase() : 'PENDING'}
                      </ThemedText>
                      <ThemedText variant="caption" color={colors.granite}>
                        Coordinates: {r.lat?.toFixed(4)}, {r.lng?.toFixed(4)}
                      </ThemedText>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: r.status === 'verified' ? '#D1FAE5' : r.status === 'rejected' ? '#FEE2E2' : '#FEF3C7' }
                    ]}>
                      <ThemedText variant="caption" color={r.status === 'verified' ? '#065F46' : r.status === 'rejected' ? '#991B1B' : '#92400E'}>
                        {r.status || 'unverified'}
                      </ThemedText>
                    </View>
                  </View>

                  <ThemedText variant="body" color={colors.ink} style={{ marginVertical: spacing.sm }}>
                    "{r.description}"
                  </ThemedText>

                  <ThemedText variant="caption" color={colors.granite}>
                    Reported by: {r.reporter_name || 'Anonymous traveler'} • {r.created_at ? new Date(r.created_at).toLocaleTimeString() : 'Recent'}
                  </ThemedText>

                  {/* Actions */}
                  <View style={styles.reportActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                      onPress={() => validateMutation.mutate({ reportId: r.id, status: 'verified' })}
                    >
                      <CheckCircle size={16} color={colors.snow} />
                      <ThemedText variant="small" color={colors.snow} style={{ fontWeight: '600' }}>
                        Verify
                      </ThemedText>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                      onPress={() => validateMutation.mutate({ reportId: r.id, status: 'rejected' })}
                    >
                      <XCircle size={16} color={colors.snow} />
                      <ThemedText variant="small" color={colors.snow} style={{ fontWeight: '600' }}>
                        Reject
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 2: ROAD CLOSURES */}
        {activeTab === 'closures' && (
          <View style={styles.tabContent}>
            {/* Impose closure card */}
            <View style={styles.declareCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
                <Ban size={20} color="#DC2626" />
                <ThemedText variant="h3" color={colors.ink}>Impose Emergency Restriction</ThemedText>
              </View>

              <ThemedText variant="small" color={colors.granite} style={{ marginBottom: 4 }}>
                Target Highway Segment:
              </ThemedText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['seg_01','seg_02','seg_03','seg_04','seg_05','seg_06','seg_07','seg_08','seg_09','seg_10','seg_11','seg_12','seg_13','seg_14','seg_15','seg_16','seg_17','seg_18'].map(id => (
                    <Chip
                      key={id}
                      label={id}
                      selected={selectedSegmentId === id}
                      onPress={() => setSelectedSegmentId(id)}
                    />
                  ))}
                </View>
              </ScrollView>

              <ThemedText variant="small" color={colors.granite} style={{ marginBottom: 4 }}>
                Restriction Level:
              </ThemedText>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: spacing.md }}>
                {(['closed', 'one_way', 'restricted'] as const).map(st => (
                  <Chip
                    key={st}
                    label={st.replace('_', ' ').toUpperCase()}
                    selected={closureStatus === st}
                    onPress={() => setClosureStatus(st)}
                  />
                ))}
              </View>

              <ThemedText variant="small" color={colors.granite} style={{ marginBottom: 4 }}>
                Reason / Advisory:
              </ThemedText>
              <TextInput
                style={styles.textInput}
                value={closureReason}
                onChangeText={setClosureReason}
                placeholder="e.g. Mudslide debris blocking both lanes near km 78"
                placeholderTextColor={colors.granite}
              />

              <Button
                label={isSubmittingClosure ? 'Submitting...' : 'Declare Highway Closure'}
                variant="primary"
                onPress={handleDeclareClosure}
                disabled={isSubmittingClosure}
              />
            </View>

            {/* Active closures list */}
            <View style={styles.sectionHeader}>
              <ThemedText variant="h2" color={colors.ink}>Active Closures & Restrictions</ThemedText>
            </View>

            {loadingClosures ? (
              <ActivityIndicator size="large" color={colors.river} />
            ) : !closures?.closures || closures.closures.length === 0 ? (
              <View style={styles.emptyCard}>
                <ThemedText variant="body" color={colors.granite}>All NH-7 corridor sectors currently open.</ThemedText>
              </View>
            ) : (
              closures.closures.map((c: any) => (
                <View key={c.id || c.segment_id} style={styles.closureCard}>
                  <View style={styles.closureTop}>
                    <View style={{ flex: 1 }}>
                      <ThemedText variant="h3" color={colors.ink}>
                        {c.segment_id?.toUpperCase()} • {c.status?.toUpperCase()}
                      </ThemedText>
                      <ThemedText variant="body" color={colors.ink} style={{ marginTop: 2 }}>
                        {c.reason}
                      </ThemedText>
                      <ThemedText variant="caption" color={colors.granite} style={{ marginTop: 4 }}>
                        Source: {c.source || 'Traffic Police'} • Started: {c.starts_at ? new Date(c.starts_at).toLocaleTimeString() : 'Active'}
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      style={styles.reopenBtn}
                      onPress={() => handleLiftClosure(c.id)}
                    >
                      <Trash2 size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* TAB 3: PRIORITY LIST */}
        {activeTab === 'priority' && (
          <View style={styles.tabContent}>
            <View style={styles.sectionHeader}>
              <ThemedText variant="h2" color={colors.ink}>Critical Highway Hotspots</ThemedText>
              <ThemedText variant="small" color={colors.granite}>
                Top landslide vulnerable segments ranked by physical hazard & consequence scores
              </ThemedText>
            </View>

            {loadingPriority ? (
              <ActivityIndicator size="large" color={colors.river} />
            ) : !priorityList || priorityList.length === 0 ? (
              <View style={styles.emptyCard}>
                <ThemedText variant="body" color={colors.granite}>Priority telemetry unavailable.</ThemedText>
              </View>
            ) : (
              priorityList.map((p: any, idx: number) => (
                <View key={p.id || idx} style={styles.priorityCard}>
                  <View style={styles.priorityRank}>
                    <ThemedText variant="h2" color={colors.river}>#{idx + 1}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="h3" color={colors.ink}>{p.name}</ThemedText>
                    <ThemedText variant="small" color={colors.granite}>
                      Risk Level: {p.risk_level} • Score: {p.risk_score?.toFixed(2)}
                    </ThemedText>
                    <View style={styles.metricsRow}>
                      <ThemedText variant="caption" color={colors.granite}>
                        Rain: {p.rain_mm_3d ?? p.r3d_mm ?? 0} mm
                      </ThemedText>
                      <ThemedText variant="caption" color={colors.granite}>
                        Terrain: {p.terrain_level || 'Normal'}
                      </ThemedText>
                      {p.nearest_hospital_km && (
                        <ThemedText variant="caption" color={colors.granite}>
                          Hospital: {p.nearest_hospital_km} km
                        </ThemedText>
                      )}
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
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
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
    backgroundColor: colors.snow,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.river,
  },
  content: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  tabContent: { gap: spacing.md },
  sectionHeader: { marginBottom: spacing.sm },
  emptyCard: {
    padding: spacing.xl,
    alignItems: 'center',
    backgroundColor: colors.mist,
    borderRadius: radii.md,
  },
  reportCard: {
    backgroundColor: colors.snow,
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.mist,
  },
  reportTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reportActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  declareCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: spacing.base,
  },
  textInput: {
    backgroundColor: colors.snow,
    borderWidth: 1,
    borderColor: colors.mist,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    height: 44,
    marginBottom: spacing.md,
    color: colors.ink,
    fontFamily: 'IBMPlexSans_400Regular',
  },
  closureCard: {
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
  },
  closureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reopenBtn: {
    padding: spacing.sm,
  },
  priorityCard: {
    flexDirection: 'row',
    backgroundColor: colors.snow,
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.mist,
    alignItems: 'center',
    gap: spacing.md,
  },
  priorityRank: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.glacier,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: 4,
  },
});
