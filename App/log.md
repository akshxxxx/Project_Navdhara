# Raah app — Change Log

**Append-only.** Add new entries at the bottom and never edit or delete old ones. To correct an entry, add a new
one that refers to it by ID. Same format as the repository's root `log.md`, with `APP-NNN` IDs so the two never
collide.

Each entry records **When** (IST), **Who**, **What**, **Why**, **How**, and the **Files** touched.

---

### APP-001 — New Expo app scaffolded
- **When:** 2026-10-24 00:36 IST
- **Who:** Claude Code (AI assistant), working for Aakash
- **What:** Created a fresh Expo app in `App/`: Expo SDK 58, React Native 0.88, React 19.3, TypeScript, Expo
  Router (routes in `src/app/`). Added react-native-svg, lucide-react-native (icons), @tanstack/react-query,
  AsyncStorage, expo-location, expo-speech, IBM Plex Sans / Sans Condensed fonts, ESLint (eslint-config-expo)
  and Prettier.
- **Why:** The old app files had been removed from `App/`; Aakash asked for a new React Native app built from
  `frontend.md` (five client pages), the team plan PDFs, the backend, and the phone mock-ups in `design/ui/`.
- **How:** `npx create-expo-app@latest App --template blank-typescript`, then `npx expo install …` so every
  native package matches SDK 58. Expo Router was set up from the SDK 58 install guide. The tab bar uses
  `navigateToTab(routeKey)`, which is the SDK 58 tab-bar API (the older `navigation.navigate` no longer
  type-checks).
- **Files:** `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`,
  `.gitignore`, `.env.example`, `README.md`, `AGENTS.md` (from the Expo template), `assets/`

### APP-002 — Backend client, offline cache and sample data
- **When:** 2026-10-24 00:45 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. `src/api/client.ts` calls `GET /risk-map`, `POST /trip-planner`, `GET /field-reports`, `POST /field-report`
     and `GET /offline-pack`. Nothing uses the admin key.
  2. Backend address: `EXPO_PUBLIC_API_URL` if set; on the web, the page's host on port 8000; on a phone, the LAN
     address of the laptop running `expo start` (from `hostUri`) on port 8000. A phone's `localhost` is the
     phone itself, which is why the team plan says "never localhost".
  3. Every good `/risk-map` and `/offline-pack` response is saved on the device. With no network the app shows
     that copy, labelled **Offline copy · time**. On a fresh install with no network it shows a bundled sample,
     labelled **Demo data, not live** in red, plus a sentence saying the colours are not today's conditions.
  4. The risk map refreshes every 5 minutes (as `frontend.md` asks).
- **Why:** NH-7 has long no-signal stretches. A blank screen there is worse than a clearly labelled old copy,
  but an old copy must never look live.
- **How:** React Query with a `withFallback()` fetcher (live → saved → sample). The two sample files are the
  team's own recorded backend responses, taken read-only from the previous app's commit
  (`git show HEAD:App/src/api/fixtures/risk-map-en.json` and `offline-pack.json`).
- **Files:** `src/api/client.ts`, `src/api/types.ts`, `src/api/hooks.ts`, `src/api/storage.ts`,
  `src/data/fixtures/risk-map.json`, `src/data/fixtures/offline-pack.json`

### APP-003 — Shared logic: levels, wording, km table, geo, IST time
- **When:** 2026-10-24 00:50 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. Five levels with the web dashboard's colours: Low / Moderate / High / Severe (the backend's "Very High") /
     Closed. An official closure always shows as Closed. Otherwise the backend's `adjusted_risk_level` (which
     already includes verified reports and slope sensors) wins over `risk_level`.
  2. The 18-stretch km table and 19 towns (same as `Frontend/src/data/segments.js`). Town-to-segment mapping
     for trips in both directions: up the valley a trip starts on the segment that begins at the From town;
     coming down it starts on the segment that ends there.
  3. Plain-words sentences ("Heavy rain on steep, unstable slopes. Delay your trip if you can.") are built only
     from backend values: 3-day rain, 24 h rain, terrain percentile, verified reports, closure, sensor reason.
  4. GPS → stretch, km mark and distance from the road, by the nearest road point, scaled to the official km.
  5. All times are shown in IST whatever the phone's time zone.
- **Why:** `frontend.md`'s team notes list invented numbers and fixed text on the web pages (63/100 score,
  "12°C", "Unstable slope", fake counts). The app shows a dash or hides a block when the backend sends nothing.
