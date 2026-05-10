/*
 * AgriSense — Sensor & Actuator Node (Plain ESP32)
 * ─────────────────────────────────────────────────────────────
 * Flash this to the PLAIN ESP32 (38-pin, NOT the ESP32-CAM).
 *
 * HOW TO USE:
 *   1. Power on this ESP32. It connects to your Home Wi-Fi station.
 *   2. Note the IP address printed in the Serial Monitor (e.g. 192.168.29.X).
 *   3. Update your `agrisense_vision_backend.py` with this IP address.
 */

#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ─── Home Wi-Fi Credentials ───────────────────────────────────────────────────
#define WIFI_SSID  "Jiofiber-4gh"
#define WIFI_PASS  "bharat@9051"

// ─── Sensor pins ──────────────────────────────────────────────────────────────
#define SENSOR_L_TRIG   12
#define SENSOR_L_ECHO   13
#define SENSOR_R_TRIG   14
#define SENSOR_R_ECHO   15

// ─── Unsafe alerts (buzzer + LED) ─────────────────────────────────────────────
#define WARN_CM  80
#define STOP_CM  30

#define LED_PIN     5
#define BUZZER_PIN  25

// Manual override flags — set by app/backend HTTP commands
bool manualBuzzer = false;
bool manualLight  = false;

// ─── Config ───────────────────────────────────────────────────────────────────
#define MAX_CM              250
#define SENSOR_SPACING_CM   8.0f   
#define WS_INTERVAL_MS      80     

WebServer        httpServer(80);
WebSocketsServer wsServer(81);

// ─── Ultrasonic read ──────────────────────────────────────────────────────────
float readHCSR04(int trig, int echo) {
  digitalWrite(trig, LOW);  delayMicroseconds(2);
  digitalWrite(trig, HIGH); delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long t = pulseIn(echo, HIGH, 30000);  // 30 ms timeout
  if (t <= 0) return -1.0f;
  return t * 0.0343f / 2.0f;
}

void fuseSensors(float dL, float dR, float &dist, float &angle, bool &valid) {
  bool okL = (dL >= 2.0f && dL <= MAX_CM);
  bool okR = (dR >= 2.0f && dR <= MAX_CM);

  if (!okL && !okR) { dist = -1; angle = 0;     valid = false; return; }
  if (!okL)         { dist = dR; angle =  25.0f; valid = true;  return; }
  if (!okR)         { dist = dL; angle = -25.0f; valid = true;  return; }

  dist  = (dL + dR) / 2.0f;
  angle = ((dL - dR) / SENSOR_SPACING_CM) * 15.0f;
  angle = constrain(angle, -45.0f, 45.0f);
  valid = true;
}

void onWsEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t len) {
  if (type == WStype_CONNECTED)
    Serial.printf("[WS] Client #%u connected\n", num);
  else if (type == WStype_DISCONNECTED)
    Serial.printf("[WS] Client #%u disconnected\n", num);
}

static unsigned long lastBeepMs  = 0;
static unsigned long beepUntilMs = 0;

