# GLCC Screenshot Kit

One command to produce the five 1290×2796 PNGs App Store Connect wants.

## First-time setup (once per Mac)

```bash
xcode-select --install
brew install --cask maestro
```

You also need an **iPhone 15 Pro Max** simulator available in Xcode →
Window → Devices and Simulators. Any iOS 17+ runtime works.

## Usage

### If you already installed the app via TestFlight

```bash
cd mobile/store-assets/screenshots
./make-screenshots.sh
```

### If you want to build from source first

```bash
cd mobile/store-assets/screenshots
./make-screenshots.sh --dev
```

`--dev` runs `npx expo run:ios` from `mobile/` before the flows — takes
5-10 minutes on a cold build.

## What lands in `output/`

| File | What it shows |
| --- | --- |
| `01-auth.png` | Auth hero + GLCC glass panel |
| `02-rides-list.png` | Rides Calendar with the next few rides |
| `03-ride-detail.png` | Ride detail — stats, RSVP, café, going chips |
| `04-coffee.png` | Coffee tab hero + Today's coffee orders |
| `05-member-card.png` | Jason's Rapha-style member card modal |

Each PNG is verified to be `1290×2796` before the script exits — App
Store Connect will refuse anything else in the 6.7" slot.

## Uploading

App Store Connect → your app → Version → Screenshots → iPhone 6.7"
Display → drag all 5 files in from `output/`. Apple auto-downsizes for
smaller devices from these.

## Troubleshooting

- **"Simulator 'iPhone 15 Pro Max' not found"** — open Xcode → Window →
  Devices and Simulators → Simulators tab → `+` → pick iPhone 15 Pro Max +
  iOS 17+ runtime.
- **Flows time out** — the seed user `leo@glcc.club` must exist. The
  backend seeds it on startup; if you wiped the DB, re-hit the health
  endpoint or restart the FastAPI service.
- **Screenshots look tiny / include the notch bezel** — check that
  `xcrun simctl status_bar` supports your Xcode version. Xcode 15+ ships
  with the `status_bar` override. Otherwise remove the `status_bar` block
  from `make-screenshots.sh`.
- **Different bundle id in EAS** — change `BUNDLE_ID` at the top of
  `make-screenshots.sh` and the `appId:` line at the top of each
  `flows/*.yaml`.
