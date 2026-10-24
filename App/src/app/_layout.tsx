import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansDevanagari_400Regular,
  IBMPlexSansDevanagari_500Medium,
  IBMPlexSansDevanagari_600SemiBold,
  IBMPlexSansDevanagari_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-devanagari';
import {
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from '@expo-google-fonts/ibm-plex-sans-condensed';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { loadSavedApiUrl } from '@/api/client';
import { loadSavedMapStyle } from '@/components/CorridorMap';
import { LanguageProvider, loadSavedLang } from '@/i18n';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [loaded, error] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexSansCondensed_600SemiBold,
    IBMPlexSansCondensed_700Bold,
    IBMPlexSansDevanagari_400Regular,
    IBMPlexSansDevanagari_500Medium,
    IBMPlexSansDevanagari_600SemiBold,
    IBMPlexSansDevanagari_700Bold,
  });

  // The saved server address and language must be in place before the first screen
  const [apiReady, setApiReady] = useState(false);
  useEffect(() => {
    Promise.all([loadSavedApiUrl(), loadSavedLang(), loadSavedMapStyle()]).finally(() => setApiReady(true));
  }, []);

  const ready = (loaded || !!error) && apiReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // A font that fails to load falls back to the system font rather than blocking the app
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </LanguageProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
