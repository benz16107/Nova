# ESP32 Room NFC Reader

Reads guest key cards via RC522 and POSTs to the backend `POST /api/nfc/read`.

## Wiring (SPI)

| RC522 | ESP32 |
|-------|--------|
| SDA   | GPIO 5 (SS_PIN) |
| SCK   | GPIO 18 |
| MOSI  | GPIO 23 |
| MISO  | GPIO 19 |
| RST   | GPIO 22 |
| 3.3V  | 3.3V   |
| GND   | GND    |

## Config

Set `WIFI_SSID`, `WIFI_PASS`, `SERVER_URL`, and `ROOM_ID`:

- Copy `config.example.h` to `config.h` and edit, then in `main.cpp` add `#include "config.h"` at the top; or
- Use PlatformIO `build_flags` in `platformio.ini`:
  `-DWIFI_SSID=\"...\" -DWIFI_PASS=\"...\" -DSERVER_URL=\"http://...\" -DROOM_ID=\"101\"`

## Build & upload

```bash
cd hardware/esp32-room-reader
pio run
pio run -t upload
```

## Payload

Each read sends:

```json
{ "room_id": "101", "card_uid": "a1b2c3d4", "timestamp": "2025-02-21T12:00:00Z" }
```

Backend resolves the guest for that room and activates the concierge session (push to guest app).
