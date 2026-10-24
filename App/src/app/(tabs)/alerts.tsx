import { router } from 'expo-router';
import { ChevronRight, Phone, Search, ShieldAlert } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { useCorridor } from '@/api/hooks';
import { AppHeader } from '@/components/AppHeader';
import { Card, Chip, Disclaimer, LevelBadge, Txt } from '@/components/ui';
import { LEVELS, levelLabel, type LevelKey } from '@/domain/levels';
import { alertCategory, cardSubtitle, isHeavyRain, kmRange, stretchName, type Stretch } from '@/domain/stretch';
import { updatedLabel } from '@/domain/time';
import { fontFor, useI18n } from '@/i18n';
import { colors, fonts, radius } from '@/theme/tokens';

type Filter = 'all' | LevelKey;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'severe', label: 'Severe' },
  { key: 'high', label: 'High' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'closed', label: 'Closures' },
];

function matches(s: Stretch, q: string): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  const km = Number(query.replace(/^km\s*/, ''));
  if (!Number.isNaN(km) && query.replace(/^km\s*/, '') !== '')
    return km >= Math.floor(s.kmStart) && km <= Math.ceil(s.kmEnd);
  return s.name.toLowerCase().includes(query) || stretchName(s).toLowerCase().includes(query);
}

export default function AlertsScreen() {
  const { corridor, refetch, isRefetching } = useCorridor();
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const list = useMemo(
    () => (corridor?.worstFirst ?? []).filter((s) => (filter === 'all' || s.level === filter) && matches(s, query)),
    [corridor, filter, query],
  );

  if (!corridor) {
    return (
      <View style={{ flex: 1 }}>
        <AppHeader title={t('Alerts')} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.navy} />
      </View>
    );
  }

  const count = (k: Filter) =>
    k === 'all' ? corridor.stretches.length : corridor.stretches.filter((s) => s.level === k).length;
  const heavyRain = corridor.stretches.filter(isHeavyRain).length;
  const sourceText =
    corridor.source === 'live' ? t('Live') : corridor.source === 'saved' ? t('Offline copy') : t('Demo data, not live');

  return (
    <View style={{ flex: 1 }}>
      <AppHeader title={t('Alerts')} />
      <FlatList
        data={list}
        keyExtractor={(s) => s.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.body}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={styles.search}>
              <Search size={20} color={colors.inkMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('Search stretch or km')}
                placeholderTextColor={colors.inkFaint}
                style={[styles.searchInput, { fontFamily: fontFor(fonts.body, lang) }]}
                accessibilityLabel={t('Search stretch name or km')}
                returnKeyType="search"
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={`${t(f.label)} ${count(f.key)}`}
                  active={filter === f.key}
                  dotColor={f.key === 'all' ? undefined : LEVELS[f.key].color}
                  onPress={() => setFilter(f.key)}
                />
              ))}
            </ScrollView>
            <View style={styles.statusLine}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: corridor.source === 'live' ? colors.green : LEVELS.moderate.color },
                ]}
              />
              <Txt variant="bodyStrong" color={corridor.source === 'live' ? '#1E5C3F' : colors.ink}>
                {sourceText}
              </Txt>
              <Txt color={colors.inkMuted} style={{ flex: 1 }} numberOfLines={1}>
                {updatedLabel(corridor.updatedAt, true)} · {t('worst first')}
              </Txt>
            </View>
            {heavyRain ? (
              <Txt color={colors.inkMuted}>
                {t('Heavy recent rain on {n} of {total} stretches.', {
                  n: heavyRain,
                  total: corridor.stretches.length,
                })}
              </Txt>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        renderItem={({ item, index }) => (
          <AlertCard
            stretch={item}
            highlight={index === 0 && filter === 'all' && !query && LEVELS[item.level].rank >= 3}
          />
        )}
        ListEmptyComponent={
          <Card>
            <Txt>
              {query
                ? t('No stretch matches "{q}".', { q: query })
                : t('No {kind} alerts right now.', {
                    kind: t(FILTERS.find((f) => f.key === filter)?.label ?? '').toLowerCase(),
                  })}
            </Txt>
          </Card>
        }
        ListFooterComponent={
          <View style={{ marginTop: 24, gap: 14 }}>
            <Pressable
              onPress={() => router.navigate('/emergency')}
              style={styles.emergency}
              accessibilityRole="button">
              <Phone size={24} color={LEVELS.severe.color} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                  {t('Emergency contacts')}
                </Txt>
                <Txt color={colors.inkMuted}>{t('112, your contacts, helplines and hospitals')}</Txt>
              </View>
              <ChevronRight size={22} color={colors.inkMuted} />
            </Pressable>
            <Card>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <ShieldAlert size={22} color={colors.teal} />
                <Txt variant="bodyStrong" style={{ fontSize: 14 }}>
                  {t('Travel safety')}
                </Txt>
              </View>
              {[
                'Check the trip before you leave and again on the way.',
                'Avoid driving at night when it is raining.',
                'Follow BRO, SDRF and police instructions over any app.',
              ].map((tip) => (
                <Txt key={tip}>• {t(tip)}</Txt>
              ))}
            </Card>
            <Disclaimer />
          </View>
        }
      />
    </View>
  );
}

function AlertCard({ stretch, highlight }: { stretch: Stretch; highlight: boolean }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stretchName(stretch)}, ${levelLabel(stretch.level)}, ${alertCategory(stretch)}. ${t('Opens details')}`}
      onPress={() => router.push(`/alert/${stretch.id}`)}
      style={({ pressed }) => [styles.card, highlight && styles.cardHighlight, pressed && { opacity: 0.85 }]}>
      <View style={styles.cardTop}>
        <View style={{ flexShrink: 1 }}>
          <LevelBadge level={stretch.level} dot={false} />
        </View>
        <Txt color={colors.inkMuted} style={{ fontSize: 13 }}>
          {kmRange(stretch)}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="h2" style={{ fontSize: 18 }}>
            {stretchName(stretch)}
          </Txt>
          <Txt color={colors.inkMuted} style={{ fontSize: 13, marginTop: 2 }} numberOfLines={2}>
            {alertCategory(stretch)} · {cardSubtitle(stretch)}
          </Txt>
        </View>
        <ChevronRight size={24} color={colors.ink} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 40 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 20,
    height: 50,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.ink, height: '100%' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: 18 },
  cardHighlight: { borderWidth: 3, borderColor: colors.navy, padding: 15 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  emergency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
  },
});
