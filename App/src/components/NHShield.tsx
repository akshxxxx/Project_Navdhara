import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { colors, radii } from '../design/tokens';

interface NHShieldProps {
  size?: 24 | 40;
}

/**
 * NH-7 milestone yellow badge with Ink border.
 * Used in the header, strip start, share image.
 */
export function NHShield({ size = 24 }: NHShieldProps) {
  const isLarge = size === 40;
  const fontSize = isLarge ? 14 : 9;
  const paddingH = isLarge ? 8 : 4;
  const paddingV = isLarge ? 4 : 2;
  const borderWidth = 1.5;

  return (
    <View
      style={[
        styles.shield,
        {
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          borderWidth,
          minHeight: size,
          minWidth: size,
        },
      ]}
      accessibilityLabel="National Highway 7"
      accessibilityRole="image"
    >
      <ThemedText
        variant="caption"
        color={colors.ink}
        style={{
          fontSize,
          lineHeight: fontSize * 1.2,
          fontFamily: 'IBMPlexSansCondensed_700Bold',
        }}
      >
        NH 7
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  shield: {
    backgroundColor: colors.milestone,
    borderColor: colors.ink,
    borderRadius: radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
