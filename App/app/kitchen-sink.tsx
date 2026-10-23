// @ts-nocheck
import React, { useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import {
  ThemedText,
  NHShield,
  RiskIcon,
  RiskBadge,
  StatusLine,
  Button,
  Chip,
  Skeleton,
  LanguageToggle,
  RoadStrip,
  AppHeader,
  BottomSheet,
  type BottomSheetRef,
} from '../src/components';
import { colors, night, nightRisk, risk, spacing, radii, iconSize, iconStroke, touchTarget, type Level } from '../src/design/tokens';
import { towns } from '../src/data/towns';
import { setSimulateRainMm } from '../src/api/demoStore';

type Scenario = 'dry' | 'heavy-rain' | 'blocked';
const getScenario = () => 'dry' as Scenario;
const getSegments = (scenario: Scenario) => [] as any[];

const levels: Level[] = [0, 1, 2, 3];

export default function KitchenSinkScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [isNight, setIsNight] = useState(false);
  const [scenario, setLocalScenario] = useState<Scenario>(getScenario());
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [chipSelected, setChipSelected] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<BottomSheetRef>(null);

  const segments = getSegments(scenario);

  const bg = isNight ? night.bg : colors.snow;
  const textColor = isNight ? night.text : colors.ink;
  const mutedColor = isNight ? night.muted : colors.granite;
  const sectionBg = isNight ? night.surface : colors.glacier;

  const switchScenario = (s: Scenario) => {
    setScenario(s);
    setLocalScenario(s);
  };

  const handleSelectSegment = (id: string) => {
    setSelectedSegId(id);
    setSheetOpen(true);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bg }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: isNight ? night.line : colors.mist }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <ArrowLeft size={iconSize} strokeWidth={iconStroke} color={textColor} />
        </Pressable>
        <ThemedText variant="h2" color={textColor} style={{ flex: 1 }}>
          Kitchen sink
        </ThemedText>
        <LanguageToggle night={isNight} />
        <Pressable
          onPress={() => setIsNight(!isNight)}
          style={[styles.toggleBtn, { backgroundColor: isNight ? night.line : colors.mist }]}
          accessibilityLabel={isNight ? 'Switch to light mode' : 'Switch to night mode'}
          accessibilityRole="button"
        >
          <ThemedText variant="small" color={textColor}>
            {isNight ? 'Light' : 'Night'}
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* --- Scenarios --- */}
        <Section title="Scenario" bg={sectionBg} textColor={textColor}>
          <View style={styles.row}>
            {(['dry', 'heavy-rain', 'blocked'] as Scenario[]).map(s => (
              <Chip
                key={s}
                label={s}
                selected={scenario === s}
                onPress={() => switchScenario(s)}
              />
            ))}
          </View>
        </Section>

        {/* --- AppHeader --- */}
        <Section title="AppHeader" bg={sectionBg} textColor={textColor}>
          <AppHeader title={t('app_name')} />
        </Section>

        {/* --- Typography --- */}
        <Section title="Typography" bg={sectionBg} textColor={textColor}>
          <ThemedText variant="verdict" color={textColor}>Verdict 40/44</ThemedText>
          <ThemedText variant="h1" color={textColor}>H1 heading 28/34</ThemedText>
          <ThemedText variant="h2" color={textColor}>H2 heading 22/28</ThemedText>
          <ThemedText variant="h3" color={textColor}>H3 heading 18/24</ThemedText>
          <ThemedText variant="body" color={textColor}>Body text 16/24 – Rishikesh to Badrinath</ThemedText>
          <ThemedText variant="small" color={mutedColor}>Small text 14/20 – Updated 10 min ago</ThemedText>
          <ThemedText variant="caption" color={mutedColor}>Caption 12/16 – km 112</ThemedText>
        </Section>

        {/* --- NH Shield --- */}
        <Section title="NHShield" bg={sectionBg} textColor={textColor}>
          <View style={styles.row}>
            <NHShield size={24} />
            <NHShield size={40} />
          </View>
        </Section>

        {/* --- Risk shapes (light) --- */}
        <Section title="Risk shapes (light)" bg={sectionBg} textColor={textColor}>
          <View style={styles.row}>
            {levels.map(l => (
              <View key={l} style={styles.riskItem}>
                <RiskIcon level={l} size={24} night={false} />
                <ThemedText variant="caption" color={textColor}>
                  {t(`risk_level.${l}`)}
                </ThemedText>
              </View>
            ))}
          </View>
        </Section>

        {/* --- Risk shapes (night) --- */}
        <Section title="Risk shapes (night)" bg={night.surface} textColor={night.text}>
          <View style={styles.row}>
            {levels.map(l => (
              <View key={l} style={styles.riskItem}>
                <RiskIcon level={l} size={24} night={true} />
                <ThemedText variant="caption" color={night.text}>
                  {t(`risk_level.${l}`)}
                </ThemedText>
              </View>
            ))}
          </View>
        </Section>

        {/* --- Risk badges --- */}
        <Section title="RiskBadge" bg={sectionBg} textColor={textColor}>
          {levels.map(l => (
            <View key={l} style={{ marginBottom: 4 }}>
              <RiskBadge level={l} night={isNight} />
            </View>
          ))}
        </Section>

        {/* --- Risk badges with verdict --- */}
        <Section title="RiskBadge + verdict" bg={sectionBg} textColor={textColor}>
          {levels.map(l => (
            <View key={l} style={{ marginBottom: 4 }}>
              <RiskBadge level={l} showVerdict night={isNight} />
            </View>
          ))}
        </Section>

        {/* --- StatusLine --- */}
        <Section title="StatusLine" bg={sectionBg} textColor={textColor}>
          <ThemedText variant="caption" color={mutedColor}>Fresh (&lt; 30 min):</ThemedText>
          <StatusLine dataUpdatedAt={new Date(Date.now() - 5 * 60 * 1000)} />
          <ThemedText variant="caption" color={mutedColor}>Stale (&gt; 30 min):</ThemedText>
          <StatusLine dataUpdatedAt={new Date(Date.now() - 45 * 60 * 1000)} />
          <ThemedText variant="caption" color={mutedColor}>Old (&gt; 3 h):</ThemedText>
          <StatusLine dataUpdatedAt={new Date(Date.now() - 4 * 60 * 60 * 1000)} />
          <ThemedText variant="caption" color={mutedColor}>Offline (airplane mode / cached data):</ThemedText>
          <StatusLine dataUpdatedAt={new Date(Date.now() - 15 * 60 * 1000)} forceOffline />
          <ThemedText variant="caption" color={mutedColor}>Loading (fetching initial risk):</ThemedText>
          <StatusLine dataUpdatedAt={null} />
        </Section>

        {/* --- Buttons --- */}
        <Section title="Button" bg={sectionBg} textColor={textColor}>
          <Button label={t('plan.cta')} onPress={() => {}} variant="primary" />
          <View style={{ height: 8 }} />
          <Button label={t('plan.share')} onPress={() => {}} variant="secondary" />
          <View style={{ height: 8 }} />
          <Button label="Disabled" onPress={() => {}} disabled />
        </Section>

        {/* --- Chips --- */}
        <Section title="Chip" bg={sectionBg} textColor={textColor}>
          <View style={styles.row}>
            {['Moderate', 'High', 'Severe'].map((label, i) => (
              <Chip
                key={label}
                label={label}
                selected={chipSelected === i}
                onPress={() => setChipSelected(i)}
              />
            ))}
          </View>
        </Section>

        {/* --- Skeleton --- */}
        <Section title="Skeleton" bg={sectionBg} textColor={textColor}>
          <Skeleton width="80%" height={20} />
          <View style={{ height: 8 }} />
          <Skeleton width="60%" height={14} />
          <View style={{ height: 8 }} />
          <Skeleton width="100%" height={14} />
        </Section>

        {/* --- BottomSheet trigger demo --- */}
        <Section title="BottomSheet" bg={sectionBg} textColor={textColor}>
          <ThemedText variant="body" color={textColor}>
            Tap a segment on the RoadStrip below, or click here:
          </ThemedText>
          <Button
            label={sheetOpen ? 'Close bottom sheet' : 'Open bottom sheet (peek/half/full)'}
            variant="secondary"
            onPress={() => setSheetOpen(!sheetOpen)}
          />
        </Section>

        {/* --- Road strip horizontal --- */}
        <Section title="RoadStrip (horizontal)" bg={sectionBg} textColor={textColor}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <RoadStrip
              segments={segments}
              towns={towns}
              orientation="horizontal"
              selectedId={selectedSegId}
              onSelect={handleSelectSegment}
              night={isNight}
              width={360}
              height={60}
            />
          </ScrollView>
        </Section>

        {/* --- Road strip vertical --- */}
        <Section title="RoadStrip (vertical)" bg={sectionBg} textColor={textColor}>
          <RoadStrip
            segments={segments}
            towns={towns}
            orientation="vertical"
            selectedId={selectedSegId}
            onSelect={handleSelectSegment}
            night={isNight}
            width={12}
            height={400}
            youAreAt={112}
          />
        </Section>

        {/* --- Road strip with range --- */}
        <Section title="RoadStrip with range (km 70–170)" bg={sectionBg} textColor={textColor}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <RoadStrip
              segments={segments}
              towns={towns}
              orientation="horizontal"
              range={{ start: 70, end: 170 }}
              selectedId={selectedSegId}
              onSelect={handleSelectSegment}
              night={isNight}
              width={360}
              height={60}
            />
          </ScrollView>
        </Section>

        {/* --- i18n strings --- */}
        <Section title="i18n strings" bg={sectionBg} textColor={textColor}>
          <ThemedText variant="body" color={textColor}>{t('plan.title')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('report.title')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('alerts.empty')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('factor.rain')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('factor.slope')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('disclaimer')}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('offline.banner', { time: '2:10 pm' })}</ThemedText>
          <ThemedText variant="body" color={textColor}>{t('home.watch', { n: 3 })}</ThemedText>
        </Section>

        {/* --- Verdicts --- */}
        <Section title="Verdicts" bg={sectionBg} textColor={textColor}>
          {levels.map(l => (
            <View key={l} style={styles.verdictRow}>
              <RiskIcon level={l} size={20} night={isNight} />
              <ThemedText variant="h3" color={textColor}>
                {t(`verdict.${l}`)}
              </ThemedText>
            </View>
          ))}
        </Section>

        <View style={{ height: 48 }} />
      </ScrollView>

      {sheetOpen && (
        <BottomSheet ref={sheetRef} initialIndex={0}>
          <View style={styles.sheetInner}>
            <ThemedText variant="h2" color={colors.ink}>
              {selectedSegId
                ? segments.find(s => s.id === selectedSegId)?.name ?? selectedSegId
                : 'NH-7 Stretch Overview'}
            </ThemedText>
            {selectedSegId && (
              <RiskBadge
                level={segments.find(s => s.id === selectedSegId)?.level ?? 1}
                showVerdict
              />
            )}
            <ThemedText variant="body" color={colors.granite}>
              {t('disclaimer')}
            </ThemedText>
            <Button
              label="Close sheet"
              variant="secondary"
              onPress={() => setSheetOpen(false)}
            />
          </View>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

function Section({
  title,
  bg,
  textColor,
  children,
}: {
  title: string;
  bg: string;
  textColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: bg }]}>
      <ThemedText variant="h3" color={textColor} style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  backBtn: {
    minWidth: touchTarget.min,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    gap: spacing.base,
  },
  section: {
    padding: spacing.base,
    borderRadius: radii.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  riskItem: {
    alignItems: 'center',
    gap: 4,
    minWidth: 56,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  sheetInner: {
    paddingVertical: spacing.base,
    gap: spacing.md,
  },
});
