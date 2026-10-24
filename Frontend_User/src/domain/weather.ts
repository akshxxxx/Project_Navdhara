// weather_source values the backend sends (Backend/app/risk_service.py, weather_service.py), in plain words
const WEATHER_SOURCES: Record<string, string> = {
  live: 'live, from Open-Meteo',
  cached: 'recent copy saved on the server',
  snapshot: 'saved snapshot on the server (not live)',
  simulated: 'simulated rain (test)',
  unavailable: 'unavailable; risk uses terrain only',
  terrain_only: 'none; risk uses terrain only',
  archive_replay: 'archived rain (replay)',
  database_fallback: 'last values in the server database',
};

export const weatherSourceText = (source?: string | null) =>
  source ? (WEATHER_SOURCES[source] ?? source) : null;
