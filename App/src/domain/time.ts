// All times are shown in IST (UTC+5:30), whatever the phone's own time zone is.

const IST_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export function clock12(d: Date): string {
  const f = istFields(d);
  const h = f.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(f.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
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
  return `${DAYS[dt.getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}

export function shortDay(d: Date): string {
  const f = istFields(d);
  return `${DAYS[f.getUTCDay()]} ${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]}`;
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** "Today, 7:42 pm" / "Yesterday, 5:30 pm" / "21 Oct, 5:30 pm" */
export function relativeStamp(iso?: string | null, now = new Date()): string {
  const d = parseIso(iso);
  if (!d) return '';
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins >= 0 && mins < 2) return 'just now';
  const key = istDateKey(d);
  if (key === istDateKey(now)) return `Today, ${clock12(d)}`;
  if (key === addDays(istDateKey(now), -1)) return `Yesterday, ${clock12(d)}`;
  const f = istFields(d);
  return `${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]}, ${clock12(d)}`;
}

/** "updated 9:05 pm" or "updated 23 Oct, 9:05 pm" when it is not from today */
export function updatedLabel(iso?: string | null, now = new Date()): string {
  const d = parseIso(iso);
  if (!d) return 'update time unknown';
  if (istDateKey(d) === istDateKey(now)) return `updated ${clock12(d)}`;
  const f = istFields(d);
  return `updated ${f.getUTCDate()} ${MONTHS[f.getUTCMonth()]}, ${clock12(d)}`;
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

export function durationLabel(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1} h`;
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`;
}
