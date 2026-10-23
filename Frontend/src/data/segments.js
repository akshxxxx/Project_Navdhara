export const SEGMENTS = [
  { id: 'seg_01', seq: 1, nameEn: 'Rishikesh to Shivpuri', kmStart: 0.00, kmEnd: 17.43, length: 17.43 },
  { id: 'seg_02', seq: 2, nameEn: 'Shivpuri to Byasi', kmStart: 17.43, kmEnd: 24.26, length: 6.83 },
  { id: 'seg_03', seq: 3, nameEn: 'Byasi to Kaudiyala', kmStart: 24.26, kmEnd: 38.12, length: 13.86 },
  { id: 'seg_04', seq: 4, nameEn: 'Kaudiyala to Devprayag', kmStart: 38.12, kmEnd: 70.63, length: 32.51 },
  { id: 'seg_05', seq: 5, nameEn: 'Devprayag to Teen Dhara', kmStart: 70.63, kmEnd: 85.56, length: 14.94 },
  { id: 'seg_06', seq: 6, nameEn: 'Teen Dhara to Kirtinagar', kmStart: 85.56, kmEnd: 98.04, length: 12.47 },
  { id: 'seg_07', seq: 7, nameEn: 'Kirtinagar to Srinagar', kmStart: 98.04, kmEnd: 102.99, length: 4.95 },
  { id: 'seg_08', seq: 8, nameEn: 'Srinagar to Sirobagarh', kmStart: 102.99, kmEnd: 112.42, length: 9.42 },
  { id: 'seg_09', seq: 9, nameEn: 'Sirobagarh to Rudraprayag', kmStart: 112.42, kmEnd: 136.06, length: 23.64 },
  { id: 'seg_10', seq: 10, nameEn: 'Rudraprayag to Gauchar', kmStart: 136.06, kmEnd: 158.55, length: 22.49 },
  { id: 'seg_11', seq: 11, nameEn: 'Gauchar to Karnaprayag', kmStart: 158.55, kmEnd: 168.12, length: 9.56 },
  { id: 'seg_12', seq: 12, nameEn: 'Karnaprayag to Langasu', kmStart: 168.12, kmEnd: 174.18, length: 6.07 },
  { id: 'seg_13', seq: 13, nameEn: 'Langasu to Nandprayag', kmStart: 174.18, kmEnd: 187.33, length: 13.15 },
  { id: 'seg_14', seq: 14, nameEn: 'Nandprayag to Chamoli', kmStart: 187.33, kmEnd: 200.39, length: 13.05 },
  { id: 'seg_15', seq: 15, nameEn: 'Chamoli to Birahi', kmStart: 200.39, kmEnd: 205.62, length: 5.24 },
  { id: 'seg_16', seq: 16, nameEn: 'Birahi to Pipalkoti', kmStart: 205.62, kmEnd: 212.36, length: 6.74 },
  { id: 'seg_17', seq: 17, nameEn: 'Pipalkoti to Helang (Tangani)', kmStart: 212.36, kmEnd: 241.04, length: 28.68 },
  { id: 'seg_18', seq: 18, nameEn: 'Helang to Joshimath', kmStart: 241.04, kmEnd: 247.37, length: 6.33 },
];

export const TOWNS = [
  { name: 'Rishikesh', km: 0, segmentId: 'seg_01' },
  { name: 'Shivpuri', km: 17.43, segmentId: 'seg_02' },
  { name: 'Byasi', km: 24.26, segmentId: 'seg_03' },
  { name: 'Kaudiyala', km: 38.12, segmentId: 'seg_04' },
  { name: 'Devprayag', km: 70.63, segmentId: 'seg_05' },
  { name: 'Teen Dhara', km: 85.56, segmentId: 'seg_06' },
  { name: 'Kirtinagar', km: 98.04, segmentId: 'seg_07' },
  { name: 'Srinagar', km: 102.99, segmentId: 'seg_08' },
  { name: 'Sirobagarh', km: 112.42, segmentId: 'seg_09' },
  { name: 'Rudraprayag', km: 136.06, segmentId: 'seg_10' },
  { name: 'Gauchar', km: 158.55, segmentId: 'seg_11' },
  { name: 'Karnaprayag', km: 168.12, segmentId: 'seg_12' },
  { name: 'Langasu', km: 174.18, segmentId: 'seg_13' },
  { name: 'Nandprayag', km: 187.33, segmentId: 'seg_14' },
  { name: 'Chamoli', km: 200.39, segmentId: 'seg_15' },
  { name: 'Birahi', km: 205.62, segmentId: 'seg_16' },
  { name: 'Pipalkoti', km: 212.36, segmentId: 'seg_17' },
  { name: 'Helang', km: 241.04, segmentId: 'seg_18' },
  { name: 'Joshimath', km: 247.37, segmentId: null },
];

// Town to segment mapping: "from" town maps to segment starting at that town
export function townToFromSegment(townName) {
  const town = TOWNS.find(t => t.name.toLowerCase() === townName.toLowerCase());
  return town ? town.segmentId : null;
}

// "to" town: the segment that ends at this town
export function townToToSegment(townName) {
  const town = TOWNS.find(t => t.name.toLowerCase() === townName.toLowerCase());
  if (!town) return null;
  const seg = SEGMENTS.find(s => Math.abs(s.kmEnd - town.km) < 0.01);
  return seg ? seg.id : null;
}

export function getSegmentById(id) {
  return SEGMENTS.find(s => s.id === id);
}
