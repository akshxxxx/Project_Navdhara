import fs from 'fs/promises';
import path from 'path';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
const OUT_DIR = path.join(process.cwd(), 'src/api/fixtures');

async function fetchAndSave(url, filename, options = {}) {
  console.log(`Fetching ${filename}...`);
  try {
    const res = await fetch(`${API_URL}${url}`, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(data, null, 2));
    console.log(`Saved ${filename}`);
  } catch (err) {
    console.error(`Failed to fetch ${filename}:`, err.message);
  }
}

async function record() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  await fetchAndSave('/risk-map?lang=en', 'risk-map-en.json');
  await fetchAndSave('/risk-map?lang=hi', 'risk-map-hi.json');
  await fetchAndSave('/risk-map?lang=en&simulate_rain_mm=85', 'risk-map-sim-85.json');
  await fetchAndSave('/risk-map?lang=en&simulate_rain_mm=140', 'risk-map-sim-140.json');
  await fetchAndSave('/risk-map?lang=en&as_of=2023-08-14', 'risk-map-2023-08-14.json');
  
  await fetchAndSave('/closures', 'closures.json');
  await fetchAndSave('/offline-pack?lang=en', 'offline-pack.json');
  
  const dateStr = new Date().toISOString().split('T')[0];
  await fetchAndSave(`/route-risk?from_segment=seg_01&to_segment=seg_18&date=${dateStr}&depart_time=${new Date().toISOString()}&speed_kmph=30&lang=en`, 'trip-planner.json');
}

record();
