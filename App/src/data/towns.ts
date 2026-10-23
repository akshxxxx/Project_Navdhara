export interface Town {
  id: string;
  name_en: string;
  name_hi: string;
  km: number;
  lat: number;
  lng: number;
}

export const towns: Town[] = [
  { id: 'rishikesh',   name_en: 'Rishikesh',    name_hi: 'ऋषिकेश',    km: 0,      lat: 30.0869, lng: 78.2676 },
  { id: 'shivpuri',    name_en: 'Shivpuri',     name_hi: 'शिवपुरी',     km: 17.43,  lat: 30.1357, lng: 78.3892 },
  { id: 'byasi',       name_en: 'Byasi',        name_hi: 'ब्यासी',        km: 24.26,  lat: 30.1410, lng: 78.4350 },
  { id: 'kaudiyala',   name_en: 'Kaudiyala',    name_hi: 'कौडियाला',     km: 38.12,  lat: 30.1300, lng: 78.5020 },
  { id: 'devprayag',   name_en: 'Devprayag',    name_hi: 'देवप्रयाग',    km: 70.63,  lat: 30.1466, lng: 78.5964 },
  { id: 'teen_dhara',  name_en: 'Teen Dhara',   name_hi: 'तीन धारा',    km: 85.56,  lat: 30.1650, lng: 78.6500 },
  { id: 'kirtinagar',  name_en: 'Kirtinagar',   name_hi: 'कीर्तिनगर',     km: 98.04,  lat: 30.2200, lng: 78.7650 },
  { id: 'srinagar',    name_en: 'Srinagar',     name_hi: 'श्रीनगर',      km: 102.99, lat: 30.2206, lng: 78.7833 },
  { id: 'sirobagarh',  name_en: 'Sirobagarh',   name_hi: 'सिरोबगड़',      km: 112.42, lat: 30.2550, lng: 78.9000 },
  { id: 'rudraprayag', name_en: 'Rudraprayag',  name_hi: 'रुद्रप्रयाग',   km: 136.06, lat: 30.2840, lng: 78.9801 },
  { id: 'gauchar',     name_en: 'Gauchar',      name_hi: 'गौचर',       km: 158.55, lat: 30.2600, lng: 79.1600 },
  { id: 'karnaprayag', name_en: 'Karnaprayag',  name_hi: 'कर्णप्रयाग',   km: 168.12, lat: 30.2597, lng: 79.2128 },
  { id: 'langasu',     name_en: 'Langasu',      name_hi: 'लंगासू',       km: 174.18, lat: 30.2650, lng: 79.2250 },
  { id: 'nandprayag',  name_en: 'Nandprayag',   name_hi: 'नंदप्रयाग',    km: 187.33, lat: 30.3350, lng: 79.2900 },
  { id: 'chamoli',     name_en: 'Chamoli',      name_hi: 'चमोली',       km: 200.39, lat: 30.4031, lng: 79.3264 },
  { id: 'birahi',      name_en: 'Birahi',       name_hi: 'बिरही',       km: 205.62, lat: 30.4200, lng: 79.3450 },
  { id: 'pipalkoti',   name_en: 'Pipalkoti',    name_hi: 'पीपलकोटी',     km: 212.36, lat: 30.4390, lng: 79.3700 },
  { id: 'helang',      name_en: 'Helang',       name_hi: 'हेलंग',       km: 241.04, lat: 30.5200, lng: 79.4900 },
  { id: 'joshimath',   name_en: 'Joshimath',    name_hi: 'जोशीमठ',     km: 247.37, lat: 30.5567, lng: 79.5660 }
];

export function segmentIdForFrom(townId: string): string | null {
  const t = towns.find(x => x.id === townId);
  if (!t) return null;
  // Approximation based on sequence
  const idx = towns.findIndex(x => x.id === townId);
  if (idx < 0 || idx >= towns.length - 1) return null;
  const num = (idx + 1).toString().padStart(2, '0');
  return `seg_${num}`;
}

export function segmentIdForTo(townId: string): string | null {
  const t = towns.find(x => x.id === townId);
  if (!t) return null;
  const idx = towns.findIndex(x => x.id === townId);
  if (idx <= 0) return null;
  const num = (idx).toString().padStart(2, '0');
  return `seg_${num}`;
}
