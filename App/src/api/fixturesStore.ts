export function getFixtureForUrl(url: string): any {
  let filename: string | null = null;
  
  if (url.includes('/risk-map')) {
    if (url.includes('simulate_rain_mm=85')) filename = 'risk-map-sim-85.json';
    else if (url.includes('simulate_rain_mm=140')) filename = 'risk-map-sim-140.json';
    else if (url.includes('as_of=')) filename = 'risk-map-2023-08-14.json';
    else if (url.includes('lang=hi')) filename = 'risk-map-hi.json';
    else filename = 'risk-map-en.json';
  } else if (url.includes('/closures')) {
    filename = 'closures.json';
  } else if (url.includes('/offline-pack')) {
    filename = 'offline-pack.json';
  } else if (url.includes('/route-risk') || url.includes('/trip-planner')) {
    filename = 'trip-planner.json';
  }

  if (!filename) return null;

  switch (filename) {
    case 'risk-map-en.json': return require('./fixtures/risk-map-en.json');
    case 'risk-map-hi.json': return require('./fixtures/risk-map-hi.json');
    case 'risk-map-sim-85.json': return require('./fixtures/risk-map-sim-85.json');
    case 'risk-map-sim-140.json': return require('./fixtures/risk-map-sim-140.json');
    case 'risk-map-2023-08-14.json': return require('./fixtures/risk-map-2023-08-14.json');
    case 'closures.json': return require('./fixtures/closures.json');
    case 'offline-pack.json': return require('./fixtures/offline-pack.json');
    case 'trip-planner.json': return require('./fixtures/trip-planner.json');
    default: return null;
  }
}
