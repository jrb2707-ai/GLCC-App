# GLCC — Grey Lynn Cycle Club Mobile App

## Original problem statement
Build a mobile app for Grey Lynn Cycle Club (GLCC). Hub for scheduled rides,
rider profiles, coffee ordering, live chat, and push notifications.
React Native / Expo (mobile) + FastAPI + MongoDB (backend) + React SPA (web
fallback). JWT auth with admin roles. WebSockets for live chat and events.
Expo Push + VAPID Web Push. Strava integration. Resend transactional emails.
Apple App Store 1.2 compliance (block/report/moderate).

## Personas
- **El Presidente / Ride Captains** — Admin. Announce rides, moderate chat,
  reset passwords, manage riders.
- **Members** — Log rides, RSVP, order coffee in rounds, banter in chat.
- **Apple App Store Reviewer** — Seeded test accounts for App Store review.

## Core requirements (implemented unless noted)
- JWT auth, admin roles, password reset flow via Resend
- Rides (create, list, RSVP, Strava sync)
- Rider profiles (bio, coffee, admin promote/demote, delete with 2-step)
- Coffee **Ride Rounds**: 5-min shout timer on upcoming ride, live orders,
  barista tally (item-grouped), copy-to-clipboard for barista
- Chat with WebSocket, mechanicals + live map, announcements
- VAPID Web Push + Expo Push notifications
- App Store 1.2 compliance: report user, block user, moderation
- Apple App Store screenshot automation

## Implemented (dates in NZT)
- 2026-02-24 — Coffee Ride Rounds refactor (rounds tied to rides, 5-min timer)
- 2026-02-24 — Coffee tab as landing page
- 2026-02-25 — Barista tally item-first grouping + "Split the Bill" rename
- 2026-02-25 — Text contrast fixes (white on coffee dark card)
- **2026-02-25 — Coffee tab CTA visibility fix**: Removed persistent
  localStorage hide for "Split the Bill"; now session-only, resets on round
  cycle. CoffeeTab no longer falls back to past rides; greyed "No upcoming
  rides — sync Strava" prompt when no upcoming ride. Mirrored on mobile.
- 2026-02-23 — Push adoption banner in ChatTab
- 2026-02-23 — Automated App Store screenshot pipeline (35 screens)
- 2026-02-22 — Mechanical live map (Leaflet)
- 2026-02-22 — Two-step delete confirmation on rider profile
- **2026-02-27 — Ride page "I'm buying" reroutes to live tally**: When a
  coffee round is already live on any ride, tapping the CTA on any ride
  detail page now shows "Round in progress · [buyer]" with an "Add my
  coffee" button that opens the global Barista Tally overlay instead of
  starting a competing shout. Uses `useLiveRound()` context, so Rides tab
  and Coffee tab share the same funnel. Ported to Web + Mobile.
- **2026-02-27 — El Prez email migrated to `bryantj@xtra.co.nz`**: Master
  admin credentials moved to `bryantj@xtra.co.nz` / `Roenick2707`. Seeder
  auto-migrates legacy `jb@greylynncc.com` (and older `jb@glcc.club`)
  row onto the new email, preserving El Prez's rides / coffee / chat
  history and `member_no=1`. `.env` `ADMIN_EMAIL` updated to match.
- **2026-02-27 — Bell icon + Riders tab colour**: Bell (top header) turns
  pink `text-accent-pink` when notifications granted. Riders bottom-tab
  active tint flips to `text-status-cant` (red) whenever effective theme
  is dark (respects both theme picker and OS auto-dark).
- **2026-02-27 — Private DMs shipped (v1)**: `GET/POST /api/dm/…`
  endpoints (list conversations, get thread, send message, mark read,
  unread badge count, delete message). Web `DMDrawer` + Mobile
  `DMScreen` modals reachable from mail icon in header. Two collections
  `dm_conversations` (with `pair_key` unique index) + `dm_messages`.
  WS-driven live updates via `dm.message` / `dm.read` / `dm.deleted`.
  Recipient-not-focused push skipping via `dm.focus`/`dm.blur` WS
  presence events. Blocking reuses `blocks` collection — blocked riders
  hidden from inbox both directions. Delete endpoint recomputes latest
  preview + unread counts from source of truth.
