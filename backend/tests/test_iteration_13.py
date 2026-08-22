"""Iteration 13 tests:
1. /auth/me for JB includes non-empty bio and ISO member_since
2. PATCH /riders/me member_since success + invalid date -> 400
3. POST /chat/mechanical returns top-level id + maps_link, and message appears in GET /chat/messages
4. Regressions: webpush endpoints, announcement gating, /rides/cafe-suggest rules
"""
import os
import re
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

JB = {"email": "jb@glcc.club", "password": "Roenick2707"}
LEO = {"email": "leo@glcc.club", "password": "cycle123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def jb_token():
    return _login(JB)


@pytest.fixture(scope="module")
def leo_token():
    return _login(LEO)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# --- (1) /auth/me bio + member_since -------------------------------
class TestElPrezProfile:
    def test_me_has_bio_and_member_since(self, jb_token):
        r = requests.get(f"{API}/auth/me", headers=_hdr(jb_token), timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me.get("is_president") is True
        bio = (me.get("bio") or "").strip()
        assert bio, f"JB bio must be non-empty, got: {me.get('bio')!r}"
        ms = me.get("member_since")
        assert isinstance(ms, str) and len(ms) >= 10
        # Should be ISO datetime-parseable
        assert re.match(r"^\d{4}-\d{2}-\d{2}T", ms), f"member_since not ISO datetime: {ms}"


# --- (2) PATCH /riders/me member_since --------------------------------
class TestMemberSinceUpdate:
    def test_valid_date(self, jb_token):
        r = requests.patch(f"{API}/riders/me", headers=_hdr(jb_token),
                           json={"member_since": "2018-03-15"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("member_since", "").startswith("2018-03-15")
        # persistence
        me = requests.get(f"{API}/auth/me", headers=_hdr(jb_token)).json()
        assert me.get("member_since", "").startswith("2018-03-15")

    def test_invalid_date_400(self, jb_token):
        r = requests.patch(f"{API}/riders/me", headers=_hdr(jb_token),
                           json={"member_since": "not-a-date"}, timeout=15)
        assert r.status_code == 400
        assert "Invalid member_since date" in r.text


# --- (3) POST /chat/mechanical returns id + maps_link -----------------
class TestMechanicalReturn:
    def test_returns_id_and_maps_link_and_visible_in_list(self, leo_token):
        payload = {"lat": -36.8666, "lng": 174.7500, "text": "TEST_ iter13 flat tyre"}
        r = requests.post(f"{API}/chat/mechanical", headers=_hdr(leo_token),
                          json=payload, timeout=15)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert isinstance(msg.get("id"), str) and msg["id"]
        assert msg.get("mechanical", {}).get("maps_link", "").startswith(
            "https://www.google.com/maps/search/?api=1&query="
        )
        msg_id = msg["id"]

        # GET /chat/messages must list this id
        g = requests.get(f"{API}/chat/messages", headers=_hdr(leo_token), timeout=15)
        assert g.status_code == 200
        ids = [m.get("id") for m in g.json().get("messages", [])]
        assert msg_id in ids, "posted mechanical missing from list"


# --- (4) Web push regression ------------------------------------------
class TestWebPushRegression:
    def test_vapid_key(self):
        r = requests.get(f"{API}/webpush/vapid-key", timeout=15)
        assert r.status_code == 200
        assert r.json().get("public_key")

    def test_subscribe_and_unsubscribe(self, leo_token):
        fake = {
            "endpoint": "https://fcm.googleapis.com/fcm/send/TEST_iter13_endpoint_xyz",
            "keys": {"p256dh": "TEST_p256dh_key", "auth": "TEST_auth_key"},
        }
        s = requests.post(f"{API}/webpush/subscribe", headers=_hdr(leo_token),
                          json=fake, timeout=15)
        assert s.status_code in (200, 201), s.text
        # DELETE with endpoint payload
        d = requests.delete(f"{API}/webpush/unsubscribe", headers=_hdr(leo_token),
                            json={"endpoint": fake["endpoint"]}, timeout=15)
        assert d.status_code in (200, 204), d.text


# --- (5) Announcement gating ------------------------------------------
class TestAnnouncementGating:
    def test_jb_announcement_true(self, jb_token):
        r = requests.post(f"{API}/chat/messages", headers=_hdr(jb_token),
                          json={"text": "TEST_iter13 JB announce", "announcement": True},
                          timeout=15)
        assert r.status_code in (200, 201)
        assert r.json().get("announcement") is True

    def test_leo_announcement_forced_false(self, leo_token):
        r = requests.post(f"{API}/chat/messages", headers=_hdr(leo_token),
                          json={"text": "TEST_iter13 leo attempt", "announcement": True},
                          timeout=15)
        assert r.status_code in (200, 201)
        assert r.json().get("announcement") is False


# --- (6) cafe-suggest regression --------------------------------------
class TestCafeSuggest:
    def test_airport_loop_rule(self, leo_token):
        r = requests.get(f"{API}/rides/cafe-suggest", headers=_hdr(leo_token),
                         params={"q": "Airport loop"}, timeout=15)
        assert r.status_code == 200
        s = str(r.json().get("suggestion") or "")
        assert "Daily Bread" in s and "Britomart" in s, f"got: {s!r}"

    def test_jailbreak_rule(self, leo_token):
        r = requests.get(f"{API}/rides/cafe-suggest", headers=_hdr(leo_token),
                         params={"q": "Jailbreak"}, timeout=15)
        assert r.status_code == 200
        s = str(r.json().get("suggestion") or "")
        assert "Little Sister" in s and "Henderson" in s, f"got: {s!r}"
