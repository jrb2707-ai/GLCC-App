"""
Regression tests for durable coffee-counter settlement (added alongside the
coffee_rounds TTL fix): lifetime_rounds_bought/joined, the per-day
leaderboard bucket, and jersey minting no longer get recomputed live from
coffee_rounds — they're written once, durably, at settlement time.

Covers:
- Buyer-side settlement (lifetime_rounds_bought, coffee_daily_buyer_counts)
  fires synchronously on manual close — instant, not deferred.
- Joiner-side settlement (lifetime_rounds_joined) is deferred to the 20s
  background sweep until the 30-minute late-order grace window has fully
  elapsed, and is idempotent — the sweep revisiting an already
  buyer-settled round must not double-count it.
- Jersey minting fires exactly once per tier crossed, posts the chat
  celebration, and never re-fires on a later round at the same tier.
- POST /admin/riders/{id}/coffee/reset-bought zeroes the counter, requires
  admin/president, and never touches jersey_achievements.

These tests talk to a live backend + real Mongo (same convention as
test_ride_rounds.py) rather than importing server.py directly, and the
joiner-side test genuinely waits out the background sweep's 20s interval
— it's an integration test, not a fast unit test.
"""
import os
import time
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

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
    payload = {
        "name": "TEST_ride_for_settlement",
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
            requests.post(f"{API}/rides/{ride_id}/round/close", headers=buyer_h, timeout=15)


def _start_round(buyer_h, ride_id, cafe_name):
    r = requests.post(
        f"{API}/rides/{ride_id}/round",
        json={"cafe_name": cafe_name, "close_in_seconds": 300},
        headers=buyer_h, timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _order(user_h, ride_id, text):
    r = requests.post(f"{API}/rides/{ride_id}/round/order", json={"text": text}, headers=user_h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _close(buyer_h, ride_id):
    r = requests.post(f"{API}/rides/{ride_id}/round/close", headers=buyer_h, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _lifetime(mongo, user_id):
    doc = mongo.users.find_one({"_id": ObjectId(user_id)}) or {}
    return doc.get("lifetime_rounds_bought", 0), doc.get("lifetime_rounds_joined", 0)


def _nz_date_key(dt=None):
    if dt is None:
        dt = datetime.now(timezone.utc)
    return dt.astimezone(ZoneInfo("Pacific/Auckland")).strftime("%Y-%m-%d")


def _daily_bucket_rounds(mongo, rider_id, date_key):
    doc = mongo.coffee_daily_buyer_counts.find_one({"rider_id": rider_id, "date": date_key})
    return (doc or {}).get("rounds", 0)


def _wait_until(predicate, timeout=40, interval=3):
    """Poll predicate() until truthy or timeout. Used only for the
    background sweep, which ticks every 20s — this is a real integration
    wait, not something to shortcut."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = predicate()
        if result:
            return result
        time.sleep(interval)
    return predicate()


# ---- Buyer-side settlement: instant, not deferred ----
def test_buyer_side_settlement_is_instant(jb, sam, ride, mongo):
    _cleanup_active(ride["id"], jb["h"])
    bought_before, _ = _lifetime(mongo, jb["user"]["id"])
    _, joined_before = _lifetime(mongo, sam["user"]["id"])
    today_key = _nz_date_key()
    bucket_before = _daily_bucket_rounds(mongo, jb["user"]["id"], today_key)

    _start_round(jb["h"], ride["id"], "Instant Settlement Test")
    _order(sam["h"], ride["id"], "Flat white")
    _close(jb["h"], ride["id"])

    # No sleep — buyer-side settlement is synchronous on close.
    bought_after, _ = _lifetime(mongo, jb["user"]["id"])
    assert bought_after == bought_before + 1, "lifetime_rounds_bought should increment immediately on close"

    bucket_after = _daily_bucket_rounds(mongo, jb["user"]["id"], today_key)
    assert bucket_after == bucket_before + 1, "coffee_daily_buyer_counts should update immediately on close"

    # Joiner-side has NOT run yet — it's deferred to the background sweep.
    _, joined_immediately_after = _lifetime(mongo, sam["user"]["id"])
    assert joined_immediately_after == joined_before, "lifetime_rounds_joined must not increment before the grace window elapses"


# ---- Joiner-side settlement: deferred, then idempotent ----
def test_joiner_side_settles_after_grace_window_and_buyer_side_is_not_double_counted(jb, sam, ride, mongo):
    _cleanup_active(ride["id"], jb["h"])
    bought_before, _ = _lifetime(mongo, jb["user"]["id"])
    _, joined_before = _lifetime(mongo, sam["user"]["id"])

    round_doc = _start_round(jb["h"], ride["id"], "Grace Window Test")
    _order(sam["h"], ride["id"], "Long black")
    _close(jb["h"], ride["id"])

    bought_after_close, _ = _lifetime(mongo, jb["user"]["id"])
    assert bought_after_close == bought_before + 1

    # Force the round past the 30-min late-order grace window rooted at
    # started_at, so the sweep's joiner-side query picks it up on its next
    # tick instead of waiting a real 30 minutes.
    rid = ObjectId(round_doc["id"])
    long_ago = datetime.now(timezone.utc) - timedelta(minutes=45)
    res = mongo.coffee_rounds.update_one({"_id": rid}, {"$set": {"started_at": long_ago}})
    assert res.modified_count == 1

    settled = _wait_until(lambda: mongo.coffee_rounds.find_one({"_id": rid, "joiner_settled_at": {"$exists": True}}))
    assert settled is not None, "background sweep never settled the joiner side within the timeout"

    _, joined_after = _lifetime(mongo, sam["user"]["id"])
    assert joined_after == joined_before + 1, "lifetime_rounds_joined should increment once the sweep settles it"

    # The sweep also re-evaluates buyer-side eligibility every tick — confirm
    # it skipped this round (buyer_settled_at already set by the manual
    # close) rather than incrementing lifetime_rounds_bought a second time.
    bought_after_sweep, _ = _lifetime(mongo, jb["user"]["id"])
    assert bought_after_sweep == bought_after_close, "sweep must not double-count an already buyer-settled round"


# ---- Jersey minting: fires once at threshold, reset leaves it alone ----
def test_jersey_mints_once_and_survives_a_bought_reset(jb, sam, mika, ride, mongo):
    _cleanup_active(ride["id"], jb["h"])
    uid = mika["user"]["id"]
    oid = ObjectId(uid)

    # Clean slate for a deterministic threshold crossing, regardless of
    # whatever mika's real history is on a shared/reused database.
    mongo.jersey_achievements.delete_many({"rider_id": uid, "tier": "red"})
    mongo.chat_messages.delete_many({"jersey_rider_id": uid, "jersey_tier": "red"})
    mongo.users.update_one({"_id": oid}, {"$set": {"lifetime_rounds_bought": 24}})

    _start_round(mika["h"], ride["id"], "Jersey Threshold Test")
    _close(mika["h"], ride["id"])

    bought, _ = _lifetime(mongo, uid)
    assert bought == 25

    jerseys = list(mongo.jersey_achievements.find({"rider_id": uid, "tier": "red"}))
    assert len(jerseys) == 1, "crossing 25 should mint exactly one red jersey"

    chat_posts = list(mongo.chat_messages.find({"jersey_rider_id": uid, "jersey_tier": "red"}))
    assert len(chat_posts) == 1, "crossing the threshold should post exactly one celebration message"

    # Buying another round at the same (already-earned) tier must not re-fire.
    _cleanup_active(ride["id"], mika["h"])
    _start_round(mika["h"], ride["id"], "Jersey No-Refire Test")
    _close(mika["h"], ride["id"])

    bought_again, _ = _lifetime(mongo, uid)
    assert bought_again == 26
    assert mongo.jersey_achievements.count_documents({"rider_id": uid, "tier": "red"}) == 1
    assert mongo.chat_messages.count_documents({"jersey_rider_id": uid, "jersey_tier": "red"}) == 1

    # Admin reset zeroes the counter but must never touch the jersey ledger.
    r = requests.post(f"{API}/admin/riders/{uid}/coffee/reset-bought", headers=jb["h"], timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["lifetime_rounds_bought"] == 0

    bought_after_reset, _ = _lifetime(mongo, uid)
    assert bought_after_reset == 0
    assert mongo.jersey_achievements.count_documents({"rider_id": uid, "tier": "red"}) == 1, \
        "resetting the counter must never remove an already-earned jersey"


def test_reset_bought_requires_admin(sam, mika):
    r = requests.post(
        f"{API}/admin/riders/{mika['user']['id']}/coffee/reset-bought",
        headers=sam["h"], timeout=15,
    )
    assert r.status_code == 403
