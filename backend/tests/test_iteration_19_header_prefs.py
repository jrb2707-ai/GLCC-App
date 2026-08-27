"""Iteration 19 regression: new Header/notifications/clear + DM delete + prefs."""
import os
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-craft-4628.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "bryantj@xtra.co.nz"
ADMIN_PASSWORD = "Roenick2707"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def peer_token():
    # sam is a seeded regular member
    return _login("sam@glcc.club", "cycle123")


@pytest.fixture(scope="module")
def peer_headers(peer_token):
    return {"Authorization": f"Bearer {peer_token}"}


# --- basic regression endpoints ---
def test_get_rides(admin_headers):
    r = requests.get(f"{API}/rides", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert "rides" in r.json()


def test_get_riders(admin_headers):
    r = requests.get(f"{API}/riders", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert "riders" in r.json()


def test_get_dm_conversations(admin_headers):
    r = requests.get(f"{API}/dm/conversations", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    assert "conversations" in r.json()


# --- notification prefs (PUT partial merge) ---
def test_notification_prefs_toggle(admin_headers):
    # Turn coffee off
    r = requests.put(f"{API}/users/me/notification-prefs", headers=admin_headers,
                     json={"coffee": False}, timeout=15)
    assert r.status_code == 200
    body = r.json()
    prefs = body.get("notification_prefs") or {}
    assert prefs.get("coffee") is False
    # Turn coffee back on
    r2 = requests.put(f"{API}/users/me/notification-prefs", headers=admin_headers,
                      json={"coffee": True}, timeout=15)
    assert r2.status_code == 200
    prefs2 = r2.json().get("notification_prefs") or {}
    assert prefs2.get("coffee") is True


# --- notifications feed + clear ---
def test_notifications_feed_and_clear(admin_headers):
    r = requests.get(f"{API}/notifications", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "unread" in data
    # Clear
    c = requests.post(f"{API}/notifications/clear", headers=admin_headers, timeout=15)
    assert c.status_code == 200
    assert c.json().get("ok") is True
    # After clear, items should be empty (until a fresh event)
    r2 = requests.get(f"{API}/notifications", headers=admin_headers, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("items") == []


# --- DM delete flow ---
def test_dm_send_and_delete(admin_headers, peer_headers):
    # Find sam's user id
    riders = requests.get(f"{API}/riders", headers=admin_headers, timeout=15).json()["riders"]
    sam = next((r for r in riders if r.get("email") == "sam@glcc.club" or "sam" in (r.get("name") or "").lower()), None)
    assert sam is not None, "sam@glcc.club rider not found"
    peer_id = sam["id"]

    # admin sends a DM to sam
    send = requests.post(
        f"{API}/dm/conversations/{peer_id}/messages",
        headers=admin_headers,
        json={"text": "TEST_iter19 delete me"},
        timeout=15,
    )
    assert send.status_code == 200, send.text
    msg = send.json()["message"]
    mid = msg["id"]

    # confirm the message shows up in the thread
    thread = requests.get(f"{API}/dm/conversations/{peer_id}", headers=admin_headers, timeout=15)
    assert thread.status_code == 200
    ids = [m["id"] for m in thread.json().get("messages", [])]
    assert mid in ids

    # delete it
    d = requests.delete(f"{API}/dm/messages/{mid}", headers=admin_headers, timeout=15)
    assert d.status_code in (200, 204), d.text

    # confirm removed
    thread2 = requests.get(f"{API}/dm/conversations/{peer_id}", headers=admin_headers, timeout=15)
    ids2 = [m["id"] for m in thread2.json().get("messages", [])]
    assert mid not in ids2


def test_dm_delete_non_participant_forbidden(admin_headers, peer_headers):
    """Recipient IS allowed to delete (server intent per docstring). But an
    unrelated third party must not be. Uses leo -> sam DM, admin tries."""
    leo_token = _login("leo@glcc.club", "cycle123")
    leo_headers = {"Authorization": f"Bearer {leo_token}"}
    riders = requests.get(f"{API}/riders", headers=leo_headers, timeout=15).json()["riders"]
    sam = next((r for r in riders if "sam" in (r.get("name") or "").lower()), None)
    if not sam:
        # fall back — admin can see everyone
        admin_riders = requests.get(f"{API}/riders", headers=admin_headers, timeout=15).json()["riders"]
        sam = next((r for r in admin_riders if "sam" in (r.get("name") or "").lower()), None)
    if not sam:
        pytest.skip("sam not found in /riders")
    r = requests.post(
        f"{API}/dm/conversations/{sam['id']}/messages",
        headers=leo_headers,
        json={"text": "TEST_iter19 leo->sam"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    mid = r.json()["message"]["id"]
    # admin (not in the convo) must get 403
    d = requests.delete(f"{API}/dm/messages/{mid}", headers=admin_headers, timeout=15)
    assert d.status_code == 403, f"expected 403, got {d.status_code} {d.text}"
    # cleanup
    requests.delete(f"{API}/dm/messages/{mid}", headers=leo_headers, timeout=15)
