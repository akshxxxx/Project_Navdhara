// Real landslide photos (supplied by the team, log.md L-049), served from public/landslides/.
// Used where a report or past event has no photo of its own, in place of the old Unsplash stock images.
const photo = (name) => `/landslides/${name}.jpg`;

export const LANDSLIDE_PHOTOS = {
  roadBuried: photo('road-buried-under-rockslide'),
  roadEdgeCollapsed: photo('road-edge-collapsed-into-valley'),
  bouldersAcrossHighway: photo('boulders-across-highway'),
  mudslide: photo('mudslide-across-highway'),
  rockfallCutSlope: photo('rockfall-from-cut-slope'),
  clearingByHand: photo('clearing-boulders-by-hand'),
  roadWashedOut: photo('road-washed-out-aerial'),
  bouldersMountainRoad: photo('boulders-on-mountain-road'),
  bouldersBrokenMesh: photo('boulders-and-broken-mesh'),
  activeRockslide: photo('active-rockslide-on-cliff'),
  nightRockfall: photo('night-rockfall-traffic-stopped'),
  crackedRoad: photo('cracked-subsiding-road'),
  fenceWithCones: photo('rockfall-fence-with-cones'),
  debrisFourViews: photo('debris-on-highway-four-views'),
};

const ROTATION = Object.values(LANDSLIDE_PHOTOS);

/** A stable photo for the i-th item that has none of its own */
export const landslidePhoto = (i) => ROTATION[Math.abs(i) % ROTATION.length];

/** Picks a photo that matches a report's words, else falls back to the rotation */
export function photoForDescription(description, i) {
  const d = (description || '').toLowerCase();
  if (/water|flood|mud/.test(d)) return LANDSLIDE_PHOTOS.mudslide;
  if (/crack|subsid|sink/.test(d)) return LANDSLIDE_PHOTOS.crackedRoad;
  if (/rockfall|falling stone|boulder/.test(d)) return LANDSLIDE_PHOTOS.bouldersAcrossHighway;
  if (/block/.test(d)) return LANDSLIDE_PHOTOS.roadBuried;
  if (/damage|washed|collapse/.test(d)) return LANDSLIDE_PHOTOS.roadEdgeCollapsed;
  return landslidePhoto(i);
}
