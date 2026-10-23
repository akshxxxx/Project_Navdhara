import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { colors, radii, touchTarget } from '../design/tokens';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * Chip: 999 radius, 40px tall, Mist border.
 * Selected: River-tint fill, River border and text.
 */
export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected ? styles.selected : styles.unselected,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <ThemedText
        variant="small"
        color={selected ? colors.river : colors.ink}
        style={styles.label}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: touchTarget.min,
  },
  selected: {
    backgroundColor: colors.riverTint,
    borderColor: colors.river,
  },
  unselected: {
    backgroundColor: colors.snow,
    borderColor: colors.mist,
  },
  label: {
    fontFamily: 'IBMPlexSans_500Medium',
  },
});
