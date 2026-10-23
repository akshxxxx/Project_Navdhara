/*
  Raah Node firmware 2.1 - ESP32 DevKit (ESP-WROOM-32)
  ======================================================
  Wiring (team diagram, 2026-10-23), everything on the 3V3 rail and common GND:
    MPU6050 (tilt + vibration)   SDA -> GPIO21, SCL -> GPIO22        (3V3 only, not 5 V)
    Soil moisture (LM393)        AO  -> GPIO34   dry 4095, wet ~1250
    Rain plate (LM393)           AO  -> GPIO35   dry 4095, wet ~2400
    Traffic light                G -> GPIO26 (OK), Y -> GPIO27 (watch/warning), R -> GPIO33 (alarm)
    Active buzzer                + -> GPIO25, - -> GND

  Once a second the node sends one reading:
    * over Wi-Fi to SERVER_URL (if WIFI_SSID is set), header X-Node-Key;
    * always on USB serial at 115200 baud as one JSON line ending in "posted":0/1.
      The backend reads that line by itself when the board is plugged into its laptop
      (Backend/app/serial_ingest.py, NODE_SERIAL=auto) and skips lines already posted over Wi-Fi.
  Other serial lines: READY..., CAL,OK..., CFG,MPU_FAIL, NET,WIFI_UP..., NET,POST_FAIL,<code>.
  Type ZERO + Enter in the Serial Monitor to re-zero the tilt after mounting the node.

  Keep the node still for the first 2 seconds after power-on: that sets "0 degrees".
  No extra libraries: WiFi, HTTPClient and Wire come with the ESP32 Arduino core.
  Bench-calibrated prototype. Not certified prediction and not an official warning.
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <math.h>

// Wi-Fi name/password, SERVER_URL and NODE_KEY live in secrets.h next to this file (git-ignored).
// First time: copy secrets.example.h to secrets.h and fill it in. A wrong NODE_KEY gives
// NET,POST_FAIL,401 on the Serial Monitor.
#include "secrets.h"

// ============================== CONFIG ==============================
const char* NODE_ID    = "NODE1";            // no MOCK- / SIM- / REPLAY prefix for real hardware
const char* SEGMENT_ID = "seg_05";           // stretch where the node is installed
const char* FW_VERSION = "2.1.0";
// ===================================================================

const int PIN_SDA = 21, PIN_SCL = 22, PIN_SOIL = 34, PIN_RAIN = 35;
const int PIN_G = 26, PIN_Y = 27, PIN_R = 33, PIN_BUZZ = 25;

// Bench calibration of the LM393 boards (12-bit ADC)
const int SOIL_DRY = 4095, SOIL_WET = 1250;
const int RAIN_DRY = 4095, RAIN_WET = 2400;
const float RAIN_WET_PCT = 50.0;

// Thresholds: same numbers as Backend/app/node_sensors.py
const float TILT_WATCH = 2.0, TILT_WARN = 5.0, TILT_ALARM = 8.0;   // degrees
const float RATE_WARN = 3.0, RATE_ALARM = 8.0;                     // degrees per minute
const float VIB_WARN_RMS = 0.10, IMPACT_G = 0.35, SEVERE_G = 0.80; // g
const float MOIST_SAT = 70.0, WET_FACTOR = 0.6;                    // wet soil: tilt/rate thresholds x 0.6
const uint32_t HOLD_MS = 5000;                                     // stay in a higher state at least 5 s

enum State { S_OK = 0, S_WATCH = 1, S_WARNING = 2, S_ALARM = 3 };
const char* STATE_NAME[] = {"OK", "WATCH", "WARNING", "ALARM"};

// ---------- MPU6050 (raw registers, no library) ----------
const uint8_t MPU = 0x68;
bool mpuOk = false, haveBase = false;
float base[3] = {0, 0, 1}, lp[3] = {0, 0, 1};
uint32_t lastMpuTry = 0;

void writeReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

bool mpuInit() {
  Wire.beginTransmission(MPU);
  Wire.write(0x6B);  // PWR_MGMT_1: wake up
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) return false;
  writeReg(0x1C, 0x00);  // accel +-2 g
  writeReg(0x1A, 0x03);  // digital low-pass ~44 Hz
  return true;
}

bool mpuRead(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);  // ACCEL_XOUT_H
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU, (uint8_t)6) != 6) return false;
  int16_t v[3];
  for (int i = 0; i < 3; i++) {
    uint8_t hi = Wire.read();  // two statements: the high byte must be read first
    uint8_t lo = Wire.read();
    v[i] = (int16_t)((hi << 8) | lo);
  }
  ax = v[0] / 16384.0f;
  ay = v[1] / 16384.0f;
  az = v[2] / 16384.0f;
  return true;
}

void calibrate() {
  float s[3] = {0, 0, 0};
  int n = 0;
  for (int i = 0; i < 200; i++) {
    float ax, ay, az;
    if (mpuRead(ax, ay, az)) { s[0] += ax; s[1] += ay; s[2] += az; n++; }
    delay(10);
  }
  if (n < 50) {
    mpuOk = false;
    haveBase = false;
    Serial.println("CAL,FAIL");
    return;
  }
  for (int i = 0; i < 3; i++) { base[i] = s[i] / n; lp[i] = base[i]; }
  haveBase = true;
  Serial.printf("CAL,OK,%.3f,%.3f,%.3f\n", base[0], base[1], base[2]);
}

float angleDeg(const float a[3], const float b[3]) {
  float na = sqrtf(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  float nb = sqrtf(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
  if (na < 0.2f || nb < 0.2f) return NAN;
  float c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (na * nb);
  c = fmaxf(-1.0f, fminf(1.0f, c));
  return acosf(c) * 57.29578f;
}

// ---------- 1-second window ----------
float winPeak = 0, winSq = 0;
int winN = 0;
float tiltHist[60];
float peakHist[10];
uint32_t histCount = 0;

void sampleImu() {
  if (!mpuOk) {
    if (millis() - lastMpuTry > 2000) {
      lastMpuTry = millis();
      if (mpuInit()) {
        mpuOk = true;
        Serial.println("CFG,MPU_OK");
        if (!haveBase) calibrate();
      }
    }
    return;
  }
  float a[3];
  if (!mpuRead(a[0], a[1], a[2])) {
    mpuOk = false;
    Serial.println("CFG,MPU_FAIL");
    return;
  }
  // Slow average = gravity (tilt); what is left over = vibration
  for (int i = 0; i < 3; i++) lp[i] += 0.05f * (a[i] - lp[i]);
  float dx = a[0] - lp[0], dy = a[1] - lp[1], dz = a[2] - lp[2];
  float d = sqrtf(dx * dx + dy * dy + dz * dz);
  if (d > winPeak) winPeak = d;
  winSq += d * d;
  winN++;
}

int readAdc(int pin) {
  long s = 0;
  for (int i = 0; i < 16; i++) s += analogRead(pin);
  return (int)(s / 16);
}

float rawToPct(int raw, int dry, int wet) {
  float p = (float)(dry - raw) / (float)(dry - wet) * 100.0f;
  return fmaxf(0.0f, fminf(100.0f, p));
}

// ---------- state ----------
State cur = S_OK;
uint32_t stateSince = 0;
uint32_t seq = 0;

State classify(float tilt, float rate, float vrms, float vpk, float moist, int rainWet) {
  float f = moist >= MOIST_SAT ? WET_FACTOR : 1.0f;
  bool impactConfirmed = vpk >= SEVERE_G || (vpk >= IMPACT_G && tilt >= TILT_WATCH);
  if (tilt >= TILT_ALARM * f || rate >= RATE_ALARM * f || impactConfirmed) return S_ALARM;
  if (tilt >= TILT_WARN * f || rate >= RATE_WARN * f || vrms >= VIB_WARN_RMS || vpk >= IMPACT_G) return S_WARNING;
  if (tilt >= TILT_WATCH * f || moist >= MOIST_SAT || rainWet) return S_WATCH;
  return S_OK;
}

// ---------- network task (core 0) ----------
struct Msg { char body[640]; };
QueueHandle_t netQ;
Msg outMsg;
volatile int lastRtt = -1;
bool useWifi = false;

void netTask(void*) {
  Msg m;
  bool wasUp = false;
  uint32_t lastTry = 0;
  if (useWifi) {
    WiFi.mode(WIFI_STA);
    WiFi.setSleep(false);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    lastTry = millis();
  }
  for (;;) {
    if (useWifi) {
      bool up = WiFi.status() == WL_CONNECTED;
      if (up && !wasUp) Serial.printf("NET,WIFI_UP,%s,%d\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
      if (!up && wasUp) Serial.println("NET,WIFI_DOWN");
      wasUp = up;
      if (!up && millis() - lastTry > 10000) {
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASS);
        lastTry = millis();
      }
    }
    if (xQueueReceive(netQ, &m, pdMS_TO_TICKS(1000)) != pdTRUE) continue;

    int posted = 0;
    if (useWifi && WiFi.status() == WL_CONNECTED) {
      static char body[720];
      snprintf(body, sizeof(body), "%s,\"rssi_dbm\":%d,\"rtt_ms\":%d}", m.body, (int)WiFi.RSSI(), (int)lastRtt);
      HTTPClient http;
      http.setConnectTimeout(1500);
      http.setTimeout(1500);
      if (http.begin(SERVER_URL)) {
        http.addHeader("Content-Type", "application/json");
        http.addHeader("X-Node-Key", NODE_KEY);
        uint32_t t0 = millis();
        int code = http.POST((uint8_t*)body, strlen(body));
        lastRtt = (int)(millis() - t0);
        http.end();
        posted = (code == 200 || code == 201) ? 1 : 0;
        if (!posted) Serial.printf("NET,POST_FAIL,%d\n", code);
      }
    }
    Serial.printf("%s,\"rtt_ms\":%d,\"posted\":%d}\n", m.body, (int)lastRtt, posted);
  }
}

// ---------- one reading per second ----------
void report() {
  float vpk = winN ? winPeak : 0.0f;
  float vrms = winN ? sqrtf(winSq / winN) : 0.0f;
  winPeak = 0; winSq = 0; winN = 0;

  float tilt = (mpuOk && haveBase) ? angleDeg(base, lp) : NAN;
  int slot = histCount % 60;
  tiltHist[slot] = tilt;
  peakHist[histCount % 10] = vpk;
  histCount++;

  float rate = 0;
  if (!isnan(tilt) && histCount > 3) {
    int back = histCount - 1 < 10 ? histCount - 1 : 10;
    float old = tiltHist[(slot - back + 60) % 60];
    if (!isnan(old)) rate = fabsf(tilt - old) * 60.0f / back;
  }
  int strikes = 0;
  int have = histCount < 10 ? histCount : 10;
  for (int i = 0; i < have; i++) if (peakHist[i] >= IMPACT_G) strikes++;

  int soilRaw = readAdc(PIN_SOIL), rainRaw = readAdc(PIN_RAIN);
  float moist = rawToPct(soilRaw, SOIL_DRY, SOIL_WET);
  float rainPct = rawToPct(rainRaw, RAIN_DRY, RAIN_WET);
  int rainWet = rainPct >= RAIN_WET_PCT ? 1 : 0;

  State s = classify(isnan(tilt) ? 0 : tilt, rate, vrms, vpk, moist, rainWet);
  if (!mpuOk && s < S_WATCH) s = S_WATCH;  // a dead tilt sensor must not look safe
  uint32_t now = millis();
  if (s > cur || (s < cur && now - stateSince >= HOLD_MS)) {
    if (s != cur) stateSince = now;
    cur = s;
  } else if (s == cur) {
    // keep the hold timer running from the last time the state was confirmed high
    if (s > S_OK) stateSince = now;
  }

  seq++;
  int n = snprintf(outMsg.body, sizeof(outMsg.body),
                   "{\"node_id\":\"%s\",\"segment_id\":\"%s\",\"state\":\"%s\",\"seq\":%lu,\"fw\":\"%s\","
                   "\"uptime_s\":%lu,\"heap_free\":%u,\"link\":\"%s\",\"mpu_ok\":%d",
                   NODE_ID, SEGMENT_ID, STATE_NAME[cur], (unsigned long)seq, FW_VERSION,
                   (unsigned long)(now / 1000), (unsigned)ESP.getFreeHeap(), useWifi ? "wifi" : "serial", mpuOk ? 1 : 0);
  if (!isnan(tilt)) {
    n += snprintf(outMsg.body + n, sizeof(outMsg.body) - n,
                  ",\"tilt_deg\":%.2f,\"tilt_rate_dpm\":%.2f,\"vib_g\":%.3f,\"vib_rms_g\":%.3f,\"strikes_10s\":%d",
                  tilt, rate, vpk, vrms, strikes);
  }
  snprintf(outMsg.body + n, sizeof(outMsg.body) - n,
           ",\"moisture_pct\":%.1f,\"soil_raw\":%d,\"rain_pct\":%.1f,\"rain_raw\":%d,\"rain_wet\":%d,\"vib_thr_g\":%.2f",
           moist, soilRaw, rainPct, rainRaw, rainWet, VIB_WARN_RMS);
  xQueueOverwrite(netQ, &outMsg);  // the network task always gets the newest reading
}

// ---------- lights and buzzer ----------
void driveOutputs(uint32_t now) {
  bool blink = (now / 500) % 2;
  bool beep = (now / 250) % 2;
  digitalWrite(PIN_G, cur == S_OK ? HIGH : LOW);
  digitalWrite(PIN_Y, cur == S_WARNING ? HIGH : (cur == S_WATCH ? blink : LOW));
  digitalWrite(PIN_R, cur == S_ALARM ? HIGH : LOW);
  digitalWrite(PIN_BUZZ, cur == S_ALARM ? beep : LOW);
}

void selfTest() {
  int pins[] = {PIN_G, PIN_Y, PIN_R};
  for (int p : pins) { digitalWrite(p, HIGH); delay(200); digitalWrite(p, LOW); }
  digitalWrite(PIN_BUZZ, HIGH); delay(100); digitalWrite(PIN_BUZZ, LOW);
}

void readCommands() {
  static char buf[16];
  static int len = 0;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      buf[len] = 0;
      if (len && strcasecmp(buf, "ZERO") == 0) { Serial.println("CAL,ZERO"); calibrate(); }
      len = 0;
    } else if (len < (int)sizeof(buf) - 1) {
      buf[len++] = c;
    }
  }
}

uint32_t lastSample = 0, lastReport = 0;

void setup() {
  Serial.begin(115200);
  delay(200);
  pinMode(PIN_G, OUTPUT); pinMode(PIN_Y, OUTPUT); pinMode(PIN_R, OUTPUT); pinMode(PIN_BUZZ, OUTPUT);
  selfTest();
  analogReadResolution(12);

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  mpuOk = mpuInit();
  if (mpuOk) calibrate(); else Serial.println("CFG,MPU_FAIL");

  useWifi = strlen(WIFI_SSID) > 0;
  Serial.printf("READY,RAAH_NODE,%s,%s,%s,%s\n", FW_VERSION, NODE_ID, SEGMENT_ID, useWifi ? "wifi+usb" : "usb");
  netQ = xQueueCreate(1, sizeof(Msg));
  xTaskCreatePinnedToCore(netTask, "net", 8192, nullptr, 1, nullptr, 0);
  lastSample = lastReport = millis();
}

void loop() {
  uint32_t now = millis();
  if (now - lastSample >= 10) {           // 100 Hz
    lastSample = (now - lastSample > 100) ? now : lastSample + 10;
    sampleImu();
  }
  if (now - lastReport >= 1000) {         // 1 reading per second
    lastReport += 1000;
    if (now - lastReport > 5000) lastReport = now;
    report();
  }
  driveOutputs(now);
  readCommands();
}
