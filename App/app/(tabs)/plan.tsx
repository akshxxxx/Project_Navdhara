import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowUpDown } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  AppHeader, 
  ThemedText, 
  Button, 
  DepartureStrip,
  TownSelectModal,
  RiskBadge
} from '../../src/components';
import { towns, segmentIdForFrom, segmentIdForTo } from '../../src/data/towns';
import { colors, spacing, radii } from '../../src/design/tokens';

const LAST_TRIP_KEY = 'raah_last_trip';

export default function PlanScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isHindi = i18n.language === 'hi';
  
  const [fromId, setFromId] = useState('rishikesh');
  const [toId, setToId] = useState('joshimath');
  const [speedKmph, setSpeedKmph] = useState(30);
  
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [modalType, setModalType] = useState<'from' | 'to' | null>(null);
  const [lastTrip, setLastTrip] = useState<any>(null);

  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem(LAST_TRIP_KEY).then(data => {
        if (data) setLastTrip(JSON.parse(data));
      }).catch(() => {});
    }, [])
  );

  const fromTown = towns.find(t => t.id === fromId);
  const toTown = towns.find(t => t.id === toId);

  const handleSwap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const handleSelectTown = (id: string) => {
    const selectedTown = towns.find(t => t.id === id);
    if (!selectedTown) return;

    if (modalType === 'from') {
      // Allow reverse directions
      setFromId(id);
    } else {
      setToId(id);
    }
  };

  const handleCheckTrip = () => {
    if (!selectedSlot) return;
    const originSeg = segmentIdForFrom(fromId) || 'seg_01';
    const destSeg = segmentIdForTo(toId) || 'seg_18';
    
    // Save to last trip
    const tripToSave = {
      from: fromId,
      to: toId,
      fromName: fromTown?.name_en,
      toName: toTown?.name_en,
      dateFormatted: selectedSlot.timeLabel,
      level: selectedSlot.closureCount > 0 ? 'closed' : selectedSlot.maxRiskLevel,
      departTime: selectedSlot.departTime
    };
    AsyncStorage.setItem(LAST_TRIP_KEY, JSON.stringify(tripToSave)).catch(() => {});

    router.push({
      pathname: '/plan/result',
      params: { 
        origin: originSeg, 
        destination: destSeg, 
        departTime: selectedSlot.departTime,
        speedKmph: speedKmph
      }
    });
  };

  const handleCheckLastTrip = () => {
    if (lastTrip) {
      const originSeg = segmentIdForFrom(lastTrip.from) || 'seg_01';
      const destSeg = segmentIdForTo(lastTrip.to) || 'seg_18';
      router.push({
        pathname: '/plan/result',
        params: { 
          origin: originSeg, 
          destination: destSeg, 
          departTime: lastTrip.departTime,
          speedKmph: 30
        }
      });
    }
  };

  const originSeg = segmentIdForFrom(fromId) || 'seg_01';
  const destSeg = segmentIdForTo(toId) || 'seg_18';
  const isReverse = fromTown && toTown && fromTown.km > toTown.km;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title={t('nav.plan')} />
      
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
        {lastTrip && (
          <TouchableOpacity style={styles.lastTripCard} onPress={handleCheckLastTrip}>
            <ThemedText variant="small" color={colors.ink}>
              Last checked: {lastTrip.fromName} to {lastTrip.toName}, {lastTrip.dateFormatted}
            </ThemedText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 }}>
              {lastTrip.level && <RiskBadge level={lastTrip.level} />}
              <ThemedText variant="small" color={colors.river}>
                Check again
              </ThemedText>
            </View>
          </TouchableOpacity>
        )}
        
        <ThemedText variant="h1" color={colors.ink} style={styles.title}>
          {t('plan.title', 'Plan your trip')}
        </ThemedText>
        
        <View style={styles.formRow}>
          <View style={styles.field}>
            <ThemedText variant="small" color={colors.granite}>
              {t('plan.from', 'From')}
            </ThemedText>
            <TouchableOpacity 
              style={styles.selectBtn} 
              onPress={() => setModalType('from')}
            >
              <ThemedText variant="body" color={colors.ink}>
                {fromTown ? (isHindi ? fromTown.name_hi : fromTown.name_en) : ''} ▾
              </ThemedText>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity style={styles.swapBtn} onPress={handleSwap}>
            <ArrowUpDown size={20} color={colors.river} />
          </TouchableOpacity>
          
          <View style={styles.field}>
            <ThemedText variant="small" color={colors.granite}>
              {t('plan.to', 'To')}
            </ThemedText>
            <TouchableOpacity 
              style={styles.selectBtn} 
              onPress={() => setModalType('to')}
            >
              <ThemedText variant="body" color={colors.ink}>
                {toTown ? (isHindi ? toTown.name_hi : toTown.name_en) : ''} ▾
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {isReverse && (
          <ThemedText variant="small" color={colors.granite} style={{ marginTop: -12, marginBottom: spacing.lg }}>
            Towards Rishikesh
          </ThemedText>
        )}
        
        <View style={styles.dateSection}>
          <ThemedText variant="small" color={colors.granite} style={styles.dateLabel}>
            Departure
          </ThemedText>
          <DepartureStrip 
            origin={originSeg}
            destination={destSeg}
            speedKmph={speedKmph}
            onSlotSelected={setSelectedSlot}
          />
        </View>

        <View style={styles.advancedSection}>
          <ThemedText variant="small" color={colors.granite}>Advanced: Speed ({speedKmph} km/h)</ThemedText>
          {/* We could add a slider here, but leaving as text for now to keep it simple, or toggle between 30/40 */}
        </View>
        
        <View style={styles.bottomPin}>
          <Button 
            label={t('plan.cta', 'Check my trip')} 
            variant="primary" 
            onPress={handleCheckTrip} 
            disabled={!selectedSlot}
          />
        </View>
      </ScrollView>
      
      <TownSelectModal 
        visible={modalType !== null}
        towns={towns}
        title={modalType === 'from' ? t('plan.from', 'From') : t('plan.to', 'To')}
        onSelect={handleSelectTown}
        onClose={() => setModalType(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  content: { flex: 1, padding: spacing.base },
  lastTripCard: {
    backgroundColor: colors.glacier, padding: spacing.base,
    borderRadius: radii.md, marginBottom: spacing.lg,
  },
  title: { marginBottom: spacing.xl },
  formRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.xl,
  },
  field: { flex: 1 },
  selectBtn: {
    borderBottomWidth: 1, borderBottomColor: colors.mist,
    paddingVertical: spacing.xs, marginTop: spacing.xs,
  },
  swapBtn: {
    padding: spacing.sm, backgroundColor: colors.riverTint,
    borderRadius: radii.full, marginHorizontal: spacing.sm,
    marginTop: spacing.base,
  },
  dateSection: { marginBottom: spacing.xl },
  dateLabel: { marginBottom: spacing.sm },
  advancedSection: { marginBottom: spacing.xl },
  bottomPin: { marginTop: spacing.xl, marginBottom: spacing.xl }
});
