import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Map, Route, Bell, Camera } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors, iconSize, iconStroke } from '../../src/design/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.river,
        tabBarInactiveTintColor: colors.granite,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.map'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Map size={iconSize} strokeWidth={iconStroke} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: t('nav.plan'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Route size={iconSize} strokeWidth={iconStroke} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: t('nav.alerts'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Bell size={iconSize} strokeWidth={iconStroke} color={color} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: t('nav.report'),
          tabBarIcon: ({ color, focused }) => (
            <TabIcon focused={focused}>
              <Camera size={iconSize} strokeWidth={iconStroke} color={color} />
            </TabIcon>
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 64,
    backgroundColor: colors.snow,
    borderTopWidth: 1,
    borderTopColor: colors.mist,
    paddingBottom: 4,
    paddingTop: 4,
  },
  tabLabel: {
    fontFamily: 'IBMPlexSansCondensed_500Medium',
    fontSize: 11,
  },
  tabItem: {
    paddingTop: 4,
  },
  iconContainer: {
    width: 36,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: colors.riverTint,
  },
});
