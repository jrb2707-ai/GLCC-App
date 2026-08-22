"""Tests for POST /api/chat/mechanical/{id}/resolve (iteration_15)."""
import os
import time
import requests
import pytest

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

ADMIN = {"email": "jb@glcc.club", "password": "Roenick2707"}


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _ensure_user(email, password, name):
    """Login existing or register+approve new."""
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()
    # register
    reg = requests.post(f"{BASE}/api/auth/register", json={
        "email": email, "password": password, "name": name
    })
    assert reg.status_code in (200, 201), f"register failed: {reg.status_code} {reg.text}"
    # approve as admin
    admin = _login(ADMIN["email"], ADMIN["password"])
    riders = requests.get(f"{BASE}/api/riders", headers=_headers(admin["token"]))
    assert riders.status_code == 200
    target = None
    for r_ in riders.json():
        if r_.get("email", "").lower() == email.lower():
            target = r_
            break
    assert target, f"newly-registered {email} not found in roster"
    rid = target.get("id") or target.get("_id")
    ap = requests.post(f"{BASE}/api/riders/{rid}/approve", headers=_headers(admin["token"]))
    assert ap.status_code in (200, 204), f"approve failed: {ap.status_code} {ap.text}"
    # try login again
    r2 = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200, f"post-approval login failed: {r2.text}"
    return r2.json()


def _post_mechanical(token):
    r = requests.post(
        f"{BASE}/api/chat/mechanical",
        headers=_headers(token),
        json={"share_location": False},
    )
    assert r.status_code == 200, f"post mechanical failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN["email"], ADMIN["password"])


@pytest.fixture(scope="module")
def member1():
    return _ensure_user("mika@glcc.club", "cycle123", "Mika Test")


@pytest.fixture(scope="module")
def member2():
    return _ensure_user("sam@glcc.club", "cycle123", "Sam Test")


# ---------- Tests ----------

class TestResolveMechanical:
    def test_reporter_can_resolve_fixed(self, member1):
        msg = _post_mechanical(member1["token"])
        mid = msg.get("id") or msg.get("_id")
        assert mid, f"no id in mechanical response: {msg}"
        assert msg.get("mechanical"), "mechanical field missing"
        assert msg.get("resolved") is False

        r = requests.post(
            f"{BASE}/api/chat/mechanical/{mid}/resolve",
            headers=_headers(member1["token"]),
            json={"status": "fixed"},
        )
        assert r.status_code == 200, f"resolve failed: {r.status_code} {r.text}"
        data = r.json()
        assert "resolved" in data and "followup" in data
        resolved = data["resolved"]
        followup = data["followup"]
        assert resolved["resolved"] is True
        assert resolved["resolution"]["status"] == "fixed"
        assert resolved["resolution"].get("by_name")
        assert followup["text"].startswith("✅ Fixed"), followup["text"]
        assert followup["user_id"] == member1["user"]["id"]
        assert followup["system"] is False

        # Double-resolve -> 400
        r2 = requests.post(
            f"{BASE}/api/chat/mechanical/{mid}/resolve",
            headers=_headers(member1["token"]),
            json={"status": "fixed"},
        )
        assert r2.status_code == 400, f"expected 400 already-resolved, got {r2.status_code} {r2.text}"

        # GET /api/chat/messages includes both muted original and follow-up
        msgs_resp = requests.get(f"{BASE}/api/chat/messages", headers=_headers(member1["token"]))
        assert msgs_resp.status_code == 200
        msgs_list = msgs_resp.json()["messages"]
        ids = {m.get("id"): m for m in msgs_list}
        assert mid in ids, "original mechanical missing from messages"
        assert ids[mid]["resolved"] is True
        assert any(m.get("text", "").startswith("✅ Fixed") for m in msgs_list)

    def test_non_reporter_non_admin_cannot_resolve(self, member1, member2):
        msg = _post_mechanical(member1["token"])
        mid = msg["id"]
        r = requests.post(
            f"{BASE}/api/chat/mechanical/{mid}/resolve",
            headers=_headers(member2["token"]),
            json={"status": "fixed"},
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"

        # cleanup: reporter resolves so leftover state is fine
        requests.post(
            f"{BASE}/api/chat/mechanical/{mid}/resolve",
            headers=_headers(member1["token"]),
            json={"status": "carry_on"},
        )

    def test_admin_can_resolve_carry_on_attrib_to_reporter(self, admin_session, member2):
        msg = _post_mechanical(member2["token"])
        mid = msg["id"]
        r = requests.post(
            f"{BASE}/api/chat/mechanical/{mid}/resolve",
            headers=_headers(admin_session["token"]),
            json={"status": "carry_on"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        followup = data["followup"]
        assert followup["text"].startswith("🚴 Carry on"), followup["text"]
        # attributed to original reporter, not admin
        assert followup["user_id"] == member2["user"]["id"], (
            f"followup should be attributed to reporter {member2['user']['id']}, "
            f"got {followup['user_id']}"
        )
        # resolution.by_name still records admin
        assert data["resolved"]["resolution"]["by_name"] == admin_session["user"]["name"]

    def test_invalid_message_id(self, member1):
        r = requests.post(
            f"{BASE}/api/chat/mechanical/deadbeef/resolve",
            headers=_headers(member1["token"]),
            json={"status": "fixed"},
        )
        assert r.status_code in (400, 404)
