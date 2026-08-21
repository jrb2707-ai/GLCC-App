# iOS Build & Submit Checklist

Run these once on your Mac from `/mobile`:

```bash
yarn install
npm install -g eas-cli
eas login                    # sign in with the Apple ID you'll ship under
eas init                     # attaches this project to your EAS account
```

## Before every submission

1. **Bump the build number** in `app.json` → `ios.buildNumber` (e.g. "1" → "2").
   Apple rejects duplicate build numbers.
2. **Bump the version** in `app.json` → `version` for user-facing releases (e.g. "1.0.0" → "1.0.1").
3. Replace the placeholders in `eas.json` (`submit.production.ios`) with your real:
   - `appleId` — your Apple ID email
   - `ascAppId` — App Store Connect App ID (10-digit number from ASC)
   - `appleTeamId` — 10-char team ID from developer.apple.com

## Build

```bash
eas build --platform ios --profile production
```
- First build takes ~15-25 min in EAS cloud.
- You'll get an `.ipa` you can download OR submit directly.

## Submit
```bash
eas submit --platform ios
```
- Uploads the `.ipa` to App Store Connect via Transporter.
- ASC will process for 15-60 min then the build appears in your listing.

## First-submission Apple checks that trip people up

- ❌ **Privacy policy URL** must be publicly reachable (302 or 200, not 401).
  Create `https://greylynncc.com/privacy` before you submit.
- ❌ **UGC moderation** — Apple 1.2 requires block + report + auto-filter
  BEFORE approval since we have user chat. See `store-assets/APP_STORE_LISTING.md`.
- ❌ **Screenshots** must be provided in BOTH 6.7" and 6.5" iPhone sizes.
- ❌ **Sign-in required for reviewer** — provide the `jb@glcc.club` /
  `Roenick2707` demo login in the "App Review Information" section OR
  create a `reviewer@glcc.club` account with a note.
- ❌ **Data safety questionnaire** — must be filled before submit, not after.

## Rejection recovery loop

When Apple rejects, they email you a Guideline reference (e.g. 1.2, 2.1, 5.1.1).
Read the Guideline, fix the code or the listing, `eas build` again with a
bumped `buildNumber`, then `eas submit`. Usually 1-2 loops for a first-time app.

## Common phase-2 add-ons (BEFORE App Store review approval)

Track these in `PRD.md` — Apple will hold up 1.0 without them:

1. Report button on chat messages (Guideline 1.2)
2. Block user from profile modal (Guideline 1.2)
3. Delete-my-account inside the app (Guideline 5.1.1(v))
4. Terms of Service URL (highly recommended)
5. iPad support — either enable it and test, or explicitly declare
   iPhone-only in `app.json` → `ios.supportsTablet: false` (already done here).
