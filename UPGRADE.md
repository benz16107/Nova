# Upgrade, 2026-09-29

Nova was last touched in February 2026. This pass revives it on macserver's toolchain (Node 26.9.0,
npm 11.19.1, Flutter 3.47.4 / Dart 3.13.3) and moves each web app and the backend to the latest
stable major of every dependency. Flutter gets in-range updates only; two majors are deferred (see
below). Every command in the task passes; the outputs are at the end.

## How the base was chosen

The task asked for two arena paths. The `arena` skill cannot be started by the model
(`disable-model-invocation`), so I ran both paths myself, one after the other:

- **Path (a), minimal.** The unchanged repo already passed `npm ci`, `tsc --noEmit` and
  `npm run build` in all three web apps, and `flutter analyze` reported 0 issues. The only gaps were
  missing `typecheck`/`test` scripts, no tests at all, and a Realtime model that OpenAI has shut
  down. The minimal path therefore needs almost no dependency changes.
- **Path (b), full.** I moved every dependency to its latest major in a scratch copy
  (`/tmp/nova-full`). Every break came up in the typecheck, the build or a live smoke test, and
  each one had a small fix (listed below).

Base: path (a). I then grafted every path (b) upgrade that I could verify on this machine.
The Flutter `record` 7 and `permission_handler` 13 majors could not be verified on Android here,
so I left them out.

## Version changes

Resolved versions from the lockfiles, before and after.

### backend

| Package | Before | After |
|---|---|---|
| @prisma/client | ^5.22.0 (5.22.0) | ^7.10.0 (7.10.0) |
| prisma (dev) | ^5.22.0 (5.22.0) | ^7.10.0 (7.10.0) |
| @prisma/adapter-better-sqlite3 | not installed | ^7.10.0 (7.10.0), new |
| better-sqlite3 (via adapter) | not installed | 12.11.1 |
| express | ^4.21.0 (4.22.1) | ^5.2.1 (5.2.1) |
| @types/express (dev) | ^4.17.21 (4.17.25) | ^5.0.6 |
| openai | ^6.22.0 (6.22.0) | ^7.23.0 (7.23.0) |
| dotenv | ^16.4.5 (16.6.1) | ^18.0.4 |
| express-rate-limit | ^7.4.1 (7.5.1) | ^8.7.0 |
| ws | ^8.18.0 (8.19.0) | ^8.22.0 |
| cors | ^2.8.5 (2.8.6) | ^2.8.6 (2.8.6) |
| typescript (dev) | ^5.6.3 (5.9.3) | ^7.0.2 |
| tsx (dev) | ^4.19.2 (4.21.0) | ^4.23.15 |
| @types/node (dev) | ^22.9.0 (22.19.11) | ^26.6.3 |
| @types/ws (dev) | ^8.5.13 (8.18.1) | ^8.18.2 |
| @types/cors (dev) | ^2.8.17 (2.8.19) | ^2.8.19 |
| esbuild (via tsx) | 0.27.3 | 0.28.2 |
| overrides: deepmerge-ts | 7.1.5 (via prisma 7) | ^8.0.0 (8.0.2) |
| overrides: mysql2 | 3.15.3 (via prisma 7) | ^3.23.1 (3.24.4) |

Prisma's CLI (`npm view prisma dist-tags`) tags `8.0.0-rc.19` as `latest`, but that release is a
release candidate and `@prisma/client` is still at 7.10.0. I stayed on 7.10.0.

### apps/dashboard and apps/guest-app (same changes in both)

| Package | Before | After |
|---|---|---|
| react, react-dom | ^18.3.1 (18.3.1) | ^19.3.0 |
| react-router-dom | ^6.28.0 (6.30.3) | ^7.18.4 |
| vite (dev) | ^5.4.10 (5.4.21) | ^8.3.1 (bundles with rolldown 1.2.11; esbuild and rollup are gone) |
| @vitejs/plugin-react (dev) | ^4.3.3 (4.7.0) | ^6.1.1 |
| typescript (dev) | ^5.6.3 (5.9.3) | ^7.0.2 |
| @types/react, @types/react-dom (dev) | ^18.3.x (18.3.28 / 18.3.7) | ^19.3.0 |

### apps/guest_app_flutter

`pubspec.yaml` is unchanged. `flutter pub get` on Flutter 3.47.4 followed by `flutter pub upgrade`
(in-range only) changed `pubspec.lock` like this:

