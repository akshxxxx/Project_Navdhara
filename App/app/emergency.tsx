import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { PhoneCall, ChevronLeft, AlertCircle } from 'lucide-react-native';
import { ThemedText, Button } from '../src/components';
import { getOfflinePack } from '../src/api/offlinePack';
import { colors, spacing, radii } from '../src/design/tokens';
import Constants from 'expo-constants';

export default function EmergencyScreen() {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';
  const router = useRouter();
  
  const [pack, setPack] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const smsNumber = Constants.expoConfig?.extra?.EXPO_PUBLIC_SMS_NUMBER ?? process.env.EXPO_PUBLIC_SMS_NUMBER;

  useEffect(() => {
    getOfflinePack().then(data => {
      setPack(data);
      setLoading(false);
    });
  }, []);

  const handleCall = (number: string) => {
    Linking.openURL(`tel:${number}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.ink} />
        </TouchableOpacity>
        <ThemedText variant="h3" color={colors.ink}>{t('emergency.title')}</ThemedText>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {smsNumber && (
          <View style={styles.smsCard}>
            <AlertCircle size={24} color={colors.snow} style={{ marginBottom: spacing.sm }} />
            <ThemedText variant="h3" color={colors.snow}>
              {t('emergency.sms_banner', { number: smsNumber })}
            </ThemedText>
            <ThemedText variant="body" color={colors.snow} style={{ marginTop: spacing.xs }}>
              {t('emergency.sms_example')}
            </ThemedText>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.river} style={{ marginTop: spacing.xl }} />
        ) : pack ? (
          <>
            <View style={styles.section}>
              <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>
                {t('emergency.contacts')}
              </ThemedText>
              
              {pack.emergency_contacts?.map((contact: any, i: number) => (
                <View key={i} style={styles.contactRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="h3" color={colors.ink}>{contact.name}</ThemedText>
                    <ThemedText variant="body" color={colors.granite}>{contact.description}</ThemedText>
                  </View>
                  <TouchableOpacity style={styles.callBtn} onPress={() => handleCall(contact.number)}>
                    <PhoneCall size={20} color={colors.snow} />
                    <ThemedText variant="body" color={colors.snow} style={{ marginLeft: spacing.xs, fontWeight: 'bold' }}>{t('emergency.call')}</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <View style={styles.section}>
              <ThemedText variant="h2" color={colors.ink} style={styles.sectionTitle}>
                {t('emergency.hospitals')}
              </ThemedText>
              <ThemedText variant="body" color={colors.ink} style={{ marginBottom: spacing.md, fontStyle: 'italic' }}>
                {isHindi ? pack.advisory_hi : pack.advisory_en}
              </ThemedText>
              
              {pack.hospitals?.map((hosp: any, i: number) => (
                <View key={i} style={styles.hospRow}>
                  <ThemedText variant="body" color={colors.ink} style={{ fontWeight: 'bold' }}>{hosp.segment_name}</ThemedText>
                  <ThemedText variant="body" color={colors.granite}>{hosp.hospital_name}</ThemedText>
                  <ThemedText variant="caption" color={colors.granite}>{Math.round(hosp.distance_km)} km away</ThemedText>
                </View>
              ))}
            </View>
          </>
        ) : (
          <ThemedText variant="body" color={colors.granite} style={{ textAlign: 'center', marginTop: spacing.xl }}>
            {t('emergency.unavailable')}
          </ThemedText>
        )}
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
  smsCard: {
    backgroundColor: colors.ink,
    padding: spacing.lg,
    borderRadius: radii.md,
    marginBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.snow,
    borderWidth: 1,
    borderColor: colors.mist,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.river,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  hospRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.mist,
  }
});