- **2026-02-27 — DM index bug fix**: Legacy `participants` unique index
  was multikey (rejected any second convo for a rider). Replaced with
  `pair_key` sorted-string unique index; migration drops the old index
  on startup.
- **2026-02-27 — ChatTab dark mode parity**: Weather header, message
  scroller, system pill, peer bubble, mention picker, and input row all
  now use theme-aware `bg-bg-*` / `text-text-*` / `border-border-subtle`.
  iMessage-y bubble aesthetic preserved.
- **2026-02-27 — Coffee cafe locked per ride per day**: New
  `_todays_cafe_for_ride` helper anchors all subsequent shouts on the
  same ride to the first cafe chosen that day (NZ local). Backend
  silently overrides any drift. New `GET /rides/{id}/round/today-cafe`
  exposes the lock for UI hints.
- **2026-02-27 — Any rider can end a round**: `POST /round/close` no
  longer restricted to buyer/admin. Web + mobile "Close early" button
  is always visible; label flips to "End round" for non-buyers.
- **2026-02-27 — Late "Add my coffee" grace window**: Order endpoint
  accepts orders on rounds within 30 min of `started_at` even after
  auto-expiry or manual close. Web + mobile tally overlay and
  RideRoundBlock close-view now show "Add my coffee" primary CTA when
  the viewer hasn't ordered; Copy list stays as secondary. "Tap to
  order my usual" renamed to "Add my coffee" everywhere.
- **2026-02-27 — PWA / Home Screen refresh snap**: CoffeeTab now
  refetches on `pageshow` + `focus` + `visibilitychange` (with an
  in-flight guard). Store proactively reconnects the WebSocket on
  resume — suspended PWAs often die silently without an `onclose`, so
  live coffee-round events were stalling until the 30s polling caught
  up. Now they fire within ms of foreground return.
- **2026-02-27 — Invite a rider label**: theme-aware
  `text-text-primary` (white in dark, black in light) on both web +
  mobile.
- **2026-02-27 — EL PREZ badge pink**: header badge now
  `bg-accent-pink/15 text-accent-pink border-accent-pink/40` for
  president; regular admin keeps volt yellow.

## Backlog / Roadmap
- **P0 — Private DMs (Rider → Rider)**: conversations + dm_messages
  collections, unread counts, blocking, push notifications, mobile + web UI
- **P1 — Backend monolith refactor**: split `/app/backend/server.py` (~3k
  lines) into `/routes`, `/models`, `/services`
- **P1 — Production VAPID key**: user to update Deployment Panel secrets
  with valid PEM (RCA already provided by deployer agent)
- **P1 — www → apex redirect**: prevent geolocation/push split-origin issue
- **P2 — Chat archive**: downloadable JSON of chat before 7-day TTL wipe
- **P2 — 60s-left coffee push**: auto-nudge riders who haven't ordered yet
- **P2 — In-chat round chip**: compact "☕ Dave's shout · 3:42 left" chip
- **P2 — Round reactions**: 🙌 🚴 ☕ reactions on coffee orders

## Tech stack
- Frontend (web): React SPA, React-Leaflet, VAPID Web Push, Tailwind
- Mobile: React Native / Expo, Expo Push Notifications
- Backend: FastAPI, Motor (async MongoDB), WebSockets, APScheduler, Resend,
  Strava OAuth, OpenWeather
- Deployment: Emergent platform (preview + production at greylynncc.com)

## Environments
- **Preview** (dev): https://mobile-craft-4628.preview.emergentagent.com
- **Production**: https://greylynncc.com

## Credentials (in /app/memory/test_credentials.md)
- Admin (El Prez): `jb@glcc.club` / `Roenick2707`
- Apple Reviewer: `apple-review@glcc.club` / `GreyLynn2026!`
- Apple Reviewer Admin: `apple-review-admin@glcc.club` / `GreyLynn2026!`
