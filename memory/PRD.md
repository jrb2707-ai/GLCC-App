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
- Proper admin-invite flow instead of auto-creating `.@glcc.pending` placeholder users.

## Latest Verified Test Report
`/app/test_reports/iteration_5.json` — 17/17 backend guard tests + full pending/admin/member UI flows green.
