// NH-7 chainage (km from Rishikesh) for the 18 stretches and 19 towns.
// Same table as the web dashboard (Frontend/src/data/segments.js).

export interface SegmentInfo {
  id: string;
  seq: number;
  name: string;
  kmStart: number;
  kmEnd: number;
}

export const SEGMENTS: SegmentInfo[] = [
  { id: 'seg_01', seq: 1, name: 'Rishikesh to Shivpuri', kmStart: 0.0, kmEnd: 17.43 },
  { id: 'seg_02', seq: 2, name: 'Shivpuri to Byasi', kmStart: 17.43, kmEnd: 24.26 },
  { id: 'seg_03', seq: 3, name: 'Byasi to Kaudiyala', kmStart: 24.26, kmEnd: 38.12 },
  { id: 'seg_04', seq: 4, name: 'Kaudiyala to Devprayag', kmStart: 38.12, kmEnd: 70.63 },
  { id: 'seg_05', seq: 5, name: 'Devprayag to Teen Dhara', kmStart: 70.63, kmEnd: 85.56 },
  { id: 'seg_06', seq: 6, name: 'Teen Dhara to Kirtinagar', kmStart: 85.56, kmEnd: 98.04 },
  { id: 'seg_07', seq: 7, name: 'Kirtinagar to Srinagar', kmStart: 98.04, kmEnd: 102.99 },
  { id: 'seg_08', seq: 8, name: 'Srinagar to Sirobagarh', kmStart: 102.99, kmEnd: 112.42 },
  { id: 'seg_09', seq: 9, name: 'Sirobagarh to Rudraprayag', kmStart: 112.42, kmEnd: 136.06 },
  { id: 'seg_10', seq: 10, name: 'Rudraprayag to Gauchar', kmStart: 136.06, kmEnd: 158.55 },
  { id: 'seg_11', seq: 11, name: 'Gauchar to Karnaprayag', kmStart: 158.55, kmEnd: 168.12 },
  { id: 'seg_12', seq: 12, name: 'Karnaprayag to Langasu', kmStart: 168.12, kmEnd: 174.18 },
  { id: 'seg_13', seq: 13, name: 'Langasu to Nandprayag', kmStart: 174.18, kmEnd: 187.33 },
  { id: 'seg_14', seq: 14, name: 'Nandprayag to Chamoli', kmStart: 187.33, kmEnd: 200.39 },
  { id: 'seg_15', seq: 15, name: 'Chamoli to Birahi', kmStart: 200.39, kmEnd: 205.62 },
  { id: 'seg_16', seq: 16, name: 'Birahi to Pipalkoti', kmStart: 205.62, kmEnd: 212.36 },
  { id: 'seg_17', seq: 17, name: 'Pipalkoti to Helang (Tangani)', kmStart: 212.36, kmEnd: 241.04 },
  { id: 'seg_18', seq: 18, name: 'Helang to Joshimath', kmStart: 241.04, kmEnd: 247.37 },
];

export interface Town {
  name: string;
  km: number;
  major: boolean;
}

export const TOWNS: Town[] = [
  { name: 'Rishikesh', km: 0, major: true },
  { name: 'Shivpuri', km: 17.43, major: false },
  { name: 'Byasi', km: 24.26, major: false },
  { name: 'Kaudiyala', km: 38.12, major: false },
  { name: 'Devprayag', km: 70.63, major: true },
  { name: 'Teen Dhara', km: 85.56, major: false },
  { name: 'Kirtinagar', km: 98.04, major: false },
  { name: 'Srinagar', km: 102.99, major: true },
  { name: 'Sirobagarh', km: 112.42, major: false },
  { name: 'Rudraprayag', km: 136.06, major: true },
  { name: 'Gauchar', km: 158.55, major: false },
  { name: 'Karnaprayag', km: 168.12, major: true },
  { name: 'Langasu', km: 174.18, major: false },
  { name: 'Nandprayag', km: 187.33, major: false },
  { name: 'Chamoli', km: 200.39, major: true },
  { name: 'Birahi', km: 205.62, major: false },
  { name: 'Pipalkoti', km: 212.36, major: false },
  { name: 'Helang', km: 241.04, major: false },
  { name: 'Joshimath', km: 247.37, major: true },
];

export const CORRIDOR_KM = 247.37;

// Valley towns with fuel, food and lodging where travellers can wait out bad weather
export const WAIT_TOWNS = ['Srinagar', 'Rudraprayag', 'Karnaprayag'];

export const segmentInfo = (id: string) => SEGMENTS.find((s) => s.id === id);
export const townByName = (name: string) => TOWNS.find((t) => t.name === name);

export function nearestTown(km: number): Town {
  return TOWNS.reduce((best, t) => (Math.abs(t.km - km) < Math.abs(best.km - km) ? t : best), TOWNS[0]);
}

/** "Pipalkoti to Helang (Tangani)" -> ["Pipalkoti", "Helang (Tangani)"] */
export function splitName(name: string): [string, string] {
  const [a, b] = name.split(' to ');
  return [a ?? name, b ?? ''];
}

/**
 * The backend plans by segment id. Driving up the valley (towards Joshimath) a trip starts on the
 * segment that begins at the From town and ends on the one that finishes at the To town; coming
 * down it is the other way round.
 */
export function routeSegments(fromTown: string, toTown: string): { origin: string; destination: string } | null {
  const from = townByName(fromTown);
  const to = townByName(toTown);
  if (!from || !to || from.km === to.km) return null;
  const startsAt = (km: number) => SEGMENTS.find((s) => Math.abs(s.kmStart - km) < 0.01)?.id;
  const endsAt = (km: number) => SEGMENTS.find((s) => Math.abs(s.kmEnd - km) < 0.01)?.id;
  const origin = from.km < to.km ? startsAt(from.km) : endsAt(from.km);
  const destination = from.km < to.km ? endsAt(to.km) : startsAt(to.km);
  return origin && destination ? { origin, destination } : null;
}
