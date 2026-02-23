# Hotel Room Concierge – API

Base URL: `http://localhost:3000` (or your backend URL).

## Auth (manager)

- **POST /api/auth/login**  
  Body: `{ "email": "...", "password": "..." }`.  
  Returns: `{ "token": "..." }`. Use `MANAGER_PASSWORD` env (default `hotel-staff`).

## Guests & rooms

- **GET /api/guests** – list all guests (with room).
- **GET /api/guests/:id** – get one guest.
- **POST /api/guests** – create guest. Body: `{ "firstName", "lastName", "roomId" }`.
- **PUT /api/guests/:id** – update guest. Body: optional `firstName`, `lastName`, `roomId`.
- **GET /api/rooms** – list rooms with primary guest.

## NFC (device)

- **POST /api/nfc/read**  
  Body: `{ "room_id": "101", "card_uid": "a1b2c3d4", "timestamp": "ISO8601" }`.  
  Resolves guest for room, activates concierge session, sends push to guest app.

## Guest app

- **GET /api/me** – query: `guest_token` or `guestId`. Returns `{ guest, conciergeActive }`.
- **POST /api/me/activate** – body: `{ "roomId", "lastName", "pushToken?" }`. Returns `{ guest, token }`.
- **WebSocket /api/realtime/connect?guest_token=...** – voice session (audio relay to OpenAI Realtime).

## Manager dashboard

- **GET /api/requests** – query: optional `type`, `roomId`. List requests/complaints.
- **GET /api/complaints** – list complaints only.
- **GET /api/guests/:id** – get one guest. Query `?include=memories` to include Backboard memories.
- **GET /api/guests/:id/memories** – Backboard memories for this guest (stay context).
- **GET /api/guests/:id/check-out-summary** – guest + requests + memories for pre–check-out confirmation.
- **GET /api/guests/:id/export** – guest summary + memories + requests (for print/handover).
- **GET /api/memories/recent** – query: optional `limit` (default 10). Latest memories across all guests.
- **GET /api/memories/search** – query: `q`. Search memories by content.
- **GET /api/memories/room/:roomNumber/previous-stay** – memories from the last archived guest in this room (handover).
