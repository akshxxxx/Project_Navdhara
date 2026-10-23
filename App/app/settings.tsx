import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText, Button, LanguageToggle } from '../src/components';
import { colors, spacing, radii } from '../src/design/tokens';
import { useDemoStore } from '../src/api/demoStore';

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { simulateRainMm, setSimulateRainMm } = useDemoStore();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>
        <ThemedText variant="h3" color={colors.ink}>{t('settings', 'Settings')}</ThemedText>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>Language</ThemedText>
          <View style={styles.card}>
            <LanguageToggle night={false} />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>Account</ThemedText>
          <View style={styles.card}>
            <TouchableOpacity onPress={() => router.push('/report/mine')} style={{ paddingVertical: spacing.xs }}>
              <ThemedText variant="body" color={colors.ink}>My Reports</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText variant="h3" color={colors.ink} style={styles.sectionTitle}>Demo Tools</ThemedText>
          <View style={styles.card}>
            <ThemedText variant="body" color={colors.ink} style={{ marginBottom: spacing.md }}>
              Simulate Rain (mm)
            </ThemedText>
            
            <View style={styles.buttonRow}>
              {[null, 0, 35, 85, 140].map((val) => (
                <TouchableOpacity 
                  key={String(val)}
                  style={[styles.simBtn, simulateRainMm === val && styles.simBtnActive]}
                  onPress={() => setSimulateRainMm(val)}
                >
                  <ThemedText variant="small" color={simulateRainMm === val ? colors.snow : colors.ink}>
                    {val === null ? 'Live' : `${val}`}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <ThemedText variant="caption" color={colors.granite} style={{ marginTop: spacing.sm }}>
              Overrides live weather API with artificial rainfall across the whole corridor.
            </ThemedText>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.snow },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderBottomWidth: 1, borderBottomColor: colors.mist,
  },
  backBtn: { padding: spacing.xs, marginRight: spacing.sm },
  content: { flex: 1 },
  scrollContent: { padding: spacing.base, paddingBottom: spacing['2xl'] },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.snow,
    borderRadius: radii.md,
    padding: spacing.base,
    borderWidth: 1,
    borderColor: colors.mist,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  simBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.mist,
    borderWidth: 1,
    borderColor: colors.granite + '40',
  },
  simBtnActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
});
