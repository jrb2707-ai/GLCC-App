# GLCC — Grey Lynn Cycle Club (Mobile App)

## Original Problem Statement
Build a mobile app for the Grey Lynn Cycle Club. The user provided an HTML mockup (`GLCC App.dc.html`) showing a 4-tab mobile UI: Rides, Coffee Order, Riders, Chat — plus rider profiles, admin approvals, RSVPs, coffee rounds, and toast/push notifications. Tagline: *"4th best cycle club in Grey Lynn."*

## User Choices
- **Platform**: React Native / Expo (delivered as a mobile-first React web app inside an iOS-style device frame because the Emergent supervisor is locked to CRA on port 3000 — same code can be lifted into Expo later without changing the API).
- **Backend**: FastAPI + MongoDB with real persistence.
- **Auth**: JWT email/password + admin role.
- **Real-time**: WebSockets for live chat + coffee round push notifications.
- **Design**: Fresh, distinctive spin by the design agent (Volt Hi-Vis + Dark Tactical).
- **Push**: Real Expo Push infrastructure on the backend + Web Notifications fallback in the current web preview.

## Architecture
- **Frontend** (`/app/frontend`): CRA React 18 + Tailwind + framer-motion + sonner + lucide-react. Wrapped in a `PhoneFrame` for a native-mobile feel. Bearer JWT stored in localStorage. Central `AppProviders` wires auth + a global WebSocket event bus (`useEvents.subscribe`) + browser notification helpers.
- **Backend** (`/app/backend/server.py`): FastAPI + Motor (async MongoDB) + httpx. Bcrypt + PyJWT. `ConnectionManager` supports `broadcast`, `broadcast_except`, and `send_user` for targeted routing. All routes under `/api` (WS at `/api/ws?token=`).
- **DB collections**: `users`, `rides`, `messages`, `coffee_rounds`, `push_tokens`. Seeded on startup.

## Personas
- **JB (El Presidente)** — full admin + can promote/demote admins.
- **Ride Captain (Aroha)** — admin, can approve/deny/delete but not change admin status.
- **Members (Sam, Mika, Leo)** — RSVP, chat, send coffee rounds.
- **New sign-ups** — start as `pending`, appear in admin approval block.

## Implemented (2026-01)
- Auth: register / login / me, JWT (7-day access), bcrypt hashing, seed admin + demo members.
- Rides: 5 seeded rides, list + detail with stylized SVG route map, RSVP going/maybe/no persisted per-user.
- Coffee: send-a-round modal, live feed, auto-posts matching system message to Chat, WebSocket broadcast + toast notification.
- Riders: directory, admin approval flow (pending block with approve/deny), profile modal (edit self, admin edit others, President-only make/remove admin, delete non-President).
- Chat: seeded welcome, live weather header (Auckland 14°C · Partly cloudy · 10% rain), user + system message bubbles, real-time WebSocket delivery.
- **Push notifications (2026-01)**:
  - Backend Expo Push infra: `/api/push/register`, `/api/push/unregister`, `/api/push/test`. Batches of 100 messages, auto-cleans `DeviceNotRegistered` tokens.
  - Coffee round trigger: fires an Expo push to all users except the sender (fire-and-forget task, does not block the HTTP response).
  - `@mention` parsing on chat messages: matches first-name (case-insensitive), skips self and unknown handles, delivers a targeted `chat.mention` WebSocket event + Expo push to the mentioned rider.
  - Web preview fallback: browser bell icon in the header requests Web Notifications permission; `coffee.round` and `chat.mention` fire real `new Notification(...)` when the tab is hidden (foreground users get the in-app sonner toast).
- Design system: `#D4FF00` volt accent on `#0D1117` dark tactical base, Barlow Condensed headings, JetBrains Mono captions, iOS phone frame wrapper.
- All interactive elements carry `data-testid` (tested end-to-end — 100% pass across two iterations, 15+ backend checks).

## Test Credentials
See `/app/memory/test_credentials.md`.

## Prioritized Backlog
### P1 — Real mobile packaging
- Lift the same components into an Expo Router project. Wire `expo-notifications` + `expo-device` and call `POST /api/push/register` with the real `ExponentPushToken`. Backend is already ready — no server changes needed.

### P2 — Product depth
- Real Strava / MyRide route imports & GPX previews.
- Expo push receipts worker (poll `getReceipts` ~15 min after each send to catch delayed errors like `MessageTooBig`).
- Live weather from OpenWeather (currently a static endpoint).
- Presence indicators in chat (typing / online dots via WS).
- Rider avatar uploads (S3 or Cloudinary) — currently initials.

### P3 — Nice-to-haves
- Ride creation UI for admins (endpoint exists, no form yet).
- Post-ride kudos ("send it" / "chapeau" reactions on messages).
- Café tab: nearest-café map + one-tap Uber Eats reorder of "the usual".
- Weekly "4th best in GLCC" leaderboard with shareable story card (revenue-adjacent — drives recruitment).
