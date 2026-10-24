import { router, useLocalSearchParams } from 'expo-router';
import { Map, Route, Share2 } from 'lucide-react-native';
import { ActivityIndicator, Share, StyleSheet, View } from 'react-native';

import { useCorridor } from '@/api/hooks';
import { DetailShell } from '@/components/DetailShell';
import { ListenButton } from '@/components/StretchParts';
import { Button, Disclaimer, IconCircle, LevelBadge, StatTile, Txt } from '@/components/ui';
import { LEVELS, levelLabel, levelVerdict } from '@/domain/levels';
import { alertCategory, alertParagraph, onRoadTips, planParamsFor, stretchName, type Stretch } from '@/domain/stretch';
import { updatedLabel } from '@/domain/time';
import { tr, useI18n } from '@/i18n';
import { colors, radius } from '@/theme/tokens';

function shareText(s: Stretch): string {
  return (
    `NH-7 ${stretchName(s)} (km ${Math.round(s.kmStart)}–${Math.round(s.kmEnd)}): ${levelLabel(s.level)}, ${levelVerdict(s.level)}. ` +
    `${alertParagraph(s)} ${tr('Shared from Raah. Not an official warning. Emergency: 112.')}`
  );
}

export default function AlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { corridor } = useCorridor();
  const { t } = useI18n();
  const s = corridor?.byId[id ?? ''];

  if (!corridor) return <ActivityIndicator style={{ flex: 1 }} color={colors.navy} />;
  if (!s) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <Txt variant="h2">{t('Alert not found')}</Txt>
        <Button label={t('Back to alerts')} onPress={() => router.replace('/alerts')} style={{ marginTop: 16 }} />
      </View>
    );
  }
  const m = LEVELS[s.level];
  const active = m.rank >= 2;

  return (
    <DetailShell
      stretches={corridor.stretches}
      stretch={s}
      actions={
        <IconCircle
          icon={Share2}
          label={t('Share this alert')}
          size={52}
          onPress={() => Share.share({ message: shareText(s) }).catch(() => {})}
        />
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <LevelBadge
            level={s.level}
            dot={false}
            text={`${alertCategory(s)} · ${s.level === 'closed' || active ? t('active') : levelLabel(s.level)}`}
          />
        </View>
        <ListenButton stretch={s} compact />
      </View>
      <Txt variant="h1" style={{ fontSize: 26, lineHeight: 29, marginTop: 12 }}>
        {stretchName(s)}
      </Txt>
      <Txt color={colors.inkMuted} style={{ fontSize: 14, marginTop: 4 }}>
        {t('NH-7 · km {from} to {to}', { from: Math.round(s.kmStart), to: Math.round(s.kmEnd) })} ·{' '}
        {updatedLabel(s.updatedAt)}
      </Txt>
      <Txt style={{ fontSize: 14, lineHeight: 22, marginTop: 12 }}>
        <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
          {levelVerdict(s.level)}.{' '}
        </Txt>
        {alertParagraph(s)}
      </Txt>

      <View style={styles.stats}>
        <StatTile label={t('Rain 24 h')} value={fmt(s.rain24h)} unit={s.rain24h == null ? undefined : t('mm')} />
        <StatTile label={t('Next 24 h')} value={fmt(s.next24h)} unit={s.next24h == null ? undefined : t('mm')} />
        <StatTile label={t('Reports')} value={String(s.reports24h)} unit={t('in 24 h')} />
      </View>

      <View style={styles.actions}>
        <Button
          label={t('View on map')}
          icon={Map}
          style={{ flex: 1 }}
          onPress={() => router.push(`/stretch/${s.id}`)}
        />
        <Button
          label={t('Check a trip')}
          icon={Route}
          kind="outline"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/plan', params: planParamsFor(s) })}
        />
      </View>

      <View style={styles.tips}>
        <Txt variant="h3" style={{ fontSize: 16, marginBottom: 8 }}>
          {t('If you are already on this road')}
        </Txt>
        {onRoadTips(s).map((tip) => (
          <Txt key={tip} style={{ fontSize: 14, lineHeight: 20 }}>
            • {tip}
          </Txt>
        ))}
      </View>
      <Disclaimer text={t('Not an official warning · Emergency 112')} />
    </DetailShell>
  );
}

const fmt = (v: number | null) => (v == null ? '—' : String(Math.round(v)));

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 10, marginTop: 18 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  tips: { backgroundColor: colors.chip, borderRadius: radius.lg, padding: 18, marginTop: 20 },
});
