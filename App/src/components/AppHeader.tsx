import React, { useRef, useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { MoreVertical, ChevronLeft } from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import Slider from '@react-native-community/slider';
import { NHShield } from './NHShield';
import { ThemedText } from './ThemedText';
import { LanguageToggle } from './LanguageToggle';
import { BottomSheet, type BottomSheetRef } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { colors, spacing, touchTarget, iconSize, iconStroke, radii, risk } from '../design/tokens';
import { useDemoStore } from '../api/demoStore';

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function AppHeader({ title, showBack, onBack }: AppHeaderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  
  // Demo state
  const { simulateRainMm, setSimulateRainMm, asOf, setAsOf, useSavedData, setUseSavedData, reset } = useDemoStore();
  const [taps, setTaps] = useState(0);
  const sheetRef = useRef<BottomSheetRef>(null);

  // Local state for the slider to avoid constant refetching on slide
  const [localSliderValue, setLocalSliderValue] = useState(simulateRainMm || 0);

  useEffect(() => {
    if (taps >= 5) {
      sheetRef.current?.snapToIndex(0);
      setTaps(0);
    }
    const timer = setTimeout(() => setTaps(0), 2000);
    return () => clearTimeout(timer);
  }, [taps]);

  const handleApplySimRain = (val: number) => {
    setLocalSliderValue(val);
    setSimulateRainMm(val);
    setAsOf(null); // Mutually exclusive
  };

  const handleApplyDate = (date: string) => {
    setAsOf(date);
    setSimulateRainMm(null); // Mutually exclusive
  };

  const handleBackToLive = () => {
    reset();
    setLocalSliderValue(0);
  };

  const isSim = simulateRainMm !== null;
  const isReplay = asOf !== null;
  const isSaved = useSavedData;

  return (
    <>
      <View style={styles.header}>
        <View style={styles.left}>
          {showBack ? (
            <Pressable onPress={onBack} hitSlop={8} style={{ marginRight: spacing.sm }}>
              <ChevronLeft size={24} color={colors.ink} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setTaps(prev => prev + 1)}>
              <NHShield size={24} />
            </Pressable>
          )}
          <ThemedText variant="h3" style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          {(isSim || isReplay || isSaved) && (
            <View style={styles.simChip}>
              <ThemedText variant="caption" color={colors.ink}>
                {isSaved ? 'Saved Data' : isSim ? 'Simulation' : 'Replay'}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.right}>
          <LanguageToggle />
          <Pressable
            onPress={() => setMenuOpen(!menuOpen)}
            style={styles.moreButton}
            accessibilityLabel="More options"
            accessibilityRole="button"
            hitSlop={8}
          >
            <MoreVertical size={iconSize} strokeWidth={iconStroke} color={colors.granite} />
          </Pressable>
        </View>
      </View>
      
      {menuOpen && (
        <View style={styles.menu}>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/emergency'); }}>
            <ThemedText variant="body" color={colors.ink}>Emergency SOS</ThemedText>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/officials'); }}>
            <ThemedText variant="body" color={colors.ink}>Control Room (Officials)</ThemedText>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/history'); }}>
            <ThemedText variant="body" color={colors.ink}>Historical Landslides</ThemedText>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/drive'); }}>
            <ThemedText variant="body" color={colors.ink}>Drive HUD Mode</ThemedText>
          </Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); router.push('/about'); }}>
            <ThemedText variant="body" color={colors.ink}>About & Model</ThemedText>
          </Pressable>
        </View>
      )}

      <BottomSheet ref={sheetRef} initialIndex={-1}>
        <ScrollView style={styles.demoSheet} contentContainerStyle={{ paddingBottom: spacing['2xl'] }}>
          <ThemedText variant="h2" color={colors.ink}>Demo Panel</ThemedText>
          
          {/* STORM SIMULATION */}
          <View style={styles.section}>
            <ThemedText variant="h3" color={colors.ink}>Storm simulation (Rain mm)</ThemedText>
            <Slider
              style={{ width: '100%', height: 40 }}
              minimumValue={0}
              maximumValue={180}
              step={1}
              value={localSliderValue}
              onValueChange={setLocalSliderValue}
              onSlidingComplete={handleApplySimRain}
              minimumTrackTintColor={colors.river}
              maximumTrackTintColor={colors.mist}
            />
            <ThemedText variant="body" color={colors.ink} style={{ textAlign: 'center' }}>
              {Math.round(localSliderValue)} mm
            </ThemedText>
            
            <View style={styles.chipRow}>
              <Chip label="Moderate (35)" selected={simulateRainMm === 35} onPress={() => handleApplySimRain(35)} />
              <Chip label="Severe (85)" selected={simulateRainMm === 85} onPress={() => handleApplySimRain(85)} />
              <Chip label="Cloudburst (140)" selected={simulateRainMm === 140} onPress={() => handleApplySimRain(140)} />
            </View>
          </View>

          {/* TIME MACHINE */}
          <View style={styles.section}>
            <ThemedText variant="h3" color={colors.ink}>Time machine</ThemedText>
            <View style={styles.chipRow}>
              <Chip label="12 Aug 2023" selected={asOf === '2023-08-12'} onPress={() => handleApplyDate('2023-08-12')} />
              <Chip label="13 Aug 2023" selected={asOf === '2023-08-13'} onPress={() => handleApplyDate('2023-08-13')} />
              <Chip label="14 Aug 2023" selected={asOf === '2023-08-14'} onPress={() => handleApplyDate('2023-08-14')} />
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText variant="h3" color={colors.ink}>Data source</ThemedText>
            <View style={styles.chipRow}>
              <Chip label="Live API" selected={!useSavedData} onPress={() => setUseSavedData(false, false)} />
              <Chip label="Saved data (Fixtures)" selected={useSavedData} onPress={() => setUseSavedData(true, true)} />
            </View>
          </View>

          <Button label="Back to live" variant={(!isSim && !isReplay && !isSaved) ? 'primary' : 'secondary'} onPress={handleBackToLive} />
          
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    backgroundColor: colors.snow,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    flexShrink: 1,
  },
  simChip: {
    backgroundColor: risk[1].tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  moreButton: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoSheet: {
    padding: spacing.base,
    flex: 1,
  },
  section: {
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  menu: {
    position: 'absolute',
    top: 56,
    right: spacing.base,
    backgroundColor: colors.snow,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.mist,
    boxShadow: `0px 2px 4px rgba(27, 42, 51, 0.1)`, // colors.ink = #1B2A33 = rgb(27,42,51)
    elevation: 4,
    zIndex: 100,
  },
  menuItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  }
});
