/**
 * Hotel Room Concierge – NFC reader
 * Reads RC522 key card and POSTs to backend POST /api/nfc/read
 * Configure: WIFI_SSID, WIFI_PASS, SERVER_URL, ROOM_ID in config.h (or build flags)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>

#ifndef WIFI_SSID
#define WIFI_SSID "YourSSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "YourPassword"
#endif
#ifndef SERVER_URL
#define SERVER_URL "http://192.168.1.100:3000"
#endif
#ifndef ROOM_ID
#define ROOM_ID "101"
#endif

#define RST_PIN  22
#define SS_PIN   5

MFRC522 mfrc522(SS_PIN, RST_PIN);
String lastUid = "";
unsigned long lastReadMillis = 0;
const unsigned long DEBOUNCE_MS = 2000;

void setup() {
  Serial.begin(115200);
  SPI.begin();
  mfrc522.PCD_Init();
  mfrc522.PCD_DumpVersionToSerial();
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected. IP: " + WiFi.localIP().toString());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // Debounce: ignore same card within DEBOUNCE_MS
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toLowerCase();
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  unsigned long now = millis();
  if (uid == lastUid && (now - lastReadMillis) < DEBOUNCE_MS) {
    return;
  }
  lastUid = uid;
  lastReadMillis = now;

  // ISO8601-like timestamp (YYYY-MM-DDTHH:MM:SSZ). Use NTP in production.
  char iso[32];
  time_t t = time(nullptr);
  if (t > 0) {
    struct tm* tm = gmtime(&t);
    snprintf(iso, sizeof(iso), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
             tm->tm_hour, tm->tm_min, tm->tm_sec);
  } else {
    snprintf(iso, sizeof(iso), "1970-01-01T00:00:00Z");
  }

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/read";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["room_id"] = ROOM_ID;
  doc["card_uid"] = uid;
  doc["timestamp"] = iso;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("POST %s -> %d\n", url.c_str(), code);
  if (code > 0) {
    Serial.println(http.getString());
  } else {
    Serial.println(http.errorToString(code));
  }
  http.end();
}
