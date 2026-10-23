# 🌐 NH7 Raah — Web Dashboard & Control Center

Officials' control console for real-time landslide monitoring, route checks, field-report verification, closures and alerts along the NH-7 highway corridor (Rishikesh to Joshimath, Uttarakhand). Built for the **IBM x Jigyasa Hackathon 2026**; extended with the Raah Node slope sensors.

---

## 🚀 Overview

This dashboard is for officials only (English). There is no public view and no login screen: admin actions use the key in `Frontend/.env` (`VITE_ADMIN_API_KEY`, same value as `ADMIN_API_KEY` in `Backend/.env`).
- **Map**: 18 highway segments coloured by the backend's risk level (Low, Moderate, High, Severe, Closed); **Alert All** broadcasts an official alert to a stretch's subscribers.
- **Plan trip**: route risk at each stretch's arrival time and safer departure windows.
- **Reports**: log field reports and **Verify / Reject** them; only verified reports raise a stretch's risk.
- **Sensors**: Raah Node slope sensors (tilt, tilt rate, vibration, soil moisture, rain plate), SENSOR LOST hold and release, one-clock incident timings, voice alerts.
- **Admin**: verify reports, declare and lift closures, broadcast alerts, BRO pre-positioning priority.
- **Emergency / Past events / How it works**: helplines and hospitals, historical events, and how the console decides.
- **Rainfall Simulation Studio**: simulate extreme rainfall (0–180 mm) and watch the corridor respond.

---

## 🛠️ Tech Stack

- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 + Custom Design Tokens (Milestone Yellow, River Slate, Alpine White)
- **Mapping**: Leaflet + React-Leaflet
- **Routing**: React Router DOM v7
- **Icons**: Lucide React
- **Typography**: IBM Plex Sans, IBM Plex Sans Condensed

---

## ⚡ Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```

---

## 📁 Key Project Structure

```
Frontend/
├── src/
│   ├── api/             # API client and response adapters
│   ├── components/      # UI components (InteractiveMap, Layout, RainSimulationModal, etc.)
│   ├── data/            # Static highway segment registries & town coordinates
│   ├── pages/           # Views (LiveMap, PlanTrip, Alerts, Report, Sensors, Officials = Admin, Emergency, PastEvents, About)
│   ├── store/           # Global state (simulation state)
│   ├── App.jsx          # Route configuration
│   └── main.jsx         # Application entry point
├── public/              # Static assets and icons
└── index.html           # HTML document template
```
