/**
 * Hotel Room Concierge – NFC reader
 * Reads RC522 key card and POSTs to backend POST /api/nfc/read
 * Configure: WIFI_SSID, WIFI_PASS, SERVER_URL, ROOM_ID in config.h (or build
 * flags)
 */
#include "config.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <LiquidCrystal.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>

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
#ifndef READER_ID
#define READER_ID "reader-1"
#endif

// Pins for MFRC522 (Standard SPI)
#define RST_PIN 4
#define SS_PIN 5

// Pins for 1602A LCD (4-bit Parallel Mode)
const int rs = 13, en = 12, d4 = 14, d5 = 27, d6 = 26, d7 = 25;
const int CONTRAST_PIN = 33;  // PWM for contrast (V0)
const int BACKLIGHT_PIN = 32; // OPTIONAL: Connect LCD Pin 15 (A) here
const int BUZZER_PIN = 15;    // Active Buzzer (+) pin
const int BUTTON_PIN = 22;    // Mode Toggle Button (to GND)

LiquidCrystal lcd(rs, en, d4, d5, d6, d7);

MFRC522 mfrc522(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;

enum DeviceMode { MODE_READ, MODE_WRITE };
DeviceMode currentMode = MODE_READ;

String currentRoomID = ROOM_ID; // This reader's room (for READ mode)
String readerID = READER_ID;    // Reader identity for remote config
String roomToWrite =
    ""; // The room we are currently programming (for WRITE mode)
String lastUid = "";
unsigned long lastReadMillis = 0;
const unsigned long DEBOUNCE_MS = 2000;
bool pendingCardInspect = false;

void syncReaderRoomFromServer() {
  static unsigned long lastSync = 0;
  if (millis() - lastSync < 3000)
    return;
  lastSync = millis();

  if (WiFi.status() != WL_CONNECTED)
    return;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/reader-config/" + readerID;
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<128> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error && doc["roomId"].is<const char *>()) {
      String serverRoomID = doc["roomId"].as<String>();
      serverRoomID.trim();
      if (serverRoomID.length() > 0 && serverRoomID != currentRoomID) {
        currentRoomID = serverRoomID;
        Serial.println("Updated Room ID from server: " + currentRoomID);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Remote Room Set");
        lcd.setCursor(0, 1);
        lcd.print("Room: ");
        lcd.print(currentRoomID);
        delay(1000);
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Scan keycard...");
        lcd.setCursor(0, 1);
        lcd.print("Room: ");
        lcd.print(currentRoomID);
      }
    } else if (error) {
      Serial.println("Reader config JSON parse error: " + String(error.c_str()));
    }
  } else if (code > 0) {
    Serial.printf("Reader config sync failed: HTTP %d\n", code);
  } else {
    Serial.println("Reader config sync transport error: " +
                   http.errorToString(code));
  }
  http.end();
}

void checkForPendingCardInspect() {
  static unsigned long lastInspectPoll = 0;
  if (millis() - lastInspectPoll < 2000)
    return;
  lastInspectPoll = millis();

  if (WiFi.status() != WL_CONNECTED)
    return;

  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/inspect-card/pending";
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<64> doc;
    DeserializationError error = deserializeJson(doc, payload);
    if (!error) {
      pendingCardInspect = doc["pending"] == true;
    }
  }
  http.end();
}

void notifyServerOfInspectResult(bool success, String cardRoomID, String cardUid) {
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/inspect-card/confirm";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["success"] = success;
  if (success) {
    doc["roomId"] = cardRoomID;
    doc["cardUid"] = cardUid;
  }

  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  Serial.printf("POST %s (inspect-card) -> %d\n", url.c_str(), code);
  http.end();
}

bool notifyReadAndCheckDoorAllowed(String roomId, String uid, const char *timestampIso) {
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/read";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> reqDoc;
  reqDoc["room_id"] = roomId;
  reqDoc["card_uid"] = uid;
  reqDoc["timestamp"] = timestampIso;
  String body;
  serializeJson(reqDoc, body);

  int code = http.POST(body);
  Serial.printf("POST %s -> %d\n", url.c_str(), code);
  if (code <= 0) {
    Serial.println(http.errorToString(code));
    http.end();
    return false;
  }

  String payload = http.getString();
  Serial.println(payload);
  http.end();

  StaticJsonDocument<256> resDoc;
  DeserializationError error = deserializeJson(resDoc, payload);
  if (error) {
    Serial.println("/api/nfc/read JSON parse error: " + String(error.c_str()));
    return false;
  }

  return resDoc["doorAllowed"] == true;
}

