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

### APP-016 — Standalone release APK built and installed on a phone
- **When:** 2026-10-24 03:42 IST
- **Who:** Claude Code for Aakash (local SDK installs and the build route approved by Aakash in chat; the
  Windows setting changed by Aakash)
- **What:** Built `android/app/build/outputs/apk/release/app-release.apk` (34.7 MB, arm64-v8a, signed with
  the debug keystore, so for sideloading only, not for the Play Store) and installed it over USB with
  `adb install -r` on a Realme RMX3840 (Android, arm64). It starts and runs with no crash in logcat.
  Package `org.raah.nh7`, app name Raah.
- **Why:** Aakash asked for the app installed as an APK on the connected phone, not run through Expo Go.
- **How:**
  1. `app.json`: added the `expo-build-properties` plugin with `android.usesCleartextTraffic: true`. Release
     builds block plain `http://` by default, and the backend runs on `http://<laptop>:8000`.
  2. The backend address is baked in at build time with `EXPO_PUBLIC_API_URL=http://172.168.11.111:8000`
     (this laptop's Wi-Fi address on 2026-10-24). A standalone APK has no Expo server to take the address
     from. If the laptop's address changes, set it in the app (tap the Live / Offline / Demo pill on the Map
     → Server address); no rebuild is needed.
  3. `android/` already existed (generated at 02:06 and open in Android Studio, which locked it), so
     `expo prebuild` could not regenerate it. The cleartext flag was added by hand to
     `android/app/src/main/AndroidManifest.xml`. The folder is generated and git-ignored; the plugin in
     `app.json` makes the next prebuild produce the same setting.
  4. Built with `gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`, using JDK 17
     (`C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot`; the default Java 27 is too new for Gradle).
  5. Problems fixed on the way:
     - `android/local.properties` had been written with single backslashes, which properties files treat
       as escapes. It now uses forward slashes. This was my mistake earlier in this session.
     - Every NDK folder in the SDK was an empty leftover from an interrupted install. Installed
       `ndk/27.1.12297006` and `cmake/3.31.6` with the SDK's new `android sdk install` CLI (`sdkmanager.bat`
       now forwards to it, and splits `ndk;…` at the semicolon).
     - The C++ build failed on Windows' 260-character path limit (paths under
       `node_modules\react-native-gesture-handler\…`). Aakash turned on `LongPathsEnabled` (admin).
       `local.properties` now sets `cmake.dir` to CMake 3.31.6, whose ninja 1.12 handles long paths.
- **Outside `App/` (machine setup, not repository files):** Android SDK gained NDK 27.1.12297006 and CMake
  3.22.1 and 3.31.6; Windows `LongPathsEnabled` is now 1.
- **To rebuild later** (from `App/android`, in PowerShell, with `JAVA_HOME` set to JDK 17 and
  `EXPO_PUBLIC_API_URL` set): `.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`, then
  `adb install -r app\build\outputs\apk\release\app-release.apk`. After the first build only changed parts
  rebuild.
- **Files:** `app.json`, `package.json`, `package-lock.json` (expo-build-properties),
  `android/app/src/main/AndroidManifest.xml` and `android/local.properties` (generated, git-ignored)

### APP-017 — Smoother map: gestures and fly-to no longer redraw every frame
- **When:** 2026-10-24 04:40 IST
- **Who:** Claude Code for Aakash
- **What:** The map felt laggy on the phone. Every drag, pinch, zoom-button press and fly-to used to rebuild
  the whole SVG (18 stretches, about 4,800 path points, town labels) and re-place every map tile, frame by
  frame, from JavaScript.
  Now one layer holds the tiles and the road, and it is moved and scaled with a native transform
  (`Animated`, native driver on the phone) while a finger moves or the map flies. Nothing is redrawn until
  the movement ends; then the road and tiles are drawn once for the new view and the transform resets. The
  road and tiles are drawn 220 px past each edge, so a drag does not show empty borders straight away.
- **Why:** Aakash reported the app, the map above all, as laggy on the phone.
- **How:** `viewAfter()` and `xformTo()` in `CorridorMap.tsx` convert between "drawn view plus transform" and
  "the view on screen". The transform scales around the centre of the map box, while the drawing is centred
  between the overlays. Pan and pinch update the transform from `PanResponder` without a React render. Zoom
  buttons and fly-to use `Animated.timing`. A gesture that starts mid-animation stops it and continues from
  where it is. The reset after a redraw happens in a layout effect, so the old transform never shows over the
  new drawing. On the web the map box clips with `overflow: clip`, so the margin does not make it scrollable.
