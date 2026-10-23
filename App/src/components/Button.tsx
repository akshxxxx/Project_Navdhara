import React from 'react';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { ThemedText } from './ThemedText';
import { colors, radii, touchTarget } from '../design/tokens';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Button: Primary (River fill, white text) or Secondary (Snow fill, Mist border, Ink text).
 * 48px tall minimum touch target. Label is the verb.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}: ButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <ThemedText
        variant="body"
        color={isPrimary ? colors.snow : colors.ink}
        style={[
          styles.label,
          disabled && styles.disabledText,
        ]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    paddingHorizontal: 24,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.river,
  },
  secondary: {
    backgroundColor: colors.snow,
    borderWidth: 1,
    borderColor: colors.mist,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontFamily: 'IBMPlexSans_500Medium',
    fontSize: 16,
  },
  disabledText: {
    opacity: 0.6,
  },
});
