import { router } from 'expo-router';
import { ArrowLeft, Languages, Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

import { Txt } from './ui';

export const call = (number: string) => Linking.openURL(`tel:${number.replace(/[^\d+]/g, '')}`).catch(() => {});

export function CallButton({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Call 112, emergency')}
      onPress={() => call('112')}
      style={({ pressed }) => [
        styles.call,
        compact && { height: 46, paddingHorizontal: 14 },
        pressed && { opacity: 0.85 },
      ]}>
      <Phone size={18} color={colors.white} strokeWidth={2.3} />
      <Txt variant="h2" color={colors.white} style={{ fontSize: 19 }}>
        112
      </Txt>
    </Pressable>
  );
}

/** One tap switches between English and Hindi; the button shows the language you would switch to */
export function LangButton({ light }: { light?: boolean }) {
  const { lang, setLang } = useI18n();
  const next = lang === 'hi' ? 'en' : 'hi';
  const fg = light ? colors.ink : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={next === 'hi' ? 'हिंदी में बदलें (Switch to Hindi)' : 'Switch to English'}
      hitSlop={6}
      onPress={() => setLang(next)}
      style={({ pressed }) => [styles.lang, light && styles.langLight, pressed && { opacity: 0.75 }]}>
      <Languages size={16} color={fg} strokeWidth={2.2} />
      <Txt variant="smallStrong" color={fg} style={{ fontSize: 14 }}>
        {next === 'hi' ? 'हिंदी' : 'EN'}
      </Txt>
    </Pressable>
  );
}

export function Brand() {
  return (
    <View style={styles.brand}>
      <View style={styles.shield}>
        <Txt style={{ fontFamily: fonts.headBold, fontSize: 15, color: colors.ink }}>NH7</Txt>
      </View>
      <Txt variant="h1" color={colors.white} style={{ fontSize: 24 }}>
        Raah
      </Txt>
    </View>
  );
}

/** Dark top bar used by every page except the map */
export function AppHeader({
  title,
  subtitle,
  back,
  showCall = true,
  right,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
  showCall?: boolean;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Go back')}
          hitSlop={12}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <ArrowLeft size={24} color={colors.white} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <Txt variant="h1" color={colors.white} numberOfLines={1} style={{ fontSize: subtitle ? 19 : 24 }}>
            {title}
          </Txt>
        ) : (
          <Brand />
        )}
        {subtitle ? (
          <Txt variant="small" color="#B9C6CE" numberOfLines={1} style={{ fontSize: 15 }}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
      <LangButton />
      {showCall ? <CallButton /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.navy,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  call: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.red,
    height: 46,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    ...shadow.card,
  },
  lang: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  langLight: { borderColor: colors.lineStrong, backgroundColor: colors.white },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shield: { backgroundColor: colors.yellow, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 2 },
});