- **Checked (web, 360 × 800):** a drag moves the road and redraws once on release, with the transform back to
  identity. During a zoom-button animation only the transform changes (geometry untouched at scale 1.27); the
  redrawn position matches the end of the animation to about 1 px.
- **Files:** `src/components/CorridorMap.tsx`

### APP-018 — Hindi / English language option
- **When:** 2026-10-24 04:45 IST
- **Who:** Claude Code for Aakash
- **What:** Every page can be shown in Hindi or English. A **हिंदी / EN** button in every page header (and on
  the Map's header card) switches with one tap, and the choice is remembered on the phone. In Hindi:
  - all text, buttons, alerts, tips, errors and the spoken **Listen** advice (uses the phone's Hindi voice,
    `hi-IN`) are in Hindi;
  - town and stretch names are in Devanagari (ऋषिकेश से शिवपुरी), on the map too;
  - dates and times read सोम, 24 अक्टू, रात 9:05;
  - the trip planner asks the backend for its explanation in Hindi (`lang: 'hi'`);
  - text uses IBM Plex Sans Devanagari, with a little more line height and no letter spacing (spacing breaks
    joined Devanagari letters).
- **Why:** Aakash asked for a Hindi or English option. Many NH-7 drivers and pilgrims read Hindi first.
- **How:** `src/i18n/index.tsx` is a small translation layer: the English text is the key, `t()` and `tr()`
  look it up in `src/i18n/hi.ts`, and a missing entry falls back to English. All 349 strings in the app have a
  Hindi entry (a script lists any that are missing). `Txt` switches the font itself. Report types are still
  stored in English inside the report text (`[Falling stones] km 114: …`), so the web dashboard reads them
  the same; only the display is translated. Numbers stay in Latin digits, as on road signs.
- **Note:** the Hindi was written for this app and has not been reviewed by a native speaker yet. Worth a read
  before the demo.
- **Files:** `src/i18n/index.tsx`, `src/i18n/hi.ts` (new), `src/app/_layout.tsx`, every screen in `src/app/`,
  `src/components/*.tsx`, `src/domain/levels.ts`, `src/domain/stretch.ts`, `src/domain/time.ts`,
  `src/api/client.ts`, `src/api/hooks.ts`, `src/api/storage.ts`, `package.json` (Devanagari font)

### APP-019 — My emergency contacts
- **When:** 2026-10-24 04:50 IST
- **Who:** Claude Code for Aakash
- **What:** The Emergency tab has a new **My emergency contacts** card, right under Call 112. A traveller adds
  up to 8 people (name, phone, Family / Friend / Hotel or driver / Other). Each contact has **Call**,
  **Send my location** and **Remove** (with a confirm step). With two or more there is also **Send my location
  to all**. The message names the place on NH-7 ("I am on NH-7 near Sirobagarh, km 114") and adds a Google
  Maps link from GPS. Without GPS it says "I am travelling on NH-7 and may need help. Please call me."
- **Why:** Aakash asked to add emergency contacts. These are the person's own people, alongside the official
  helplines, whose numbers are still unconfirmed.
- **How:** Contacts are kept only on the phone (AsyncStorage, `raah.contacts.v1`); nothing goes to the
  server. Messages open the phone's SMS app with the text filled in, and the person presses Send; the app never
  sends anything by itself. Phone numbers are cleaned to digits and checked for 10–13 digits.
- **Checked (web):** add (in Hindi), the number cleaned to `9876543210`, the row with its buttons, remove with
  confirm, storage emptied. SMS and calling need a real phone.
- **Files:** `src/domain/contacts.ts`, `src/components/MyContacts.tsx` (new), `src/app/(tabs)/emergency.tsx`

### APP-020 — Updated APK installed on a second phone
- **When:** 2026-10-24 05:09 IST
- **Who:** Claude Code for Aakash
- **What:** Rebuilt the release APK with APP-017 to APP-019 (35.8 MB, arm64-v8a; the incremental build took 5
  min) and installed it with `adb install -r` on a Xiaomi 22101320I. It launches with no crash in logcat and
  shows live data from the backend at `172.168.11.111:8000`, with the mountain-terrain tiles.
- **Not yet checked on the phone:** how smooth pinch and drag feel, the Hindi voice, and SMS or calling from
  My emergency contacts.
- **Files:** none (build output only, `android/app/build/outputs/apk/release/app-release.apk`)

### APP-021 — Satellite by default; the Needs attention panel slides down for a full-screen map
- **When:** 2026-10-24 05:40 IST
- **Who:** Claude Code for Aakash
- **What:**
  1. **Satellite is the default map style** (Aakash's request). A style picked from Map style is now
     remembered on the phone (`raah.map-style.v1`), not just for the session.
  2. **The map fills the whole screen.** "Needs attention today" is now a panel over the map. Drag it down
     (or tap its title bar or arrow) and only the title stays, about 70 px; drag it up or tap again to bring
     it back. Each time it moves, the map refits to the space it has and the zoom buttons move with it. The
     colour legend rides on top of the panel so it is never hidden.
- **How:** The panel moves with an `Animated` translate (native driver on the phone) and snaps open or closed
  by position and swipe speed. Vertical drags are claimed in the capture phase, so a drag that starts on the
  title bar or a card still moves the panel; sideways swipes still scroll the cards. The map gets the
  panel's visible height as its bottom inset.
- **Checked:** in the browser at 360 × 800, satellite loads by default; tapping the title collapses the panel
  (only the 66 px title stays, the buttons move down, the map refits) and tapping again opens it. Drags could
  not be tested in this browser session: its drag tool sent a press and one move but no release. The swipe
  gesture still needs checking on a phone (`adb shell input swipe`). APK rebuilt (35.8 MB); not installed
  yet, because the phone was disconnected.
- **Files:** `src/app/(tabs)/index.tsx`, `src/components/CorridorMap.tsx`, `src/app/_layout.tsx`,
  `src/api/storage.ts`, `src/i18n/hi.ts`

### APP-022 — APP-021 installed on the Xiaomi; swipe not tested by machine
- **When:** 2026-10-24 05:28 IST
- **Who:** Claude Code for Aakash
- **What:** Installed the APP-021 APK on the Xiaomi 22101320I. It opens in satellite view, and the collapsed
  panel looks right: only the "Needs attention today" title bar shows, and the legend and zoom buttons sit
  just above it. The panel had been collapsed by `adb shell monkey`'s one random tap, which landed on the
  title bar.
- **Not tested:** the swipe itself. `adb shell input swipe` is refused on this phone (`SecurityException:
  … INJECT_EVENTS permission`). MIUI only allows injected touches with Developer options → "USB debugging
  (Security settings)" turned on. That is the owner's security setting, so it was left as it is. The swipe
  needs a person to try it on the phone.
- **Files:** none

### APP-023 — Checked helpline numbers on Emergency; photos on reports (camera or gallery)
- **When:** 2026-10-24 05:45 IST
- **Who:** Claude Code for Aakash ("add emergency number and in report section allow user to capture photo or
  upload photo")
- **What:**
  1. **Helpline numbers on Emergency.** Under Call 112 there is now a list of helplines, each with what it is
     for and a Call button:
     - SDMA Uttarakhand control room **1070** (landline 0135-2710334): landslides, floods, rescue
       (source: usdma.uk.gov.in);
     - District disaster control room **1077**: road blocked, road status, local rescue (usdma.uk.gov.in);
     - National Highway helpline **1033**: accidents, crane, help on the highway (NHAI / MoRTH);
     - Ambulance **108**, free (nhm.uk.gov.in);
     - BRO control room: no public number was found, so it shows "[number to confirm]".
     A note says when the numbers were checked (24 Oct 2026). If the backend's offline pack ever sends a
     number for one of these, the server's number wins.
  2. **Photos on reports.** The Send report form has an optional "Add a photo" step with **Take photo** and
     **From gallery**. The photo shows as a preview with an X to remove it. Recent reports show the photo
     with each report that has one.
- **Why:** the Emergency page only had 112; the other numbers had been left blank because nobody had checked
  them. Officials asked for photos so they can judge a report before verifying it.
- **How:**
  - `domain/helplines.ts` holds the checked numbers and the date; `emergency.tsx` matches backend contacts to
    them by name.
  - `domain/photo.ts` asks for camera or gallery permission, opens the picker, shrinks the photo to at most
    1600 px on its longest side and re-saves it as JPEG (quality 0.7). Re-saving drops the file's EXIF data,
    including the GPS position, which the form tells the user.
  - On Send, the photo is uploaded first (`POST /field-report/photo`, 30 s timeout) and the returned
    `photo_url` goes with the report. If the server has no photo endpoint (404/405) or refuses the photo
    (413/415), the report is still sent and the "Report sent" banner says it went without the photo.
  - `expo-image-picker` and `expo-image-manipulator` added; `app.json` declares the camera and photo
    permission texts (no microphone). All new text is in Hindi too.
  - The backend endpoint was added with Aakash's approval; see root `log.md` L-048.
- **Checked:** `tsc` and ESLint clean; Hindi checker shows no missing keys. Helplines render on web at
  360 × 800. APK rebuilt (36.0 MB), installed on the Xiaomi 22101320I and launched: no crash, satellite map,
  live data; the APK declares the CAMERA permission.
- **Not yet checked on the phone:** taking or picking a photo, the permission prompts, and sending a report
  with a photo to the backend. Touch input from the laptop is blocked on this phone (APP-022), so this needs
  a person.
- **Files:** `src/domain/helplines.ts`, `src/domain/photo.ts` (new), `src/app/(tabs)/emergency.tsx`,
  `src/app/(tabs)/reports.tsx`, `src/api/client.ts`, `src/api/types.ts`, `src/i18n/hi.ts`, `app.json`,
  `package.json`, `package-lock.json`

### APP-024 — BRO control room removed from Emergency
- **When:** 2026-10-24 05:55 IST
- **Who:** Claude Code for Aakash ("From emergency section remove Bro control room box")
- **What:** The Emergency helpline list no longer has the "BRO control room" box. It had no checked number and
  only showed "[number to confirm]" (APP-023). The list is now SDMA 1070, District 1077, National Highway
  1033 and Ambulance 108. The advice that mentions BRO ("wait for BRO or police to clear it") is unchanged.
- **How:** Removed the BRO entry from `HELPLINES` and its two now-unused Hindi strings. A BRO contact sent by
  the backend's offline pack is not shown either, because the screen only lists the lines in `HELPLINES`.
- **Checked:** `tsc` and ESLint clean; Hindi checker shows no missing keys. APK rebuilt (36.0 MB), installed
  on the Xiaomi 22101320I and launched with no crash.
- **Files:** `src/domain/helplines.ts`, `src/i18n/hi.ts`

### APP-025 — Recent reports show real landslide photos (backend change only)
- **When:** 2026-10-24 09:47 IST
- **Who:** Claude Code for Aakash ("change the mock pics … to these real landslide pics in the app, website …")
- **What:** The three sample reports in Recent reports now show real landslide photos instead of Unsplash stock
  images. The app has no past-alerts photos, so nothing else changed in the app.
- **How:** No app code changed. The backend now stores the photos and sends full URLs on the address the app
  uses (root `log.md` L-049). The installed APK picks them up as is.
- **Checked:** on the web build, Recent reports loads all three photos. With the phone's address the backend
  returns `http://172.168.11.111:8000/static/landslides/…` URLs. Not looked at on the phone itself.
- **Files:** none in App

### APP-026 — New Wi-Fi: app rebuilt for the backend at 10.68.89.155
- **When:** 2026-10-24 10:45 IST
- **Who:** Claude Code for Aakash ("change the ip … to current one wifi … my app stopped working i changed my wifi")
- **What:** The laptop moved to the "realme 12 Pro+ 5G" hotspot and is now `10.68.89.155`, so the installed app
  was still calling the old `172.168.11.111:8000` and failed. The APK was rebuilt with
  `EXPO_PUBLIC_API_URL=http://10.68.89.155:8000` and installed on the Xiaomi (on the same hotspot at
  `10.68.89.90`; from the phone, `curl` to `10.68.89.155:8000/health` returns 200). After install the app
  opens with **Live** data from the backend. The first build reused the old JavaScript bundle (Gradle does not
  see a changed `EXPO_PUBLIC_API_URL`), so `android/app/build/generated/assets/react/release` was deleted and
  the APK rebuilt; the new address was confirmed inside the APK before installing.
- **Also:** the sensor node's `Hardware/raah_node/secrets.h` (git-ignored) now posts to `10.68.89.155:8000`
  instead of `10.68.89.10` (root `log.md` L-039); it needs re-flashing to take effect.
- **Next time the network changes:** the hotspot can hand out a new address. Either rebuild with the new
  `EXPO_PUBLIC_API_URL`, or in the app open the server sheet (shown with the connection error) and type the new
  address; a typed address is saved on the phone and wins over the built-in one.
- **Files:** none in App (build output only); `Hardware/raah_node/secrets.h`
