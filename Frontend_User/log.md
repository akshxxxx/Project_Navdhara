# Raah traveller website (Frontend_User) — Change Log

**Append-only.** Add new entries at the bottom and never edit or delete old ones. To correct an entry, add a new
one that refers to it by ID. Same format as the repository's root `log.md` and `App/log.md`, with `WEB-NNN` IDs so
the three logs never collide.

Each entry records **When** (IST), **Who**, **What**, **Why**, **How**, and the **Files** touched.

---

### WEB-001 — Project scaffolded: Vite, React, TypeScript
- **When:** 2026-10-24 08:15 IST
- **Who:** Claude Code (AI assistant), working for Aakash
- **What:** A new web project in `Frontend_User/`: Vite 8, React 19, TypeScript 6, React Router 7, TanStack
  Query 5, Leaflet 1.9 with react-leaflet 5, lucide-react icons, IBM Plex Sans / Sans Condensed (Google Fonts).
  The dev server runs on port 5174 and forwards `/api/*` and `/report-photos/*` to the backend
  (`http://localhost:8000`, or `BACKEND_URL` in `.env`).
- **Why:** Aakash asked for the traveller (client) website in `Frontend_User/`, built for the backend and taking
  inspiration from the Expo app in `App/`, using `frontend.md`, the two project PDFs and four desktop page designs
  (Emergency, Reports, Alerts, Plan trip) as the brief. The existing `Frontend/` is the officials' dashboard and was
  not touched.
