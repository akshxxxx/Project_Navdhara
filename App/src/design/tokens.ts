/**
 * Design tokens for the Raah app.
 * Source: 00_DESIGN_SYSTEM.md section 4.
 *
 * These are plain constants so that SVG, react-native-svg, and map code
 * can use them directly. The same values are mirrored in tailwind.config.js
 * for NativeWind classes.
 *
 * NEVER hardcode a colour, radius, or font anywhere else in the project.
 */

// ---------------------------------------------------------------------------
// 4.1 Colour – Neutrals and brand
// ---------------------------------------------------------------------------

export const colors = {
  ink: '#1B2A33',
  granite: '#4F5E66',
  mist: '#CBD5DA',
  glacier: '#EDF1F3',
  snow: '#FAFBFC',
  river: '#1D5E6B',
  riverTint: '#DCEBEE',
  milestone: '#F7C600',
} as const;

// ---------------------------------------------------------------------------
// 4.1 Colour – Risk scale
// ---------------------------------------------------------------------------

export type Level = 0 | 1 | 2 | 3;
export type EffectiveLevel = Level | 'closed';

export interface RiskColour {
  fill: string;
  tint: string;
  textOnFill: string;
}

export const risk: Record<Level, RiskColour> = {
  0: { fill: '#2E7D57', tint: '#E3F1EA', textOnFill: '#FFFFFF' },
  1: { fill: '#D49A00', tint: '#FAF0D2', textOnFill: '#1B2A33' }, // Ink
  2: { fill: '#C4470F', tint: '#F8E3D8', textOnFill: '#FFFFFF' },
  3: { fill: '#9B1C31', tint: '#F3DADF', textOnFill: '#FFFFFF' },
} as const;

/** Closed state uses Ink colour */
export const closedColour: RiskColour = {
  fill: '#1B2A33', // colors.ink
  tint: '#CBD5DA',  // colors.mist
  textOnFill: '#FFFFFF',
} as const;

/** Get risk colour for any effective level including closed */
export function riskColourFor(level: EffectiveLevel): RiskColour {
  return level === 'closed' ? closedColour : risk[level];
}

export const riskName = {
  en: { 0: 'Low', 1: 'Moderate', 2: 'High', 3: 'Severe' } as Record<Level, string>,
  hi: { 0: 'कम', 1: 'मध्यम', 2: 'ज़्यादा', 3: 'गंभीर' } as Record<Level, string>,
} as const;

export const riskShape: Record<Level, 'circle' | 'triangle' | 'diamond' | 'octagon'> = {
  0: 'circle',
  1: 'triangle',
  2: 'diamond',
  3: 'octagon',
} as const;

export const verdict = {
  en: {
    0: 'Good to go',
    1: 'Go with care',
    2: 'Delay if you can',
    3: 'Not advised',
    closed: 'Road closed',
  } as Record<string, string>,
  hi: {
    0: 'चल सकते हैं',
    1: 'सावधानी से चलें',
    2: 'हो सके तो टालें',
    3: 'यात्रा की सलाह नहीं',
    closed: 'सड़क बंद है',
  } as Record<string, string>,
} as const;

// ---------------------------------------------------------------------------
// 4.1 Colour – Night palette (Drive mode and dark theme)
// ---------------------------------------------------------------------------

export const night = {
  bg: '#0E181D',
  surface: '#16242B',
  text: '#E6EDF0',
  muted: '#9DB0B8',
  line: '#2B3D46',
} as const;

export const nightRisk: Record<Level, string> = {
  0: '#4DB383',
  1: '#F0B429',
  2: '#F2793F',
  3: '#F0647A',
} as const;

export const nightRiskClosed = '#E6EDF0'; // night.text for closed

// ---------------------------------------------------------------------------
// 4.2 Type
// ---------------------------------------------------------------------------

export const fontFamily = {
  sans400: 'IBMPlexSans_400Regular',
  sans500: 'IBMPlexSans_500Medium',
  sans600: 'IBMPlexSans_600SemiBold',
  condensed500: 'IBMPlexSansCondensed_500Medium',
  condensed600: 'IBMPlexSansCondensed_600SemiBold',
  condensed700: 'IBMPlexSansCondensed_700Bold',
  devanagari400: 'IBMPlexSansDevanagari_400Regular',
  devanagari500: 'IBMPlexSansDevanagari_500Medium',
  devanagari600: 'IBMPlexSansDevanagari_600SemiBold',
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

/** Type scale. lineHeight values are for Latin; add 0.1 ratio for Hindi. */
export const typeScale: Record<string, TypeStyle> = {
  verdict: { fontSize: 40, lineHeight: 44, fontFamily: fontFamily.condensed700 },
  h1: { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.condensed600 },
  h2: { fontSize: 22, lineHeight: 28, fontFamily: fontFamily.condensed600 },
  h3: { fontSize: 18, lineHeight: 24, fontFamily: fontFamily.condensed600 },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fontFamily.sans400 },
  small: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.sans400 },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.sans500 },
  drive: { fontSize: 56, lineHeight: 64, fontFamily: fontFamily.condensed700 },
} as const;

// ---------------------------------------------------------------------------
// 4.3 Space, shape, depth, motion
// ---------------------------------------------------------------------------

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radii = {
  xs: 2,   // strip blocks, tags
  sm: 6,   // inputs, buttons
  md: 10,  // panels, popovers
  lg: 16,  // bottom sheet top corners
  full: 999, // chips
} as const;

export const shadows = {
  sheet: {
    boxShadow: `0px -2px 12px rgba(27, 42, 51, 0.12)`, // colors.ink = #1B2A33 = rgb(27,42,51)
    elevation: 8,
  },
  popover: {
    boxShadow: `0px 4px 16px rgba(27, 42, 51, 0.16)`,
    elevation: 12,
  },
} as const;

export const touchTarget = {
  min: 48,
  drive: 64,
} as const;

export const iconSize = 20;
export const iconStroke = 1.75;

// ---------------------------------------------------------------------------
// Severe hatch pattern constants (for SVG patterns)
// ---------------------------------------------------------------------------

export const severeHatch = {
  angle: 45,
  stripeWidth: 2,
  gapWidth: 4, // total repeat = stripe + gap = 6
  color: 'rgba(255,255,255,0.45)',
} as const;