void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Optimizing LCD Refresh: Set high frequency PWM to reduce ghosting
  analogWriteFrequency(10000);

  // Set contrast via software (PWM on V0 pin)
  // 0 is max contrast (darkest), 255 is minimum.
  // Lowering this to 30 makes text much clearer.
  analogWrite(CONTRAST_PIN, 60);

  // Set backlight brightness (PWM on Pin A)
  // Lowering this to 80 dims the screen to a comfortable level.
  analogWrite(BACKLIGHT_PIN, 120);

  // Initialize LCD (Parallel mode uses .begin instead of .init)
  lcd.begin(16, 2);
  lcd.setCursor(0, 0);
  lcd.print("Nova Concierge");
  lcd.setCursor(0, 1);
  lcd.print("Room: ");
  lcd.print(currentRoomID);

  SPI.begin();
  mfrc522.PCD_Init();

  // Prepare the key (used for MIFARE writing)
  // Default key is FFFFFFFFFFFF
  for (byte i = 0; i < 6; i++)
    key.keyByte[i] = 0xFF;

  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected. IP: " + WiFi.localIP().toString());

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Scan keycard...");
  lcd.setCursor(0, 1);
  lcd.print("Room: ");
  lcd.print(currentRoomID);
}

bool writeToCard(String data) {
  // Sector 1, Block 4
  byte blockAddr = 4;
  byte dataBlock[16];

  // Clean block
  for (byte i = 0; i < 16; i++)
    dataBlock[i] = 0;
  // Fill with data
  for (byte i = 0; i < data.length() && i < 16; i++) {
    dataBlock[i] = data[i];
  }

  // 1. Authenticate using key A
  MFRC522::StatusCode status = mfrc522.PCD_Authenticate(
      MFRC522::PICC_CMD_MF_AUTH_KEY_A, blockAddr, &key, &(mfrc522.uid));
  if (status != MFRC522::STATUS_OK) {
    Serial.print("Auth failed: ");
    Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }

  // 2. Write block
  status = mfrc522.MIFARE_Write(blockAddr, dataBlock, 16);
  if (status != MFRC522::STATUS_OK) {
    Serial.print("Write failed: ");
    Serial.println(mfrc522.GetStatusCodeName(status));
    return false;
  }

  return true;
}

String readFromCard() {
  // Sector 1, Block 4
  byte blockAddr = 4;
  byte buffer[18];
  byte size = sizeof(buffer);

  // 1. Authenticate using key A
  MFRC522::StatusCode status = mfrc522.PCD_Authenticate(
      MFRC522::PICC_CMD_MF_AUTH_KEY_A, blockAddr, &key, &(mfrc522.uid));
  if (status != MFRC522::STATUS_OK) {
    return "";
  }

  // 2. Read block
  status = mfrc522.MIFARE_Read(blockAddr, buffer, &size);
  if (status != MFRC522::STATUS_OK) {
    return "";
  }

  // 3. Convert to string
  String data = "";
  for (uint8_t i = 0; i < 16; i++) {
    if (buffer[i] == 0)
      break;
    data += (char)buffer[i];
  }
  return data;
}

// 4. ESP32 calls this to report success or failure to the check-in modal
void notifyServerOfWriteResult(bool success) {
  if (roomToWrite == "")
    return;
  HTTPClient http;
  String url = String(SERVER_URL) + "/api/nfc/confirm-write";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<64> doc;
  doc["roomId"] = roomToWrite;
  doc["success"] = success;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  Serial.printf("POST %s (confirm-write) for %s -> %d\n", url.c_str(),
                roomToWrite.c_str(), code);
  http.end();
}

