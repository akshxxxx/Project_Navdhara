import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { KEYS, readJson, writeJson } from '@/api/storage';
import { fonts } from '@/theme/tokens';

import { HI } from './hi';

// English text is the key, so screens stay readable and a missing Hindi entry falls back to English.

export type Lang = 'en' | 'hi';
export type Params = Record<string, string | number>;
export type TFn = (key: string, params?: Params) => string;

// The current language is also kept outside React so plain helpers (time, wording) can read it.
// Screens re-render on a change because they all read it through useI18n().
let currentLang: Lang = 'en';
export const getLang = () => currentLang;

function format(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate outside React (domain helpers). Components use useI18n().t */
export function tr(key: string, params?: Params): string {
  return format(currentLang === 'hi' ? (HI[key] ?? key) : key, params);
}

export async function loadSavedLang(): Promise<void> {
  const saved = await readJson<Lang>(KEYS.lang);
  if (saved === 'hi' || saved === 'en') currentLang = saved;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: tr });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);
  const setLang = useCallback((l: Lang) => {
    currentLang = l;
    setLangState(l);
    writeJson(KEYS.lang, l);
  }, []);
  // t changes identity with the language so memoised text recomputes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback<TFn>((key, params) => tr(key, params), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

// IBM Plex Sans has no Devanagari; in Hindi every face maps to IBM Plex Sans Devanagari (which also has Latin)
const DEVANAGARI: Record<string, string> = {
  [fonts.body]: 'IBMPlexSansDevanagari_400Regular',
  [fonts.bodyMedium]: 'IBMPlexSansDevanagari_500Medium',
  [fonts.bodySemi]: 'IBMPlexSansDevanagari_600SemiBold',
  [fonts.bodyBold]: 'IBMPlexSansDevanagari_700Bold',
  [fonts.head]: 'IBMPlexSansDevanagari_600SemiBold',
  [fonts.headBold]: 'IBMPlexSansDevanagari_700Bold',
};

export const fontFor = (family: string, lang: Lang = currentLang) =>
  lang === 'hi' ? (DEVANAGARI[family] ?? family) : family;

// --- Place names ---

const TOWNS_HI: Record<string, string> = {
  Rishikesh: 'ऋषिकेश',
  Shivpuri: 'शिवपुरी',
  Byasi: 'ब्यासी',
  Kaudiyala: 'कौड़ियाला',
  Devprayag: 'देवप्रयाग',
  'Teen Dhara': 'तीन धारा',
  Kirtinagar: 'कीर्तिनगर',
  Srinagar: 'श्रीनगर',
  Sirobagarh: 'सिरोबगड़',
  Rudraprayag: 'रुद्रप्रयाग',
  Gauchar: 'गौचर',
  Karnaprayag: 'कर्णप्रयाग',
  Langasu: 'लंगासू',
  Nandprayag: 'नंदप्रयाग',
  Chamoli: 'चमोली',
  Birahi: 'बिरही',
  Pipalkoti: 'पीपलकोटी',
  Helang: 'हेलंग',
  'Helang (Tangani)': 'हेलंग (टंगणी)',
  Joshimath: 'जोशीमठ',
};

export const townName = (name: string) => (currentLang === 'hi' ? (TOWNS_HI[name] ?? name) : name);

/** "Sirobagarh to Rudraprayag" -> "सिरोबगड़ से रुद्रप्रयाग" */
export function placeName(name: string): string {
  if (currentLang !== 'hi') return name;
  const [a, b] = name.split(' to ');
  return b ? `${townName(a)} से ${townName(b)}` : townName(name);
}
