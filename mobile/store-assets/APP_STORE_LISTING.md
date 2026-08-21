# App Store Connect — Draft Copy

Paste these into App Store Connect → Version 1.0.

## App name (30 char max)
`GLCC · Grey Lynn Cycle Club`

Fallback (if the above is too long): `GLCC Cycle Club`

## Subtitle (30 char max)
`Rides. Coffee. Peloton chat.`

## Promotional text (170 char max)
`Grey Lynn Cycle Club's home base — synced Strava rides, one-tap coffee rounds, and the group chat. New members join here, El Prez approves you, and you're rolling.`

## Description (4000 char max)

```
GLCC is the app for the Grey Lynn Cycle Club — Aotearoa's fourth best cycling
club, and proud of it. The clubhouse in your pocket, wherever the ride is going.

RIDES
• Every Strava club event, one tap away
• RSVP as Going, Maybe or Can't Go
• Deep-link straight to the Strava event so you can hit "I'm going" there too
• Cafe stop, distance, elevation and route map front and centre
• Automated evening-before ride reminder emails with weather forecast, cafe
  and the current going list

COFFEE
• One-tap "Order my coffee" — sends your usual to the group feed
• Today's coffee orders, live
• 1-hour auto-expiry keeps the feed clean

RIDERS
• The full roster, Rapha-inspired member cards with permanent member numbers
• Founder JB is #1, obviously
• Admin approval flow so the club stays the club

CHAT
• Live group chat with @mentions and push notifications
• Weather header in Auckland

BUILT FOR THE CLUB
• Free — no ads, no subscriptions, no crypto
• You sign up, an admin approves you, you're in
• Made by riders. 4th best in Grey Lynn. Ride hard, coffee harder.
```

## Keywords (100 char max, comma separated)
`cycling,cyclist,grey lynn,glcc,strava,peloton,coffee,ride,auckland,group ride,route,club,rapha`

## What's New in this Version (4000 char max, for updates)
For v1.0 leave as:
```
First release — the peloton is now in your pocket.
```

## Support URL
`https://greylynncc.com/support` *(add this route or link to a Notion/Google doc)*

## Marketing URL (optional)
`https://greylynncc.com`

## Privacy Policy URL (required)
`https://greylynncc.com/privacy` *(required before submission — must be reachable)*

Draft privacy content (put on the web page):

```
GLCC — Privacy Policy

Grey Lynn Cycle Club ("we") operates the GLCC mobile app and the
greylynncc.com website.

Data we collect
- Email address, name and coffee preference — to create your rider account
- Password hash (never the plain password) — to sign you in
- Your ride RSVPs and coffee orders — to power the club feed
- Chat messages — visible to other approved club members
- Push notification tokens (opt-in) — to deliver ride and coffee alerts

Data we do not collect
- Location, contacts, calendar or photo library (except when you tap "change
  photo", which only reads the single file you pick)
- Advertising or analytics identifiers

Third parties
- Resend.com — sends transactional email (password reset, ride reminders)
- OpenWeather — Auckland weather in the chat header
- Strava — synced club events (public data from the Strava Club API)

Retention
- Your account exists until you or an admin delete it. Coffee rounds auto-
  delete after 1 hour. Chat and rides remain in the club history.

Contact
- Email jason@greylynncc.com to delete your account or request your data.
```

## Age Rating

Answers to the Apple questionnaire:
- Cartoon or Fantasy Violence — None
- Realistic Violence — None
- Sexual Content or Nudity — None
- Profanity or Crude Humor — Infrequent/Mild *(chat allows it, mark honestly)*
- Alcohol, Tobacco, or Drug Use — None
- Simulated Gambling — None
- Horror/Fear Themes — None
- Mature/Suggestive Themes — None
- Medical/Treatment Information — None
- Unrestricted Web Access — No
- User-Generated Content — **Yes** (chat, coffee orders, profile bio)
  → Then Apple requires: Content Moderation, Reporting, Blocking users, and
    filtering objectionable content. See "User-generated content requirements"
    below.

Result: **4+**.

## User-Generated Content requirements (Apple Guideline 1.2) — ✅ IMPLEMENTED
Apple mandates ALL of the following exist in the app before approval:

1. **Content filtering** — profanity/offensive text auto-filtering
2. **User reporting** — a way to flag any message/profile
3. **User blocking** — a way to block another user
4. **Response to reports within 24h** — moderation SLA
5. **Account deletion** — in-app path to delete-my-account (Guideline 5.1.1(v))

Status in the shipped app (v1.0):

- **Reporting** — long-press any chat message (native) / flag icon on hover (web).
  Reason picker (6 categories + free text). Report is stored in `chat_reports`
  with a snapshot of the message, and every admin gets a push + WS event.
  Endpoint: `POST /api/chat/messages/{id}/report`.
- **Blocking** — Block button on the Member Card for anyone but yourself and
  El Presidente. Blocked users' messages never reach the chat feed and can't
  fire @mention pushes at you. Endpoint: `POST /api/blocks` /
  `DELETE /api/blocks/{target_id}`.
- **Account deletion** — Delete-my-account button inside the profile modal
  (mobile + web), with password confirmation. Removes push tokens, blocks,
  reports, coffee rounds and RSVPs; anonymises chat messages to "Former rider"
  so replies don't dangle. Endpoint: `DELETE /api/auth/me`.
- **Moderation SLA** — Admin dashboard polling is still manual (admins get
  pushed via `type: chat.report`). Response within 24h is the club's stated
  policy — mention this in the App Store submission notes.
- **Content filtering** — because the club is closed and admin-approved,
  no auto-profanity filter is bundled. Apple accepts a moderation policy in
  lieu of an auto-filter for small closed communities, but we should mention
  this explicitly in review notes and turn on an auto-filter later if 1.2
  reviewers push back.

## Screenshot ideas (10 slots — pick 3-5 best)

Sizes needed: 6.7" iPhone (1290×2796) AND 6.5" (1284×2778).
Use the same 5 screenshots for both — Apple downsizes automatically.

1. AuthScreen with hero + glass panel: "GLCC. — 4th best cycle club in Grey Lynn"
2. Rides list with 3 upcoming rides + distance/elevation stats
3. Coffee tab with "ORDER MY COFFEE" button + today's orders feed
4. Riders tab showing JB at #0001 + roster
5. Member card modal (Rapha-style)
6. Chat tab with a few messages + weather header