void checkForPendingWrite() {
  static unsigned long lastPoll = 0;
  if (millis() - lastPoll < 2000)
    return; // Poll every 2s
  lastPoll = millis();

  HTTPClient http;

  if (currentMode == MODE_READ) {
    // Poll for our SPECIFIC room
    String url = String(SERVER_URL) + "/api/nfc/pending-write/" + currentRoomID;
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      StaticJsonDocument<128> doc;
      DeserializationError error = deserializeJson(doc, payload);
      if (!error) {
        if (doc["pending"] == true) {
          Serial.println("SERVER REQUESTED WRITE FOR OUR ROOM");
          roomToWrite = currentRoomID;
          currentMode = MODE_WRITE;
          // ... rest handled by mode check in loop
        }
      } else {
        Serial.println("JSON Parse Error: " + String(error.c_str()));
      }
    }
  } else if (currentMode == MODE_WRITE && roomToWrite != "") {
    // Check if the current write task is STILL pending or was cancelled
    String url = String(SERVER_URL) + "/api/nfc/pending-write/" + roomToWrite;
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      StaticJsonDocument<128> doc;
      DeserializationError error = deserializeJson(doc, payload);
      if (!error) {
        if (doc["pending"] == false) {
          Serial.println("WRITE TASK CANCELLED BY SERVER");
          roomToWrite = "";
          currentMode = MODE_READ;
        }
      } else {
        Serial.println("JSON Parse Error: " + String(error.c_str()));
      }
    }
  } else if (currentMode == MODE_WRITE && roomToWrite == "") {
    // Poll for ANY room
    String url = String(SERVER_URL) + "/api/nfc/any-pending-write";
    http.begin(url);
    int code = http.GET();
    if (code == 200) {
      String payload = http.getString();
      StaticJsonDocument<128> doc;
      DeserializationError error = deserializeJson(doc, payload);
      if (!error) {
        if (doc["pending"] == true) {
          roomToWrite = doc["roomId"].as<String>();
          Serial.println("GENERIC WRITE REQUESTED FOR: " + roomToWrite);
        }
      } else {
        Serial.println("JSON Parse Error: " + String(error.c_str()));
      }
    }
  }
  http.end();
}

