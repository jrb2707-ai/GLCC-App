# GLCC — Grey Lynn Cycle Club App

## Original Problem Statement
Build a mobile app for GLCC (Grey Lynn Cycle Club). The app is the club hub for viewing
scheduled rides, tracking member profiles, ordering coffee ("send a round") and chat.

## Target Stack
- Frontend: React (mobile-first web preview inside a phone frame) — future migration to Expo/React Native.
- Backend: FastAPI + Motor (async MongoDB).
- Auth: JWT email/password with Admin / President / Member / Pending roles.
- Realtime: WebSocket at `/api/ws?token=...` for chat, coffee feed, RSVP updates.
- Notifications: Expo Push (with browser Notification fallback in the preview).
- Integrations: Strava (club events sync), OpenWeather (Auckland).

## Implemented (as of Feb 2026)
- JWT auth, seeded admin (jb@glcc.club / president123), president-only powers.
- Rides list, RSVP (going/maybe/no), Strava club sync (hourly), route maps, café blocks.
- Coffee rounds with 1-hour TTL auto-expiry, quick-send from profile default.
- Chat with @mention → Expo push, iMessage-style bubbles, live weather header.
- Riders tab with admin approval flow, avatar uploads (base64, resized client-side).
- Dark/Light theme with GLCC brand palette (Volt Yellow, Strava Orange, Pink).
- Push notifications banner + toggle bell in header.
- **Pending user read-only enforcement** (backend 403 + frontend disabled UI, banner, gated Register-a-rider).
- Admin-only "Register a rider" button.
- AuthScreen tagline darkened for readability (text-text-primary, font-medium).

## Test Credentials
See `/app/memory/test_credentials.md`.

## Backlog / Roadmap
### P1
- React hook dependency cleanup (`store.jsx`, `RidesTab.jsx`, `RidersTab.jsx`, `ChatTab.jsx`).
- Move JWT storage to a more secure store before the Expo migration.

### P2
- Split `server.py` (>1000 lines) into routers: `auth`, `rides`, `coffee`, `chat`, `strava`, `push`, `admin`.
- Gate `email` field in `/api/riders` responses so only admins see emails (reviewer note).

### P3
- Migrate to true React Native / Expo native codebase for App Store / Play Store distribution.
  - **Phase 1 (Feb 2026): DONE** — Expo scaffold under `/app/mobile` with AuthScreen (all polish: validation, pending, forgot pw, glass panel), HomeShell tab nav, and live-data tabs (Rides, Coffee, Riders, Chat with polling). Secure token storage, EAS build config, App Store Connect draft copy at `/app/mobile/store-assets/APP_STORE_LISTING.md`, submit checklist at `/app/mobile/store-assets/BUILD_AND_SUBMIT.md`. Bundle id `com.greylynncc.app`.
  - **Phase 2 (Feb 2026): DONE** — Full UI port with feature parity:
    - `RidesTab.js`: list + ride detail view with RSVP (going/maybe/can't), café round CTA, going-list chips, Strava deep-link, StravaPanel admin (connect/sync/disconnect via `expo-web-browser` OAuth session).
    - `CoffeeTab.js`: hero image header, Order button with pending guard, "Today's coffee orders" list with avatars + relative time, coffee picker modal.
    - `ChatTab.js`: weather header, iMessage-style bubbles, system messages, pending lock state, 5s polling refresh.
    - `RidersTab.js`: pending approvals block (approve/deny), rider list with badges, ProfileModal (self-edit name+coffee; admin-edit role+bio+admin actions; make/remove admin, send-reset-link, delete), Invite modal, MemberCard viewer (Rapha-style card with rotate + watermark + meta grid), inline change-password block.
    - Shared: `components/Avatar.js`, `components/MemberCard.js`, `components/StravaPanel.js`, `lib/util.js` (timeAgo, fmtTime, pad4).
  - **Phase 3 (Feb 2026): DONE** — Real-time + native platform features:
    - `lib/store.js`: WebSocket client connects to `wss://…/api/ws?token=…` with auto-reconnect (2.5s backoff). Exposes `useEvents()` context matching the web app.
    - Tab subscriptions: ChatTab (`chat.message` appends live, polling removed), CoffeeTab (`coffee.round` prepends live), RidesTab (`ride.updated/created/deleted`, `rider.updated`, `rides.synced`), RidersTab (`rider.updated/pending/deleted/approved/denied`).
    - `lib/push.js`: `registerForPush()` requests notification permission, gets Expo push token via `Notifications.getExpoPushTokenAsync`, POSTs `/api/push/register` `{expo_push_token, platform, project_id}`. Foreground handler shows heads-up alerts.
    - `lib/imagePicker.js`: `expo-image-picker` + `expo-image-manipulator` pipeline — pick, crop 1:1, resize to 512px JPEG, return base64 data URL. Wired into `ProfileModal` as a camera badge on the avatar (admin editing others only, matching web parity). `MemberCard` preview reflects the pending photo.
    - `components/RouteMap.js`: Shows Strava `map_url` when present, otherwise renders a stylised SVG polyline (react-native-svg) with a volt→orange gradient. Rendered inside ride detail view.
    - `app.json`: Added `expo-image-picker` plugin; `NSPhotoLibraryUsageDescription` already present.
    - New deps: `expo-image-picker@~15.0.0`, `expo-image-manipulator@~12.0.0`, `react-native-svg@15.2.0`.
  - Phase 4: User-generated content moderation (Apple 1.2) — block, report, auto-filter, delete-my-account.
  - Phase 5: Screenshots, real icon/splash design, submit v1.0 for review.
- Proper admin-invite flow instead of auto-creating `.@glcc.pending` placeholder users.

## Latest Verified Test Report
`/app/test_reports/iteration_5.json` — 17/17 backend guard tests + full pending/admin/member UI flows green.
