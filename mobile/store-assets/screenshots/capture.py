"""GLCC App Store Screenshot Auto-Capture.

Captures the six hero shots across every device size Apple currently accepts.
Uses Playwright + Chromium with per-device viewport + deviceScaleFactor so the
CSS layout stays mobile-native while the final PNG lands at the exact pixel
dimensions App Store Connect requires.

Run:
    python3 /app/mobile/store-assets/screenshots/capture.py
Outputs to:
    /app/mobile/store-assets/screenshots/final/<size>/<01-…>.png
"""
import asyncio
import os
import subprocess
from pathlib import Path
from playwright.async_api import async_playwright

PREVIEW_URL = subprocess.check_output(
    "grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2",
    shell=True,
).decode().strip()

LOGIN = ("bryantj@xtra.co.nz", "Roenick2707")

# CSS viewport × device scale factor → target pixel size Apple requires.
# We keep viewport small enough for the mobile layout and let deviceScaleFactor
# scale the raster to the exact required pixels.
DEVICES = {
    "iphone-6.7in-1290x2796": {"width": 430, "height": 932, "scale": 3},
    "iphone-6.5in-1242x2688": {"width": 414, "height": 896, "scale": 3},
    "iphone-5.5in-1242x2208": {"width": 414, "height": 736, "scale": 3},
    # iPads: portrait, low scale — the app is already responsive so it stretches.
    "ipad-13in-2064x2752":    {"width": 1032, "height": 1376, "scale": 2},
    "ipad-12.9in-2048x2732":  {"width": 1024, "height": 1366, "scale": 2},
}

OUT_ROOT = Path("/app/mobile/store-assets/screenshots/final")


async def login(page):
    """Fill the auth form and end up on the Rides tab."""
    await page.goto(PREVIEW_URL, wait_until="domcontentloaded", timeout=30000)
    # Clear any old push-adoption dismiss + login state.
    await page.evaluate("() => { try { localStorage.clear(); } catch(_){} }")
    await page.goto(PREVIEW_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_selector('input[type="email"]', timeout=15000)
    await page.fill('input[type="email"]', LOGIN[0])
    await page.fill('input[type="password"]', LOGIN[1])
    await page.click('button[type="submit"]')
    await page.wait_for_selector('[data-testid="tab-content"]', timeout=15000)
    await page.wait_for_timeout(1500)


async def shot(page, out_dir: Path, name: str):
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.png"
    await page.screenshot(path=str(path), full_page=False, type="png")
    print(f"  ✓ {path}")


async def capture_device(browser, device_key: str, spec: dict):
    out_dir = OUT_ROOT / device_key
    print(f"\n== {device_key} ({spec['width']}×{spec['height']} @{spec['scale']}x)")
    ctx = await browser.new_context(
        viewport={"width": spec["width"], "height": spec["height"]},
        device_scale_factor=spec["scale"],
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    )
    # Suppress the push-adoption banner + geolocation permission prompt in shots.
    await ctx.add_init_script("""
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
        localStorage.setItem('glcc.pushBanner.dismissed', '1');
    """)
    page = await ctx.new_page()

    # 01 — Auth (marketing shot without the form filled in)
    await page.goto(PREVIEW_URL, wait_until="domcontentloaded", timeout=30000)
    await page.evaluate("() => { try { localStorage.clear(); } catch(_){} }")
    await page.goto(PREVIEW_URL, wait_until="domcontentloaded", timeout=30000)
    await page.wait_for_selector('input[type="email"]', timeout=15000)
    await page.wait_for_timeout(800)
    await shot(page, out_dir, "01-auth")

    # Now log in for the other shots.
    await login(page)

    # 02 — Rides list
    rides = await page.query_selector('[data-testid="tab-rides"]')
    if rides:
        await rides.click()
        await page.wait_for_timeout(1200)
    await shot(page, out_dir, "02-rides-list")

    # 03 — Ride detail (tap first ride card)
    card = await page.query_selector('[data-testid^="ride-card-"]')
    if card:
        await card.click()
        await page.wait_for_timeout(1500)
        await shot(page, out_dir, "03-ride-detail")
        back = await page.query_selector('[data-testid="ride-back"]')
        if back:
            await back.click()
            await page.wait_for_timeout(500)

    # 04 — Chat (hero: mini-map + mechanical thread)
    chat = await page.query_selector('[data-testid="tab-chat"]')
    if chat:
        await chat.click()
        await page.wait_for_timeout(1500)
    # Give leaflet tiles time to render.
    await page.wait_for_timeout(1800)
    await shot(page, out_dir, "04-chat-mechanical")

    # 05 — Riders roster + Member Card
    riders = await page.query_selector('[data-testid="tab-riders"]')
    if riders:
        await riders.click()
        await page.wait_for_timeout(1200)
    await shot(page, out_dir, "05-riders-roster")
    # Open first non-self rider card
    first_rider = await page.query_selector('[data-testid^="rider-card-"]')
    if first_rider:
        await first_rider.click()
        await page.wait_for_timeout(1200)
        view_card = await page.query_selector('[data-testid="view-member-card"]')
        if view_card:
            await view_card.click()
            await page.wait_for_timeout(1200)
            await shot(page, out_dir, "05b-member-card")
            close = await page.query_selector('[data-testid="member-card-close"]')
            if close:
                await close.click()
                await page.wait_for_timeout(400)
        # Close the profile modal
        close_p = await page.query_selector('[data-testid="profile-close"]')
        if close_p:
            await close_p.click()
            await page.wait_for_timeout(400)

    # 06 — Coffee
    coffee = await page.query_selector('[data-testid="tab-coffee"]')
    if coffee:
        await coffee.click()
        await page.wait_for_timeout(1200)
    await shot(page, out_dir, "06-coffee")

    await ctx.close()


async def main():
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for key, spec in DEVICES.items():
            try:
                await capture_device(browser, key, spec)
            except Exception as e:
                print(f"  ✗ {key} FAILED: {e}")
        await browser.close()
    print(f"\nDone. Finals under: {OUT_ROOT}")


if __name__ == "__main__":
    asyncio.run(main())