| Package | Kind | Before | After |
|---|---|---|---|
| SDK dart (lock floor) | sdk | >=3.10.8 <4.0.0 | >=3.12.0 <4.0.0 |
| SDK flutter (lock floor) | sdk | >=3.38.4 | >=3.44.0 |
| audio_session | direct | 0.2.2 | 0.2.4 |
| audioplayers | direct | 6.5.1 | 6.8.1 |
| permission_handler | direct | 12.0.1 | 12.0.3 (13.0.2 deferred) |
| record | direct | 6.2.0 | 6.2.1 (7.1.1 deferred) |
| shared_preferences | direct | 2.5.4 | 2.5.5 |
| audioplayers_android / _darwin / _linux / _platform_interface / _web / _windows | transitive | 5.2.1 / 6.3.0 / 4.2.1 / 7.1.1 / 5.1.1 / 4.2.1 | 5.3.0 / 6.5.0 / 4.3.0 / 7.2.0 / 5.3.0 / 4.4.1 |
| permission_handler_apple / _html / _platform_interface / _windows | transitive | 9.4.7 / 0.1.3+5 / 4.3.0 / 0.2.1 | 9.6.2 / 0.1.4+1 / 4.4.1 / 0.2.2 |
| record_android / _ios / _linux / _macos / _platform_interface | transitive | 1.5.1 / 1.2.0 / 1.3.0 / 1.2.1 / 1.5.0 | 1.5.2 / 1.2.1 / 1.3.1 / 1.2.2 / 1.6.0 |
| shared_preferences_android / _foundation / _platform_interface | transitive | 2.4.20 / 2.5.6 / 2.4.1 | 2.4.28 / 2.5.7 / 2.4.2 |
| path_provider / _android / _linux / _platform_interface | transitive | 2.1.5 / 2.2.22 / 2.2.1 / 2.1.2 | 2.1.6 / 2.3.1 / 2.2.2 / 2.1.3 |
| jni, jni_flutter, jni_util, package_config, record_use | transitive | not installed | 1.0.3, 1.0.3, 1.0.0, 3.0.0, 1.1.1 (new; path_provider_android 2.3 uses JNI) |
| SDK-pinned by flutter_test: characters, matcher, material_color_utilities, meta, test_api, vector_math | transitive | 1.4.0, 0.12.17, 0.11.1, 1.17.0, 0.7.7, 2.2.0 | 1.4.1, 0.12.20, 0.13.0, 1.19.0, 0.7.12, 2.4.3 |
| archive, async, clock, code_assets, hooks, image, json_annotation, logger, objective_c, platform, posix, pub_semver, stack_trace, synchronized, uuid, vm_service, yaml | transitive | 4.0.9, 2.13.0, 1.1.2, 1.0.0, 1.0.1, 4.8.0, 4.11.0, 2.6.2, 9.3.0, 3.1.6, 6.5.0, 2.2.0, 1.12.1, 3.4.0, 4.5.3, 15.0.2, 3.1.3 | 4.3.0, 2.13.1, 1.1.3, 2.1.0, 2.2.0, 4.10.1, 4.12.0, 2.8.0, 9.6.0, 3.2.0, 6.5.2, 2.2.1, 1.12.2, 3.4.2, 4.6.0, 15.3.0, 3.1.4 |

Flutter also rewrote `analysis_options.yaml` on its own during `pub get`. The rewrite adds an
`analyzer.exclude` block for `build/` and the platform folders. I kept it.

### Runtime and config

| Item | Before | After |
|---|---|---|
| Realtime model (`nova-config.ts` `MODEL`) | gpt-4o-mini-realtime-preview-2024-12-17 | gpt-realtime-mini |
| Node.js requirement (README) | 18+ | 22.12+ (tested on 26.9.0) |

### hardware/esp32-room-reader (not changed)

PlatformIO `espressif32` platform (unpinned), board `esp32dev`, Arduino framework. Libraries:
`miguelbalboa/MFRC522@^1.4.10`, `bblanchon/ArduinoJson@^6.21.3`,
`arduino-libraries/LiquidCrystal@^1.0.7`. PlatformIO is not installed on macserver, so I did not
build the firmware. Its HTTP calls (`GET /api/nfc/reader-config/:id`,
`/api/nfc/inspect-card/pending`, `POST /api/nfc/read`, `/api/nfc/inspect-card/confirm` with a JSON
content type) match the upgraded backend's routes.

## What broke and how it was fixed

1. **The Realtime model no longer exists.** OpenAI removed the `gpt-4o-*-realtime-preview` models
   on 2026-05-07 (current deprecations page, checked via Context7). The Realtime beta interface
   was removed on 2026-05-12. `nova-config.ts` now uses `gpt-realtime-mini`, which OpenAI names
   as the replacement. The proxy already sent the GA event shape: `session.type: "realtime"`,
   `output_modalities`, `audio.input.format {type: "audio/pcm", rate: 24000}`, `audio.output.voice`,
   and the `response.output_audio*` / `response.output_text*` event names. The web and Flutter
   clients already listen for those GA names, so no other protocol change was needed.
   `test/realtime.test.mts` now pins that shape.
