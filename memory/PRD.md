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
  - **Phase 4.4 (Feb 2026): DONE** — Chat clubhouse banner + café rules refresh + route reveal:
    - New café rules: Waitakeres / Scenic Drive / Henderson Valley routes → Little Sister · 3 Onslow Ave Epsom. "Airport loop" and "Julie Andrews" → Daily Bread · Federal St, Auckland Central. All ordered before generic neighbourhoods so named-ride keywords win.
    - Ride detail route line now taps to reveal the full Strava route description (both native + web). Backend exposes `route_description` on the ride payload (drawn from `_fetch_route_stats` — cache self-heals for entries missing the field).
    - Chat clubhouse banner: sits under the weather header, rounded glass card (translucent white, backdrop-blur on web). Reads *"Welcome to the GLCC clubhouse."* + a dynamic tail: `Weather check. Watch this space.` normally, but flips to red *"🌧 {rain_chance}% rain forecast — ride may be cancelled"* when rain ≥ 60 % or *"💨 {wind_kph} kph wind — ride may be cancelled"* when wind ≥ 40 kph. Uses the existing `/api/weather` payload.
    - Removed the leftover manual test ride "Devonport Coastal" from production Mongo.
  - **Phase 5 (Feb 2026): DONE** — App Store submission playbook consolidated:
    - `/app/mobile/store-assets/SUBMISSION_PLAYBOOK.md` — single-source-of-truth checklist covering EAS setup, privacy/support URL requirements, `eas build`, Maestro screenshot capture, ASC metadata paste, review notes with reviewer credentials, and the rejection recovery loop.
    - Visual sign-off on the sticky glass clubhouse banner completed on the web preview at chat tab (Playwright screenshot, banner text "Welcome to the GLCC clubhouse. Weather check. Watch this space." rendered correctly, profanity filter visible on messages).
    - App is now functionally App Store-ready. Remaining work is user-side: fill Apple IDs in `eas.json`, publish greylynncc.com/privacy + /support, run `eas build` + `eas submit` on Mac, capture screenshots via Maestro.
  - **Phase 5.1 (Feb 2026): DONE** — Legal pages shipped:
    - New `/app/frontend/src/components/LegalPage.jsx` — full-page (breaks out of the phone frame) responsive layout serving `/privacy` and `/support` at the top of `App()` before AppShell. Content drawn from the drafts in `APP_STORE_LISTING.md`. GLCC branding + footer links between the two.
    - AuthScreen gained a "Privacy · Support" footer link so App Review can reach the pages from any point in the app.
    - Verified 200 OK via curl on both URLs and via Playwright screenshot.
    - Live at `https://greylynncc.com/privacy` and `/support` after deploy.
  - **Phase 5.2 (Feb 2026): DONE** — Café rules refresh (user's authoritative version):
    - Weekday rides (Mon-Fri) stop at The Brunchery (unchanged).
    - Airport loop + Julie Andrews + Sunday spin now stop at `Daily Bread · Britomart`.
    - Devonport loop + any Devonport ride now stops at `Calliope Rd Cafe · Devonport`.
    - Up'n'over (5 spellings) + Jailbreak + Struggle Street + West / Waitakeres / Scenic Drive / Henderson Valley all stop at `Little Sister · 91 Central Park Dr, Henderson` (address corrected from earlier Epsom placeholder).
    - Backfilled all existing rides in Mongo to the new addresses.
  - **Phase 5.3 (Feb 2026): DONE** — El Presidente self-edit + invite flow enhancements:
    - JB can now change his own profile photo. Backend `PATCH /riders/me` accepts `photo`.
    - `POST /riders/invite` gained `email`, `phone`, `photo`, `send_email` fields with a Resend-backed invite email + shareable `/?invite={id}` link.
    - New RegisterRiderModal: photo picker + email + phone + three delivery buttons (Send email / Send text / Add without inviting).
    - MongoDB users email index recreated with `partialFilterExpression` so null-email invited riders no longer collide.
  - **Phase 5.4 (Feb 2026): DONE** — Swipe-down dismiss on rider profiles:
    - New shared hook `/app/frontend/src/lib/usePullToDismiss.js`.
    - `ProfileModal`, `MemberCard`, and `RegisterRiderModal` all pull-down to dismiss.
    - Backdrop tap also dismisses.
  - **Phase 5.5 (Feb 2026): DONE** — Café Rules admin screen (no more code deploys for rule tweaks):
    - Backend: `cafe_rules` Mongo collection with in-memory cache + admin CRUD at `GET/POST/PATCH/DELETE /api/admin/cafe-rules`. Seeded from the hard-coded `_CAFE_MAP` on first boot.
    - Web SPA: new `CafeRulesAdmin` block on the Riders tab (admin-only) with filter, inline edit, add-new, and delete. Cache refreshes on every write so `/api/rides/cafe-suggest` reflects changes instantly.
  - **Phase 5.6 (Feb 2026): DONE** — Chat retention & wipe:
    - MongoDB TTL index on `messages.created_at` set to 604800s = 7 days.
    - Admin-only `DELETE /api/chat/messages` endpoint + WS `chat.cleared` broadcast.
    - ChatTab "Wipe now" button + "Messages auto-clear after 7 days" hint.
  - **Phase 5.7 (Feb 2026): DONE** — Café Rules admin on native mobile:
    - New `/app/mobile/src/components/CafeRulesAdmin.js` mirrors the web version.
  - **Phase 5.8 (Feb 2026): DONE** — Chat push, El Prez announcements, @mentions, mechanical alert, 1-hour ride reminder, and lock-screen push:
    - Backend: `ChatMessageIn.announcement` — only accepted from is_president. Announcements push to all riders via `push_to_all_except`.
    - Backend: `POST /api/chat/mechanical` — accepts optional lat/lng, creates a system chat message with a Google Maps link, broadcasts push to everyone except the reporter.
    - Backend: `send_pending_ride_1h_pushes` + 10-min loop — every ride starting in 55-90 min gets a "starts in 1h" push per RSVP=going rider with weather + cafe. Idempotent via `hour_reminder_sent_at`.
    - Backend: Expo push payload now includes `priority: high`, `channelId: default`, `_contentAvailable: True`, `interruptionLevel: active` — required for iOS 15+ lock-screen banners and Android heads-up on lock screen.
    - Mobile push.js: notification handler upgraded to Expo SDK 52+ API (`shouldShowBanner`, `shouldShowList`); Android channel bumped to `MAX` importance + `PUBLIC` lockscreen visibility.
    - Mobile app.json: added `UIBackgroundModes: ["remote-notification"]` (silent-push wake), `NSLocationWhenInUseUsageDescription` (mechanical alert).
    - Web ChatTab: Announce toggle **pinned above weather header** (El Prez only), Mechanical rendered as a full-width, pulsing SOS-style red emergency button above the composer, `@mention` picker dropdown, and no "El Prez" label on announcement messages (just name · time). Mechanical alerts render as red cards with Google Maps deep link.
    - Native ChatTab: matches web parity — Announce toggle pinned above weather, Mechanical as bold red emergency button below the composer, @mention picker chip strip, and geolocation via `expo-location`. `expo-location@~17.0.1` added to `mobile/package.json`.
  - **Phase 5.9 (Feb 2026): DONE** — Test push button:
  - **Phase 5.10 (Feb 2026): DONE** — Removed the "Welcome to the GLCC clubhouse" banner from web + native ChatTab (chat opens straight to weather header → messages).
  - **Phase 5.11 (Feb 2026): DONE** — Web Push via VAPID + Service Worker (see earlier notes).
  - **Phase 5.12 (Feb 2026): DONE** — Mechanical alert modal + universal Maps URL (see earlier notes).
  - **Phase 5.13 (Feb 2026): DONE** — 5-item batch, verified by testing_agent iteration_13 at 100% backend + 100% frontend:
    - **Mechanical sender visibility**: web + native ChatTab now optimistically appends the returned message doc to local state after POST /chat/mechanical succeeds, deduping against the WS broadcast by message id. Sender sees their own broadcast instantly.
    - **El Prez bio guaranteed**: seed() now restores JB's default bio ("Founder. 4th best cyclist in Grey Lynn.") if blank on every startup so it never disappears.
    - **Editable Member Since**: `ProfileUpdateIn.member_since` accepts an ISO string, `serialize_rider` exposes `member_since` (falls back to `created_at`), ProfileModal has a `<input type="date">` (`profile-since-input`) pre-populated with the current value, saves via PATCH /riders/me. Invalid dates return 400 "Invalid member_since date".
    - **Tab swipe navigation**: HomeShell tab-content div now has `onTouchStart`/`onTouchEnd` handlers. Horizontal swipe > 65px advances (leftward) or reverses (rightward) through Rides ↔ Coffee ↔ Riders ↔ Chat, respecting bounds.
    - **Swipe-right dismiss**: `usePullToDismiss` extended to track both `dy` (down) and `dx` (right) with 10px axis lock. ProfileModal + MemberCard outer transforms now use `translate(dx, dy)`, so either gesture dismisses whichever reaches threshold first.
    - Web ChatTab: replaced browser `confirm()` (which lost user-gesture context and silently killed geolocation) with a proper in-app modal (`mechanical-sheet`) offering two direct-tap buttons: "Send with location" runs geolocation in the correct gesture context, "Send without location" broadcasts empty.
    - Backend `maps_link` now uses the universal Google Maps deep-link format `https://www.google.com/maps/search/?api=1&query=lat%2Clng` — auto-opens the native Google Maps app on iOS + Android and falls back to google.com/maps in-browser.
    - The whole mechanical message card is tappable on both web (`<a href target=_blank>`) and native (TouchableOpacity + Linking.openURL) so users can open the location with a single tap on any device.
    - Testing agent verified end-to-end via Playwright: modal opens, sends without location works, resulting card renders as an anchor to the Maps URL, and all iteration_11 backend regressions still pass.
    - Backend generated VAPID keypair, stored in `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY_PEM`, `VAPID_CONTACT_EMAIL`).
    - New collection `web_push_subscriptions` with unique index on `endpoint`.
    - New endpoints: `GET /api/webpush/vapid-key` (unauthenticated public key), `POST /api/webpush/subscribe`, `DELETE /api/webpush/unsubscribe`.
    - `push_to_users` and `push_to_all_except` now fan out to both native Expo tokens AND web push subscriptions (pywebpush). Stale endpoints (404/410) auto-delete.
    - `POST /api/push/test` now returns `{ok, sent, native, web}` — counts both channels.
    - Frontend: new service worker `/public/sw.js` (push + notificationclick handlers). New `/lib/webpush.js` helper (register, unregister, permission check). Hooked into `store.jsx` login/register/logout.
    - "Send me a test push" button in ProfileModal now auto-requests browser permission + subscribes on first click, so tapping it once enables browser push AND fires a test in one step.
    - Verified via testing_agent: 10/10 backend cases pass at 100% (VAPID key exposed unauthenticated, subscribe upserts, test counts native+web separately, unsub removes, announcement gated to president, mechanical persists maps_link, 1h reminder helper live, /sw.js served as application/javascript).
    - Web ProfileModal now has a "Send me a test push" button (visible to everyone viewing their own profile). Hits `POST /api/push/test` and toasts back either "sent to N devices" or "No registered devices".
    - Native ProfileModal already had the same button (`testID="send-test-push"`). Both use the same backend endpoint. JB can verify lock-screen delivery in 2 taps after each EAS build.
    - JB (El Presidente) can now change his own profile photo. Backend `PATCH /riders/me` now accepts `photo` (was silently dropped). Frontend camera badge no longer hidden for `isMe`.
    - Same fix applies to every approved rider — anyone can now update their own avatar.
    - Verified: only `is_president=True` can promote/demote admins (`make_admin`/`remove_admin` returns 403 for non-president admins — pre-existing correct behaviour).
    - `POST /riders/invite` gained optional `email`, `phone`, `photo`, `send_email` fields. If `send_email=true`, sends a branded Resend invite email with a shareable `/?invite={id}` link. Response always returns `invite_link` so admins can share via SMS via the browser's native `navigator.share` sheet.
    - New RegisterRiderModal in the web SPA: photo picker, email + phone fields, three delivery buttons ("Send email" / "Send text" / "Add without inviting"), backdrop-tap dismiss.
    - MongoDB users email index recreated with `partialFilterExpression: {email: {$type: "string"}}` so multiple null-email invited riders no longer collide.
    - Weekday rides (Mon-Fri) stop at The Brunchery (unchanged).
    - Airport loop + Julie Andrews now stop at `Daily Bread · Britomart` (was Federal St).
    - Devonport loop + any Devonport ride now stops at `Calliope Rd Cafe · Devonport` (was The Depot Eatery).
    - West Auckland + Waitakeres + Scenic Drive + Henderson Valley + "out west" all stop at Little Sister.
    - Backfilled 2 existing Airport/Julie Andrews rides in Mongo to the new Britomart café.
    - Verified via `/api/rides/cafe-suggest` for 9 keyword variants.
    - New `/app/frontend/src/components/LegalPage.jsx` — full-page (breaks out of the phone frame) responsive layout serving `/privacy` and `/support` at the top of `App()` before AppShell. Content drawn from the drafts in `APP_STORE_LISTING.md` (data collected/not collected, third parties, retention, contact for privacy; sign-in help, pending state, push troubleshooting, block/unblock, delete-my-account, and email escalation for support). GLCC branding + footer links between the two.
    - AuthScreen gained a "Privacy · Support" footer link so App Review can reach the pages from any point in the app.
    - Verified 200 OK via curl on both URLs and via Playwright screenshot (both render cleanly at desktop widths — no phone frame in the way for Apple's reviewer).
    - Pages will auto-serve at `https://greylynncc.com/privacy` and `/support` the moment DNS points at this deployment.
- Phase 6 (Backlog): Refactor `/app/backend/server.py` (2100+ lines) into `/routes`, `/models`, `/services` modules.
- Proper admin-invite flow instead of auto-creating `.@glcc.pending` placeholder users.

## Session Feb 22, 2026 — Two-Step Delete Confirmation
- Added a two-step "Are you sure you want to delete this rider?" modal that gates the admin `admin-delete` action on both web and mobile.
- Web (`RidersTab.jsx`): new `confirmDeleteRider` state + destructive overlay with `data-testid="confirm-delete-rider"`, `confirm-delete-cancel`, `confirm-delete-yes`. Overlay stacks on top of the ProfileModal (z-40) and shows the rider's name inline.
- Mobile (`RidersTab.js`): `Alert.alert("Delete rider?", …)` with `destructive` Yes / `cancel` Cancel actions.
- Verified via testing_agent (iteration_14) — 100% (4/4 scenarios).

## Session Feb 22, 2026 — Mechanical Clear + Rider Card Fixes
- **Clear own mechanical**: sender OR any admin can tap "Fixed, on my way" ✅ or "Carry on without me" 🚴 under a live mechanical card. Posts a follow-up chat bubble attributed to the original reporter and mutes the original card (grey background, strike-through body, "Mechanical · Resolved" eyebrow, resolution meta line).
- **Backend**: `POST /api/chat/mechanical/{message_id}/resolve` body `{status: 'fixed'|'carry_on'}`. Auth: reporter or admin. Broadcasts `chat.updated` (muted original) + `chat.message` (follow-up). Serializer now emits `resolved`, `resolution`. Rejects double-resolve (400) and unauthorised (403). Regression tests at `/app/backend/tests/test_mechanical_resolve.py`.
- **Web/Native ChatTab**: subscribes to `chat.updated` to restyle original in place. New buttons `mechanical-clear-<id>`, `mechanical-fixed-<id>`, `mechanical-carry-<id>` only render for sender + admin.
- **Member Card Since**: card now reads `rider.member_since || rider.created_at`, so editing the "Member since" date on profile propagates instantly to the card (web + native).
- **Member Card contrast**: meta grid labels (Since, Coffee, Role, Number, Chapter) bumped from `text-white/40` to `text-white/75` (web) and `rgba(255,255,255,0.4)` → `0.75` (native). Border also lifted for legibility.
- **Swipe-back on Ride detail**: right-swipe > 65 px anywhere on the ride-detail view returns to the rides list. Web uses inline touch listeners; native uses `PanResponder` that only claims the gesture when clearly horizontal (`dx > 12 && |dx| > 1.6 * |dy|`). "Back to Rides · swipe →" hint added to the button (now visible on mobile after post-test fix).
- Verified via testing_agent (iteration_15) — backend 4/4 pytest + frontend 5/5 scenarios PASS.

## Latest Verified Test Report
`/app/test_reports/iteration_16.json` — mechanical resolve push + Live mini-map: **backend 7/7 pytest + frontend 100% PASS**.

## Session Feb 22, 2026 — Live Mechanical Map + Follow-up Push
- Added a Leaflet + OpenStreetMap mini-map at the top of Chat (web) that shows every unresolved mechanical as a red pin with an "Open in Google Maps" popup. Auto-fits bounds; hides once every mechanical is resolved.
- Native mobile fallback: a horizontal `mechanical-live-banner` pill strip renders above the messages ScrollView. Each pill (`mechanical-live-open-<id>`) taps into `Linking.openURL(mechanical.maps_link)`.
- Backend: `POST /api/chat/mechanical/{id}/resolve` now also fires `push_to_all_except` with title `🔧 Mechanical resolved` and body `<reporter>: ✅ Fixed — on their way` / `🚴 Carrying on without them` (data.type = `chat.mechanical.resolved`).
- New regression tests: `/app/backend/tests/test_mechanical_resolve_push.py` asserts the push signature via monkeypatch.

## Session Feb 22, 2026 — App Store Reviewer Accounts
- Added two idempotent seed accounts (auto-recreate on every backend startup, and re-pinned to spec if edited in the UI):
  - `apple-review@glcc.club` / `GreyLynn2026!` — approved regular member for the day-to-day rider demo + Apple 1.2 report/block flows.
  - `apple-review-admin@glcc.club` / `GreyLynn2026!` — approved admin (Ride Captain) for announce/moderate/delete flows.
- Update `App Store Connect → App Review → Sign-In Information` to hand Apple the member account (and optionally attach the admin one under "Notes").

## Session Feb 22, 2026 — Push Adoption Banner
- New `PushAdoptionBanner` at the top of Chat: shows only when `Notification.permission === "default"` and the rider hasn't tapped X. Enable button runs the existing `registerWebPush({silent: false})` flow. Dismiss persists via `localStorage["glcc.pushBanner.dismissed"]`.
- Retired the old `PushBanner.jsx` (globally rendered in HomeShell) — it duplicated the new one and had less contextual copy. HomeShell import removed, file deleted.
- Verified via testing_agent (iteration_17) — **100% (13/13 acceptance checks)** across default/denied/granted permission states, dismiss persistence, both Apple reviewer accounts, and coexistence with Leaflet mini-map.

## Session Feb 22, 2026 — App Store Screenshots
- New auto-capture script `/app/mobile/store-assets/screenshots/capture.py` (Playwright + Chromium) that logs in as `bryantj@xtra.co.nz` and captures 7 hero shots across 5 device sizes (iPhone 6.7"/6.5"/5.5", iPad 12.9", iPad 13"). Auto-clears any old open mechanicals + posts a fresh one on Great North Rd so the mini-map always has a live pin.
- Also seeded `bryantj@xtra.co.nz` (password `Roenick2707`, El Presidente, approved) on preview — one-off, not in the seed loop.
- Outputs to `/app/mobile/store-assets/screenshots/final/<device>/` with a README explaining upload order. Ready for App Store Connect → Media Manager.

## Session Feb 22, 2026 — Coffee → Coordinated Ride Rounds
Full rework of the coffee flow. Café stop is now a sub-object of a ride, not a standalone menu.

**Backend** (`server.py`)
- New models: `RideRoundStartIn`, `RideRoundOrderIn`. `serialize_round` computes `closed` from `close_at` (naive-datetime safe).
- Endpoints (all under approved-user auth):
  - `POST /api/rides/{ride_id}/round` — start a round. 5-min hard cutoff by default. Pushes to everyone via `push_to_all_except`.
  - `GET /api/rides/{ride_id}/round` — active round OR most recent closed one (within 30 min).
  - `POST /api/rides/{ride_id}/round/order` — upsert my order (free-text ≤140 chars).
  - `DELETE /api/rides/{ride_id}/round/order` — retract mine.
  - `POST /api/rides/{ride_id}/round/close` — buyer or admin closes early.
  - `GET /api/coffee/rounds/active` and `GET /api/coffee/rounds/history` — Coffee tab feeds.
- `coffee_rounds` TTL bumped from 1h → 7d + secondary indexes on `ride_id`, `close_at`.
- Regression: `/app/backend/tests/test_ride_rounds.py` — **16/16 PASS** (auto-close via Mongo backdate, permissions, upsert semantics).

**Web** (`RideRoundBlock.jsx` + rewritten `CoffeeTab.jsx`)
- Ride detail cafe block replaced with `RideRoundBlock`: countdown, prefill "Usual" button (reads `user.coffee`), free-text `round-order-input` + `round-submit`, order list `round-orders`, buyer-only `round-close-early`, `round-locked` state with `round-copy` (clipboard) and `round-dismiss` (also nulls local state so a new round can be started immediately).
- Coffee tab repurposed: `usual-card` with `usual-input` + `usual-save` (patches `/riders/me`), `active-rounds-section`, `history-section`, `coffee-round-row-<id>` rows, preview modal.

**Mobile** — parity via `/app/mobile/src/components/RideRoundBlock.js` + rewritten `/app/mobile/src/tabs/CoffeeTab.js`. Same testIDs.

**Verified** via testing_agent (iteration_18) — backend 16/16 pytest + full web e2e PASS. Medium UX bug on Dismiss patched post-report.

## Session Feb 22, 2026 — Coffee CTA Polish
- **Colour coord**: Coffee flow is now pink end-to-end (Usual card eyebrow, save button, Usual → chip on both web + native).
- **Bottom-of-ride CTA pair**: Ride detail moves the Coffee CTA to the very bottom (below Going list) and splits it into two clear buttons — **"I'm Buying"** (pink) and **"Not My Turn"** (outlined). "Not My Turn" locally hides the pair via `localStorage["glcc.notMyTurn.<rideId>"]` — reappears if someone actually starts a round.
- Fixed React hooks-order bug (moved `useState` for `notMyTurn` above the loading return).
- Save-Usual is no longer disabled when the value matches — always tappable.
