import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from './ThemedText';
import { setStoredLanguage } from '../locales/i18n';
import { colors, night, touchTarget } from '../design/tokens';

interface LanguageToggleProps {
  night?: boolean;
}

/**
 * Language toggle: "हिं | EN" – always one tap from any screen.
 * Switches between Hindi and English and persists the choice.
 */
export function LanguageToggle({ night: isNight = false }: LanguageToggleProps = {}) {
  const { i18n } = useTranslation();

  const toggle = async () => {
    const newLang = i18n.language === 'hi' ? 'en' : 'hi';
    await i18n.changeLanguage(newLang);
    await setStoredLanguage(newLang);
  };

  const isHindi = i18n.language === 'hi';
  const inactiveColor = isNight ? night.muted : colors.granite;
  const separatorColor = isNight ? night.line : colors.mist;

  return (
    <Pressable
      onPress={toggle}
      style={styles.toggle}
      accessibilityRole="button"
      accessibilityLabel={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}
      hitSlop={8}
    >
      <ThemedText
        variant="small"
        color={isHindi ? colors.river : inactiveColor}
        style={[styles.text, isHindi && styles.active]}
      >
        हिं
      </ThemedText>
      <ThemedText variant="small" color={separatorColor} style={styles.separator}>
        {' | '}
      </ThemedText>
      <ThemedText
        variant="small"
        color={!isHindi ? colors.river : inactiveColor}
        style={[styles.text, !isHindi && styles.active]}
      >
        EN
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'IBMPlexSansCondensed_600SemiBold',
    fontSize: 14,
  },
  active: {
    fontFamily: 'IBMPlexSansCondensed_700Bold',
  },
  separator: {
    fontSize: 14,
  },
});
