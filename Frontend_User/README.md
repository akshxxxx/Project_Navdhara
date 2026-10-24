# Raah · traveller website (Frontend_User)

The public web site for travellers on **NH-7, Rishikesh to Joshimath**. It has the five client pages from
`frontend.md`: **Map, Plan trip, Alerts, Reports, Emergency**. It talks only to the Raah FastAPI backend in
`Backend/` and never uses the admin key. The officials' dashboard is the separate `Frontend/` folder.

> Raah supports decisions; it is not an official warning. Low risk does not mean safe. Emergency: 112.

## Run it

1. Start the backend (see `Backend/README.md`): `python run.py` in `Backend/` with its venv. It listens on port 8000.
2. In this folder:

```bash
npm install
```

```bash
npm run dev
```

3. Open http://localhost:5174. The dev server forwards `/api/*` to the backend, so no CORS set-up is needed.
   If the backend runs elsewhere, copy `.env.example` to `.env` and set `BACKEND_URL`.

Other commands: `npm run typecheck`, `npm run build` (output in `dist/`), `npm run preview` (serves the build on
port 4174 with the same `/api` forwarding).

## Backend endpoints used

| Page | Calls |
|---|---|
| Map, Alerts | `GET /risk-map` (every 5 minutes) |
| Plan trip | `POST /trip-planner` |
| Reports | `GET /field-reports`, `POST /field-report`, `POST /field-report/photo`, photos from `/report-photos/…` |
| Emergency | `GET /offline-pack` |

## When the backend cannot be reached

The last good `/risk-map` and `/offline-pack` answers are saved in the browser. Without a connection the pages show
that copy labelled **Offline copy**. With no saved copy they show a bundled sample labelled
**Demo data, not live** in red. A saved or sample copy never looks live.

## Where things are

- `src/pages/` — the five pages
- `src/components/CorridorMap.tsx` — the risk-coloured road on Leaflet (terrain, streets, satellite, schematic)
- `src/domain/` — levels, the km table, wording, IST time, reports, helplines, hospitals. Most of it is ported from
  the Expo app (`App/src/domain/`) so the site and the app say the same thing.
- `src/api/` — backend client, response types, data hooks with the offline fallback
- `log.md` — what changed, why, how, by whom and when
