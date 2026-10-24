import { router } from 'expo-router';
import { ChevronDown, ChevronRight, ChevronUp, Info } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCorridor } from '@/api/hooks';
import { Brand, CallButton, LangButton } from '@/components/AppHeader';
import { CorridorMap, Legend } from '@/components/CorridorMap';
import { getApiUrl } from '@/api/client';
import { ServerSheet } from '@/components/ServerSheet';
import { SourcePill } from '@/components/StretchParts';
import { LevelBadge, Txt } from '@/components/ui';
import { LEVELS, levelLabel } from '@/domain/levels';
import { kmRange, rainText, stretchName, type Stretch } from '@/domain/stretch';
import { updatedLabel } from '@/domain/time';
import { useI18n } from '@/i18n';
import { colors, radius, shadow } from '@/theme/tokens';

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { corridor, refetch, isFetching } = useCorridor();
  const [serverOpen, setServerOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ ids: string[] | null; key: number }>({ ids: null, key: 0 });

  // --- The "Needs attention" panel slides down to a peek so the map can use the whole screen ---
  const [sheetH, setSheetH] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [slide] = useState(() => new Animated.Value(0));
  const sheetHRef = useRef(0);
  const collapsedRef = useRef(false);
  const dragFrom = useRef(0);
  const travel = () => Math.max(0, sheetHRef.current - PEEK);

  // Only touches state setters, refs and the animated value, so the gesture handler below can keep the
  // version from the first render
  const snap = (toCollapsed: boolean) => {
    collapsedRef.current = toCollapsed;
    Animated.spring(slide, {
      toValue: toCollapsed ? travel() : 0,
      useNativeDriver: Platform.OS !== 'web',
      bounciness: 0,
      speed: 16,
    }).start();
    setCollapsed(toCollapsed);
    // Refit the map to the space it now has
    setFocus((fc) => ({ ids: fc.ids, key: fc.key + 1 }));
  };

  // Vertical drags on the panel move it; horizontal ones still scroll the cards
  // eslint-disable-next-line react-hooks/refs
  const [sheetDrag] = useState(() =>
    PanResponder.create({
      // Capture phase: the title bar and the cards are buttons, which would otherwise keep the touch
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderGrant: () => {
        slide.stopAnimation();
        dragFrom.current = collapsedRef.current ? travel() : 0;
      },
      onPanResponderMove: (_, g) => slide.setValue(Math.min(Math.max(dragFrom.current + g.dy, 0), travel())),
      onPanResponderRelease: (_, g) => {
        const at = Math.min(Math.max(dragFrom.current + g.dy, 0), travel());
        const down = g.vy > 0.4 || (g.vy > -0.4 && at > travel() / 2);
        snap(down);
      },
      onPanResponderTerminate: () => snap(collapsedRef.current),
    }),
  );

  const onSheetLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (Math.abs(h - sheetHRef.current) < 2) return;
    const first = sheetHRef.current === 0;
    sheetHRef.current = h;
    setSheetH(h);
    if (collapsedRef.current) slide.setValue(travel());
    // The map was fitted before the panel's height was known
    if (first) setFocus((fc) => ({ ids: fc.ids, key: fc.key + 1 }));
  };

  if (!corridor) {
    return (
      <View style={[styles.fill, styles.center]}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Txt color={colors.inkMuted} style={{ marginTop: 12 }}>
          {t('Loading NH-7 risk…')}
        </Txt>
      </View>
    );
  }

  const attention = corridor.worstFirst.filter((s) => LEVELS[s.level].rank >= 1).slice(0, 3);
  const headerSpace = insets.top + 12 + 70 + 52;
  // Map space kept clear at the bottom: the visible part of the panel plus the legend above it
  const sheetVisible = collapsed ? PEEK : sheetH || 300;
  const mapBottom = sheetVisible + LEGEND_SPACE;

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
      <View style={StyleSheet.absoluteFill}>
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
          insets={{ top: headerSpace, bottom: mapBottom, right: 58 }}
          attributionBottom={sheetVisible + 6}
        />

        <View style={[styles.overlayTop, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
          <View style={styles.headerCard}>
            <Brand />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <LangButton />
              <CallButton />
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Data source. Opens the server address')}
            onPress={() => setServerOpen(true)}
            style={{ alignSelf: 'flex-start' }}>
            <SourcePill
              source={corridor.source}
              savedAt={corridor.savedAt}
              extra={
                t('{n} High or Severe', { n: corridor.highOrSevere }) +
                (corridor.closed ? ` · ${t('{n} closed', { n: corridor.closed })}` : '')
              }
            />
          </Pressable>
        </View>
      </View>

      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slide }] }]}
        onLayout={onSheetLayout}
        {...sheetDrag.panHandlers}>
        {/* The legend rides on top of the panel so it is never hidden by it */}
        <View style={styles.legendWrap} pointerEvents="box-none">
          <Legend />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? t('Show the list') : t('Hide the list to see the whole map')}
          onPress={() => snap(!collapsed)}>
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Txt variant="h2" style={{ fontSize: 20, flexShrink: 1 }} numberOfLines={1}>
              {t('Needs attention today')}
            </Txt>
            <View style={styles.count}>
              <Txt variant="bodyStrong" color={colors.white}>
                {attention.length}
              </Txt>
            </View>
            <View style={{ flex: 1 }} />
            {collapsed ? (
              <ChevronUp size={24} color={colors.inkMuted} />
            ) : (
              <ChevronDown size={24} color={colors.inkMuted} />
            )}
          </View>
        </Pressable>
        <Txt variant="small" color={colors.inkMuted} style={{ paddingHorizontal: 20, marginTop: 2 }}>
          {updatedLabel(corridor.updatedAt, true)}
          {corridor.weatherSource ? ` · ${t('weather {source}', { source: t(corridor.weatherSource) })}` : ''}
        </Txt>

        {attention.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {attention.map((s) => (
              <AttentionCard key={s.id} stretch={s} selected={selected === s.id} onPress={() => flyTo(s)} />
            ))}
          </ScrollView>
        ) : (
          <Txt color={colors.inkMuted} style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
            {t('No stretch is above Low right now. Low risk does not mean safe.')}
          </Txt>
        )}

        <View style={styles.hint}>
          <Info size={20} color={colors.inkMuted} />
          <Txt variant="small" color={colors.inkMuted} style={{ fontSize: 15, flex: 1 }}>
            {selected ? t('Tap the card again to see why') : t('Tap any stretch on the map for details')}
          </Txt>
        </View>
        {corridor.source !== 'live' ? (
          <View style={styles.demoNote}>
            <Txt variant="small" color={corridor.source === 'demo' ? LEVELS.severe.ink : colors.inkMuted}>
              {corridor.source === 'demo'
                ? t('These colours are sample data, not today’s conditions.')
                : t('Showing the last copy saved on this phone.')}{' '}
              {t('Cannot reach the Raah server at {url}.', { url: getApiUrl() })}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 4 }}>
              <Pressable onPress={() => refetch()} accessibilityRole="button" hitSlop={8}>
                <Txt variant="smallStrong" color={colors.teal}>
                  {isFetching ? t('Trying…') : t('Try again')}
                </Txt>
              </Pressable>
              <Pressable onPress={() => setServerOpen(true)} accessibilityRole="button" hitSlop={8}>
                <Txt variant="smallStrong" color={colors.teal}>
                  {t('Change server')}
                </Txt>
              </Pressable>
            </View>
          </View>
        ) : null}
      </Animated.View>
      {serverOpen ? <ServerSheet visible onClose={() => setServerOpen(false)} /> : null}
    </View>
  );
}

function AttentionCard({ stretch, selected, onPress }: { stretch: Stretch; selected: boolean; onPress: () => void }) {
  const { t } = useI18n();
  const detail = [kmRange(stretch), rainText(stretch)].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stretchName(stretch)}, ${levelLabel(stretch.level)}. ${selected ? t('Opens details') : t('Shows it on the map')}`}
      onPress={onPress}
      style={[styles.card, selected && styles.cardSelected]}>
      <LevelBadge level={stretch.level} />
      <Txt variant="h2" numberOfLines={1} style={{ marginTop: 10, fontSize: 18 }}>
        {stretchName(stretch)}
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

/** Height of the panel left showing when it is pulled down: the handle and the title row */
const PEEK = 70;
/** Room for the legend that sits above the panel */
const LEGEND_SPACE = 52;

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
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 12,
    ...shadow.float,
  },
  legendWrap: { position: 'absolute', left: 16, right: 16, top: -44 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 12,
    ...shadow.float,
  },
  handle: { alignSelf: 'center', width: 80, height: 6, borderRadius: 3, backgroundColor: colors.line, marginTop: 12 },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
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
