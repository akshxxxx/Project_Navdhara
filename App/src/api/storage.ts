import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage can be unavailable (private browser window, full disk): never let it break a screen.

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  riskMap: 'raah.cache.risk-map.v1',
  offlinePack: 'raah.cache.offline-pack.v1',
  myReports: 'raah.my-reports.v1',
  apiUrl: 'raah.api-url.v1',
  lang: 'raah.lang.v1',
  contacts: 'raah.contacts.v1',
  mapStyle: 'raah.map-style.v1',
} as const;
