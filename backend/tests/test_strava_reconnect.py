"""Verify Strava panel handles stale/placeholder refresh token gracefully."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-craft-4628.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "jb@glcc.club"
ADMIN_PASSWORD = "Roenick2707"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_strava_status_returns_needs_reconnect(h):
    r = requests.get(f"{BASE_URL}/api/strava/status", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    print("status:", body)
    assert body["connected"] is False, f"expected connected=false, got {body}"
    assert body["needs_reconnect"] is True, f"expected needs_reconnect=true, got {body}"


def test_strava_sync_returns_401_reconnect(h):
    r = requests.post(f"{BASE_URL}/api/strava/sync", headers=h, timeout=30)
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"
    detail = r.json().get("detail", "")
    assert "reconnect" in detail.lower(), f"unexpected detail: {detail}"


def test_status_reflects_last_refresh_error_immediately(h):
    # After the failed sync above, calling status again should still be needs_reconnect
    # (this validates last_refresh_error is persisted, not just transient)
    r = requests.get(f"{BASE_URL}/api/strava/status", headers=h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["needs_reconnect"] is True
    assert body["connected"] is False


def test_strava_connect_returns_oauth_url(h):
    r = requests.get(f"{BASE_URL}/api/strava/connect", headers=h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "url" in body
    assert "strava.com" in body["url"].lower()
    assert "client_id" in body["url"]
