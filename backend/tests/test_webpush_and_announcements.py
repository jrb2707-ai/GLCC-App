"""Backend tests for Web Push (VAPID), push/test aggregation,
announcement gating, mechanical alerts, 1h-ride reminder helper,
and service-worker delivery."""
import os
import uuid
import asyncio
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-craft-4628.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

JB = {"email": "jb@glcc.club", "password": "Roenick2707"}
LEO = {"email": "leo@glcc.club", "password": "cycle123"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def jb_token():
    return _login(**JB)


@pytest.fixture(scope="module")
def leo_token():
    return _login(**LEO)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


# ---------------- VAPID public key ----------------
class TestVapidKey:
    def test_unauthenticated_vapid_key(self):
        r = requests.get(f"{API}/webpush/vapid-key", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "public_key" in data
        assert isinstance(data["public_key"], str)
        assert len(data["public_key"]) > 20, f"vapid key looks empty: {data}"


# ---------------- Service worker ----------------
class TestServiceWorker:
    def test_sw_served_as_js(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=10)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "").lower()
        assert "javascript" in ct, f"unexpected content-type: {ct}"
        assert len(r.text) > 50
        # Must contain a service worker event handler for push OR notificationclick
        assert ("push" in r.text) or ("notificationclick" in r.text)


# ---------------- Web push subscription CRUD + push/test aggregation ----------------
class TestWebPushSubscribeAndPushTest:
    def _fake_sub(self):
        # unique endpoint per test run
        return {
            "endpoint": f"https://fcm.googleapis.com/fcm/send/TEST_{uuid.uuid4().hex}",
            "keys": {
                "p256dh": "BJv9Cw7VBmZv6d3T9nQK3wF-wV0mYqrq2s8Zj3rZk3lT8mVYQ5m6H0hj2wU4pW7cW6X1t8xk5s5v3jw3v5cQ9uY",
                "auth": "TEST_" + uuid.uuid4().hex[:16],
            },
        }

    def test_full_flow(self, jb_token):
        # Baseline: push/test may already return either state depending on env.
        # Ensure a clean slate by unsubscribing anything with our TEST_ prefix isn't possible
        # (no list endpoint), so we just add a fresh sub and check counts.
        sub = self._fake_sub()

        # 1. Subscribe (auth required)
        r = requests.post(f"{API}/webpush/subscribe", json=sub, headers=_auth(jb_token), timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # 2. push/test must now report at least 1 web sub for JB
        r2 = requests.post(f"{API}/push/test", headers=_auth(jb_token), timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("ok") is True, body
        assert body.get("web", 0) >= 1, body
        assert body.get("sent", 0) == body.get("native", 0) + body.get("web", 0)

        # 3. Unsubscribe
        r3 = requests.request(
            "DELETE",
            f"{API}/webpush/unsubscribe",
            json={"endpoint": sub["endpoint"]},
            headers=_auth(jb_token),
            timeout=10,
        )
        assert r3.status_code == 200, r3.text
        assert r3.json().get("ok") is True

    def test_subscribe_requires_auth(self):
        r = requests.post(f"{API}/webpush/subscribe", json={
            "endpoint": "https://example.com/xyz",
            "keys": {"p256dh": "x" * 40, "auth": "y" * 16},
        }, timeout=10)
        assert r.status_code in (401, 403), r.status_code

    def test_push_test_no_devices_returns_ok_false(self, leo_token):
        # Leo probably has no push tokens or web subs in this preview env.
        # If he does, this test is informational — skip.
        r = requests.post(f"{API}/push/test", headers=_auth(leo_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        if body.get("ok") is True:
            pytest.skip(f"Leo has registered devices in this env: {body}")
        assert body == {"ok": False, "detail": "No registered devices"}


# ---------------- Announcement gating ----------------
class TestAnnouncementGating:
    def test_president_can_announce(self, jb_token):
        r = requests.post(
            f"{API}/chat/messages",
            json={"text": f"TEST_announce {uuid.uuid4().hex[:6]}", "announcement": True},
            headers=_auth(jb_token),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg.get("announcement") is True, msg

    def test_non_president_announcement_stripped(self, leo_token):
        r = requests.post(
            f"{API}/chat/messages",
            json={"text": f"TEST_leo_announce {uuid.uuid4().hex[:6]}", "announcement": True},
            headers=_auth(leo_token),
            timeout=10,
        )
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg.get("announcement") is False, msg


# ---------------- Mechanical endpoint ----------------
class TestMechanical:
    def test_with_location_universal_maps_url(self, leo_token):
        # Per bug fix: maps_link must be a universal Google Maps deep-link that
        # OS-routes to native Maps on iOS/Android and falls back to web.
        payload = {"lat": -36.86234, "lng": 174.75, "text": "TEST_mech loc"}
        r = requests.post(f"{API}/chat/mechanical", json=payload, headers=_auth(leo_token), timeout=10)
        assert r.status_code == 200, r.text
        msg = r.json()
        mech = msg.get("mechanical")
        assert mech is not None, msg
        link = mech.get("maps_link")
        assert link, mech
        assert link.startswith("https://www.google.com/maps/search/?api=1&query="), link
        # lat/lng must be URL-encoded with comma as %2C
        assert "%2C" in link, link
        # Both coordinates should appear (allow 6-decimal formatting)
        assert "-36.86234" in link or "-36.862340" in link, link
        assert "174.75" in link, link
        assert msg.get("system") is True

    def test_without_location(self, leo_token):
        r = requests.post(f"{API}/chat/mechanical", json={"text": "TEST_mech noloc"}, headers=_auth(leo_token), timeout=10)
        assert r.status_code == 200, r.text
        msg = r.json()
        mech = msg.get("mechanical")
        assert mech is not None, msg
        assert mech.get("maps_link") is None, mech
        # Text should mention no location shared
        text = (msg.get("text") or "").lower()
        assert ("no location" in text) or ("didn't share" in text) or ("did not share" in text) or ("location not" in text), msg


# ---------------- 1h ride reminder helper ----------------
class TestOneHourReminderHelper:
    def test_helper_returns_counts(self):
        """Import the backend module directly and invoke the async helper.
        The DB may have no rides in the 55-90 minute window, so counts may be zero."""
        import sys
        sys.path.insert(0, "/app/backend")
        import server as srv  # type: ignore

        assert hasattr(srv, "send_pending_ride_1h_pushes")
        result = asyncio.get_event_loop().run_until_complete(srv.send_pending_ride_1h_pushes()) \
            if not asyncio.get_event_loop().is_running() else asyncio.run(srv.send_pending_ride_1h_pushes())
        assert isinstance(result, dict)
        assert "rides_notified" in result
        assert "pushes_sent" in result
        assert isinstance(result["rides_notified"], int)
        assert isinstance(result["pushes_sent"], int)
