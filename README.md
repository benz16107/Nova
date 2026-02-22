# Hotel Room Concierge

A hotel room concierge system: **manager dashboard** for staff, **guest app** for in-room voice concierge (OpenAI Realtime API), and optional **NFC hardware** for room activation. Each guest gets isolated **persistent memory** via [Backboard](https://docs.backboard.io/). Requests and complaints are logged and shown on the dashboard.

## Features

- **Manager dashboard** – Guests & rooms (add, edit, check-in, check-out, archive, delete). View requests & complaints. Auto-refresh and polling.
- **Guest app** – Activate with room number + first and last name. Voice concierge only works after **check-in**; **check-out** disables the account and moves the guest to the archived list.
- **Voice concierge (Nova)** – OpenAI Realtime API: WiFi info, log requests/complaints, request amenities. Configurable prompt, voice, model, and Backboard memory in **`nova-config.ts`** (project root).
- **Per-guest memory** – Backboard stores memories per guest (per stay). One Backboard thread per guest.
- **Archived guests** – Check-out auto-archives; manual **Archive** also available. Archived list shows reason (Checked out / Manual archive) and time.
- **Optional** – ESP32 + NFC reader for key-card activation (`hardware/esp32-room-reader`).

## Repo layout

| Path | Description |
|------|-------------|
| `backend/` | Node.js (TypeScript), Express, Prisma (SQLite). REST API + WebSocket Realtime proxy, Backboard client. |
| `apps/dashboard/` | Manager SPA (React, Vite). Guests & rooms, requests & complaints. |
| `apps/guest-app/` | Guest PWA (React, Vite). Activate (room + first and last name), Concierge voice screen. |
| `hardware/esp32-room-reader/` | ESP32 + RC522 NFC; POST to `/api/nfc/read` on card read. |
| `docs/` | [Environment variables](docs/env.md), [API reference](docs/api.md). |

## Prerequisites

- **Node.js** 18+
- **OpenAI API key** (required for voice concierge) – [platform.openai.com](https://platform.openai.com/)
- **Backboard API key** (optional, for memory) – [Backboard](https://app.backboard.io/)

## Run locally

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: set OPENAI_API_KEY (required). Optionally BACKBOARD_API_KEY.
npm install
npx prisma db push
npm run dev
```

- Server: **http://localhost:3000**
- If port 3000 is in use, the server tries 3001–3004.

### 2. Manager dashboard

```bash
cd apps/dashboard
npm install
npm run dev
```

- Open **http://localhost:5174**
- Login: any email, password = value of `MANAGER_PASSWORD` in `backend/.env` (default `hotel-staff`)
- Proxy: `/api` → backend (localhost:3000)

### 3. Guest app

```bash
cd apps/guest-app
npm install
npm run dev
```

- Open **http://localhost:5175**
- Proxy: `/api` and WebSocket → backend
- **Activate** with room number and guest first and last name (create the guest in the dashboard first, then check them in)

### 4. Hardware (optional)

In `hardware/esp32-room-reader`: set WiFi and `SERVER_URL` (backend URL), then build/upload with PlatformIO.

## Configuration

- **Backend env** – See [docs/env.md](docs/env.md). Copy `backend/.env.example` to `backend/.env`. Required: `OPENAI_API_KEY`. Optional: `BACKBOARD_API_KEY`, `BACKBOARD_ASSISTANT_ID`, `HOTEL_WIFI_NAME`, `HOTEL_WIFI_PASSWORD`, `PORT`, `MANAGER_PASSWORD`.
- **Nova & memory** – Edit **`nova-config.ts`** (project root): concierge instructions, welcome message, model, voice, turn detection, Backboard assistant name/prompt, and how many memories to include in context. Restart the backend after changes.

## Manager workflow

1. **Add guest** – First name, last name, room number. Room is created if needed.
2. **Check-in** – Enables the room concierge for that guest. They can then activate the guest app (room + first and last name) and use voice.
3. **Check-out** – Disables the guest’s concierge access and **auto-archives** them into the archived list.
4. **Archive** – Manually archive an active guest (they move to archived list and are disabled).
5. **Archived list** – Shows “Archived via” (Checked out / Manual archive) and time. Delete to remove from list.
6. **Requests & complaints** – Listed on the Requests page when the concierge logs them.

## Guest workflow

1. Open the guest app → **Activate** with room number and first and last name. Only works if the guest is **checked in** and not checked out.
2. After activation, open **Concierge** for voice. The agent can give WiFi info, log requests/complaints, and request amenities.
3. If the guest is **checked out**, activation fails and the app shows that the stay has ended.

## API & docs

- [Environment variables](docs/env.md)
- [API reference](docs/api.md)
