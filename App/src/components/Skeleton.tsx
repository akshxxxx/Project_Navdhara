import React from 'react';
import { View, StyleSheet, type ViewStyle } from 'react-native';
import { colors, radii } from '../design/tokens';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  style?: ViewStyle;
  radius?: number;
}

/**
 * Skeleton loading placeholder in Mist colour.
 * Used when data is loading – strip shows grey blocks, text shows grey bars.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  style,
  radius = radii.xs,
}: SkeletonProps) {
  return (
    <View
      style={[
        styles.skeleton,
        {
          width: width as number,
          height,
          borderRadius: radius,
        },
        style,
      ]}
      accessibilityLabel="Loading"
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.mist,
    opacity: 0.6,
  },
});
