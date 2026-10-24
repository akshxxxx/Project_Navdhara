import * as Speech from 'expo-speech';
import { OctagonAlert, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Source } from '@/api/hooks';
import { LEVELS, levelLabel, levelVerdict } from '@/domain/levels';
import { RAIN_REF_MM, spokenAdvisory, verdictSentence, type Stretch } from '@/domain/stretch';
import { clock12, parseIso } from '@/domain/time';
import { useI18n } from '@/i18n';
import { colors, radius, shadow } from '@/theme/tokens';

import { FactorBar, StatTile, Txt } from './ui';

export function ListenButton({ stretch, compact }: { stretch: Stretch; compact?: boolean }) {
  const { t, lang } = useI18n();
  const [speaking, setSpeaking] = useState(false);
  const tint = LEVELS[stretch.level];
  useEffect(() => () => void Speech.stop(), []);
  const toggle = () => {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(spokenAdvisory(stretch), {
      // Hindi uses the phone's Hindi voice; phones without one read it with their default voice
      language: lang === 'hi' ? 'hi-IN' : 'en-IN',
      rate: 0.92,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  };
  const Icon = speaking ? VolumeX : Volume2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={speaking ? t('Stop the spoken advisory') : t('Listen to this advisory')}
      onPress={toggle}
      style={({ pressed }) => [styles.listen, { borderColor: tint.color + '66' }, pressed && { opacity: 0.8 }]}>
      <Icon size={22} color={colors.ink} />
      {compact ? null : (
        <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
          {speaking ? t('Stop') : t('Listen')}
        </Txt>
      )}
    </Pressable>
  );
}

/** The coloured verdict block: "SEVERE RISK / Not advised" */
export function VerdictCard({ stretch, withReason = true }: { stretch: Stretch; withReason?: boolean }) {
  const { t } = useI18n();
  const m = LEVELS[stretch.level];
  return (
    <View style={[styles.verdict, { backgroundColor: m.tint }]}>
      <View style={styles.verdictRow}>
        <OctagonAlert size={34} color={m.color} strokeWidth={2} />
        <View style={{ flex: 1 }}>
          <Txt variant="eyebrow" color={m.ink}>
            {stretch.level === 'closed'
              ? t('Official closure')
              : t('{level} risk', { level: levelLabel(stretch.level) })}
          </Txt>
          <Txt variant="display" color={m.ink} style={{ fontSize: 24, lineHeight: 27 }}>
            {levelVerdict(stretch.level)}
          </Txt>
        </View>
        <ListenButton stretch={stretch} />
      </View>
      {withReason ? (
        <Txt style={{ marginTop: 10, fontSize: 14, lineHeight: 20 }}>{verdictSentence(stretch)}</Txt>
      ) : null}
    </View>
  );
}

const mm = (v: number | null) => (v == null ? '—' : String(Math.round(v)));

export function RainTiles({ stretch }: { stretch: Stretch }) {
  const { t } = useI18n();
  const unit = (v: number | null) => (v == null ? undefined : t('mm'));
  return (
    <View style={styles.row}>
      <StatTile label={t('Rain 24 h')} value={mm(stretch.rain24h)} unit={unit(stretch.rain24h)} />
      <StatTile label={t('Next 24 h')} value={mm(stretch.next24h)} unit={unit(stretch.next24h)} />
      <StatTile label={t('Next 72 h')} value={mm(stretch.next72h)} unit={unit(stretch.next72h)} />
    </View>
  );
}

/** Why it is risky: each bar is a factor's share of its own maximum, from backend values */
export function WhyRisky({ stretch }: { stretch: Stretch }) {
  const { t } = useI18n();
  const rain = stretch.rain3d;
  return (
    <View>
      <FactorBar
        label={t('Rain, 3 days')}
        value={rain == null ? 0 : rain / RAIN_REF_MM}
        display={rain == null ? '—' : `${Math.round(rain)} ${t('mm')}`}
      />
      <FactorBar
        label={t('Unstable terrain')}
        value={stretch.terrain ?? 0}
        display={stretch.terrain == null ? '—' : `${Math.round(stretch.terrain * 100)}%`}
      />
      <FactorBar
        label={t('Driver reports')}
        value={Math.min(stretch.reports24h, 3) / 3}
        display={`${stretch.reports24h}`}
      />
      <Txt variant="small" color={colors.inkMuted} style={{ marginTop: 6 }}>
        {t(
          'Rain bar is full at {mm} mm in 3 days. Terrain is how this stretch ranks for landslide-prone ground on NH-7. Reports are verified ones from the last 24 hours.',
          { mm: RAIN_REF_MM },
        )}
      </Txt>
    </View>
  );
}

export function SourcePill({ source, savedAt, extra }: { source: Source; savedAt: string | null; extra?: string }) {
  const { t } = useI18n();
  const saved = parseIso(savedAt);
  const label =
    source === 'live'
      ? t('Live')
      : source === 'saved'
        ? `${t('Offline copy')}${saved ? ` · ${clock12(saved)}` : ''}`
        : t('Demo data, not live');
  const dot = source === 'live' ? colors.green : source === 'saved' ? LEVELS.moderate.color : LEVELS.severe.color;
  return (
    <View style={styles.pill}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Txt variant="bodyStrong" color={source === 'live' ? '#1E5C3F' : colors.ink} style={{ fontSize: 14 }}>
        {label}
      </Txt>
      {extra ? (
        <Txt variant="bodyStrong" color={LEVELS.high.ink} style={{ fontSize: 14 }}>
          {'  '}
          {extra}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    height: 48,
  },
  verdict: { borderRadius: radius.lg, padding: 16 },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  row: { flexDirection: 'row', gap: 10 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radius.pill,
    ...shadow.card,
  },
  dot: { width: 10, height: 10, borderRadius: 6 },
});
