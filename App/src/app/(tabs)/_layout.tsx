import { Tabs } from 'expo-router';
import { Bell, Flag, Map, Route, Siren, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui';
import { useI18n } from '@/i18n';
import { colors } from '@/theme/tokens';

const TABS: { name: string; title: string; icon: LucideIcon }[] = [
  { name: 'index', title: 'Map', icon: Map },
  { name: 'plan', title: 'Plan trip', icon: Route },
  { name: 'alerts', title: 'Alerts', icon: Bell },
  { name: 'reports', title: 'Reports', icon: Flag },
  { name: 'emergency', title: 'Emergency', icon: Siren },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      tabBar={({ state, navigateToTab }) => (
        <TabBar index={state.index} routes={state.routes} navigate={navigateToTab} />
      )}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.title }} />
      ))}
    </Tabs>
  );
}

function TabBar({
  index,
  routes,
  navigate,
}: {
  index: number;
  routes: { key: string; name: string }[];
  navigate: (routeKey: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {routes.map((r, i) => {
        const tab = TABS.find((t) => t.name === r.name);
        if (!tab) return null;
        const active = i === index;
        const Icon = tab.icon;
        return (
          <Pressable
            key={r.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(tab.title)}
            onPress={() => navigate(r.key)}
            style={styles.item}>
            <View style={[styles.iconWrap, active && { backgroundColor: colors.yellowSoft }]}>
              <Icon size={24} color={active ? colors.ink : colors.inkMuted} strokeWidth={active ? 2.3 : 1.9} />
            </View>
            <Txt
              variant={active ? 'smallStrong' : 'small'}
              color={active ? colors.ink : colors.inkMuted}
              numberOfLines={1}
              style={{ fontSize: 12 }}>
              {t(tab.title)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  iconWrap: { width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
