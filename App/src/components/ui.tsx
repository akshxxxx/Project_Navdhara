import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { LEVELS, levelLabel, levelVerdict, type LevelKey } from '@/domain/levels';
import { fontFor, useI18n } from '@/i18n';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'smallStrong' | 'eyebrow';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.headBold, fontSize: 28, lineHeight: 32 },
  h1: { fontFamily: fonts.headBold, fontSize: 24, lineHeight: 28 },
  h2: { fontFamily: fonts.headBold, fontSize: 19, lineHeight: 23 },
  h3: { fontFamily: fonts.head, fontSize: 16, lineHeight: 20 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18 },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    lineHeight: 15,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
};

export function Txt({
  variant = 'body',
  color = colors.ink,
  style,
  ...rest
}: TextProps & { variant?: Variant; color?: string }) {
  const { lang } = useI18n();
  if (lang !== 'hi') return <Text {...rest} style={[VARIANTS[variant], { color }, style]} />;
  // Hindi: Devanagari face, a little more line height for the vowel marks, and no letter spacing
  // (spacing breaks joined Devanagari letters)
  const flat = StyleSheet.flatten([VARIANTS[variant], style]) as TextStyle;
  const hi: TextStyle = {
    fontFamily: fontFor(flat.fontFamily ?? fonts.body, 'hi'),
    letterSpacing: 0,
    ...(flat.lineHeight ? { lineHeight: Math.round(flat.lineHeight * 1.18) } : null),
  };
  return <Text {...rest} style={[VARIANTS[variant], { color }, style, hi]} />;
}

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && { padding: 18 }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  icon: Icon,
  kind = 'primary',
  disabled,
  loading,
  style,
  compact,
}: {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  kind?: 'primary' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const fg = kind === 'primary' || kind === 'danger' ? colors.white : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        kind === 'primary' && { backgroundColor: colors.navy },
        kind === 'danger' && { backgroundColor: colors.red },
        kind === 'outline' && { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.navy },
        kind === 'ghost' && { backgroundColor: 'transparent' },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <Icon size={compact ? 16 : 20} color={fg} strokeWidth={2.2} /> : null}
          <Txt variant={compact ? 'smallStrong' : 'bodyStrong'} color={fg} style={!compact && { fontSize: 14 }}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** "SEVERE · NOT ADVISED" */
export function LevelBadge({ level, text, dot = true }: { level: LevelKey; text?: string; dot?: boolean }) {
  const m = LEVELS[level];
  return (
    <View style={[styles.badge, { backgroundColor: m.tint }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: m.color }]} /> : null}
      <Txt variant="eyebrow" color={m.ink} numberOfLines={1}>
        {text ?? `${levelLabel(level)} · ${levelVerdict(level)}`}
      </Txt>
    </View>
  );
}

export function StatTile({
  label,
  value,
  unit,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.stat}>
      <Txt variant="small" color={colors.inkMuted} numberOfLines={1}>
        {label}
      </Txt>
      <Text numberOfLines={1}>
        <Txt variant="h1" color={valueColor ?? colors.ink} style={{ fontSize: 24 }}>
          {value}
        </Txt>
        {unit ? (
          <Txt variant="smallStrong" color={colors.inkMuted}>
            {' '}
            {unit}
          </Txt>
        ) : null}
      </Text>
    </View>
  );
}

export function FactorBar({ label, value, display }: { label: string; value: number; display: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.factorRow} accessible accessibilityLabel={`${label}: ${display}`}>
      <Txt style={{ flex: 1.3 }}>{label}</Txt>
      <View style={styles.factorTrack}>
        <View style={[styles.factorFill, { width: `${pct * 100}%` }]} />
      </View>
      <Txt variant="bodyStrong" style={{ width: 52, textAlign: 'right' }}>
        {display}
      </Txt>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  dotColor,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  dotColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor, width: 10, height: 10 }]} /> : null}
      <Txt variant="bodyStrong" color={active ? colors.white : colors.ink}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="h3" style={{ fontSize: 16, flex: 1 }}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

export function Disclaimer({ text }: { text?: string }) {
  const { t } = useI18n();
  text = text ?? t('Not an official warning · Low risk does not mean safe · Emergency 112');
  return (
    <Txt variant="small" color={colors.inkMuted} style={{ textAlign: 'center', marginTop: 16 }}>
      {text}
    </Txt>
  );
}

export function IconCircle({
  icon: Icon,
  onPress,
  label,
  size = 48,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconCircle, { width: size, height: size }, pressed && { opacity: 0.8 }]}>
      <Icon size={size * 0.46} color={colors.ink} strokeWidth={2.2} />
    </Pressable>
  );
}

export function Notice({
  tone,
  title,
  body,
  icon: Icon,
}: {
  tone: 'info' | 'warn' | 'ok' | 'error';
  title: string;
  body?: string;
  icon?: LucideIcon;
}) {
  const palette = {
    info: { bg: colors.tealSoft, fg: colors.teal },
    warn: { bg: LEVELS.moderate.tint, fg: LEVELS.moderate.ink },
    ok: { bg: colors.greenSoft, fg: '#1E5C3F' },
    error: { bg: LEVELS.severe.tint, fg: LEVELS.severe.ink },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: palette.bg }]}>
      {Icon ? <Icon size={22} color={palette.fg} strokeWidth={2.2} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong" color={palette.fg} style={{ fontSize: 14 }}>
          {title}
        </Txt>
        {body ? <Txt color={colors.ink}>{body}</Txt> : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: 16, borderRadius: radius.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    maxWidth: '100%',
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  stat: {
    flex: 1,
    backgroundColor: colors.chip,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  factorTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#E2E8EB', overflow: 'hidden' },
  factorFill: { height: '100%', borderRadius: 5, backgroundColor: colors.teal },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 12 },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.white,
    ...shadow.float,
  },
  notice: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: radius.md, alignItems: 'flex-start' },
});
