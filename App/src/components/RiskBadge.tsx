import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RiskIcon } from './RiskIcon';
import { ThemedText } from './ThemedText';
import { riskColourFor, night, colors, radii, type EffectiveLevel } from '../design/tokens';

interface RiskBadgeProps {
  level: EffectiveLevel;
  /** Replace the level word with the verdict text */
  showVerdict?: boolean;
  night?: boolean;
  size?: number;
}

/**
 * Risk shape + level word on the level's tint background.
 * Shape + word always appear together so colour is never the only carrier.
 */
export function RiskBadge({
  level,
  showVerdict = false,
  night: isNight = false,
  size = 16,
}: RiskBadgeProps) {
  const { t } = useTranslation();

  const tintBg = isNight ? 'rgba(255,255,255,0.08)' : riskColourFor(level).tint;
  const textColor = isNight ? night.text : colors.ink;

  const labelKey = level === 'closed' ? 'closed' : level;
  const label = showVerdict
    ? t(`verdict.${labelKey}`)
    : (level === 'closed' ? t('verdict.closed') : t(`risk_level.${level}`));

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: tintBg },
      ]}
      accessibilityLabel={`${label} risk`}
      accessibilityRole="text"
    >
      <RiskIcon level={level} size={size} night={isNight} />
      <ThemedText
        variant="small"
        color={textColor}
        style={styles.label}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.xs,
    gap: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: 'IBMPlexSansCondensed_600SemiBold',
    fontSize: 14,
  },
});