- **How:** Pure TypeScript modules with no React, so they can be tested on their own.
- **Files:** `src/domain/levels.ts`, `src/domain/corridor.ts`, `src/domain/stretch.ts`, `src/domain/geo.ts`,
  `src/domain/time.ts`, `src/domain/reports.ts`, `src/domain/hospitals.ts`

### APP-004 — Map tab and the SVG corridor map
- **When:** 2026-10-24 00:58 IST
- **Who:** Claude Code for Aakash
- **What:** The Map tab (mock-up `app_map.png`): floating NH7 Raah header with the red 112 button, Live /
  Offline / Demo pill with the High-or-Severe and closed counts, the corridor coloured by risk (closed stretches
  dashed), "!" badges on High, Severe and Closed stretches, town labels, a legend, zoom in/out, a map-style
  menu (Terrain or Plain; all 19 towns on/off) and fit-the-corridor. The sheet shows the three worst stretches;
  tapping a card flies the map to it, and tapping it again opens its details. Tapping a stretch on the map
  opens its details.
- **Why:** `frontend.md`, section 1.
- **How:** `CorridorMap` draws the backend's real road geometry (`subpoints`) with react-native-svg. It needs
  no Google/Mapbox key or map tiles, works offline, and behaves the same on Android, iOS and the web. Drag to
  pan, pinch to zoom, animated fly-to. Overlapping town names are dropped (selected and major towns first). The
  contour rings and the river line are decorative and labelled "schematic" in the style menu.
  On the web, taps use `onClick`, because react-native-svg's `onPress` leaks responder props to the DOM there.
- **Files:** `src/app/(tabs)/index.tsx`, `src/app/(tabs)/_layout.tsx`, `src/app/_layout.tsx`,
  `src/components/CorridorMap.tsx`, `src/components/AppHeader.tsx`, `src/components/ui.tsx`,
  `src/theme/tokens.ts`