void broadcastSensors() {
  float dL = readHCSR04(SENSOR_L_TRIG, SENSOR_L_ECHO);
  delay(10);
  float dR = readHCSR04(SENSOR_R_TRIG, SENSOR_R_ECHO);

  float dist, angle;
  bool  valid;
  fuseSensors(dL, dR, dist, angle, valid);

  unsigned long now = millis();

  if (beepUntilMs && now >= beepUntilMs) {
    noTone(BUZZER_PIN);
    digitalWrite(LED_PIN, LOW);
    beepUntilMs = 0;
  }

  bool unsafe = valid && (dist > 0) && (dist <= WARN_CM);
  if (!manualBuzzer) {
    if (!unsafe) {
      if (beepUntilMs) {
        noTone(BUZZER_PIN);
        beepUntilMs = 0;
      }
    } else {
      unsigned long periodMs;
      unsigned long durationMs;
      int toneHz;

      if (dist <= STOP_CM) {
        periodMs   = 180;
        durationMs = 120;
        toneHz     = 2000;
      } else {
        periodMs   = 350;
        durationMs = 80;
        toneHz     = 1200;
      }

      if (beepUntilMs == 0 && (now - lastBeepMs) >= periodMs) {
        lastBeepMs = now;
        tone(BUZZER_PIN, toneHz);
        if (!manualLight) digitalWrite(LED_PIN, HIGH);
        beepUntilMs = now + durationMs;
      }
    }
  }

  StaticJsonDocument<256> doc;
  doc["dL"]    = (dL < 2 || dL > MAX_CM) ? 0.0f : dL;
  doc["dR"]    = (dR < 2 || dR > MAX_CM) ? 0.0f : dR;
  doc["dist"]  = dist < 0 ? 0.0f : dist;
  doc["angle"] = angle;
  doc["valid"] = valid;
  doc["alert"] = unsafe ? "Warning: Critical proximity!" : "";

  String json;
  serializeJson(doc, json);
  wsServer.broadcastTXT(json);
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== AgriSense Sensor Node ===");

  pinMode(SENSOR_L_TRIG, OUTPUT); pinMode(SENSOR_L_ECHO, INPUT);
  pinMode(SENSOR_R_TRIG, OUTPUT); pinMode(SENSOR_R_ECHO, INPUT);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  pinMode(BUZZER_PIN, OUTPUT);
  noTone(BUZZER_PIN);

  // Hardcoded Static IP for JioFiber
  IPAddress local_IP(192, 168, 29, 200);
  IPAddress gateway(192, 168, 29, 1);
  IPAddress subnet(255, 255, 255, 0);
  IPAddress primaryDNS(8, 8, 8, 8);
  IPAddress secondaryDNS(8, 8, 4, 4);

  WiFi.mode(WIFI_STA);
  if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
    Serial.println("STA Failed to configure");
  }
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to Station WiFi: %s", WIFI_SSID);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Local IP Address: ");
  Serial.println(WiFi.localIP());

  // ─── App / Backend control endpoints ─────────────────────────
  httpServer.on("/buzzer", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    String s = httpServer.arg("state");
    if (s == "on") {
      manualBuzzer = true;
      tone(BUZZER_PIN, 1000);
    } else {
      manualBuzzer = false;
      noTone(BUZZER_PIN);
    }
    httpServer.send(200, "text/plain", "OK");
  });

  httpServer.on("/light", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    String s = httpServer.arg("state");
    manualLight = (s == "on");
    digitalWrite(LED_PIN, manualLight ? HIGH : LOW);
    httpServer.send(200, "text/plain", "OK");
  });

  httpServer.on("/status", HTTP_GET, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    
    float dL = readHCSR04(SENSOR_L_TRIG, SENSOR_L_ECHO);
    delay(10);
    float dR = readHCSR04(SENSOR_R_TRIG, SENSOR_R_ECHO);
    float dist, angle; bool valid;
    fuseSensors(dL, dR, dist, angle, valid);
    bool unsafe = valid && (dist > 0) && (dist <= WARN_CM);

    String json = "{\"node\":\"sensor\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"buzzer\":" +
                  String(manualBuzzer ? "true" : "false") + ",\"light\":" +
                  String(manualLight  ? "true" : "false") + 
                  ",\"distance\":" + String(dist < 0 ? 0 : dist) +
                  ",\"alert\":" + (unsafe ? "\"Critical distance detected!\"" : "null") + "}";
    httpServer.send(200, "application/json", json);
  });

  httpServer.on("/buzzer", HTTP_OPTIONS, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    httpServer.sendHeader("Access-Control-Allow-Headers", "*");
    httpServer.send(204);
  });

  httpServer.on("/light", HTTP_OPTIONS, []() {
    httpServer.sendHeader("Access-Control-Allow-Origin", "*");
    httpServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    httpServer.sendHeader("Access-Control-Allow-Headers", "*");
    httpServer.send(204);
  });

  httpServer.begin();
  wsServer.begin();
  wsServer.onEvent(onWsEvent);
  
  Serial.println("HTTP and WebSocket servers started.");
}

static unsigned long lastBroadcast = 0;

void loop() {
  httpServer.handleClient();
  wsServer.loop();

  if (millis() - lastBroadcast >= WS_INTERVAL_MS) {
    lastBroadcast = millis();
    broadcastSensors();
  }
}