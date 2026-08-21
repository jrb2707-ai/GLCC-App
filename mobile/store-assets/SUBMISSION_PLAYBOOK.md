# GLCC — App Store Submission Playbook (v1.0)

> This is the single source of truth for shipping GLCC to the App Store.
> Everything in this file is expected to be executed on your **Mac** — EAS builds can be triggered from anywhere, but Transporter, Simulator screenshots and Xcode are Mac-only.
>
> Companion docs (already in this folder):
> - `BUILD_AND_SUBMIT.md` — quick build/submit commands (kept for reference)
> - `APP_STORE_LISTING.md` — copy for App Store Connect fields
> - `screenshots/README.md` — Maestro-driven screenshot capture

---

## 0. Readiness snapshot

| Requirement | Status |
| --- | --- |
| Backend live (rides, chat, coffee, moderation, Strava, weather) | Ready |
| Native app feature-complete (RN / Expo) | Ready |
| Apple 1.2 (report + block + delete + moderation) | Implemented |
| Apple 5.1.1(v) (in-app delete-my-account) | Implemented |
| Encryption declaration `ITSAppUsesNonExemptEncryption=false` | Set in `app.json` |
| iPhone-only (`supportsTablet: false`) | Set in `app.json` |
| Deep links (`applinks:greylynncc.com`, `scheme: glcc`) | Set |
| Screenshots (6.7") | Generate on Mac via Maestro |
| Privacy policy URL live | **TODO before submit** |
| Support URL live | **TODO before submit** |
| EAS Project ID in `app.json` | **TODO — replace placeholder** |
| Apple IDs in `eas.json` | **TODO — replace placeholders** |

Answer to "is this ready for the App Store?":
**Functionally yes.** The remaining work is (a) publishing the two web pages listed above, (b) filling three IDs, (c) running `eas build` + `eas submit` from your Mac, and (d) capturing screenshots on the Simulator via Maestro.

---

## 1. One-time setup on your Mac (~10 min)

```bash
cd ~/…/glcc/mobile          # wherever you cloned the repo
yarn install
npm install -g eas-cli maestro-cli
eas login                    # sign in with the Apple ID you'll ship under
eas init                     # attaches this project to your EAS account
# Copy the projectId that eas init prints and paste it into app.json:
#   expo.extra.eas.projectId = "…"
```

Also fill in `eas.json → submit.production.ios`:

```json
"appleId":     "you@yourdomain.com",           // Apple ID email
"ascAppId":    "1234567890",                   // App Store Connect App ID
"appleTeamId": "ABCDE12345"                    // 10-char team ID
```

Where to find those:
- **ascAppId** — App Store Connect → My Apps → your app → App Information → "Apple ID" field
- **appleTeamId** — https://developer.apple.com/account → Membership → Team ID

---

## 2. Two web pages you must publish **before** submit

Apple will 401-reject the review if either URL is behind auth. Static HTML on `greylynncc.com` is enough. Copy the drafts from `APP_STORE_LISTING.md`.

- `https://greylynncc.com/privacy` — required
- `https://greylynncc.com/support`  — required (can be a mailto page)

Verify with:

```bash
curl -I https://greylynncc.com/privacy
curl -I https://greylynncc.com/support
# Both must be 200 (or a 301/302 to a 200). No 401/403/404.
```

---

## 3. Build the iOS artifact (from your Mac or from CI)

```bash
cd mobile
eas build --platform ios --profile production
```

- First build takes ~15–25 min in EAS cloud.
- EAS returns a signed `.ipa` in your EAS dashboard.
- The build number auto-increments (`eas.json → production.autoIncrement: true`).

If it's your **second** submission, bump `version` in `app.json` (e.g. `1.0.0` → `1.0.1`) for a user-facing release. `buildNumber` auto-bumps.

---

## 4. Capture App Store screenshots on the Simulator

Do this **after** step 3 lands in TestFlight so you're screenshotting the exact build you're shipping.

```bash
# On your Mac
open -a Simulator
# Xcode → Window → Devices and Simulators → boot "iPhone 15 Pro Max" (6.7")
# TestFlight → GLCC → Install on that simulator
# Log in as: leo@glcc.club / cycle123  (approved regular member)

# Auto-drive the 5 screens
cd mobile/store-assets/screenshots
maestro test flows/
# PNGs land in ./captured/  →  rename → drop into App Store Connect
```

Detailed instructions and per-screen flow list live in
`store-assets/screenshots/README.md`.

Required sizes (Apple):
- **6.7" iPhone** — 1290×2796 (iPhone 15 Pro Max) — MANDATORY
- Apple downsizes to smaller devices automatically from this set.

---

## 5. Submit to App Store Connect

```bash
cd mobile
eas submit --platform ios --latest
```

- Uploads the last successful `.ipa` via Transporter.
- ASC processes for 15–60 min then the build shows up under "TestFlight" → "iOS Builds".
- Alternatively, download the `.ipa` from EAS and drop it into **Transporter.app** manually.

---

## 6. Fill App Store Connect metadata (once)

Copy/paste from `APP_STORE_LISTING.md` into the ASC form:

- App name, subtitle, promo text, description, keywords, URLs
- Age rating questionnaire → answer honestly (see `APP_STORE_LISTING.md`)
- Data safety — Apple's "App Privacy" nutrition labels
- **App Review Information** → paste this note verbatim:

```
GLCC has full Apple 1.2 moderation:
- Report: long-press any chat message → pick a reason (6 categories + free text)
- Block: Member Card → Block this rider (blocks are two-way in chat)
- Delete my account: Profile modal → Delete my account (password-confirmed)

Reviewer login: leo@glcc.club / cycle123
Admin login (for admin-only screens): jb@glcc.club / Roenick2707
```

- Attach 5 screenshots (6.7")
- Sign the export compliance question with **No** (encryption declaration is already `false` in `app.json`)
- Submit for review

---

## 7. Rejection recovery loop (what to expect)

If Apple rejects, you'll get an email quoting a Guideline number:

| Guideline | What to do |
| --- | --- |
| **1.2** — UGC | Confirm the review note above is in "App Review Information". Add screenshots of the Report / Block / Delete flows if asked. |
| **2.1** — Info.plist strings | Check `app.json → ios.infoPlist` — all `NS…UsageDescription` strings must be human-readable. |
| **4.0** — Design | Usually about broken screens. Re-record the Maestro screenshots on the failing screen. |
| **5.1.1(v)** — Account deletion | We ship the in-app delete. Screenshot the Profile → Delete button in the review note. |

For any rejection: fix → `eas build` (buildNumber auto-bumps) → `eas submit`. First-timers usually loop 1–2 times.

---

## 8. After approval — what "live" looks like

- ASC state: **"Ready for Sale"**
- App shows up on the Store in ~2 hours after approval (Apple's CDN caches)
- Future updates: bump `version` in `app.json`, `eas build`, `eas submit`. No new review required for point releases unless the reviewer flags something.

---

## 9. Emergency contacts / rollback

- **Pull from sale** — ASC → your app → Pricing and Availability → "Remove from sale" (users keep the installed copy).
- **Roll back a bad OTA update** (if using EAS Update) — `eas update --branch production --republish --group <previous-group-id>`.
- **Backend rollback** — the Emergent preview URL is decoupled; back-end can be rolled back independently of the shipped native app.

---

**TL;DR checklist**

- [ ] Publish `/privacy` and `/support` on greylynncc.com
- [ ] Fill `appleId` / `ascAppId` / `appleTeamId` in `eas.json`
- [ ] Fill `projectId` in `app.json` (from `eas init`)
- [ ] `eas build --platform ios --profile production`
- [ ] Maestro run → 5 screenshots
- [ ] Fill ASC listing (copy from `APP_STORE_LISTING.md`)
- [ ] Paste reviewer note (§6 above) into App Review Information
- [ ] `eas submit --platform ios --latest`
- [ ] Wait, respond to any rejection, re-submit
