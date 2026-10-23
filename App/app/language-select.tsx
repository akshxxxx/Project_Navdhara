import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { setStoredLanguage } from '../src/locales/i18n';
import { ThemedText } from '../src/components';
import { colors, radii, spacing, touchTarget } from '../src/design/tokens';

/**
 * First-launch language selection screen.
 * Two large buttons: "हिंदी" and "English".
 * After picking, navigates to the app.
 */
export default function LanguageSelectScreen() {
  const { i18n } = useTranslation();
  const router = useRouter();

  const selectLanguage = async (lang: string) => {
    await i18n.changeLanguage(lang);
    await setStoredLanguage(lang);
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ThemedText variant="h1" color={colors.ink} style={styles.title}>
          Choose your language
        </ThemedText>
        <ThemedText variant="h1" color={colors.ink} style={styles.title}>
          अपनी भाषा चुनें
        </ThemedText>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [
              styles.langButton,
              pressed && styles.pressed,
            ]}
            onPress={() => selectLanguage('hi')}
            accessibilityLabel="हिंदी भाषा चुनें"
            accessibilityRole="button"
          >
            <ThemedText
              variant="h1"
              color={colors.ink}
              style={styles.langLabel}
            >
              हिंदी
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.langButton,
              pressed && styles.pressed,
            ]}
            onPress={() => selectLanguage('en')}
            accessibilityLabel="Choose English"
            accessibilityRole="button"
          >
            <ThemedText
              variant="h1"
              color={colors.ink}
              style={styles.langLabel}
            >
              English
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.snow,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.xl,
  },
  title: {
    textAlign: 'center',
  },
  buttons: {
    width: '100%',
    gap: spacing.base,
  },
  langButton: {
    width: '100%',
    minHeight: 80,
    backgroundColor: colors.glacier,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.riverTint,
    borderColor: colors.river,
  },
  langLabel: {
    fontSize: 28,
  },
});
