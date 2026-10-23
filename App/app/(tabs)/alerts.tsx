import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ScrollView, Alert, ToastAndroid, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppHeader, ThemedText, RiskIcon, BottomSheet, SegmentDetail, SubscribeSheet, ListenButton, type BottomSheetRef } from '../../src/components';
import { useAlerts, useRiskMap, useClosures, usePriorityList } from '../../src/api/hooks';
import { colors, spacing, radii } from '../../src/design/tokens';
import { parseLevel } from '../../src/api/types';



export default function AlertsScreen() {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<'active' | 'following'>('active');
  const [following, setFollowing] = useState<any[]>([]);
  
  const { data: alertsData } = useAlerts();
  const { data: riskMapData } = useRiskMap();
  const { data: closuresData } = useClosures();
  const { data: priorityList } = usePriorityList();
  
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const detailSheetRef = useRef<BottomSheetRef>(null);
  
  const [subscribeTarget, setSubscribeTarget] = useState<{id: string, name: string} | null>(null);
  const subscribeSheetRef = useRef<BottomSheetRef>(null);

  const notifiedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    loadFollowing();
  }, []);

  const loadFollowing = async () => {
    try {
      const data = await AsyncStorage.getItem('raah_following');
      if (data) setFollowing(JSON.parse(data));
    } catch (e) {}
  };

  useEffect(() => {
    if (alertsData && following.length > 0) {
      alertsData.forEach(async (alert) => {
        const follow = following.find(f => f.id === alert.segment_id);
        if (follow && follow.push) {
          const thresholdLvl = follow.threshold === 'Moderate' ? 1 : follow.threshold === 'High' ? 2 : 3;
          if (alert.level >= thresholdLvl) {
            const cacheKey = `${alert.segment_id}-${alert.level}`;
            const lastNotified = notifiedRef.current[cacheKey] || 0;
            // Only notify once per hour for the same alert level on a stretch
            if (Date.now() - lastNotified > 60 * 60 * 1000) {
              notifiedRef.current[cacheKey] = Date.now();
              // In a real app, this would be a push notification via backend.
              // For Expo Go, we've disabled local notifications.
            }
          }
        }
      });
    }
  }, [alertsData, following, t]);

  const handleSubscribeSuccess = (name: string) => {
    loadFollowing();
    if (Platform.OS === 'android') {
      ToastAndroid.show(`Alerts on for ${name}`, ToastAndroid.SHORT);
    } else {
      Alert.alert('Success', `Alerts on for ${name}`);
    }
  };

  const openSubscribe = (id: string, name: string) => {
    setSubscribeTarget({ id, name });
    subscribeSheetRef.current?.snapToIndex(0);
  };

  const openDetail = (id: string) => {
    setSelectedSegmentId(id);
    detailSheetRef.current?.snapToIndex(1);
  };

  const renderActiveItem = ({ item }: { item: any }) => {
    if (item.type === 'closure') {
      const d = new Date(item.starts_at);
      const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return (
        <TouchableOpacity style={styles.alertRow} onPress={() => openDetail(item.segment_id)}>
          <View style={styles.alertIcon}>
            <RiskIcon level="closed" size={24} />
          </View>
          <View style={styles.alertContent}>
            <ThemedText variant="body" color={colors.ink}>
              {item.segment_name}
            </ThemedText>
            <ThemedText variant="caption" color={colors.granite} numberOfLines={2}>
              {item.reason} ({item.source})
            </ThemedText>
          </View>
          <View style={styles.alertRight}>
            <ThemedText variant="caption" color={colors.granite}>
              Since {timeStr}
            </ThemedText>
          </View>
        </TouchableOpacity>
      );
    }

    // Alert
    const mins = Math.floor((Date.now() - new Date(item.created_at).getTime()) / 60000);
    const timeDisplay = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h`;

    return (
      <TouchableOpacity style={styles.alertRow} onPress={() => openDetail(item.segment.id)}>
        <View style={styles.unreadBar} />
        <View style={styles.alertIcon}>
          <RiskIcon level={item.level} size={24} />
        </View>
        <View style={styles.alertContent}>
          <ThemedText variant="body" color={colors.ink}>
            {item.segment.name}
          </ThemedText>
          <ThemedText variant="caption" color={colors.granite} numberOfLines={1}>
            {t(`verdict.${item.level}`)} · {item.segment.main_driver_en}
          </ThemedText>
        </View>
        <View style={styles.alertRight}>
          <ThemedText variant="caption" color={colors.granite}>
            {timeDisplay}
          </ThemedText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
            <ListenButton segmentId={item.segment.id} />
            {!following.some(f => f.id === item.segment.id) && (
              <TouchableOpacity onPress={() => openSubscribe(item.segment.id, item.segment.name)} style={styles.quietFollow}>
                <ThemedText variant="caption" color={colors.river}>Follow</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const activeItems: any[] = [];
  if (closuresData?.closures) {
    closuresData.closures.forEach(c => activeItems.push({ type: 'closure', ...c }));
  }
  if (alertsData) {
    alertsData.forEach(a => {
      // Don't duplicate if there's already a closure for this segment
      if (!activeItems.find(c => c.segment_id === a.segment_id)) {
        activeItems.push({ type: 'alert', ...a });
      }
    });
  }

  // Sort: closures first, then by time desc
  activeItems.sort((a, b) => {
    if (a.type === 'closure' && b.type !== 'closure') return -1;
    if (b.type === 'closure' && a.type !== 'closure') return 1;
    const timeA = new Date(a.starts_at || a.created_at).getTime();
    const timeB = new Date(b.starts_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const renderFollowing = () => (
    <ScrollView style={styles.followingList} contentContainerStyle={{ padding: spacing.base, gap: spacing.md }}>
      <ThemedText variant="h3" color={colors.ink}>Followed Stretches</ThemedText>
      {following.length === 0 ? (
        <ThemedText variant="body" color={colors.granite}>You are not following any stretches yet.</ThemedText>
      ) : (
        following.map(f => (
          <View key={f.id} style={styles.followRow}>
            <View style={{ flex: 1 }}>
              <ThemedText variant="body" color={colors.ink}>{f.name}</ThemedText>
              <ThemedText variant="caption" color={colors.granite}>
                Alerts: {f.push ? 'Push ' : ''}{f.sms ? 'SMS ' : ''} (From {f.threshold})
              </ThemedText>
            </View>
            <TouchableOpacity onPress={async () => {
              const newF = following.filter(item => item.id !== f.id);
              setFollowing(newF);
              await AsyncStorage.setItem('raah_following', JSON.stringify(newF));
            }}>
              <ThemedText variant="body" color={colors.river}>Unfollow</ThemedText>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('nav.alerts')} />
      
      {priorityList && priorityList.length > 0 && (
        <View style={styles.priorityCard}>
          <ThemedText variant="body" color="#856404" style={{ fontWeight: 'bold', marginBottom: spacing.xs }}>
            Top Priority Segments (BRO)
          </ThemedText>
          {priorityList.slice(0, 3).map((p: any) => (
            <ThemedText key={p.id} variant="small" color="#856404" style={{ marginTop: 2 }}>
              • {p.name} (Score: {p.priority_score.toFixed(2)})
            </ThemedText>
          ))}
        </View>
      )}

      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, tab === 'active' && styles.tabActive]} 
          onPress={() => setTab('active')}
        >
          <ThemedText variant="body" color={tab === 'active' ? colors.ink : colors.granite}>Active</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, tab === 'following' && styles.tabActive]} 
          onPress={() => setTab('following')}
        >
          <ThemedText variant="body" color={tab === 'following' ? colors.ink : colors.granite}>Following</ThemedText>
        </TouchableOpacity>
      </View>

      {tab === 'active' ? (
        <View style={{ flex: 1 }}>
          <View style={{ padding: spacing.base, paddingBottom: 0 }}>
            <ThemedText variant="h3" color={colors.ink}>Road closures</ThemedText>
          </View>
          {(!closuresData || !closuresData.closures || closuresData.closures.length === 0) && (
            <View style={{ padding: spacing.base }}>
              <ThemedText variant="body" color={colors.granite}>No road closures right now.</ThemedText>
            </View>
          )}
          
          <FlatList
            data={activeItems}
            keyExtractor={item => item.id.toString()}
            renderItem={renderActiveItem}
            contentContainerStyle={{ paddingBottom: spacing['2xl'] }}
          />
        </View>
      ) : (
        renderFollowing()
      )}

      <BottomSheet ref={detailSheetRef} initialIndex={-1}>
        {selectedSegmentId && riskMapData && (
          <SegmentDetail 
            segment={riskMapData.segments.find(s => s.id === selectedSegmentId)!} 
            updatedAt={riskMapData.as_of}
            onAlertMe={() => {
              detailSheetRef.current?.close();
              const seg = riskMapData.segments.find(s => s.id === selectedSegmentId);
              if (seg) openSubscribe(seg.id, seg.name);
            }}
          />
        )}
      </BottomSheet>

      <BottomSheet ref={subscribeSheetRef} initialIndex={-1}>
        {subscribeTarget && (
          <SubscribeSheet 
            itemId={subscribeTarget.id}
            itemName={subscribeTarget.name}
            onClose={() => subscribeSheetRef.current?.close()}
            onSuccess={handleSubscribeSuccess}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.mist },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.ink },
  alertRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.mist, backgroundColor: colors.snow },
  unreadBar: { position: 'absolute', left: 0, top: spacing.md, bottom: spacing.md, width: 4, backgroundColor: colors.river, borderRadius: 2 },
  alertIcon: { marginRight: spacing.md },
  alertContent: { flex: 1 },
  alertRight: { alignItems: 'flex-end', gap: spacing.sm },
  quietFollow: { backgroundColor: colors.riverTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.sm },
  followingList: { flex: 1 },
  followRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, backgroundColor: colors.snow, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.mist },
  priorityCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    backgroundColor: '#fff3cd',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#ffe69c',
  }
});
