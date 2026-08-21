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
  - **Phase 3.5 (Feb 2026): DONE** — Polish + retention loop:
    - Chat @mention picker: horizontal riders list appears above the input when `@` is typed (or the new `@` button is tapped), filters as you type, inserts `@RiderName` handle so mention pushes fire more often.
    - Test push button on self ProfileModal calls `/api/push/test` and reports device count / no-devices state.
    - Ride reminder toggle on self ProfileModal — new backend field `ride_reminders` (defaults true) round-trips through `ProfileUpdateIn` and `/riders/me`; the reminder loop skips riders with the flag off.
    - Offline cache via `@react-native-async-storage/async-storage` — rides, riders, pending, coffee rounds hydrate from disk on boot so the app is populated at the ride start line before the network responds. Cache clears on logout.
  - **Phase 3.6 (Feb 2026): DONE** — Weather alerts + deep-link handoff:
    - Backend: new `send_pending_weather_alerts` loop runs every 20 minutes, scans rides starting 2-14 hours out, and if OpenWeather forecast crosses either threshold (rain ≥ 60% OR wind ≥ 40 kph) pushes each going rider one alert with `data.ride_id`. Idempotent via `weather_alert_sent_at`. Manual trigger at `POST /api/admin/send-weather-alerts`.
    - **Bug fix bonus**: The reminder loop was reading `ride.going` which is never written. New shared helper `_going_user_docs(ride)` derives going riders from the canonical `rsvps` dict so both reminders and weather alerts actually reach the right people. Verified end-to-end: `/api/admin/send-ride-reminders` now returns `rides_reminded > 0` where before it always returned 0.
    - Reminder email button now links to `${PUBLIC_APP_URL}/r/{ride_id}` (associated domain), copy updated to "Open ride in GLCC".
    - Native `store.js` gained a `pendingRideId` context + `consumePendingRide()`: listens to `Linking` (initial URL + subsequent) and `Notifications.addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` (cold-start). Any URL matching `/(r|ride|rides)/(id)` or notification with `data.ride_id` sets `pendingRideId`, and RidesTab auto-opens the matching ride detail.
  - **Phase 3.7 (Feb 2026): DONE** — Web ride preview so `/r/{id}` no longer 404s for friends without the app:
    - Backend `GET /api/rides/public/{ride_id}` — no auth, returns a safe subset (id, name, day/date/time, distance/elevation/pace, cafe, location, going_count, going_first_names, source, strava_url, map_url). No email/rsvps/user ids leaked. Verified 200 + shape and 404 shape via curl.
    - Web `RidePreviewScreen.jsx` — mobile-styled preview with hero map (or gradient fallback), title, stats grid, café block, going first-name chips, "Open in GLCC app" CTA that attempts `glcc://ride/{id}` and falls back to the sign-in screen after 900ms, and a "View on Strava" link when applicable.
    - `App.js` gained `useRidePreviewId()` which matches `/r/`, `/ride/`, `/rides/` paths and renders the preview in the Gate for unauthenticated visitors. Verified end-to-end via Playwright screenshot on the preview URL.
  - **Phase 4 (Feb 2026): DONE** — Apple Guideline 1.2 + 5.1.1(v) moderation (App Store submission blocker cleared):
    - Backend: `POST /api/chat/messages/{id}/report` (snapshots message, notifies admins via push + WS), `POST /api/blocks` + `DELETE /api/blocks/{target_id}` + `GET /api/blocks`, `DELETE /api/auth/me` (password-confirmed, anonymises messages, purges push tokens/rsvps/coffee/reports/blocks). Chat list + mentions filtered by pair blocks in both directions.
    - Native: Long-press chat message → ReportModal with 6-reason picker + free text. Member Card → Block/Unblock button (any non-president rider). Profile self-view → Delete-my-account inline block with password confirmation.
    - Web: Flag icon on hover of any chat message → ReportSheet with same reason picker. Member Card gained Block/Unblock. Profile modal (self) gained Delete-my-account block.
    - Verified via curl: self-report blocked (400), self-block blocked (400), report ok, block hides messages from list (27→25), delete-account wrong-pw 401, correct-pw purges user and anonymises chat to "Former rider", login post-delete 401. President cannot self-delete (400).
    - Store-assets docs updated: `APP_STORE_LISTING.md` marks 1.2 as IMPLEMENTED, `BUILD_AND_SUBMIT.md` lists the reviewer test path so Apple can verify on first submission.
  - **Phase 4.1 (Feb 2026): DONE** — Moderation tooling + auto-filter (Apple 1.2 hardening):
    - Backend: profanity filter (`filter_profanity`) applied to incoming chat text, stems + trailing word-chars so "fuck"/"fucking"/"fucked" all mask to `f*****g`. Configurable via `PROFANITY_WORDS` env var (comma-separated), 16-word NZ-flavoured default. Admin reports inbox: `GET /api/admin/reports?status_filter=open`, `POST /api/admin/reports/{id}/dismiss`, `POST /api/admin/reports/{id}/delete-message` (drops the source message and broadcasts `chat.deleted`).
    - Native RidersTab: collapsible "🚩 Reported messages · N" block above the pending approvals. Each row shows the snapshot, reporter, reason, and Dismiss / Delete Message buttons. Auto-reloads on `chat.report` WS events. Native ChatTab now removes locally on `chat.deleted`.
    - Web RidersTab: matching collapsible reports block with dismiss + delete-message actions. Web ChatTab handles `chat.deleted` too.
    - Verified end-to-end via curl: Leo reports JB's message, JB sees it in `/admin/reports`, tapping delete-message purges the message and drops open count to 0 and message list confirms it's gone.
    - Screenshots docs updated in `APP_STORE_LISTING.md` — user captures 6.7" iPhone shots on their Mac from the Simulator after the first `eas build`.
  - **Phase 4.2 (Feb 2026): DONE** — Café auto-suggest:
    - Backend `suggest_cafe(*text_fields)` matches an incoming ride's location/route/name against a curated 25-neighbourhood → café list (Devonport → The Depot, Piha → Piha Café, Waiheke → Charlie Farley's, etc). Overridable via `CAFE_OVERRIDES` env var without a redeploy.
    - Applied automatically in `_strava_event_to_ride_doc` (weekend rides) and `POST /rides` (manual create with empty café). Weekday rides still lock to The Brunchery.
    - New endpoint `GET /api/rides/cafe-suggest?q=...` for live suggestion in future create-ride forms.
    - Verified via curl: Devonport → Depot, Piha → Piha Café, Waiheke → Charlie Farley's, Antarctica → null. Manual POST /rides with location "North Head, Devonport" auto-fills "The Depot Eatery · Devonport".
  - **Phase 4.3 (Feb 2026): DONE** — Ride route labels always from Strava:
    - `_fetch_route_stats` now caches the Strava route `description` alongside name/distance/elevation; entries missing the field are re-fetched (self-healing cache).
    - `_event_to_ride` builds `route` from a strict fallback chain: fetched Strava route name → event-embedded route name → first sentence of event description → empty. Never falls back to a raw URL anymore.
    - Verified via live Strava sync: rides now display readable labels like "Monday Rooster", "GLCC Brian, Not Tamaki Revised.", "Café Ride", "Jail Break Alt route" instead of `strava.com/clubs/…/group_events/…`.
  - Phase 4: User-generated content moderation (Apple 1.2) — block, report, auto-filter, delete-my-account.
  - Phase 5: Screenshots, real icon/splash design, submit v1.0 for review.
- Proper admin-invite flow instead of auto-creating `.@glcc.pending` placeholder users.

## Latest Verified Test Report
`/app/test_reports/iteration_5.json` — 17/17 backend guard tests + full pending/admin/member UI flows green.
