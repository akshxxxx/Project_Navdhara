import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from './ThemedText';
import { colors, spacing, radii } from '../design/tokens';
import type { DimensionValue } from 'react-native';

interface RainBarsProps {
  last24hMm: number;
  next24hMm: number;
  next72hMm: number;
}

export function RainBars({ last24hMm, next24hMm, next72hMm }: RainBarsProps) {
  const { t } = useTranslation();

  // Find max to scale the bars (cap at 150 for rendering)
  const max = Math.max(last24hMm, next24hMm, next72hMm, 20);
  const scale = (val: number) => `${Math.min((val / max) * 100, 100)}%`;

  return (
    <View style={styles.container}>
      <View style={styles.barGroup}>
        <ThemedText variant="caption" color={colors.granite} style={styles.label}>
          Last 24h
        </ThemedText>
        <View style={styles.track}>
          <View style={[styles.fill, { height: scale(last24hMm) as DimensionValue, backgroundColor: colors.riverTint }]} />
        </View>
        <ThemedText variant="small" color={colors.ink} style={styles.value}>
          {Math.round(last24hMm)} mm
        </ThemedText>
      </View>

      <View style={styles.barGroup}>
        <ThemedText variant="caption" color={colors.granite} style={styles.label}>
          Next 24h
        </ThemedText>
        <View style={styles.track}>
          <View style={[styles.fill, { height: scale(next24hMm) as DimensionValue, backgroundColor: colors.river }]} />
        </View>
        <ThemedText variant="small" color={colors.ink} style={styles.value}>
          {Math.round(next24hMm)} mm
        </ThemedText>
      </View>

      <View style={styles.barGroup}>
        <ThemedText variant="caption" color={colors.granite} style={styles.label}>
          Next 72h
        </ThemedText>
        <View style={styles.track}>
          <View style={[styles.fill, { height: scale(next72hMm) as DimensionValue, backgroundColor: colors.river }]} />
        </View>
        <ThemedText variant="small" color={colors.ink} style={styles.value}>
          {Math.round(next72hMm)} mm
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
    marginTop: spacing.md,
    marginBottom: spacing.base,
  },
  barGroup: {
    alignItems: 'center',
    flex: 1,
  },
  label: {
    marginBottom: spacing.xs,
  },
  track: {
    width: 32,
    height: 80,
    backgroundColor: colors.mist,
    borderRadius: radii.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  fill: {
    width: '100%',
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  value: {
    fontFamily: 'IBMPlexSansCondensed_600SemiBold',
  },
});
