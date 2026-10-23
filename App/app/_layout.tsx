import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useFonts as useFont } from 'expo-font';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansCondensed_500Medium,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-condensed';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import 'react-native-reanimated';

import '../src/locales/i18n';
import { getStoredLanguage } from '../src/locales/i18n';
import i18n from '../src/locales/i18n';
import { fetchHealth } from '../src/api/client';
import { useDemoStore } from '../src/api/demoStore';

import '../global.css';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 24 * 60 * 60 * 1000, // 24h – keep cache for offline
      staleTime: 5 * 60 * 1000,    // 5 min
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'raah-query-cache',
});

export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFont({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSansCondensed_500Medium,
    IBMPlexSansCondensed_600SemiBold,
    IBMPlexSansCondensed_700Bold,
    IBMPlexSansDevanagari_400Regular,
    IBMPlexSansDevanagari_500Medium,
    IBMPlexSansDevanagari_600SemiBold,
  });

  const [langLoaded, setLangLoaded] = useState(false);
  const [hasStoredLang, setHasStoredLang] = useState<boolean | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const checkHealth = () => {
      fetchHealth()
        .then(() => {
          setIsOffline(false);
          const { useSavedData, userForcedSavedData, setUseSavedData } = useDemoStore.getState();
          if (useSavedData && !userForcedSavedData) {
            setUseSavedData(false);
          }
        })
        .catch((err) => {
          console.warn('[fetchHealth failed]', err?.message);
          setIsOffline(true);
        });
    };
    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load stored language preference
  useEffect(() => {
    getStoredLanguage().then(lang => {
      if (lang) {
        i18n.changeLanguage(lang);
        setHasStoredLang(true);
      } else {
        setHasStoredLang(false);
      }
      setLangLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded && langLoaded) {
      SplashScreen.hideAsync();
      if (hasStoredLang === false) {
        router.replace('/language-select');
      }
    }
  }, [fontsLoaded, langLoaded, hasStoredLang]);

  if (!fontsLoaded || !langLoaded) {
    return null;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {isOffline && (
          <View style={{ backgroundColor: '#dc3545', paddingTop: 40, paddingBottom: 10, alignItems: 'center' }}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>Offline Mode - Showing Cached Data</Text>
          </View>
        )}
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="language-select" options={{ headerShown: false }} />
          <Stack.Screen name="plan/result" options={{ headerShown: false }} />
          <Stack.Screen name="report/mine" options={{ headerShown: false }} />
          <Stack.Screen name="drive" options={{ headerShown: false }} />
          <Stack.Screen name="officials" options={{ headerShown: false }} />
          <Stack.Screen name="history" options={{ headerShown: false }} />
          <Stack.Screen name="emergency" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="about" options={{ headerShown: false }} />
          <Stack.Screen name="kitchen-sink" options={{ headerShown: false }} />
        </Stack>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}
