import React from 'react';
import { Text as RNText, type TextProps, type TextStyle, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { typeScale, fontFamily, colors } from '../design/tokens';

export type TextVariant = 'verdict' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'caption' | 'drive';

interface ThemedTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  children: React.ReactNode;
}

/**
 * Picks the Devanagari font family when the active language is Hindi.
 * Maps Sans weights to Devanagari weights, and Condensed stays Condensed
 * (Devanagari doesn't have a condensed variant – we fall back to Devanagari regular/medium/semibold).
 */
function getHindiFamily(latinFamily: string): string {
  // For Condensed fonts, use Devanagari at the closest weight
  if (latinFamily === fontFamily.condensed700) return fontFamily.devanagari600;
  if (latinFamily === fontFamily.condensed600) return fontFamily.devanagari600;
  if (latinFamily === fontFamily.condensed500) return fontFamily.devanagari500;
  // For Sans fonts, map directly
  if (latinFamily === fontFamily.sans600) return fontFamily.devanagari600;
  if (latinFamily === fontFamily.sans500) return fontFamily.devanagari500;
  if (latinFamily === fontFamily.sans400) return fontFamily.devanagari400;
  return fontFamily.devanagari400;
}

export function ThemedText({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const { i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  const scale = typeScale[variant] ?? typeScale.body;

  const resolvedFamily = isHindi
    ? getHindiFamily(scale.fontFamily)
    : scale.fontFamily;

  // Hindi gets +0.1 lineHeight ratio
  const lineHeightMultiplier = isHindi ? 0.1 : 0;
  const adjustedLineHeight = scale.lineHeight + scale.fontSize * lineHeightMultiplier;

  const textStyle: TextStyle = {
    fontFamily: resolvedFamily,
    fontSize: scale.fontSize,
    lineHeight: adjustedLineHeight,
    color: color ?? colors.ink,
    // Tabular numerals via fontVariant
    fontVariant: ['tabular-nums'],
  };

  return (
    <RNText style={[textStyle, style]} {...rest}>
      {children}
    </RNText>
  );
}

export default ThemedText;
