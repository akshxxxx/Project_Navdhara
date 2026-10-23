const url = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000') + '/trip-planner';
fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origin: 'seg_18',
    destination: 'seg_01',
    depart_time: new Date().toISOString(),
    speed_kmph: 30,
    lang: 'en'
  })
}).then(async r => {
  console.log(r.status);
  console.log(await r.text());
}).catch(console.error);
