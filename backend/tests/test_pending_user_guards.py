"""Pending user guards + approved user regression.

Tests the new require_approved dependency: pending users can GET, cannot POST
to coffee/rounds, chat/messages, rides/{id}/rsvp. Admin and approved member
must still work.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "jb@glcc.club"
ADMIN_PW = "president123"
MEMBER_EMAIL = "sam@glcc.club"
MEMBER_PW = "cycle123"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin():
    tok, user = _login(ADMIN_EMAIL, ADMIN_PW)
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def member():
    tok, user = _login(MEMBER_EMAIL, MEMBER_PW)
    return {"token": tok, "user": user}


@pytest.fixture(scope="module")
def pending():
    ts = int(time.time() * 1000)
    email = f"pending.{ts}@glcc.club"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "cycle123", "name": "Pending Tester", "coffee": "Medium Flat White"},
        timeout=15,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["status"] == "pending", f"new user should be pending, got {data['user']['status']}"
    return {"token": data["token"], "user": data["user"], "email": email}


# ---------- Pending user: GETs must succeed ----------
class TestPendingCanRead:
    def test_auth_me(self, pending):
        r = requests.get(f"{API}/auth/me", headers=_auth(pending["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "pending"

    def test_get_rides(self, pending):
        r = requests.get(f"{API}/rides", headers=_auth(pending["token"]), timeout=15)
        assert r.status_code == 200
        assert "rides" in r.json()

    def test_get_riders(self, pending):
        r = requests.get(f"{API}/riders", headers=_auth(pending["token"]), timeout=15)
        assert r.status_code == 200
        assert "riders" in r.json()
        # pending user should NOT see pending list (admin-only)
        assert r.json().get("pending", []) == []

    def test_get_coffee_rounds(self, pending):
        r = requests.get(f"{API}/coffee/rounds", headers=_auth(pending["token"]), timeout=15)
        assert r.status_code == 200
        assert "rounds" in r.json()

    def test_get_chat_messages(self, pending):
        r = requests.get(f"{API}/chat/messages", headers=_auth(pending["token"]), timeout=15)
        assert r.status_code == 200
        assert "messages" in r.json()


# ---------- Pending user: POSTs must be 403 ----------
class TestPendingBlockedFromWrites:
    def test_coffee_post_403(self, pending):
        r = requests.post(
            f"{API}/coffee/rounds",
            headers=_auth(pending["token"]),
            json={"coffee": "Long Black"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        assert "pending" in r.text.lower() or "approval" in r.text.lower()

    def test_chat_post_403(self, pending):
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(pending["token"]),
            json={"text": "hello from a pending user"},
            timeout=15,
        )
        assert r.status_code == 403
        assert "pending" in r.text.lower() or "approval" in r.text.lower()

    def test_rsvp_403(self, pending, admin):
        # need a ride to RSVP on — get from list
        r = requests.get(f"{API}/rides", headers=_auth(admin["token"]), timeout=15)
        rides = r.json()["rides"]
        if not rides:
            pytest.skip("no rides seeded")
        ride_id = rides[0]["id"]
        rr = requests.post(
            f"{API}/rides/{ride_id}/rsvp",
            headers=_auth(pending["token"]),
            json={"status": "going"},
            timeout=15,
        )
        assert rr.status_code == 403

    def test_patch_me_403(self, pending):
        r = requests.patch(
            f"{API}/riders/me",
            headers=_auth(pending["token"]),
            json={"bio": "trying to update"},
            timeout=15,
        )
        assert r.status_code == 403


# ---------- Admin: writes must still work ----------
class TestAdminWrites:
    def test_admin_can_post_coffee(self, admin):
        r = requests.post(
            f"{API}/coffee/rounds",
            headers=_auth(admin["token"]),
            json={"coffee": "Long Black"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["coffee"] == "Long Black"
        assert r.json()["rider_name"] == "JB"

    def test_admin_can_post_chat(self, admin):
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(admin["token"]),
            json={"text": f"TEST_ regression msg {int(time.time())}"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["name"] == "JB"

    def test_admin_can_rsvp(self, admin):
        r = requests.get(f"{API}/rides", headers=_auth(admin["token"]), timeout=15)
        rides = r.json()["rides"]
        if not rides:
            pytest.skip("no rides seeded")
        ride_id = rides[0]["id"]
        rr = requests.post(
            f"{API}/rides/{ride_id}/rsvp",
            headers=_auth(admin["token"]),
            json={"status": "going"},
            timeout=15,
        )
        assert rr.status_code == 200
        assert admin["user"]["id"] in rr.json()["rsvps"]


# ---------- Approved member: writes work + is_admin false ----------
class TestApprovedMember:
    def test_member_not_admin(self, member):
        assert member["user"]["is_admin"] is False
        assert member["user"]["status"] == "approved"

    def test_member_can_post_coffee(self, member):
        r = requests.post(
            f"{API}/coffee/rounds",
            headers=_auth(member["token"]),
            json={"coffee": "Oat Flat White"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_member_can_post_chat(self, member):
        r = requests.post(
            f"{API}/chat/messages",
            headers=_auth(member["token"]),
            json={"text": f"TEST_ member msg {int(time.time())}"},
            timeout=15,
        )
        assert r.status_code == 200

    def test_member_sees_no_pending_list(self, member):
        r = requests.get(f"{API}/riders", headers=_auth(member["token"]), timeout=15)
        assert r.status_code == 200
        assert r.json().get("pending", []) == []


# ---------- Admin can approve + then user can write ----------
class TestApprovalFlow:
    def test_admin_approves_pending_then_pending_can_post(self, admin, pending):
        # verify admin sees the pending user in pending list
        r = requests.get(f"{API}/riders", headers=_auth(admin["token"]), timeout=15)
        assert r.status_code == 200
        pend_ids = [p["id"] for p in r.json().get("pending", [])]
        assert pending["user"]["id"] in pend_ids

        # approve
        ar = requests.post(
            f"{API}/riders/action",
            headers=_auth(admin["token"]),
            json={"action": "approve", "target_id": pending["user"]["id"]},
            timeout=15,
        )
        assert ar.status_code == 200

        # verify /auth/me now shows approved
        me = requests.get(f"{API}/auth/me", headers=_auth(pending["token"]), timeout=15)
        assert me.status_code == 200
        assert me.json()["status"] == "approved"

        # can now post coffee
        cp = requests.post(
            f"{API}/coffee/rounds",
            headers=_auth(pending["token"]),
            json={"coffee": "Espresso"},
            timeout=15,
        )
        assert cp.status_code == 200

        # cleanup: delete the test user
        requests.post(
            f"{API}/riders/action",
            headers=_auth(admin["token"]),
            json={"action": "delete", "target_id": pending["user"]["id"]},
            timeout=15,
        )
