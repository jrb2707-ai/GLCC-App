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
- **2026-02-27 — Header Overhaul (Field Notes № 03)**: replaced GLCC
  wordmark + inline bell/theme controls with the mockup's cleaner
  cog+bell+mail+Exit row. Cog opens a **Settings popover** (four
  notification toggles + Auto/Dark/Light theme segment). Bell opens a
  **Notifications feed popover** (recent mechanicals, coffee shouts,
  @mentions of me — chronological, pink dot per-item for unread).
  All popovers use the pink 1px border/accent language from the mock.
  New components: `/app/frontend/src/components/Header.jsx`.
- **2026-02-27 — Notification Preferences Model**: added
  `user.notification_prefs = {mechanical,coffee,chat,dm}` (all ON by
  default) + `has_seen_notification_prompt` flag. New endpoints:
  `PUT /api/users/me/notification-prefs`, `GET /api/notifications`,
  `POST /api/notifications/read`. Every push call-site now passes
  `category=` so muted riders are filtered out at dispatch time
  (`_filter_users_by_pref`). First-time riders see a full-screen
  "Stay in the Loop" prompt (`NotificationPrompt.jsx`) before they
  land in the app.
- **2026-02-28 — Mockup Slice 2/3/4 shipped**: Mobile Parity for the new
  Header (cog / mail / bell / Exit) landed via `/app/mobile/src/components/Header.js`
  + `Icons.js` (react-native-svg cog/bell/mail glyphs). NotificationPrompt
  now surfaces on mobile too. **Per-Tab Watermarks** rendered on all 4 tabs
  on both web + mobile: Coffee (real cup photo), Rides (GLCC poster art —
  both extracted verbatim base64 from mockup), Riders ("1021" dossard SVG),
  Chat (rotated GLCC wordmark). New helpers: `Watermarks.jsx` (web) /
  `Watermarks.js` (mobile), `assets/watermarks.js` (shared 54KB base64
  bundle). **Rides Card Redesign**: pace chip (Social/Tempo/Race —
  inferred client-side by `inferRidePaceClass(ride)` regex on
  name+route+description+pace, default Social), Strava chip, km +
  elevation stats row, overlapping avatar stack with "N going" label.
  **Swipe-to-Delete on DMs**: web uses touch SwipeRow + hover trash pill
  for desktop mouse users; mobile uses `react-native-gesture-handler`
  `Swipeable` with a red RectButton. Mobile also gets swipe-down-to-close
  on the DM modal via `PanResponder`. WS event `dm.deleted` fans out to
  the peer so their thread updates live.
- **2026-02-28 — Notification click-through + Clear**: bell popover items
  now route on tap — coffee → Coffee tab (auto-opens live-round splash
  when one is active), mechanical/mention → Chat tab, rider → Riders.
  New `POST /api/notifications/clear` stamps `notifications_cleared_at`
  on the user and the aggregate feed filters older items; a "Clear"
  button on both web + mobile popovers wipes on demand.
- **2026-02-28 — Popover tap-toggle fix**: cog/bell buttons were losing
  their close-on-second-tap behaviour because the outside-click listener
  fired first and re-closed the popover before onClick could toggle it.
  Fixed by short-circuiting the outside-click handler when the tap
  target is the toggle button itself.
- **2026-02-29 — Coffee System Phase 2 shipped**:
  Backend: `jersey_achievements` collection + insert-once auto-mint when
  a rider crosses 25/50/100 rounds bought on any round close. Milestone
  triggers a club-wide chat auto-post (once per tier per rider — never
  re-fires). New endpoints: `GET /coffee/stats/me`, `GET /coffee/leaderboard?period=year|month`,
  `GET /coffee/history/me` (hard-capped 5, no pagination), `PUT /profile/coffee-orders`,
  `GET /coffee/jerseys/{rider_id}`. `secondary_coffee` field added to user
  model. Frontend: replaced YourUsualCard + PastRoundsList with StatsCard
  (jersey badge + progress bar always visible even when collapsed),
  TopBuyersCard (month/year toggle, gold/silver/bronze medals),
  YourHistoryCard (5-row cap). Verified end-to-end: Jason crossed 25 →
  Ruby Roaster auto-minted + chat post + card renders correctly.
- **2026-02-28 — Strava pace + I'm Buying guard + MemberCard fit**:
  Ride pace chip now sources from three cascading signals: Strava
  `event_type` / `sub_type` / `format` (if the future API ships it),
  `skill_levels` bitmask (Casual=1 → social, Tempo=2 → tempo,
  Hammerfest=4 → race), or a `[format: race|workout|social|tempo]`
  tag inside the event description. Regex over ride title stays as a
  final fallback. Empty PACE stat tile now shows the inferred label
  ("Social" / "Tempo" / "Race") instead of "—". `I'M BUYING` on a ride
  card now checks `/coffee/rounds/active` first — if a round is live
  anywhere in the club it routes the rider into that tally instead of
  trying to open a competing round. MemberCard peer view redesigned:
  card is top-anchored, Role/Since side-by-side, Coffee wide, and
  EDIT + BLOCK sit side-by-side — everything fits one screen with
  zero scroll. Riders bottom-nav active tint now inherits the same red
  as the dossard watermark on that tab (was black in light mode).

## Backlog / Roadmap
- **P1 — Backend monolith refactor**: split `/app/backend/server.py` (~3.6k
  lines) into `/routes`, `/models`, `/services`
- **P1 — Production VAPID key**: user to update Deployment Panel secrets
  with valid PEM (RCA already provided by deployer agent)
- **P1 — www → apex redirect**: prevent geolocation/push split-origin issue
- **P2 — Phone bezel on real mobile viewports**: drop the phone-frame
  chrome when the web app is opened on a genuine mobile device viewport
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