### APP-005 — Stretch details and alert details
- **When:** 2026-10-24 01:00 IST
- **Who:** Claude Code for Aakash
- **What:**
  - **Stretch** (`app_stretch_details.png`): map zoomed on the stretch and its neighbours; name, km range,
    update time; the verdict block with **Listen**; rain last 24 h / next 24 h / next 72 h; "Why it is risky"
    bars (rain over 3 days against the backend's 150 mm saturation point, the terrain percentile, verified
    reports); closure and slope-sensor notices; **Check a trip** (fills the Plan form) and **Report** (fills
    the report's place).
  - **Alert** (`app_alert_details.png`): category badge, paragraph, rain and report tiles, View on map,
    Check a trip, "If you are already on this road" tips and **Share** (the phone's share sheet).
- **Why:** `frontend.md`, sections 1 and 3.
- **How:** Listen uses `expo-speech` (en-IN) on the device, so it works without network; the text is built from
  the same data as the screen and ends with "not an official warning… call 112".
- **Files:** `src/app/stretch/[id].tsx`, `src/app/alert/[id].tsx`, `src/components/DetailShell.tsx`,
  `src/components/StretchParts.tsx`

### APP-006 — Plan trip and trip result
- **When:** 2026-10-24 01:02 IST
- **Who:** Claude Code for Aakash
- **What:**
  - **Form** (`app_plan_trip.png`): From and To from the 19 towns, a working swap button, date (today, tomorrow,
    day after; the last is marked "terrain only" because it is past the rain forecast) and leave time in
    30-minute steps. Defaults are today and the next whole hour **in IST** (the web's default date is wrong
    between 00:00 and 05:30 IST). Five popular routes, including the return trip. Same-town and off-corridor
    errors are shown.
  - **Result** (`app_plan_trip_result.png`): Avoid / Delay / Caution / Low risk banner with the backend's
    reason; distance, driving time, overall risk and risky-stretch count; the route alone on the map with start
    and end markers; **Safer times to leave** with "+N h" and **Select** (re-checks with that time);
    the route breakdown with each town's ETA, km and the risk when you get there; high-risk stretches (tap for
    details); closures with their real reason and source; weather along the route; where to wait; driving
    advice. Errors are shown, with Try again.
- **Why:** `frontend.md`, section 2. Its team notes list the web planner's hidden errors, wrong colours, fixed
  "Landslide / Not passable" text, hidden swap button and browser-side ETAs.
- **How:** `POST /trip-planner` with `depart_time` in IST. ETAs come from the backend's `eta_ist`; arrival is
  the last ETA plus that stretch's length at the backend's `speed_kmph`. The level shown per stretch is the
  worse of its level at arrival time and its live adjusted level, so a verified report or sensor alarm is never
  hidden by a dry forecast. Raah never says "safe".
- **Files:** `src/app/(tabs)/plan.tsx`, `src/app/plan-result.tsx`, `src/components/PickerSheet.tsx`

### APP-007 — Alerts tab
- **When:** 2026-10-24 01:03 IST
- **Who:** Claude Code for Aakash
- **What:** All 18 stretches, worst first (`app_alerts.png`), each with level badge, km range, category (Road
  closure, Critical alert, Landslide risk, Rockfall activity, Monitoring) and cause. Search by name or km
  ("114" or "km 114"). Filter chips with real counts, zero included. Live/Offline line with the update time, a
  heavy-rain count, a link to Emergency, travel tips, and pull to refresh.
- **Why:** `frontend.md`, section 3. The web page shows invented counts and fixed timestamps.
- **How:** Built from `/risk-map` (with closures inside it), because `/alerts` needs a subscriber token.
  "Alert me" (notifications) is **not** included: `frontend.md` says it needs a real consent form first.
- **Files:** `src/app/(tabs)/alerts.tsx`

### APP-008 — Reports tab
- **When:** 2026-10-24 01:04 IST
- **Who:** Claude Code for Aakash
- **What:**
  - **Send a report** (`app_report_form.png`): six types; place from **Use my current location** (GPS,
    shows "Near Sirobagarh, km 114 · on NH-7" or how far off the road you are), **Change** (pick the stretch)
    or the km stone typed in; description up to 300 characters; optional name or role; consent box
    **unticked** by default. Send stays disabled, with "Still needed: …", until the report is complete.
    Clear messages for more than 3 km from NH-7 (422), the same place within 10 minutes (409), too many
    reports a minute (429) and no connection (the text is kept).
  - **Recent reports** (`app_reports_recent.png`): everyone's reports, newest first, with type, place, km,
    time, who, and Pending / Verified / Rejected; your own marked "YOUR REPORT"; filter by type; "Report
    sent" banner after sending; what a report does.
- **Why:** `frontend.md`, section 4. Its team notes list the web form's ignored typed location, km pre-filled
  with 62, pre-ticked consent and the always-"Traveller" name.
- **How:** The backend stores free text only, so the type and km travel in the description in the web
  dashboard's format, `[Falling stones] km 114: …`, which both clients parse. Your own report IDs are kept on
  the phone. There is no photo upload (the backend only takes a photo URL).
- **Files:** `src/app/(tabs)/reports.tsx`, `src/domain/reports.ts`

### APP-009 — Emergency tab and hospitals
- **When:** 2026-10-24 01:05 IST
- **Who:** Claude Code for Aakash
- **What:** One big **Call 112**, "Tell them" prompt, other helplines (SDMA Uttarakhand, Highway Police, BRO
  control room, Ambulance), when to call 112, and what to do in a landslide or at a blocked road
  (`app_emergency.png`). **Hospitals along NH-7** (`app_hospitals.png`): nearest hospital and distance for
  each stretch in road order, "Saved for offline use · time", an offline-copy notice when the network is down,
  and "Show the one nearest me first" (GPS).
- **Why:** `frontend.md`, section 5.
- **How:** Helpline numbers come only from `/offline-pack`. The backend deliberately leaves them blank, so the
  app shows **[number to confirm]** and no call button. It does **not** copy 1070, 1090 or 0135-2744064 from
  the web page; `frontend.md` says to verify those first. When someone confirms the numbers, set them in the
  backend and the app picks them up. The hospital list falls back to each segment's `nearest_hospital` with the
  risk map's distance when the pack has no `hospitals` list.
- **Files:** `src/app/(tabs)/emergency.tsx`, `src/app/hospitals.tsx`

### APP-010 — Checked on the web at phone size against a live backend
- **When:** 2026-10-24 01:15 IST
- **Who:** Claude Code for Aakash
- **What:** `npx tsc --noEmit` and `npx eslint src` pass with no errors. Ran `npx expo start --web` at 375×812
  and used every tab. Checked against a running backend: the map, tapping a stretch, stretch and alert
  details, Rishikesh → Joshimath and the reverse trip (ETAs and town order right in both directions), Alerts,
  sending a report (it then appeared as YOUR REPORT · Pending), Emergency and Hospitals. Stopped the backend
  and confirmed the map falls back to "Offline copy · 1:07 am".
  Fixed during this pass: everything was about 1.4× too large next to the mock-ups (they are 2× screenshots);
  overlapping town names; the default leave time rounded to UTC hours (01:30 instead of 02:00 IST); repeated
  wording on alert details; React 19 lint rules (refs read during render, setState inside effects).
- **Why:** To check the work, not just write it.
- **How:** So that nothing was written into `Backend/` (its SQLite database and rain snapshot are tracked in
  git, and sending a report adds a row), the backend ran from a **throwaway copy in the session's scratch
  folder**, using `Backend/venv`'s Python. The test report went into that copy, not the team database.
  **Not checked yet:** a real phone in Expo Go (Android or iOS), GPS on a device, `expo-speech` voices,
  the native share sheet and `tel:` dialling. These need someone with a phone on the same Wi-Fi as the laptop.
- **Files:** `src/components/CorridorMap.tsx`, `src/app/(tabs)/*.tsx`, `src/app/*.tsx`, `src/components/*.tsx`,
  `src/domain/time.ts`, `src/domain/stretch.ts`, `.claude/launch.json` (dev-server config for the desktop app)

### APP-011 — Open items and decisions for the team
- **When:** 2026-10-24 01:16 IST
- **Who:** Claude Code for Aakash
- **What / Why:**
  1. **Root records not updated.** Aakash asked for changes only inside `App/`, so the root `log.md` and
     `features.md` do not mention this app yet. Add a pointer to this file there when convenient.
  2. **`App/log.md` and git.** The root `.gitignore` ignores every `*.md` except listed ones. `App/.gitignore`
     now re-includes `log.md` so this file is committed.
  3. **Map styles.** `frontend.md` lists terrain, streets and satellite. The app has Terrain (schematic) and
     Plain; real street or satellite tiles need a tile provider and a network, which conflicts with offline use.
  4. **Not built:** Hindi, phone notifications / "Alert me" (needs a consent form; see `frontend.md`), report
     photos, a send-later queue for reports written with no signal, and the Raah Node sensor screen. The
     sensor screen is in the 30-hour team plan (S2), but `frontend.md` says sensor views stay out of the client
     app. A sensor ALARM still reaches travellers here, through the backend's adjusted levels and the
     trip planner's Avoid.
  5. **Rain tiles show "—"** while the backend runs in its default 5-station mode, which sends only the 3-day
     total. They fill in when `PER_SEGMENT_WEATHER` is on.
  6. **Helpline numbers** stay blank until someone verifies them (APP-009).
- **Files:** none (notes)

### APP-012 — Phone could not reach the backend: cause, and an in-app server address
- **When:** 2026-10-24 01:30 IST
- **Who:** Claude Code for Aakash
- **What:** On a real Android phone (Expo Go), Check route waited and then said "Cannot reach the Raah
  server", and the Map showed "Demo data, not live".
  1. **Cause:** nothing was listening on port 8000; the backend was not running (Expo on 8081 was). The
     backend's `.env` already binds `0.0.0.0:8000`, Windows Firewall already allows Python inbound, and the
     laptop's Wi-Fi address is `172.168.11.111`, so starting the backend (`python run.py`) is the fix. No code
     change was needed for that.
  2. **New: Server address sheet.** Tap the Live / Offline / Demo pill on the Map, **Change server** under the
     map cards, or **Change server address** on a failed trip check. Type the backend's "Team LAN URL"
     (`192.168.1.15`, `192.168.1.15:8000` or a full `http(s)://` address); **Test** calls `/health`;
     **Save and reload** stores it on the phone and refetches everything; **Use the automatic address** goes
     back to the default.
  3. Every "cannot reach" message now names the address that was tried, and says whether the server never
     answered (timeout) or the connection failed. The trip check shows "Asking <address>" while it waits.
  4. Timeouts: 10 s for ordinary calls, 20 s for `/trip-planner` (it can fetch weather first).
  5. The Map's offline note gains **Try again**.
- **Why:** On a phone the app guesses the backend from the Expo laptop's address. That guess is wrong when the
  backend is on another machine, the laptop has several network adapters, or Expo runs in tunnel mode, and
  until now the only fix was editing `.env` and restarting.
- **How:** `client.ts` keeps the address in a module variable. `_layout.tsx` loads the saved one before the
  first request. Addresses are parsed with a regex because React Native's `URL` is incomplete.
- **Files:** `src/api/client.ts`, `src/api/storage.ts`, `src/app/_layout.tsx`, `src/components/ServerSheet.tsx`
  (new), `src/app/(tabs)/index.tsx`, `src/app/plan-result.tsx`, `src/app/(tabs)/reports.tsx`

### APP-013 — Plan trip used a leave time that was already past
- **When:** 2026-10-24 01:33 IST
- **Who:** Claude Code for Aakash
- **What:** The phone checked a trip at 01:24 with "leave 01:30". The tab stays mounted, so the time chosen
  when it first opened was never refreshed. Check route now moves a past date or time to the next whole hour
  in IST, and updates the form to match.
- **Why:** A trip check for a time already gone gives a misleading answer.
- **How:** Compared with the current IST date and clock (APP-010's rounding fix is correct: 01:24 → 02:00).
- **Files:** `src/app/(tabs)/plan.tsx`

### APP-014 — Map framing on narrow phones
- **When:** 2026-10-24 01:35 IST
- **Who:** Claude Code for Aakash
- **What:** On a 360 dp phone the whole corridor was fitted into about 200 dp (36 dp padding each side plus
  90 dp kept free for the zoom buttons), so it looked tiny and cramped, and names near the edges were cut off.
  1. Side padding is now 22 dp and the space kept for the buttons is 58 dp. Measured at 360 × 800, the road
     spans x 22–280 and the buttons sit at 298–344: about 30% larger, with no overlap.
  2. A town name that would run past the right edge is drawn to the left of its dot (Joshimath now shows in
     full).
  3. Tapping a "Needs attention" card frames that stretch with its neighbours rather than the stretch alone, so
     there is context around it.
- **Why:** The phone screenshot showed the corridor cropped, with "Rishikesh" cut at the edge.
- **How:** Checked in the browser at 360 × 800 by measuring the SVG path bounds and the button positions.
  **Still not checked on the phone itself.**
- **Files:** `src/components/CorridorMap.tsx`, `src/app/(tabs)/index.tsx`

### APP-015 — Real map under the road: terrain, streets and satellite
- **When:** 2026-10-24 02:40 IST
- **Who:** Claude Code for Aakash
- **What:** On the phone the map was "all white", and the Map style options did nothing useful. They only
  switched decorative contour rings on and off; there was no real map underneath.
  1. The map now draws real map tiles under the risk-coloured road: **Mountain terrain** (Esri World Topo:
     hill shading, rivers, towns; the default), **Clean streets** (Esri World Street Map) and **Satellite**
     (Esri World Imagery). **Schematic** keeps the old drawing and needs no internet.
  2. The style menu is now a bottom sheet (the popover ran off the top of a short map). It also holds "Show all
     19 town names". The chosen style applies to every map in the app (Map tab, stretch, alert and trip
     result) for the rest of the session.
  3. A credit line names the tile provider. If tiles cannot load (no signal) it says "Map needs internet ·
     road still shown"; the road, colours, badges and towns are still drawn.
  4. A light white wash over the tiles keeps the risk colours the strongest thing on the map.
- **Why:** `frontend.md` asks for terrain, streets or satellite styles, and the schematic alone looked empty.
- **How:** No map SDK or API key. The map projection changed to Web Mercator (the tile grid), and the tiles
  in view are placed as plain React Native `Image`s under the SVG road, at the zoom level that matches the
  view. Panning, pinch-zoom, fly-to and tap-a-stretch work as before. This runs the same in Expo Go, on the
  web and in a release build. Tile requests send a `User-Agent` naming the app, as tile servers ask.
  **Sources:** the web dashboard uses OpenTopoMap and CARTO, but CARTO now returns an "API KEY REQUIRED"
  image for every tile (checked with curl on 2026-10-24), so its "Clean Streets" layer is probably broken on
  the web too. OpenTopoMap is dark and busy at corridor zoom. Esri's keyless tile services were used
  instead, with Esri's credit line; Esri's terms should be checked before any commercial release.
  **Web-only fix:** tiles that ran past the map's edge made the map container scrollable, and the browser
  scrolled it about 40 px when a button inside regained focus. The tile layer is now clipped.
- **Checked:** in the browser at 360 × 800: tiles line up with the road (Rishikesh by Haridwar, Srinagar on
  Srinagar), all three styles load, the style sheet opens and closes, nothing shifts, and the stretch page map
  uses the same style. `npx tsc --noEmit` and `npx eslint src` pass. **Not yet checked on the phone.**
- **Files:** `src/components/CorridorMap.tsx`, `src/app/(tabs)/index.tsx`, `src/components/DetailShell.tsx`
