import fs from 'fs';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

async function check() {
  console.log(`Checking backend at ${API_URL}...\n`);

  try {
    // 1. /risk-map
    console.log('Fetching /risk-map...');
    const riskMapRes = await fetch(`${API_URL}/risk-map`);
    const riskMap = await riskMapRes.json();
    
    console.log(`Segments: ${riskMap.segments.length}`);
    const levels = new Set();
    riskMap.segments.forEach(seg => {
      levels.add(seg.risk_level_en);
      if (seg.subpoints.length < 6) {
        console.warn(`⚠️ Segment ${seg.id} has only ${seg.subpoints.length} subpoints`);
      }
    });
    console.log(`Observed Risk Levels: ${Array.from(levels).join(', ')}`);
    console.log();

    // 2. /closures
    console.log('Fetching /closures...');
    const closuresRes = await fetch(`${API_URL}/closures`);
    const closures = await closuresRes.json();
    console.log(`Active closures: ${closures.active_closures_count}\n`);

    // 3. /offline-pack
    console.log('Fetching /offline-pack...');
    const offlineRes = await fetch(`${API_URL}/offline-pack?lang=en`);
    const offline = await offlineRes.json();
    console.log(`Offline pack version: ${offline.metadata.version}\n`);

    // 4. POST /trip-planner
    console.log('Testing /trip-planner...');
    const tripRes = await fetch(`${API_URL}/trip-planner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: 'seg_01',
        destination: 'seg_18',
        depart_time: new Date().toISOString(),
        speed_kmph: 30,
        lang: 'en'
      })
    });
    const trip = await tripRes.json();
    console.log(`Trip recommendation: ${trip.recommendation?.action}`);

  } catch (error) {
    console.error('Error during check:', error);
  }
}

check();
