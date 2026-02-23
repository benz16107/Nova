# Hotel Room Concierge (Nova)

A hotel room concierge system: **manager dashboard** for staff, **guest app** for in-room voice concierge (OpenAI Realtime API), and optional **NFC hardware** for room activation. Each guest gets isolated **persistent memory** via [Backboard](https://docs.backboard.io/).

---

## How to run locally

### Prerequisites

- **Node.js** 18+
- **OpenAI API key** – [platform.openai.com](https://platform.openai.com/) (required for voice concierge)
- **Backboard API key** (optional, for memory) – [Backboard](https://app.backboard.io/)

### Step 1: Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set at least:

- `OPENAI_API_KEY` – required for the voice concierge  
- Optionally: `BACKBOARD_API_KEY`, `BACKBOARD_ASSISTANT_ID`, `MANAGER_PASSWORD` (default: `hotel-staff`)

Then:

```bash
npm install
npx prisma db push
npm run dev
```

- Backend runs at **http://localhost:3000** (or 3001–3004 if 3000 is in use).

### Step 2: Manager dashboard

In a new terminal:

```bash
cd apps/dashboard
npm install
npm run dev
```

- Open **http://localhost:5174**
- Log in with any email; password = `MANAGER_PASSWORD` from `backend/.env` (default `hotel-staff`)

### Step 3: Guest app

In another terminal:

```bash
cd apps/guest-app
npm install
npm run dev
```

- Open **http://localhost:5175**
- **Activate** with room number + guest first and last name (create and check in the guest in the dashboard first)

### Summary

| Service        | URL                  |
|----------------|----------------------|
| Backend API    | http://localhost:3000 |
| Manager dashboard | http://localhost:5174 |
| Guest app      | http://localhost:5175 |

Run **backend** first, then **dashboard** and **guest-app** in any order.

### Demo / example data

To load an example hotel with **floors, rooms, and sample guests** (reserved, checked-in, and archived) plus **requests** and **feedback** so you can try every feature without manual data entry, run these commands **from the `backend/` directory** (Prisma and the seed script live there):

```bash
cd backend
npx prisma db push    # if you haven't already
npm run db:seed       # or: npx prisma db seed
```

If you run `prisma` or `npm run db:seed` from the repo root you’ll get “schema not found” or “package.json not found”; always `cd backend` first.

This seeds:

- **Hotel layout:** 3 floors with 6, 6, and 4 rooms (101–106, 201–206, 301–304).
- **Rooms:** All 16 rooms created.
- **Guests:** Mix of **reserved** (301, 302), **checked-in** (101–104, some with 2 guests), and **archived** (201–204).
- **Requests:** Open and closed requests/complaints for Activity and AI digest.
- **Feedback:** A few entries for archived guests (Feedback tab).

**Guest app — try Nova:** Activate with **Room 101**, First **Jane**, Last **Smith** (or Room 102 / John Doe, Room 103 / Emma Wilson, Room 104 / James Brown or Lisa Brown). Then open Nova and use voice or text. To see the **checked-out + feedback** flow, check out that guest from the dashboard, then reopen the guest app.

**Dashboard:** Use the Guests & Rooms tab to check in/out, run checkout summary (e.g. Room 104 has 2 guests and requests), archive, restore, and delete. Use Activity for requests and AI digest; Feedback tab for collected feedback.

**Exiting the demo / resetting data:** To clear all data (including demo seed) and start with an empty database, from the `backend/` directory remove the SQLite file and re-push the schema:

```bash
cd backend
rm -f prisma/dev.sqlite
npx prisma db push
```

(If your `DATABASE_URL` in `.env` points to a different path, delete that file instead.) The dashboard and guest app will then show no rooms or guests until you add them again.

---

## Repo layout

| Path | Description |
|------|-------------|
| `backend/` | Node.js (TypeScript), Express, Prisma (SQLite). REST API + WebSocket Realtime proxy, Backboard client. |
| `apps/dashboard/` | Manager SPA (React, Vite). Guests & rooms, requests & complaints. |
| `apps/guest-app/` | Guest PWA (React, Vite). Activate (room + name), Concierge voice screen. |
| `hardware/esp32-room-reader/` | ESP32 + RC522 NFC; POST to `/api/nfc/read` on card read. |
| `docs/` | [Environment variables](docs/env.md), [API reference](docs/api.md). |

## Features

- **Manager dashboard** – Guests & rooms (add, edit, check-in, check-out, archive, delete). View requests & complaints. Auto-refresh and polling.
- **Guest app** – Activate with room number + first and last name. Voice concierge only works after **check-in**; **check-out** disables the account and moves the guest to the archived list.
- **Voice concierge (Nova)** – OpenAI Realtime API: WiFi info, log requests/complaints, request amenities. Configurable prompt, voice, model, and Backboard memory in **`nova-config.ts`** (project root).
- **Per-guest memory** – Backboard stores memories per guest (per stay). One Backboard thread per guest.
- **Archived guests** – Check-out auto-archives; manual **Archive** also available. Archived list shows reason (Checked out / Manual archive) and time.
- **Optional** – ESP32 + NFC reader for key-card activation (`hardware/esp32-room-reader`).

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
