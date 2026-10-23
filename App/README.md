# Raah app (Expo / React Native)

The traveller app for Raah: landslide risk on **NH-7, Rishikesh to Joshimath** (18 stretches, 247 km).
Five tabs, as in `../frontend.md`: **Map, Plan trip, Alerts, Reports, Emergency**. Officials' tools
(verify reports, Alert All, sensors, simulate rain, admin key) are deliberately not in this app.

> Raah supports decisions; it is not an official warning. Low risk does not mean safe. Emergency: 112.

## Run it

```bash
npm install
npx expo start          # scan the QR code with Expo Go (SDK 58), or press w for the web
```

Start the backend on the same laptop first (`cd ../Backend && python run.py`, port 8000).

- **Phone (Expo Go):** the app calls the laptop that runs `expo start`, at its LAN address on port 8000.
  Phone and laptop must be on the same Wi-Fi or hotspot.
- **Web:** the app calls the page's own host on port 8000 (`http://localhost:8000`).
- **Backend elsewhere:** copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.

If the backend cannot be reached the app keeps working: it shows the last copy saved on the phone
(labelled **Offline copy · time**), or on a fresh install a bundled sample (labelled **Demo data, not live**).

## Checks

```bash
npx tsc --noEmit
npx eslint src
```

## Layout

| Path | What |
|---|---|
| `src/app/(tabs)/` | The five tabs: `index` (Map), `plan`, `alerts`, `reports`, `emergency` |
| `src/app/stretch/[id].tsx` | Stretch details (from the map) |
| `src/app/alert/[id].tsx` | Alert details, with Share (from Alerts) |
| `src/app/plan-result.tsx` | Trip check result |
| `src/app/hospitals.tsx` | Nearest hospital per stretch, saved for offline use |
| `src/api/` | Backend client, response types, React Query hooks, offline cache |
| `src/domain/` | Pure logic: corridor km table, risk levels, wording, geo, IST time, report encoding |
| `src/components/CorridorMap.tsx` | SVG map of the corridor (no map key or tiles needed) |
| `src/data/fixtures/` | Bundled sample used only when there is no network and no saved copy |

## Backend endpoints used

`GET /risk-map` (every 5 min), `POST /trip-planner`, `GET /field-reports`, `POST /field-report`,
`GET /offline-pack`. Nothing that needs the admin key.

Change history: [`log.md`](log.md).
