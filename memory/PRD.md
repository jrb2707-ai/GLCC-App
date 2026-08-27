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
