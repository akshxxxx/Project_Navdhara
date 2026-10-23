import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ThemedText } from '../src/components';
import { colors, spacing } from '../src/design/tokens';
import Constants from 'expo-constants';



import { useTranslation } from 'react-i18next';
import { useModelInfo, useBacktestSummary } from '../src/api/hooks';

export default function AboutScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  
  const { data: modelInfo } = useModelInfo();
  const { data: backtest } = useBacktestSummary();
  
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>
        <ThemedText variant="h3" color={colors.ink}>{t('about_page.title')}</ThemedText>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>{t('about_page.what_title')}</ThemedText>
          <ThemedText variant="body" color={colors.ink}>
            {t('about_page.what_text')}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>{t('about_page.how_title')}</ThemedText>
          <ThemedText variant="body" color={colors.ink} style={{ marginBottom: spacing.sm }}>
            {t('about_page.how_text1')}
          </ThemedText>
          <ThemedText variant="body" color={colors.ink} style={{ fontWeight: 'bold' }}>
            {t('about_page.how_text2')}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>{t('about_page.sources', 'Data Sources')}</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• Copernicus DEM</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• Open-Meteo</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• ERA5-Land</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• Mey et al. 2024 landslide inventory</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• OpenStreetMap contributors</ThemedText>
          <ThemedText variant="body" color={colors.ink}>• CARTO</ThemedText>
        </View>

        {(modelInfo || backtest) && (
          <View style={styles.section}>
            <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>Model Performance</ThemedText>
            {modelInfo && (
              <ThemedText variant="body" color={colors.ink} style={{ marginBottom: spacing.xs }}>
                <ThemedText variant="body" color={colors.ink} style={{ fontWeight: 'bold' }}>Version: </ThemedText>
                {modelInfo.model_version}
              </ThemedText>
            )}
            {backtest && (
              <>
                <ThemedText variant="body" color={colors.ink}>
                  <ThemedText variant="body" color={colors.ink} style={{ fontWeight: 'bold' }}>Recall: </ThemedText>
                  {(backtest.metrics.recall * 100).toFixed(1)}%
                </ThemedText>
                <ThemedText variant="body" color={colors.ink}>
                  <ThemedText variant="body" color={colors.ink} style={{ fontWeight: 'bold' }}>F1 Score: </ThemedText>
                  {(backtest.metrics.f1_score * 100).toFixed(1)}%
                </ThemedText>
              </>
            )}
          </View>
        )}

        <View style={styles.section}>
          <ThemedText variant="body" color={colors.granite}>
            {t('about_page.contact')}
          </ThemedText>
          <ThemedText variant="caption" color={colors.granite} style={{ marginTop: spacing.xs }}>
            {t('about_page.version', { version: Constants.expoConfig?.version || '1.0.0' })}
          </ThemedText>
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
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
  }
});
