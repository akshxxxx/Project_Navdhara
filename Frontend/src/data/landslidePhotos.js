// Real landslide photos (supplied by the team, log.md L-049), served from public/landslides/.
// Used for past events, in place of the old Unsplash stock images. A field report shows only its own photo.
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

/** A stable photo for the i-th past event that has none of its own. Never used for field reports (log.md L-052). */
export const landslidePhoto = (i) => ROTATION[Math.abs(i) % ROTATION.length];
