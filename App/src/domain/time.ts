import { getLang } from '@/i18n';

// All times are shown in IST (UTC+5:30), whatever the phone's own time zone is.
// Words follow the app language; digits stay Latin, as on Indian road signs and tickets.

const IST_MS = 330 * 60 * 1000;
const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
};
const DAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  hi: ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'],
};

/** Parse an ISO string. A string without a zone is IST (the backend's trip-planner convention). */
export function parseIso(iso?: string | null): Date | null {
  if (!iso) return null;
  const hasZone = /Z$|[+-]\d\d:?\d\d$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A Date whose UTC fields read as IST wall-clock time. */
const istFields = (d: Date) => new Date(d.getTime() + IST_MS);

const pad = (n: number) => String(n).padStart(2, '0');

/** "9:05 pm", or in Hindi "रात 9:05" (the part of the day comes first) */
export function clock12(d: Date): string {
  const f = istFields(d);
  const h = f.getUTCHours();
  const hm = `${h % 12 === 0 ? 12 : h % 12}:${pad(f.getUTCMinutes())}`;
  if (getLang() === 'hi') {
    const part = h >= 4 && h < 12 ? 'सुबह' : h >= 12 && h < 16 ? 'दोपहर' : h >= 16 && h < 19 ? 'शाम' : 'रात';
    return `${part} ${hm}`;
  }
  return `${hm} ${h < 12 ? 'am' : 'pm'}`;
}

export function clock24(d: Date): string {
  const f = istFields(d);
  return `${pad(f.getUTCHours())}:${pad(f.getUTCMinutes())}`;
}

export function istDateKey(d: Date): string {
  const f = istFields(d);
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}

/** "Fri, 24 Oct" for a YYYY-MM-DD key */
export function dayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const l = getLang();
  return `${DAYS[l][dt.getUTCDay()]}, ${d} ${MONTHS[l][m - 1]}`;
}

export function shortDay(d: Date): string {
  const f = istFields(d);
  const l = getLang();
  return `${DAYS[l][f.getUTCDay()]} ${f.getUTCDate()} ${MONTHS[l][f.getUTCMonth()]}`;
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const dayMonth = (d: Date) => {
  const f = istFields(d);
  return `${f.getUTCDate()} ${MONTHS[getLang()][f.getUTCMonth()]}`;
};

/** "Today, 7:42 pm" / "Yesterday, 5:30 pm" / "21 Oct, 5:30 pm" */
export function relativeStamp(iso?: string | null, now = new Date()): string {
  const d = parseIso(iso);
  if (!d) return '';
  const hi = getLang() === 'hi';
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins >= 0 && mins < 2) return hi ? 'अभी' : 'just now';
  const key = istDateKey(d);
  if (key === istDateKey(now)) return `${hi ? 'आज' : 'Today'}, ${clock12(d)}`;
  if (key === addDays(istDateKey(now), -1)) return `${hi ? 'कल' : 'Yesterday'}, ${clock12(d)}`;
  return `${dayMonth(d)}, ${clock12(d)}`;
}

/** "updated 9:05 pm", or "updated 23 Oct, 9:05 pm" when it is not from today. capital: "Updated …" */
export function updatedLabel(iso?: string | null, capital = false, now = new Date()): string {
  const d = parseIso(iso);
  const hi = getLang() === 'hi';
  if (!d) return hi ? 'अपडेट का समय पता नहीं' : `${capital ? 'U' : 'u'}pdate time unknown`;
  const when = istDateKey(d) === istDateKey(now) ? clock12(d) : `${dayMonth(d)}, ${clock12(d)}`;
  return hi ? `अपडेट ${when}` : `${capital ? 'U' : 'u'}pdated ${when}`;
}

/** Today's IST date and the next whole hour, for the trip form's defaults */
export function nextHourIst(now = new Date()): { date: string; time: string } {
  // IST is UTC+5:30, so round up on IST wall-clock hours, not UTC ones
  const next = new Date(Math.ceil((now.getTime() + IST_MS) / 3600000) * 3600000 - IST_MS);
  return { date: istDateKey(next), time: clock24(next) };
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 3600000);
}

/** "8 h 15" / "8 घंटे 15 मिनट" */
export function durationLabel(hours: number): string {
  let h = Math.floor(hours);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (getLang() === 'hi') return m === 0 ? `${h} घंटे` : `${h} घंटे ${m} मिनट`;
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`;
}