- **How:**
  - Same stack family as `Frontend/` (React + Vite + Leaflet), so the team needs no new tools.
  - TypeScript, so the domain code could be shared almost unchanged with the app, which is TypeScript.
  - TypeScript is pinned to 6.0 (the app's version); npm offered 7.0.
  - Forwarding `/api` through the dev server means the page and the backend share one origin, so no CORS change is
    needed on the backend.
  - `.gitignore` in this folder re-allows `README.md` and `log.md`, because the root `.gitignore` ignores every
    Markdown file.
- **Files:** `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `index.html`,
  `public/favicon.svg`, `.gitignore`, `.env.example`, `.claude/launch.json`, `src/main.tsx`, `src/App.tsx`

### WEB-002 — Backend client, offline fallback and shared domain logic (ported from the app)
- **When:** 2026-10-24 08:20 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `src/api/client.ts` calls `GET /risk-map`, `POST /trip-planner`, `GET /field-reports`, `POST /field-report`,
     `POST /field-report/photo` and `GET /offline-pack`. Nothing uses the admin key.
  2. Every good `/risk-map` and `/offline-pack` answer is saved in the browser (localStorage). Without the backend
     the pages show that copy labelled **Offline copy**; with no saved copy, the app's bundled sample labelled
     **Demo data, not live** in red.
  3. The risk map refreshes every 5 minutes (as `frontend.md` asks).
  4. Domain code, with the same rules as the app:
     - five levels and colours (the backend's "Very High" shows as Severe; an official closure always shows as
       Closed; `adjusted_risk_level`, which includes verified reports and slope sensors, wins over `risk_level`);
     - the 18-stretch km table and 19 towns;
     - plain-words sentences built only from backend values;
     - GPS → stretch, km and distance from the road;
     - IST times;
     - report types encoded in the description (`[Falling stones] km 114: …`), as the app and dashboard do;
     - verified helpline numbers.
- **Why:** The site and the app should say the same thing about the same stretch. Copying the tested logic is safer
  than writing it again.
- **How:**
  - Copied unchanged: `corridor.ts`, `geo.ts`, `helplines.ts`, `api/types.ts`, and the two sample files in
    `src/data/fixtures/`.
  - Rewritten in English only, without the app's Hindi `tr()` layer: `levels.ts`, `stretch.ts`, `time.ts`,
    `reports.ts`, `hospitals.ts`.
  - New for the web: `storage.ts` (localStorage instead of AsyncStorage) and `photo.ts`. `photo.ts` shrinks a photo
    to 1600 px and re-saves it as JPEG on a canvas, which drops the file's EXIF data, including where it was taken.
    The app does the same.
  - `weather.ts` turns the backend's `weather_source` values (live, cached, snapshot, simulated…) into plain words.
- **Files:** `src/api/*`, `src/domain/*`, `src/data/fixtures/*`

### WEB-003 — Shell and map component
- **When:** 2026-10-24 08:25 IST
- **Who:** Claude Code for Aakash
- **What:**
  - Header: NH7 chip, Raah and a red **Call 112** button (`tel:112`) on every page.
  - Navigation: on desktop, five tabs in the header; below 860 px they move to a bottom bar. Every page has bottom
    padding, so the bar never covers the end of a page (a `frontend.md` team note).
  - `CorridorMap`, on Leaflet:
    - each stretch in its risk colour over a white casing; closed stretches dashed;
    - a "!" badge on High, Severe and Closed stretches; town dots and names;
    - a hover tooltip and click to select;
    - zoom, fit-the-corridor and a style menu: mountain terrain, clean streets, satellite or schematic (no tiles,
      works offline). The chosen style is remembered.
  - Design tokens in `styles.css` match the app and the designs in `design/ui/`.
- **Why:**
  - `frontend.md` lists these map features.
  - The app's map (`App/src/components/CorridorMap.tsx`) sets the visual language.
  - Leaflet is what the officials' dashboard already uses.
- **How:**
  - Tiles are Esri's keyless services, the same ones the app uses. CARTO now needs an API key.
  - Wide, invisible lines on top of the road make stretches easy to hover and click.
  - The mouse wheel zooms only on the full Map page. Inside the long pages the wheel scrolls the page, because
    otherwise it got stuck zooming the route map.
- **Files:** `src/components/AppHeader.tsx`, `src/components/CorridorMap.tsx`, `src/components/ui.tsx`,
  `src/styles.css`

### WEB-004 — The five pages
- **When:** 2026-10-24 08:30 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. **Map** (`/`, `?stretch=seg_09` opens a stretch):
     - the map with a status pill: Live / Offline copy / Demo, the number of stretches, how many are High or
       Severe, and when it was updated;
     - "Stretches needing attention today": the three worst stretches;
     - a side panel with corridor counts and every stretch worst first. Clicking a stretch opens its details:
       - the verdict and a plain-words reason;
       - **Listen**, which reads it aloud with the browser's own speech engine;
       - "Why this stretch is risky" bars: 3-day rain against 150 mm, the terrain percentile, and verified reports
         (full at 3), the same as the app;
       - rainfall, the update time, **Check a trip** and **Report a problem**.
  2. **Plan trip** (`/plan?from=&to=&date=&time=`):
     - From/To (19 towns), a swap button (also shown on phones), travel date, leave time in IST, popular routes;
     - the recommendation banner (Avoid / Delay / Caution / Low risk – proceed with caution; never "safe");
     - summary tiles, a route-only map coloured by the risk when you reach each stretch, with start and end markers;
     - the route breakdown with the backend's ETAs, a list of the high-risk stretches and closures ("Show on map");
     - **Safer times to leave** with **Select**, rain along the route, where to wait, and driving tips;
     - errors are shown with a **Try again** button.
  3. **Alerts:**
     - five count tiles: Severe, High, Moderate, Road closures, Heavy rain 3 days;
     - filter chips, and search by stretch name or km;
     - the list, worst first, with the `frontend.md` labels (Road closure, Critical alert, Landslide risk,
       Rockfall activity, Monitoring). The first 6 show, then "Show N more";
     - a detail card with its own map, **View on map**, **Check a trip** and **Share** (the phone's share sheet, or
       copy to the clipboard);
     - travel safety tips and a link to Emergency contacts.
  4. **Reports:**
     - "Call 112 first" banner;
     - six report types, then the place: **Use my location** (GPS), a click on the road (placed at the nearest point
       on NH-7), or the km stone;
     - an optional name, a description of up to 300 characters, an optional photo and a consent box (not ticked by
       default);
     - **Send report** lists what is still needed;
     - clear messages for: more than 3 km from NH-7, the same place within 10 minutes, too many reports, and no
       connection;
     - "What happens to your report", and Recent reports filtered by type, with photos and Pending / Verified /
       Rejected. Your own new report is highlighted.
  5. **Emergency:**
     - the big **Call 112** block with "When they answer, tell them";
     - the other helplines. Numbers come from `domain/helplines.ts`, which the app checked on 24 Oct 2026; the BRO
       line shows "[number to confirm]". A number the backend sends for the same line wins;
     - hospitals along NH-7 from `/offline-pack`, saved for offline use, with **Find my stretch** (GPS) that moves
       your stretch to the top;
     - "Call 112 straight away if", landslide and blocked-road advice.
  - Every page carries the "not an official warning" disclaimer.
- **Why:** These are the five client pages in `frontend.md`, laid out like the four desktop designs Aakash shared.
  Several "Team notes" placeholders in `frontend.md` are avoided:
  - no fixed temperature or text;
  - no invented counts;
  - Plan trip shows its errors;
  - Severe is red;
  - closures show the real reason;
  - ETAs come from the backend;
  - the default date is computed in IST;
  - the km field is empty and the consent box unticked;
  - the reporter name is used;
  - photos are real uploads;
  - there is no "Enable notifications" with a fixed number.
- **How:**
  - Each page reads the shared hooks.
  - The page state lives in the URL (`?stretch=`, `?from=&to=&date=&time=`), so links between pages work and can
    be shared.
  - Hospital names have two misspellings in the backend data ("Governement", "Governnment"). They are corrected
    for display only, in `domain/hospitals.ts`. **The data team should fix `Backend/data/segment_consequence.csv`.**
- **Files:** `src/pages/*.tsx`, `src/components/StretchDetails.tsx`, `src/domain/weather.ts`

### WEB-005 — Checked against the running backend
- **When:** 2026-10-24 08:35–08:45 IST
- **Who:** Claude Code for Aakash
- **What:** `npm run typecheck` and `npm run build` pass. All five pages were opened in a browser against the local
  backend on port 8000:
  - live data appears;
  - a Rishikesh → Joshimath trip returns CAUTION with ETAs, 18 rows and safer times;
  - all 18 hospitals show;
  - a click on the report map sets "Near Rudraprayag, km 133 · on NH-7";
  - no console errors;
  - at 375 px wide no page scrolls sideways.
  - To see High and Severe styling on a dry day, that one browser tab was made to ask the backend for
    `simulate_rain_mm=140`. The code was not changed; the site never sends that parameter.
- **Fixed after the first look:**
  - the rain tiles wrapped in the side panel;
  - the attention-count dot was red when nothing was High;
  - stat boxes were doubled inside the trip summary tiles;
  - inline column widths made Alerts, Reports and Emergency wider than a phone;
  - on phones the map buttons covered the status pill and the legend covered the tile credit.
- **Not done:**
  - **No report was sent from the site.** Sending would have added a real row to the backend database. The send,
    photo upload and error paths follow the app's code, but have not been run from this site.
  - English only; the app's Hindi texts are not wired in.
  - No service worker: only the risk map and the hospital list are saved for offline use, not the page itself.
  - Not deployed; no production server set-up. A build served without the dev/preview proxy needs `VITE_API_URL`,
    and the backend's CORS setting must allow the site's address.
- **Files:** `log.md`, `README.md`

### WEB-006 — Emergency: BRO control room box removed
- **When:** 2026-10-24 09:27 IST
- **Who:** Claude Code for Aakash ("From emergency section remove Bro control room box")
- **What:** The Emergency page's "Other helplines" no longer shows the **BRO control room** box. It had no verified
  number and showed "[number to confirm]" (WEB-004). The four lines left are SDMA Uttarakhand (1070), the district
  disaster control room (1077), the National Highway helpline (1033) and Ambulance (108).
- **Why:** Aakash asked for it to be removed.
- **How:** Removed the BRO entry from this site's `src/domain/helplines.ts`. The app's copy (`App/src/domain/helplines.ts`)
  is unchanged. Checked in the browser: the page shows the four helplines and no "[number to confirm]".
- **Files:** `src/domain/helplines.ts`, `log.md`
