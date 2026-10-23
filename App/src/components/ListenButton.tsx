import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Volume2, Square, AlertCircle } from 'lucide-react-native';
import { ThemedText } from './ThemedText';
import { colors, radii, spacing } from '../design/tokens';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../api/client';

interface ListenButtonProps {
  segmentId: string;
}

let activePlayer: any = null;
let activeHtmlAudio: HTMLAudioElement | null = null;

export function ListenButton({ segmentId }: ListenButtonProps) {
  const { i18n } = useTranslation();
  const isWeb = Platform.OS === 'web';

  // Native player
  const nativePlayer = useAudioPlayer(null);
  const nativeStatus = useAudioPlayerStatus(nativePlayer);

  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingWeb, setIsPlayingWeb] = useState(false);
  const [hasError, setHasError] = useState(false);
  const htmlAudioRef = useRef<HTMLAudioElement | null>(null);

  const isPlaying = isWeb ? isPlayingWeb : nativeStatus.playing;

  useEffect(() => {
    return () => {
      if (activePlayer === nativePlayer) {
        activePlayer = null;
      }
      if (isWeb) {
        if (htmlAudioRef.current) {
          try { htmlAudioRef.current.pause(); } catch {}
          htmlAudioRef.current = null;
        }
      } else {
        try {
          if (nativePlayer && typeof nativePlayer.pause === 'function') {
            nativePlayer.pause();
          }
        } catch {
          // Player already released
        }
      }
    };
  }, [nativePlayer, isWeb]);

  useEffect(() => {
    if (!isWeb && (nativeStatus.playing || nativeStatus.isLoaded)) {
      setIsLoading(false);
    }
  }, [nativeStatus.playing, nativeStatus.isLoaded, isWeb]);

  const handlePress = async () => {
    if (isPlaying) {
      if (isWeb && htmlAudioRef.current) {
        try { htmlAudioRef.current.pause(); } catch {}
        setIsPlayingWeb(false);
      } else if (!isWeb) {
        try { nativePlayer.pause(); } catch {}
      }
      return;
    }

    try {
      setHasError(false);
      setIsLoading(true);

      const lang = i18n.language === 'hi' ? 'hi' : 'en';
      const url = `${API_URL}/voice-alert?segment_id=${segmentId}&lang=${lang}`;

      if (isWeb) {
        if (activeHtmlAudio && activeHtmlAudio !== htmlAudioRef.current) {
          try { activeHtmlAudio.pause(); } catch {}
        }
        if (!htmlAudioRef.current) {
          htmlAudioRef.current = new Audio(url);
          htmlAudioRef.current.onended = () => setIsPlayingWeb(false);
          htmlAudioRef.current.onerror = () => {
            setHasError(true);
            setIsLoading(false);
            setIsPlayingWeb(false);
          };
        } else {
          htmlAudioRef.current.src = url;
        }
        activeHtmlAudio = htmlAudioRef.current;
        await htmlAudioRef.current.play();
        setIsLoading(false);
        setIsPlayingWeb(true);
      } else {
        if (activePlayer && activePlayer !== nativePlayer) {
          try {
            activePlayer.pause();
          } catch {
            // Player was already released by another component
          }
          activePlayer = null;
        }
        activePlayer = nativePlayer;
        try {
          nativePlayer.replace(url);
          nativePlayer.play();
        } catch (nativeErr) {
          console.warn('Native player playback error:', nativeErr);
          activePlayer = null;
          setHasError(true);
          setIsLoading(false);
        }
      }
    } catch (e) {
      console.error('Audio play error:', e);
      setHasError(true);
      setIsLoading(false);
      setIsPlayingWeb(false);
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.button, hasError && styles.buttonError]} 
      onPress={handlePress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={i18n.language === 'hi' ? 'आवाज़ में सुनें' : 'Listen to audio advisory'}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.ink} />
      ) : isPlaying ? (
        <Square size={20} color={colors.ink} fill={colors.ink} />
      ) : hasError ? (
        <AlertCircle size={20} color={colors.snow} />
      ) : (
        <Volume2 size={20} color={colors.ink} />
      )}
      <ThemedText variant="body" color={hasError ? colors.snow : colors.ink} style={styles.text}>
        {i18n.language === 'hi' ? 'सुनें' : 'Listen'}
      </ThemedText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mist,
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radii.full,
    gap: spacing.sm,
  },
  buttonError: {
    backgroundColor: colors.granite,
  },
  text: {
    fontWeight: '600',
  }
});
