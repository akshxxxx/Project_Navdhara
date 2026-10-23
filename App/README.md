# Raah (राह) – Mobile App

Landslide risk assessment and alert app for the NH-7 highway (Rishikesh to Badrinath, Uttarakhand). Built for the IBM Hackathon.

## Stack
- **Framework**: Expo (SDK 52+) with Expo Router
- **Language**: TypeScript Strict
- **Styling**: NativeWind v4 with design tokens matching `00_DESIGN_SYSTEM.md`
- **Typography**: IBM Plex Sans, IBM Plex Sans Condensed, IBM Plex Sans Devanagari (loaded via Expo Google Fonts)
- **Data & Cache**: TanStack Query with AsyncStorage persister (24-hour offline cache)
- **Network**: `@react-native-community/netinfo` for offline detection
- **Components & Graphics**: `react-native-svg`, `react-native-reanimated`, `@gorhom/bottom-sheet`, `lucide-react-native`
- **i18n**: `i18next` + `react-i18next` + `expo-localization` (Hindi & English)

## How to Run

1. **Install dependencies** (if not already installed):
   ```bash
   npm install
   ```

2. **Start the Expo development server**:
   ```bash
   npx expo start
   ```

3. **Open on your device**:
   - Scan the QR code with **Expo Go** on Android or Camera app on iOS.
   - Press `w` to open in a web browser.
   - Press `a` for Android emulator or `i` for iOS simulator.

## Environment Variables

Configured in `.env`:
```env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_USE_MOCKS=true
```
- `EXPO_PUBLIC_API_URL`: Base URL for the backend API.
- `EXPO_PUBLIC_USE_MOCKS`: Set to `true` (default) to use local realistic mock data with a 300ms simulated delay; set to `false` to communicate with the live backend.

## Dev Route: Kitchen Sink

The kitchen sink route is available at `/kitchen-sink`:
- Displays every component in every state:
  - Typography scale (`verdict`, `h1`, `h2`, `h3`, `body`, `small`, `caption`) with automatic Hindi Devanagari font and +0.1 line height adjustment.
  - NHShield milestone badge in sizes 24 and 40.
  - Risk icons (circle, triangle, diamond, octagon) in both light and night palettes.
  - Risk badges (with and without verdict text).
  - StatusLine in all states (Fresh, Stale, Old, Offline, Loading).
  - Buttons (Primary, Secondary, Disabled) and Chips.
  - RoadStrip in horizontal and vertical rail orientations with town ticks and Severe hatch pattern.
  - BottomSheet wrapper demo with snap points.
  - Language toggle ("हिं | EN") and Light/Night toggle.
  - Scenario switcher ("dry", "heavy-rain", "blocked").

## Architectural Decisions Differing from Web Docs

1. **Native Stack vs Web Stack**: Per project instructions, replaced Vite, PWA, Leaflet, and React Router with Expo Router, NativeWind v4, `react-native-svg`, and `@gorhom/bottom-sheet`.
2. **RoadStrip Animation**: Implemented 700ms ease-out wipe animation via Reanimated `Animated.View` clipping wrapper. This ensures identical smooth rendering on iOS, Android, and Web without relying on device-specific SVG `<clipPath>` quirks.
3. **Weekly Route Query**: Used TanStack Query's `useQueries` for parallel 7-day fetching in `useRouteRiskWeek`, strictly adhering to React Hook execution rules.
4. **Devanagari Font Mapping**: Mapped condensed headline styles to `IBMPlexSansDevanagari` semi-bold weights for Hindi, as the Devanagari family does not have a separate condensed cut.
