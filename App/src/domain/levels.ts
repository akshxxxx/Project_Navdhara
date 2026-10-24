import { tr } from '@/i18n';

// The five levels a traveller sees. The backend's "Very High" is shown as Severe.

export type LevelKey = 'low' | 'moderate' | 'high' | 'severe' | 'closed';

export interface LevelMeta {
  key: LevelKey;
  label: string;
  short: string;
  verdict: string;
  color: string;
  tint: string;
  ink: string;
  rank: number;
}

export const LEVELS: Record<LevelKey, LevelMeta> = {
  low: {
    key: 'low',
    label: 'Low',
    short: 'Low',
    verdict: 'Good to go',
    color: '#2E7D57',
    tint: '#E3F1EA',
    ink: '#1E5C3F',
    rank: 0,
  },
  moderate: {
    key: 'moderate',
    label: 'Moderate',
    short: 'Mod.',
    verdict: 'Go with care',
    color: '#D49A00',
    tint: '#FAF0D2',
    ink: '#7A5800',
    rank: 1,
  },
  high: {
    key: 'high',
    label: 'High',
    short: 'High',
    verdict: 'Delay if you can',
    color: '#C4470F',
    tint: '#F8E3D8',
    ink: '#8E330A',
    rank: 2,
  },
  severe: {
    key: 'severe',
    label: 'Severe',
    short: 'Severe',
    verdict: 'Not advised',
    color: '#9B1C31',
    tint: '#F3DADF',
    ink: '#7D1527',
    rank: 3,
  },
  closed: {
    key: 'closed',
    label: 'Closed',
    short: 'Closed',
    verdict: 'Road closed',
    color: '#1B2A33',
    tint: '#DDE3E6',
    ink: '#1B2A33',
    rank: 4,
  },
};

export const LEVEL_ORDER: LevelKey[] = ['low', 'moderate', 'high', 'severe', 'closed'];

export function levelFromText(text?: string | null): LevelKey {
  switch ((text ?? '').trim().toLowerCase()) {
    case 'very high':
    case 'severe':
      return 'severe';
    case 'high':
      return 'high';
    case 'moderate':
      return 'moderate';
    case 'closed':
      return 'closed';
    default:
      return 'low';
  }
}

/** Translated "Severe" / "Not advised" (LEVELS keeps the English as the key) */
export const levelLabel = (k: LevelKey) => tr(LEVELS[k].label);
export const levelShort = (k: LevelKey) => tr(LEVELS[k].short);
export const levelVerdict = (k: LevelKey) => tr(LEVELS[k].verdict);

export const worst = (a: LevelKey, b: LevelKey): LevelKey => (LEVELS[a].rank >= LEVELS[b].rank ? a : b);
