"""
Regression tests for the new coordinated Ride Round coffee flow.

Covers:
- POST /api/rides/{ride_id}/round (start): success, 409 duplicate, 400 invalid id, 404 not found
- GET /api/rides/{ride_id}/round (active + recently-closed)
- POST /api/rides/{ride_id}/round/order (upsert / replace, no dupes)
- DELETE /api/rides/{ride_id}/round/order (retract)
- POST /api/rides/{ride_id}/round/close (buyer/admin only, 403 for others)
- GET /api/coffee/rounds/active + /history
- close_at auto-close: serialize_round.closed becomes true after close_at passes
- PATCH /api/riders/me {coffee: '...'} persists as the "usual" order
"""
import os
import time
from datetime import datetime, timezone, timedelta

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient


def _read_env(path, key):
    with open(path) as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip().strip('"')
    raise KeyError(key)


BASE_URL = (
    os.environ.get("REACT_APP_BACKEND_URL")
    or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")
).rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ.get("MONGO_URL") or _read_env("/app/backend/.env", "MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or _read_env("/app/backend/.env", "DB_NAME")

JB = ("jb@glcc.club", "Roenick2707")
SAM = ("sam@glcc.club", "cycle123")
MIKA = ("mika@glcc.club", "cycle123")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    j = r.json()
    return j["token"], j["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="module")
def jb():
    tok, user = _login(*JB)
    return {"tok": tok, "user": user, "h": _h(tok)}


@pytest.fixture(scope="module")
def sam():
    tok, user = _login(*SAM)
    return {"tok": tok, "user": user, "h": _h(tok)}


@pytest.fixture(scope="module")
def mika():
    try:
        tok, user = _login(*MIKA)
        return {"tok": tok, "user": user, "h": _h(tok)}
    except AssertionError:
        pytest.skip("mika@glcc.club not seeded")


@pytest.fixture(scope="module")
def ride(jb, mongo):
    """Return a ride to operate on. Create a minimal manual ride if none exists."""
    r = requests.get(f"{API}/rides", headers=jb["h"], timeout=20)
    assert r.status_code == 200
    rides = r.json().get("rides") or []
    if rides:
        return rides[0]
    # Fallback: insert manual ride via API (admin only)
    payload = {
        "name": "TEST_ride_for_rounds",
        "day": "MON",
        "time": "6:00 AM",
        "location": "Test Start Point",
        "route": "Loop",
        "distance": "30 km",
        "elevation": "300 m",
        "date": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "leader": "JB",
        "cafe": "TEST Cafe",
    }
    r = requests.post(f"{API}/rides", json=payload, headers=jb["h"], timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _cleanup_active(ride_id, buyer_h):
    """Ensure no active round on this ride so tests are deterministic."""
    r = requests.get(f"{API}/rides/{ride_id}/round", headers=buyer_h, timeout=15)
    if r.status_code == 200:
        rnd = r.json().get("round")
        if rnd and not rnd.get("closed"):
            # buyer or admin (JB is admin) can close
            requests.post(f"{API}/rides/{ride_id}/round/close", headers=buyer_h, timeout=15)


# ---- Usual coffee (PATCH /riders/me) ----
def test_patch_riders_me_persists_coffee(jb):
    r = requests.patch(f"{API}/riders/me", json={"coffee": "Long black extra shot"}, headers=jb["h"], timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["coffee"] == "Long black extra shot"
    # Verify persisted via /auth/me
    me = requests.get(f"{API}/auth/me", headers=jb["h"], timeout=15).json()
    assert me.get("coffee") == "Long black extra shot"


# ---- Round start error cases ----
def test_start_round_invalid_ride_id(jb):
    r = requests.post(f"{API}/rides/not-an-objectid/round",
                      json={"cafe_name": "Test", "close_in_seconds": 300},
                      headers=jb["h"], timeout=15)
    assert r.status_code == 400


def test_start_round_missing_ride(jb):
    fake = str(ObjectId())
    r = requests.post(f"{API}/rides/{fake}/round",
                      json={"cafe_name": "Test", "close_in_seconds": 300},
                      headers=jb["h"], timeout=15)
    assert r.status_code == 404


# ---- Full happy path ----
def test_start_round_success(jb, ride):
    _cleanup_active(ride["id"], jb["h"])
    r = requests.post(f"{API}/rides/{ride['id']}/round",
                      json={"cafe_name": "The Brunchery", "cafe_address": "1 Great North Rd", "close_in_seconds": 300},
                      headers=jb["h"], timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["buyer_user_id"] == str(jb["user"]["id"])
    assert data["buyer_name"]
    assert data["cafe_name"] == "The Brunchery"
    assert data["cafe_address"] == "1 Great North Rd"
    assert data["orders"] == []
    assert data["closed"] is False
    assert data["ride_id"] == ride["id"]
    assert data["close_at"]


def test_start_round_conflict_when_open(jb, ride):
    r = requests.post(f"{API}/rides/{ride['id']}/round",
                      json={"cafe_name": "Dup", "close_in_seconds": 300},
                      headers=jb["h"], timeout=15)
    assert r.status_code == 409


def test_get_round_returns_active(jb, ride):
    r = requests.get(f"{API}/rides/{ride['id']}/round", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rnd = r.json()["round"]
    assert rnd is not None
    assert rnd["closed"] is False
    assert rnd["cafe_name"] == "The Brunchery"


def test_submit_order_upsert(sam, ride):
    r = requests.post(f"{API}/rides/{ride['id']}/round/order",
                      json={"text": "Flat white 1 sugar"},
                      headers=sam["h"], timeout=15)
    assert r.status_code == 200, r.text
    rnd = r.json()
    sam_orders = [o for o in rnd["orders"] if o["user_id"] == str(sam["user"]["id"])]
    assert len(sam_orders) == 1
    assert sam_orders[0]["text"] == "Flat white 1 sugar"


def test_submit_order_replaces_not_duplicates(sam, ride):
    r = requests.post(f"{API}/rides/{ride['id']}/round/order",
                      json={"text": "Long black now"},
                      headers=sam["h"], timeout=15)
    assert r.status_code == 200
    rnd = r.json()
    sam_orders = [o for o in rnd["orders"] if o["user_id"] == str(sam["user"]["id"])]
    assert len(sam_orders) == 1, f"expected 1 order for Sam, got {len(sam_orders)}"
    assert sam_orders[0]["text"] == "Long black now"


def test_retract_order(sam, ride):
    r = requests.delete(f"{API}/rides/{ride['id']}/round/order", headers=sam["h"], timeout=15)
    assert r.status_code == 200
    rnd = r.json()
    sam_orders = [o for o in rnd["orders"] if o["user_id"] == str(sam["user"]["id"])]
    assert len(sam_orders) == 0


def test_non_buyer_non_admin_cannot_close(sam, ride):
    r = requests.post(f"{API}/rides/{ride['id']}/round/close", headers=sam["h"], timeout=15)
    assert r.status_code == 403


def test_active_rounds_endpoint(jb, ride):
    r = requests.get(f"{API}/coffee/rounds/active", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rounds = r.json()["rounds"]
    assert any(rr["ride_id"] == ride["id"] for rr in rounds)


def test_buyer_can_close(jb, ride):
    r = requests.post(f"{API}/rides/{ride['id']}/round/close", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rnd = r.json()
    assert rnd["closed"] is True
    assert rnd["closed_manually_at"] is not None


def test_get_round_returns_recent_closed(jb, ride):
    r = requests.get(f"{API}/rides/{ride['id']}/round", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rnd = r.json()["round"]
    assert rnd is not None
    assert rnd["closed"] is True


def test_history_endpoint_includes_closed(jb, ride):
    r = requests.get(f"{API}/coffee/rounds/history", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rounds = r.json()["rounds"]
    assert any(rr["ride_id"] == ride["id"] and rr["closed"] for rr in rounds)


# ---- close_at auto-close (via direct Mongo backdating) ----
def test_close_at_auto_close(jb, ride, mongo):
    _cleanup_active(ride["id"], jb["h"])
    r = requests.post(f"{API}/rides/{ride['id']}/round",
                      json={"cafe_name": "Auto Close Test", "close_in_seconds": 60},
                      headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rid = r.json()["id"]
    # Backdate close_at to 1 minute ago
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    res = mongo.coffee_rounds.update_one({"_id": ObjectId(rid)}, {"$set": {"close_at": past}})
    assert res.modified_count == 1
    # GET should now report closed=true
    g = requests.get(f"{API}/rides/{ride['id']}/round", headers=jb["h"], timeout=15)
    assert g.status_code == 200
    rnd = g.json()["round"]
    assert rnd is not None
    assert rnd["closed"] is True
    # And no active round remains
    a = requests.get(f"{API}/coffee/rounds/active", headers=jb["h"], timeout=15).json()["rounds"]
    assert not any(rr["id"] == rid for rr in a)


# ---- Admin can close someone else's round ----
def test_admin_can_close_others_round(jb, sam, ride, mongo):
    _cleanup_active(ride["id"], jb["h"])
    # Sam starts a round
    r = requests.post(f"{API}/rides/{ride['id']}/round",
                      json={"cafe_name": "Sam's shout", "close_in_seconds": 300},
                      headers=sam["h"], timeout=15)
    assert r.status_code == 200
    # JB (admin) closes it
    c = requests.post(f"{API}/rides/{ride['id']}/round/close", headers=jb["h"], timeout=15)
    assert c.status_code == 200
    assert c.json()["closed"] is True