void loop() {
  syncReaderRoomFromServer();
  checkForPendingWrite();
  checkForPendingCardInspect();

  static DeviceMode prevMode = MODE_READ;
  static String prevRoomToWrite = "";

  // Update LCD if state changed
  if (currentMode != prevMode || roomToWrite != prevRoomToWrite) {
    lcd.clear();
    if (currentMode == MODE_WRITE) {
      if (roomToWrite == "") {
        lcd.setCursor(0, 0);
        lcd.print("MODE: WRITER");
        lcd.setCursor(0, 1);
        lcd.print("WAITING FOR DB..");
      } else {
        lcd.setCursor(0, 0);
        lcd.print("WRITE ROOM: ");
        lcd.print(roomToWrite);
        lcd.setCursor(0, 1);
        lcd.print("Tap keycard...");
        // Signal with beeps
        digitalWrite(BUZZER_PIN, HIGH);
        delay(100);
        digitalWrite(BUZZER_PIN, LOW);
      }
    } else {
      lcd.setCursor(0, 0);
      lcd.print("Scan keycard...");
      lcd.setCursor(0, 1);
      lcd.print("Room: ");
      lcd.print(currentRoomID);
    }
    prevMode = currentMode;
    prevRoomToWrite = roomToWrite;
  }

  // Check for Serial commands to update Room ID
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();
    if (input.length() > 0) {
      currentRoomID = input;
      Serial.println("Updated Room ID to: " + currentRoomID);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Updated Room!");
      lcd.setCursor(0, 1);
      lcd.print("New ID: ");
      lcd.print(currentRoomID);
      delay(2000);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Scan keycard...");
      lcd.setCursor(0, 1);
      lcd.print("Room: ");
      lcd.print(currentRoomID);
    }
  }

  // Handle mode button (Active Low)
  static bool lastButtonState = HIGH;
  bool buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW && lastButtonState == HIGH) {
    currentMode = (currentMode == MODE_READ) ? MODE_WRITE : MODE_READ;
    roomToWrite = ""; // Reset room target when toggling
    delay(200);
  }
  lastButtonState = buttonState;

  // Heartbeat every 5s
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat > 5000) {
    lastHeartbeat = millis();
    Serial.printf(
        "[heartbeat] uptime=%lus wifi=%s mode=%s room=%s\n", millis() / 1000,
        WiFi.status() == WL_CONNECTED ? "ok" : "disconnected",
        currentMode == MODE_READ ? "READ" : "WRITE", currentRoomID.c_str());
  }

  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  if (currentMode == MODE_WRITE) {
    if (roomToWrite == "") {
      Serial.println(
          "Warning: Tapped card in WRITER mode but no room assigned.");
      mfrc522.PICC_HaltA();
      return;
    }
    lcd.clear();
    lcd.print("Writing...");
    bool success = writeToCard(roomToWrite);
    if (success) {
      digitalWrite(BUZZER_PIN, HIGH);
      delay(200);
      digitalWrite(BUZZER_PIN, LOW);
      lcd.clear();
      lcd.print("SUCCESS!");
      lcd.setCursor(0, 1);
      lcd.print("Card programmed");
    } else {
      lcd.clear();
      lcd.print("FAILED!");
    }

    notifyServerOfWriteResult(success);
    delay(2000);

    currentMode = MODE_READ;
    roomToWrite = "";
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }

  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10)
      uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toLowerCase();

  if (pendingCardInspect && currentMode == MODE_READ) {
    String cardRoomID = readFromCard();
    if (cardRoomID.length() > 0) {
      Serial.println("CARD INSPECT SUCCESS: Stored Room=" + cardRoomID);
      notifyServerOfInspectResult(true, cardRoomID, uid);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Card Room:");
      lcd.setCursor(0, 1);
      lcd.print(cardRoomID);
    } else {
      Serial.println("CARD INSPECT FAILED: Could not read room from card");
      notifyServerOfInspectResult(false, "", uid);
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Inspect Failed");
      lcd.setCursor(0, 1);
      lcd.print("Try again");
    }
    pendingCardInspect = false;
    delay(1500);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Scan keycard...");
    lcd.setCursor(0, 1);
    lcd.print("Room: ");
    lcd.print(currentRoomID);
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }

  // --- READ MODE LOGIC ---
  unsigned long now = millis();
  if (uid == lastUid && (now - lastReadMillis) < DEBOUNCE_MS) {
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }
  lastUid = uid;
  lastReadMillis = now;

  // 1. Read the Room ID from the card
  String cardRoomID = readFromCard();
  Serial.println("Card Scanned: UID=" + uid + " Stored Room: " + cardRoomID);

  // 2. Compare with current reader ID
  if (cardRoomID != currentRoomID) {
    // ACCESS DENIED
    Serial.println("ACCESS DENIED: Room Mismatch");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("ACCESS DENIED");
    lcd.setCursor(0, 1);
    lcd.print("Wrong Room Key");

    // Triple beep for error
    for (int i = 0; i < 3; i++) {
      digitalWrite(BUZZER_PIN, HIGH);
      delay(150);
      digitalWrite(BUZZER_PIN, LOW);
      delay(100);
    }

    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Scan keycard...");
    lcd.setCursor(0, 1);
    lcd.print("Room: ");
    lcd.print(currentRoomID);

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }

  // ISO8601-like timestamp (YYYY-MM-DDTHH:MM:SSZ). Use NTP in production.
  char iso[32];
  time_t t = time(nullptr);
  if (t > 0) {
    struct tm *tm = gmtime(&t);
    snprintf(iso, sizeof(iso), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday, tm->tm_hour,
             tm->tm_min, tm->tm_sec);
  } else {
    snprintf(iso, sizeof(iso), "1970-01-01T00:00:00Z");
  }

  bool doorAllowed = notifyReadAndCheckDoorAllowed(currentRoomID, uid, iso);
  if (!doorAllowed) {
    Serial.println("ACCESS DENIED: Backend policy rejected this card right now");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("ACCESS DENIED");
    lcd.setCursor(0, 1);
    lcd.print("Not Authorized");

    for (int i = 0; i < 3; i++) {
      digitalWrite(BUZZER_PIN, HIGH);
      delay(150);
      digitalWrite(BUZZER_PIN, LOW);
      delay(100);
    }

    delay(2000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Scan keycard...");
    lcd.setCursor(0, 1);
    lcd.print("Room: ");
    lcd.print(currentRoomID);

    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    return;
  }

  // ACCESS GRANTED
  Serial.println("ACCESS GRANTED!");

  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Door Unlocked!");
  lcd.setCursor(0, 1);
  lcd.print("Room ");
  lcd.print(currentRoomID);

  // Show second message
  delay(2000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Nova Concierge");
  lcd.setCursor(0, 1);
  lcd.print("App Activated!");

  delay(4000);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Scan keycard...");
  lcd.setCursor(0, 1);
  lcd.print("Room: ");
  lcd.print(currentRoomID);

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}
