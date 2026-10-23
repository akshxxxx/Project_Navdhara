import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Image, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import { AppHeader, ThemedText } from '../../src/components';
import { getReports, saveReports, type QueuedReport } from '../../src/api/queue';
import { fetchFieldReports } from '../../src/api/client';
import { useRiskMap } from '../../src/api/hooks';
import { nearestSegment } from '../../src/utils/nearestSegment';
import { colors, spacing, radii } from '../../src/design/tokens';

export default function MyReportsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data: riskMapData } = useRiskMap();
  
  const [reports, setReports] = useState<QueuedReport[]>([]);

  useEffect(() => {
    let timer: any;
    
    const loadAndSync = async () => {
      const localReports = await getReports();
      setReports(localReports.sort((a, b) => b.createdAt - a.createdAt));
      
      // Attempt to sync with backend
      try {
        const remote = await fetchFieldReports();
        let changed = false;
        
        for (const r of localReports) {
          if (r.serverId && (r.status === 'pending' || r.status === 'verified' || r.status === 'rejected')) {
            const match = remote.find(rem => rem.id === r.serverId);
            if (match && match.status && match.status !== r.status) {
              r.status = match.status as any;
              changed = true;
            }
          }
        }
        
        if (changed) {
          await saveReports(localReports);
          setReports([...localReports].sort((a, b) => b.createdAt - a.createdAt));
        }
      } catch (err) {
        // Ignore network errors on polling
      }
    };
    
    loadAndSync();
    timer = setInterval(loadAndSync, 60000);
    return () => clearInterval(timer);
  }, []);

  const getStatusColor = (status: QueuedReport['status']) => {
    switch (status) {
      case 'waiting': return colors.granite;
      case 'pending': return colors.river;
      case 'verified': return colors.river;
      case 'rejected': return colors.granite;
      default: return colors.granite;
    }
  };

  const getStatusText = (status: QueuedReport['status']) => {
    switch (status) {
      case 'waiting': return 'Waiting to send';
      case 'pending': return 'Pending review';
      case 'verified': return 'Verified by officials';
      case 'rejected': return 'Rejected';
      default: return status;
    }
  };

  const renderItem = ({ item }: { item: QueuedReport }) => {
    let stretchName = 'Unknown stretch';
    if (riskMapData?.segments) {
      const n = nearestSegment(item.submission.lat, item.submission.lng, riskMapData.segments);
      if (n) stretchName = n.segment.name;
    }

    const date = new Date(item.createdAt).toLocaleString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const statusColor = getStatusColor(item.status);
    
    // Parse description like "[Road blocked] some note"
    const descMatch = item.submission.description.match(/^\[(.*?)\](.*)/);
    const typeEn = descMatch ? descMatch[1] : 'Incident';
    const note = descMatch ? descMatch[2].trim() : '';

    return (
      <View style={styles.card}>
        {item.photoUri ? (
          <Image source={{ uri: item.photoUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: colors.mist }]} />
        )}
        <View style={styles.cardContent}>
          <ThemedText variant="body" color={colors.ink}>
            {typeEn}
          </ThemedText>
          <ThemedText variant="caption" color={colors.granite} numberOfLines={1}>
            {stretchName}
          </ThemedText>
          <ThemedText variant="caption" color={colors.granite}>
            {date}
          </ThemedText>
          
          {item.photoUri && (
            <ThemedText variant="caption" color={colors.granite} style={{ fontStyle: 'italic' }}>
              Photo saved on this phone
            </ThemedText>
          )}
          
          <View style={[styles.statusChip, { borderColor: statusColor }]}>
            <ThemedText variant="caption" color={statusColor}>
              {getStatusText(item.status)}
            </ThemedText>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('nav.mine', 'My Reports')} showBack onBack={() => router.back()} />
      <FlatList
        data={reports}
        keyExtractor={item => item.clientId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ThemedText variant="body" color={colors.granite}>
              You haven't submitted any reports yet.
            </ThemedText>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  listContent: { padding: spacing.base, gap: spacing.base },
  card: { flexDirection: 'row', padding: spacing.sm, backgroundColor: colors.snow, borderRadius: radii.md, borderWidth: 1, borderColor: colors.mist, gap: spacing.md },
  thumb: { width: 80, height: 80, borderRadius: radii.sm },
  cardContent: { flex: 1, justifyContent: 'center', gap: 4 },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.full, borderWidth: 1, marginTop: 4 },
  empty: { alignItems: 'center', padding: spacing.xl }
});
