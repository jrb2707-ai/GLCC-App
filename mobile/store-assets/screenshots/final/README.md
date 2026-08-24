# GLCC App Store Screenshots — Auto-Generated Set

**Login used:** `bryantj@xtra.co.nz` / `Roenick2707` (El Presidente)
**Captured:** Feb 22, 2026
**Script:** `../capture.py` (re-run any time to regenerate)

## Device folders

Each folder contains the exact pixel size Apple requires for that device class.
Upload the whole folder to App Store Connect → Media Manager → Screenshots.

| Folder | Device | Pixels | Apple slot |
|---|---|---|---|
| `iphone-6.7in-1290x2796/` | iPhone 15/16 Pro Max | 1290 × 2796 | **6.7" Display (Required)** |
| `iphone-6.5in-1242x2688/` | iPhone 11 Pro Max, XS Max | 1242 × 2688 | 6.5" Display |
| `iphone-5.5in-1242x2208/` | iPhone 8 Plus | 1242 × 2208 | 5.5" Display (legacy) |
| `ipad-13in-2064x2752/` | iPad Pro M4 13" | 2064 × 2752 | iPad 6.9" Display |
| `ipad-12.9in-2048x2732/` | iPad Pro 12.9" (older) | 2048 × 2732 | iPad 12.9" Display (Required if iPad supported) |

## Shot list (in order)

1. `01-auth.png` — Sign-in / register screen with the GLCC lockup
2. `02-rides-list.png` — Rides tab with Auckland weather + Strava rides
3. `03-ride-detail.png` — Ride detail with route, RSVPs, and coffee stop
4. `04-chat-mechanical.png` — **Hero shot**: live mechanical mini-map + Fixed/Carry-on buttons
5. `05-riders-roster.png` — Riders tab with the club roster
6. `05b-member-card.png` — Full-screen Member Card with number, role, since, coffee
7. `06-coffee.png` — Coffee tab (auto-suggested café + roster)

## Regenerating

```
python3 /app/mobile/store-assets/screenshots/capture.py
```

The script auto-clears any open mechanicals and posts a fresh one with real
Auckland coordinates before capturing shot #4, so the mini-map always has a
pin on Great North Road.

## Notes for App Store Connect

- Apple accepts a single 6.7" set and auto-generates the smaller sizes; you
  only *need* the `iphone-6.7in-1290x2796/` folder. The others are provided
  for defensive coverage.
- The "I've a Mechanical" red button is visible in shots 4 & 5 — that's
  intentional; it's the app's most differentiating feature.
- All account names + Auckland location data is real fixture data. If you
  want to swap names for privacy, edit the seed in `backend/server.py`.
