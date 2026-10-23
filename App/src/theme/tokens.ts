// Design tokens shared by every screen. Risk colours match the web dashboard (Frontend/src/api/adapters.js).

export const colors = {
  navy: '#1B2A33',
  navySoft: '#2A3B46',
  ink: '#1B2A33',
  inkMuted: '#5B6B75',
  inkFaint: '#8A979F',
  bg: '#ECF0F2',
  card: '#FFFFFF',
  line: '#D5DDE2',
  lineStrong: '#AEBBC3',
  chip: '#E6EBEE',
  yellow: '#F5C400',
  yellowSoft: '#FBEDB0',
  red: '#B3213A',
  redDeep: '#9B1C31',
  teal: '#1F5F6B',
  tealSoft: '#DCEBEE',
  green: '#2E7D57',
  greenSoft: '#E3F1EA',
  mapBg: '#E6ECEF',
  contour: '#CBD4D9',
  river: '#B6D6E2',
  white: '#FFFFFF',
} as const;

export const fonts = {
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemi: 'IBMPlexSans_600SemiBold',
  bodyBold: 'IBMPlexSans_700Bold',
  head: 'IBMPlexSansCondensed_600SemiBold',
  headBold: 'IBMPlexSansCondensed_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadow = {
  card: {
    shadowColor: '#0B1A22',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  float: {
    shadowColor: '#0B1A22',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
} as const;