2. **Prisma 7 requires a driver adapter**, and it no longer reads `url` in the schema.
   - `datasource.url` moved from `schema.prisma` into the new `backend/prisma.config.ts`, which
     also holds the seed command. The `"prisma": {"seed"}` block in package.json is gone.
   - `src/db.ts` builds the client with `@prisma/adapter-better-sqlite3`. `prisma/seed.ts` now
     imports that shared client and no longer creates its own.
   - Prisma 5 resolved `file:./dev.sqlite` relative to `prisma/`. Prisma 7 resolves it relative to
     the config file (CLI) or the working directory (runtime). Left alone, both would silently
     open an empty `backend/dev.sqlite` in place of `backend/prisma/dev.sqlite`. Both the config
     and `db.ts` now resolve relative paths against `prisma/`, so existing `.env` files keep working.
   - Prisma 7 no longer generates the client on install. `backend` now has
     `"postinstall": "prisma generate"`, so `npm ci` still leaves a working client.
   - I kept the `prisma-client-js` generator, which 7.10 still supports. Moving to the new
     `prisma-client` generator changes every import path; I deferred it (see below).
3. **Express 5 leaves `req.body` undefined** when no body is parsed (Express 4 gave `{}`).
   Handlers in `auth`, `guests`, `nfc` and `me` destructure `req.body` directly, so a bodiless `POST /api/auth/login` or
   `/api/nfc/read` returned a 500 with a TypeError where it used to return a 400. One middleware
   after `express.json()` in `src/index.ts` restores `{}`. I checked this against a running server.
   The route patterns contain no wildcards or optional segments, so the path-to-regexp v8
   changes do not affect them.
4. **TypeScript 7 rejects `import "./index.css"`** (TS2882, side-effect imports are now checked).
   I added `src/vite-env.d.ts` (`/// <reference types="vite/client" />`) to both web apps.
5. **dotenv 17+ prints an "injected env" banner** on every load. `src/index.ts` now passes
   `quiet: true`.
6. **npm audit**: Prisma 7.10's CLI pulls in `deepmerge-ts` 7 and `mysql2` 3.15, both flagged
   high. `npm audit fix --force` would downgrade Prisma to 6. Instead, `overrides` pin
   `deepmerge-ts@^8` and `mysql2@^3.23.1`. `prisma generate`, `db push` and the tests still pass,
   and all three apps now report 0 vulnerabilities. Before this pass: backend 5, each web app 11.
7. **npm 11 install-script approvals.** npm 11.19 warns about dependency install scripts that
   package.json does not list. `backend/package.json` now has `allowScripts` for `better-sqlite3`
   (native binary), `esbuild`, `prisma` and `@prisma/engines`. The web apps' only warning is
   `fsevents`, which ships prebuilt, so I left it unlisted.

Small changes that did not fix a break:

- The proxy reads `OPENAI_REALTIME_BASE_URL` (default `wss://api.openai.com/v1/realtime`) so the
  tests can aim it at a local fake. I documented it in `docs/env.md`.
- Added `typecheck` scripts to all three web apps and a `test` script to the backend.

## Tests

`backend/test/` has 13 offline tests (`npm test` runs `tsx --test`, which uses `node:test`; no new
dependency). Each test file makes its own throwaway SQLite database under the OS temp directory,
and nothing touches the network.

- `tools.test.mts`: the five Realtime tools write the right rows, complaints keep their type, and
  unknown tools return a message rather than throwing.
- `backboard.test.mts`: with `fetch` mocked, `addMemory` sends the right URL, header and metadata;
  memories are filtered per guest and per room; failures return `[]`; `memorySummary` ordering and
  its limit hold.
- `realtime.test.mts`: runs the real proxy against a fake OpenAI WebSocket server. It checks that
  unknown guests get close code 4004, the upstream URL carries the configured model, and
  `session.update` has the GA shape, all five tools and the guest context. `session.updated`
  reaches the client and triggers the welcome `response.create`. A `function_call` in
  `response.done` runs the tool and returns a `function_call_output` with the same `call_id`.
  `guest_text` becomes an `input_text` message. A missing API key produces a client-facing error.

`apps/guest_app_flutter/test/activate_screen_test.dart` has 3 tests: with no saved token the app
opens on the activation form, empty fields show "All fields are required." without a request,
and `ApiService.setToken` persists and clears the token.

The web apps have no tests, so `npm test` does not apply to them. Instead I ran both in a browser
against the upgraded backend (Vite dev server plus Playwright). The dashboard logs in, and
Guests & Rooms and Requests & Complaints load real data. The guest app shows the backend's
activation error. The only console errors were a missing `favicon.ico`.

