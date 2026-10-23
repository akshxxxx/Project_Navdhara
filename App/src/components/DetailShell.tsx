import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Stretch } from '@/domain/stretch';
import { colors, radius } from '@/theme/tokens';

import { CallButton } from './AppHeader';
import { CorridorMap } from './CorridorMap';
import { IconCircle } from './ui';

/** Map zoomed on one stretch on top, scrolling details below (stretch and alert pages) */
export function DetailShell({
  stretches,
  stretch,
  actions,
  children,
}: {
  stretches: Stretch[];
  stretch: Stretch;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const mapH = Math.min(Math.max(height * 0.34, 240), 420);
  const neighbours = stretches.filter((s) => Math.abs(s.seq - stretch.seq) <= 1).map((s) => s.id);
  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <CorridorMap
        style={{ height: mapH + 40 }}
        stretches={stretches}
        selectedId={stretch.id}
        focusIds={neighbours}
        focusKey={stretch.id}
        onSelect={(id) => id !== stretch.id && router.setParams({ id })}
        insets={{ top: insets.top + 50, bottom: 40 }}
        attributionBottom={44}
      />
      <View style={[styles.topBar, { top: insets.top + 12 }]} pointerEvents="box-none">
        <IconCircle
          icon={ArrowLeft}
          label="Go back"
          size={52}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={{ flex: 1 }} />
        {actions}
        <CallButton compact />
      </View>
      <ScrollView style={styles.sheet} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.handle} />
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheet: {
    flex: 1,
    marginTop: -40,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 80,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
});
