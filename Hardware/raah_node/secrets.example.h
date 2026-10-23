// Copy this file to secrets.h (same folder) and fill it in. secrets.h is git-ignored.
#pragma once

// Wi-Fi the node joins (2.4 GHz only). Leave WIFI_SSID "" for USB-only (plug into the backend laptop).
const char* WIFI_SSID  = "";
const char* WIFI_PASS  = "";
// The backend laptop's address on THAT Wi-Fi: the backend prints it as "Team LAN URL" when it starts.
const char* SERVER_URL = "http://192.168.1.10:8000/node/reading";
// Exactly the NODE_API_KEY line in Backend/.env on the laptop running the backend.
const char* NODE_KEY   = "change-me";
