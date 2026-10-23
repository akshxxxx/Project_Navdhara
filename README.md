# ⛰️ NH7 Raah (राह) — Real-Time Landslide Early Warning & Resilient Mountain Routing Platform

[![IBM x Jigyasa](https://img.shields.io/badge/Hackathon-IBM%20x%20Jigyasa%202026-6366f1.svg)]()
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Expo](https://img.shields.io/badge/Mobile-Expo%20SDK%2052-000020.svg?logo=expo&logoColor=white)](https://expo.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)]()

> **The Corridor:** National Highway 7 (Rishikesh ➔ Joshimath / Badrinath, Uttarakhand, India — 247.37 km across 18 high-risk mountain sectors).  
> **The Challenge:** Monsoonal cloudbursts and fragile Himalayan geology trigger sudden landslides, blocking critical pilgrimage routes and trapping travelers with zero cell reception.  
> **The Innovation:** **Raah (राह)** unites satellite terrain physics (Copernicus 30m DEM), multi-source rainfall forecasts, Bayesian hazard prediction, arrival-ETA trip planning, bilingual Hindi neural voice alerts, and offline-first mobile survival packs into a unified disaster-resilience ecosystem.

---

## 🏛️ Repository Architecture

This repository is structured as a full-stack monorepo containing all three interconnected tiers of the platform:

```
IBM_X_Jigyasa/
├── Backend/                 # Python FastAPI prediction engine, hazard models, GIS pipeline & audio synthesis
├── Frontend/                # React 19 + Vite web dashboard, interactive Leaflet maps & simulation studio
├── App/                     # React Native / Expo cross-platform mobile application with offline SQLite caching
├── .gitignore               # Unified root git configuration
└── README.md                # Project documentation & execution guide
```

---

## 🚀 Key Innovations & Features

### 1. 🧠 Physics-Informed ML Landslide Risk Engine (`Backend`)
- Calculates dynamic hazard probabilities for all 18 corridor segments using 3-day accumulated rainfall ($R_{3d}$), Copernicus 30m Digital Elevation Model slopes, geological lithology, and historical slide catalogues.
- Supports instant **weather simulation overrides** (0–180 mm) to evaluate storm resilience and disaster readiness in real time.

### 2. 🗺️ Time-Aware Trip Risk Planner (`Frontend` & `App`)
- Unlike standard GPS maps that treat a route statically, Raah calculates **progressive arrival ETAs**.
- Evaluates forecasted rainfall at the exact hour you are predicted to reach high-hazard choke points (e.g., Sirobagarh, Helang).
- Recommends safer alternative departure windows (e.g., "Depart tomorrow at 06:00 AM instead to save 3h of delay and avoid severe storm peaks").

### 3. 🔊 Vernacular Voice Alerts & Bilingual Accessibility
- Native support for both **English** and **Hindi (हिन्दी)** across web, mobile, and voice interfaces.
- Streams real-time synthesized voice advisories via `GET /voice-alert?lang=hi` for drivers navigating winding mountain passes hands-free.

### 4. 📴 Offline-First Survival Architecture
- Mountain travel frequently suffers from complete cellular loss.
- Both mobile and web clients implement HTTP ETag caching for **Emergency Offline Packs** containing hospital directories, police/SDRF helplines, evacuation zones, and offline segment risk baselines.

### 5. 👥 Citizen Ground Reports & Incident Verification
- Allows verified ground reports (rockfalls, waterlogging, mudslides) submitted by commuters and border road personnel with photo uploads.
- Official administrative overrides enable immediate corridor closures and detour dispatches.

---

## ⚡ Quickstart Guide

### 1. Prerequisites
- **Python**: 3.11+
- **Node.js**: v18+ and **npm**

---

### 2. Launch the Backend API & Simulation Server

```bash
# Navigate to Backend
cd Backend

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python run.py
```
- **API Server**: Runs at `http://localhost:8000`
- **Interactive API Docs**: `http://localhost:8000/docs`

---

### 3. Launch the Web Frontend Dashboard

Open a new terminal:
```bash
# Navigate to Frontend
cd Frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
- **Web App**: Runs at `http://localhost:5173`

---

### 4. Launch the Mobile Application (Expo)

Open a third terminal:
```bash
# Navigate to App
cd App

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```
- Press `w` to open in browser.
- Scan the QR code using **Expo Go** on Android or iOS.

---

## 📡 Core API Endpoints

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| `GET` | `/risk-map` | Current 18-segment hazard scores, rainfall stats, and road closure statuses |
| `POST` | `/trip-planner` | Computes route risk, segment-by-segment ETAs, and safest departure windows |
| `GET` | `/voice-alert?lang=hi` | Streams localized neural MP3 voice advisories (English or Hindi) |
| `GET` | `/ground-reports` | Retrieves real-time citizen-submitted incidents and road hazard warnings |
| `POST` | `/ground-reports` | Submits a new roadside incident report with photo upload |
| `GET` | `/emergency/offline-pack` | ETag-cached offline survival pack for zero-connectivity zones |
| `POST` | `/subscribe` | Subscribes traveler phone number for automated SMS emergency dispatch |

---

## 👥 Team & Acknowledgments

Developed with ❤️ for the **IBM x Jigyasa Hackathon 2026** to build resilient digital infrastructure for Uttarakhand's mountain communities and Char Dham pilgrims.
