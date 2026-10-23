import { router } from 'expo-router';
import { ChevronRight, Info } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCorridor } from '@/api/hooks';
import { Brand, CallButton } from '@/components/AppHeader';
import { CorridorMap, Legend } from '@/components/CorridorMap';
import { getApiUrl } from '@/api/client';
import { ServerSheet } from '@/components/ServerSheet';
import { SourcePill } from '@/components/StretchParts';
import { LevelBadge, Txt } from '@/components/ui';
import { LEVELS } from '@/domain/levels';
import { kmRange, rainText, type Stretch } from '@/domain/stretch';
import { updatedLabel } from '@/domain/time';
import { colors, radius, shadow } from '@/theme/tokens';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { corridor, refetch, isFetching } = useCorridor();
  const [serverOpen, setServerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ ids: string[] | null; key: number }>({ ids: null, key: 0 });

  if (!corridor) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Txt color={colors.inkMuted} style={{ marginTop: 12 }}>
          Loading NH-7 risk…
        </Txt>
      </View>
    );
  }

  const attention = corridor.worstFirst.filter((s) => LEVELS[s.level].rank >= 1).slice(0, 3);
  const headerSpace = insets.top + 12 + 70 + 52;

  const flyTo = (s: Stretch) => {
    if (selected === s.id) {
      router.push(`/stretch/${s.id}`);
      return;
    }
    setSelected(s.id);
    const around = corridor.stretches.filter((x) => Math.abs(x.seq - s.seq) <= 1).map((x) => x.id);
    setFocus((f) => ({ ids: around, key: f.key + 1 }));
  };

  return (
    <View style={styles.fill}>
      <View style={styles.fill}>
        <CorridorMap
          style={StyleSheet.absoluteFill}
          stretches={corridor.stretches}
          selectedId={selected}
          focusIds={focus.ids}
          focusKey={focus.key}
          onSelect={(id) => {
            setSelected(id);
            router.push(`/stretch/${id}`);
          }}
          controls
          insets={{ top: headerSpace, bottom: 92, right: 58 }}
          attributionBottom={68}
        />

        <View style={[styles.overlayTop, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
          <View style={styles.headerCard}>
            <Brand />
            <CallButton />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Data source. Opens the server address"
            onPress={() => setServerOpen(true)}
            style={{ alignSelf: 'flex-start' }}>
            <SourcePill
              source={corridor.source}
              savedAt={corridor.savedAt}
              extra={`${corridor.highOrSevere} High or Severe${corridor.closed ? ` · ${corridor.closed} closed` : ''}`}
            />
          </Pressable>
        </View>

        <View style={styles.legendWrap} pointerEvents="box-none">
          <Legend />
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHead}>
          <Txt variant="h2" style={{ fontSize: 20 }}>
            Needs attention today
          </Txt>
          <View style={styles.count}>
            <Txt variant="bodyStrong" color={colors.white}>
              {attention.length}
            </Txt>
          </View>
        </View>
        <Txt variant="small" color={colors.inkMuted} style={{ paddingHorizontal: 20, marginTop: 2 }}>
          {updatedLabel(corridor.updatedAt).replace(/^u/, 'U')}
          {corridor.weatherSource ? ` · weather ${corridor.weatherSource}` : ''}
        </Txt>

        {attention.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {attention.map((s) => (
              <AttentionCard key={s.id} stretch={s} selected={selected === s.id} onPress={() => flyTo(s)} />
            ))}
          </ScrollView>
        ) : (
          <Txt color={colors.inkMuted} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
            No stretch is above Low right now. Low risk does not mean safe.
          </Txt>
        )}

        <View style={styles.hint}>
          <Info size={20} color={colors.inkMuted} />
          <Txt variant="small" color={colors.inkMuted} style={{ fontSize: 15, flex: 1 }}>
            {selected ? 'Tap the card again to see why' : 'Tap any stretch on the map for details'}
          </Txt>
        </View>
        {corridor.source !== 'live' ? (
          <View style={styles.demoNote}>
            <Txt variant="small" color={corridor.source === 'demo' ? LEVELS.severe.ink : colors.inkMuted}>
              {corridor.source === 'demo'
                ? 'These colours are sample data, not today’s conditions. '
                : 'Showing the last copy saved on this phone. '}
              Cannot reach the Raah server at {getApiUrl()}.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
              <Pressable onPress={() => refetch()} accessibilityRole="button" hitSlop={8}>
                <Txt variant="smallStrong" color={colors.teal}>
                  {isFetching ? 'Trying…' : 'Try again'}
                </Txt>
              </Pressable>
              <Pressable onPress={() => setServerOpen(true)} accessibilityRole="button" hitSlop={8}>
                <Txt variant="smallStrong" color={colors.teal}>
                  Change server
                </Txt>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      {serverOpen ? <ServerSheet visible onClose={() => setServerOpen(false)} /> : null}
    </View>
  );
}

function AttentionCard({ stretch, selected, onPress }: { stretch: Stretch; selected: boolean; onPress: () => void }) {
  const detail = [kmRange(stretch), rainText(stretch)].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stretch.name}, ${LEVELS[stretch.level].label}. ${selected ? 'Opens details' : 'Shows it on the map'}`}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}>
      <LevelBadge level={stretch.level} />
      <Txt variant="h2" numberOfLines={1} style={{ marginTop: 10, fontSize: 18 }}>
        {stretch.name}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Txt color={colors.inkMuted} numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>
          {detail}
        </Txt>
        {selected ? <ChevronRight size={22} color={colors.ink} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.mapBg },
  center: { alignItems: 'center', justifyContent: 'center' },
  overlayTop: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, gap: 14 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    paddingLeft: 18,
    paddingRight: 12,
    paddingVertical: 12,
    ...shadow.float,
  },
  legendWrap: { position: 'absolute', left: 16, right: 16, bottom: 36 },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    marginTop: -24,
    paddingBottom: 12,
    ...shadow.float,
  },
  handle: { alignSelf: 'center', width: 80, height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16 },
  count: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: LEVELS.severe.color,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cards: { paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  card: {
    width: 280,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: 14,
    backgroundColor: colors.white,
  },
  cardSelected: { borderWidth: 2.5, borderColor: colors.navy, padding: 13 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  demoNote: { paddingHorizontal: 20, marginTop: 6 },
});
