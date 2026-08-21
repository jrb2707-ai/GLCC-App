# GLCC — Grey Lynn Cycle Club (Mobile / iOS)

Native iOS build of the GLCC clubhouse app. Talks to the existing FastAPI
backend at **https://greylynncc.com/api** so everything the web app does
works the moment you sign in.

## What ships in Phase 1 (this drop)
- ✅ Native AuthScreen (sign-in, join-club, forgot-password, pending-approval flow)
- ✅ Native HomeShell with 4-tab navigation (Rides / Coffee / Riders / Chat)
- ✅ Rides tab — live pull from `/api/rides`, deep-link to Strava
- ✅ Coffee tab — order-my-coffee button + today's orders feed
- ✅ Riders tab — roster with role/coffee/member number, JB pinned at #1
- ✅ Chat tab — read + send messages, pending users see "chat locked"
- ✅ Secure token storage via `expo-secure-store`
- ✅ EAS build config (dev / preview / production)
- ✅ Bundle ID `com.greylynncc.app`, deep-link scheme `glcc://`
- ✅ Universal links from `greylynncc.com` to open in-app

## What's coming in later phases (still on the web app for now)
- Phase 2 — WebSocket live chat + coffee round pushes (currently polls every 10s)
- Phase 3 — Ride detail sheet with RSVP + café + route map
- Phase 4 — MemberCard modal (Rapha-style card popup)
- Phase 5 — Full ProfileModal (change email/password from device, admin edits)
- Phase 6 — Photo pick + upload from Camera Roll
- Phase 7 — Push notifications (Expo Push → Apple APNs)

## Setup on your Mac

```bash
cd /path/to/mobile
yarn install                # or `npm install`

# One-time: install EAS CLI globally
npm install -g eas-cli
eas login

# Point the project to your Apple team (opens a browser)
eas init                    # creates the EAS project + fills app.json extras.eas.projectId
```

## Run locally in Expo Go
```bash
yarn start
```
Scan the QR from Expo Go on your iPhone. Auth screen should hit
`https://greylynncc.com/api/auth/login`.

## Build for App Store Connect
```bash
# Update version + build number first in app.json (ios.buildNumber must increment each upload)
eas build --platform ios --profile production
```
Once EAS finishes, download the `.ipa` from https://expo.dev/accounts/…
or run `eas submit --platform ios` to push straight to App Store Connect
(requires filling in the `submit.production.ios` block in `eas.json`
with your Apple ID, ASC App ID and Team ID).

## App Store Connect setup checklist

Before your first `eas submit`, create the listing:

1. **App Store Connect → My Apps → +** → New App
   - Name: `GLCC`
   - Primary language: English (Australia) or English (NZ)
   - Bundle ID: `com.greylynncc.app`  *(register in Certificates → Identifiers first)*
   - SKU: `glcc-ios`
   - User Access: Full Access

2. **App Information**
   - Category (Primary): **Sports**
   - Category (Secondary): **Social Networking**
   - Content Rights: doesn't contain, use or access third-party content
   - Age Rating: 4+
   - Privacy Policy URL: `https://greylynncc.com/privacy`  *(create this page)*

3. **Pricing & Availability**
   - Free
   - Availability: Aotearoa New Zealand only (or worldwide, your call)

4. **App Privacy** (nutrition-label questionnaire)
   - Data collected: Email address, User ID, Name (for account creation)
   - Purpose: App Functionality only
   - Linked to identity: Yes
   - Used for tracking: No

5. **Version 1.0** (fill in from `store-assets/`)
   - Description, keywords, promotional text, screenshots — see the drafts in `/store-assets/`.

## Store assets to create before submission (in `/store-assets/`)

| Asset | Size | Notes |
| --- | --- | --- |
| `icon.png` | 1024×1024 | No transparency, no rounded corners (Apple applies) |
| Splash | 1284×2778 | Also needed at 1170×2532, 1179×2556 for smaller devices |
| Screenshots | 6.7" (1290×2796) & 6.5" (1284×2778) | 3-10 shots. Show AuthScreen, Rides list, Coffee flow, Roster, Chat |
| Preview video (optional) | 15-30s each device size | Boosts conversion — record on-device |

You'll need to actually design the icon + splash. Recommended: the pink dot
+ "GLCC." wordmark on a black background (matches the web hero). I've
stubbed placeholders in `/mobile/assets/` — replace with real 1024²
PNGs before you build.
