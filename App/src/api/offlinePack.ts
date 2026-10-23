import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';

const API_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL ??
  process.env.EXPO_PUBLIC_API_URL ??
  'http://localhost:8000';

const PACK_KEY = 'raah_offline_pack';
const ETAG_KEY = 'raah_offline_pack_etag';
const LAST_FETCH_KEY = 'raah_offline_pack_last_fetch';

// Use the fixture from the filesystem when in fallback/first load
export async function getFallbackPack() {
  try {
    const fixture = require('./fixtures/offline-pack.json');
    return fixture;
  } catch (e) {
    return null;
  }
}

export async function getOfflinePack() {
  try {
    const dataStr = await AsyncStorage.getItem(PACK_KEY);
    if (dataStr) {
      return JSON.parse(dataStr);
    }
  } catch (e) {}
  
  return await getFallbackPack();
}

export async function refreshOfflinePack(force = false) {
  try {
    const lastFetchStr = await AsyncStorage.getItem(LAST_FETCH_KEY);
    const lastFetch = lastFetchStr ? parseInt(lastFetchStr, 10) : 0;
    const now = Date.now();
    
    // Refresh every 6 hours
    if (!force && (now - lastFetch < 6 * 60 * 60 * 1000)) {
      return;
    }

    const etag = await AsyncStorage.getItem(ETAG_KEY);
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const res = await fetch(`${API_URL}/offline-pack?lang=en`, {
      headers,
    });

    if (res.status === 304) {
      await AsyncStorage.setItem(LAST_FETCH_KEY, now.toString());
      return;
    }

    if (res.ok) {
      const data = await res.json();
      const newEtag = res.headers.get('ETag');
      
      await AsyncStorage.setItem(PACK_KEY, JSON.stringify(data));
      await AsyncStorage.setItem(LAST_FETCH_KEY, now.toString());
      if (newEtag) {
        await AsyncStorage.setItem(ETAG_KEY, newEtag);
      }
    }
  } catch (e) {
    // Silently fail on network error
    console.error('Failed to refresh offline pack:', e);
  }
}
