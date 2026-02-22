# Environment variables

## Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Prisma DB URL, e.g. `file:./dev.sqlite` |
| `PORT` | Server port (default 3000) |
| `MANAGER_PASSWORD` | Dashboard login password (default `hotel-staff`) |
| `OPENAI_API_KEY` | Required for Realtime voice concierge |
| `BACKBOARD_API_KEY` | Optional; for persistent guest memory ([Backboard](https://docs.backboard.io/)) |
| `BACKBOARD_ASSISTANT_ID` | Optional; if unset, we use the first assistant or create one and cache its ID |
| `BACKBOARD_API_BASE` | Optional; default `https://app.backboard.io/api` |
| `HOTEL_WIFI_NAME` | Shown by concierge (default `Hotel-Guest`) |
| `HOTEL_WIFI_PASSWORD` | Shown by concierge (default `welcome123`) |

Copy `backend/.env.example` to `backend/.env` and set values.

## Hardware (`hardware/esp32-room-reader`)

Set via `config.h` (copy from `config.example.h`) or build flags:

- `WIFI_SSID`, `WIFI_PASS` – WiFi credentials
- `SERVER_URL` – backend URL, e.g. `http://192.168.1.100:3000`
- `ROOM_ID` – room number, e.g. `101`