### Scratch script verdicts (originals kept; Ben decides)

| Script | Verdict |
|---|---|
| `backend/test_tool.ts` | Converted to `test/tools.test.mts`. Ben can delete. |
| `backend/test_mem.ts` | Converted to `test/backboard.test.mts` (addMemory, getMemoriesForGuest). Ben can delete. |
| `backend/test_mem2.ts` | Converted to `test/backboard.test.mts` (memorySummary). Ben can delete. |
| `backend/test_bb.ts` | Its request shapes are covered by `test/backboard.test.mts`. It calls the live Backboard API directly. Ben can delete. |
| `backend/test_err.ts` | Converted to `test/realtime.test.mts` (session.update accepted, session.updated forwarded). Ben can delete. |
| `backend/test_ws.ts` | Converted to `test/realtime.test.mts` (tool call round-trip). Whether the live model picks the right tool can't be tested offline. Ben can delete. |
| `backend/test_ws3.ts` | Converted to `test/realtime.test.mts` (get_wifi_info output followed by a second response). Ben can delete. |
| `backend/test_ws2.ts` | Not converted. It only prints what the live model says about past requests. The offline parts (memory filtering and the context line) are covered by the backboard and realtime tests. Ben can delete. |

## Deferred, and why

- **Flutter `record` 6 → 7 and `permission_handler` 12 → 13.** Both pass `flutter analyze`, and
  an iOS simulator build with both succeeded in the scratch copy. But `record` 7 moves its Android
  side to AGP 9 while this app uses AGP 8.11.1 (`android/settings.gradle.kts`), and
  `permission_handler` 13 requires `compileSdk 37`. macserver has no Android SDK, so I could not
  build Android at all. Upgrading needs AGP 9 in `android/`, then an Android build on the laptop.
  `record` 7 also drops the Android background recording service and the iOS
  `manageAudioSession` option. Nova uses neither.
- **Prisma 8** is a release candidate. **The `prisma-client` generator** (Prisma's recommended
  replacement for `prisma-client-js`) moves the client into `src/generated/` and changes every
  import. 7.10 still supports the old generator.
- **iOS project migration.** The first iOS build on Flutter 3.47 rewrites `ios/`: it raises the
  deployment target from 13.0 to 15.0, adds Swift Package Manager integration and migrates to
  the UIScene lifecycle. I saw this in the scratch build and did not commit it to the repo. It
  will happen on Ben's first `flutter build ios` or `flutter run`. That build also warns that
  `flutter_sound` does not support Swift Package Manager yet.
- **`backend/src/routes/ai.ts` still uses `gpt-4o-mini`** through Chat Completions (overridable
  with `OPENAI_MODEL`). The deprecations page lists no shutdown for it, so I left it.
- **Android builds in general** are unverified for every Flutter change, including the in-range
  plugin updates (`path_provider_android` 2.3 now depends on JNI).

## For Ben

- **Possible bug, not fixed.** `resolveAssistantId` in `backend/src/backboard.ts` expects
  `GET /assistants` to return an array. `test_bb.ts` reads `.assistants[0]`, which suggests the
  real API returns `{ assistants: [...] }`. If so, and `BACKBOARD_ASSISTANT_ID` is unset, every
  cold start with no `.backboard-assistant-id` cache file creates a new assistant. I could not
  check the live API tonight.
- `gpt-realtime-mini` is the closest replacement for the old mini preview model. If voice quality
  matters more than cost, `gpt-realtime-1.5` is the full-size option.
- Nothing was deployed and no API was called. The backend was only run locally with no keys. I
  restored `backend/prisma/dev.sqlite` byte-for-byte after the smoke tests.

## Final command output (macserver, 2026-09-29)

```
backend        npm ci        added 267 packages (postinstall: Generated Prisma Client v7.10.0)
backend        npm run typecheck   exit 0
backend        npm run build       exit 0
backend        npm test            tests 13, pass 13, fail 0
backend        npm audit           found 0 vulnerabilities
apps/dashboard npm ci        added 29 packages
apps/dashboard npm run typecheck   exit 0
apps/dashboard npm run build       ✓ built (vite 8.3.1), exit 0
apps/dashboard npm audit           found 0 vulnerabilities
apps/guest-app npm ci        added 29 packages
apps/guest-app npm run typecheck   exit 0
apps/guest-app npm run build       ✓ built (vite 8.3.1), exit 0
apps/guest-app npm audit           found 0 vulnerabilities
guest_app_flutter  flutter pub get   ok
guest_app_flutter  flutter analyze   No issues found!
guest_app_flutter  flutter test      00:00 +3: All tests passed!
```
