"""Backend regression for iteration_9 review:
1) rider self-edit restricted to name+coffee
2) forgot-password rate limit 3/hour/email
3) admin ride reminder trigger returns {rides_reminded, emails_sent}
"""
import os
import time
import pytest
import requests
from datetime import datetime, timedelta, timezone
from pathlib import Path
from pymongo import MongoClient
from bson import ObjectId
from dotenv import dotenv_values

_backend_env = dotenv_values(Path("/app/backend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-craft-4628.preview.emergentagent.com").rstrip("/")
MONGO_URL = _backend_env.get("MONGO_URL") or os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = _backend_env.get("DB_NAME") or os.environ.get("DB_NAME", "glcc_db")

ADMIN_EMAIL = "jb@glcc.club"
ADMIN_PW = "Roenick2707"
MEMBER_EMAIL = "sam@glcc.club"
MEMBER_PW = "cycle123"


@pytest.fixture(scope="module")
def mongo_db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------- Test 1: rider self-edit restricted to name+coffee ----------
class TestSelfEditRestriction:
    def test_patch_riders_me_only_updates_name_and_coffee(self, admin_headers):
        # snapshot current values
        me_before = requests.get(f"{BASE_URL}/api/auth/me", headers=admin_headers, timeout=10).json()
        original_bio = me_before.get("bio")
        original_role = me_before.get("role")
        original_photo = me_before.get("photo")

        payload = {
            "name": "Jason Bryant",
            "bio": "HACKER BIO",
            "coffee": "Long Black",
            "role": "Hacker",
            "photo": "data:image/png;base64,AAAA",
        }
        r = requests.patch(f"{BASE_URL}/api/riders/me", headers=admin_headers, json=payload, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "Jason Bryant"
        assert data["coffee"] == "Long Black"
        # forbidden fields must be unchanged
        assert data.get("bio") == original_bio, f"bio changed! before={original_bio!r} after={data.get('bio')!r}"
        assert data.get("role") == original_role, f"role changed! before={original_role!r} after={data.get('role')!r}"
        assert data.get("photo") == original_photo, "photo changed!"
        # sanity: role stays El Presidente
        assert data.get("role") == "El Presidente"


# ---------- Test 2: forgot-password rate limit ----------
class TestForgotPasswordRateLimit:
    def test_rate_limit_three_then_429(self, mongo_db):
        # clear collection
        mongo_db.password_reset_requests.delete_many({})
        # first three succeed
        for i in range(3):
            r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": ADMIN_EMAIL}, timeout=10)
            assert r.status_code == 200, f"attempt {i+1}: {r.status_code} {r.text}"
            assert r.json().get("ok") is True
        # fourth is blocked
        r4 = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": ADMIN_EMAIL}, timeout=10)
        assert r4.status_code == 429, f"expected 429 got {r4.status_code}: {r4.text}"
        assert "Too many reset requests" in r4.json().get("detail", "")

        # different email still passes
        r5 = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": MEMBER_EMAIL}, timeout=10)
        assert r5.status_code == 200, r5.text
        assert r5.json().get("ok") is True

        # cleanup so we don't leave lingering rate-limit state
        mongo_db.password_reset_requests.delete_many({})


# ---------- Test 3: admin ride reminders trigger ----------
class TestRideRemindersTrigger:
    def test_trigger_returns_expected_keys_no_op(self, admin_headers, mongo_db):
        r = requests.post(f"{BASE_URL}/api/admin/send-ride-reminders", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # accept either the keys the review asks for, OR the no-resend-key branch
        if "reason" in data and data.get("reason") == "no-resend-key":
            pytest.skip("RESEND_API_KEY not configured; skipping key-shape check")
        assert "rides_reminded" in data, f"missing rides_reminded in {data}"
        assert "emails_sent" in data, f"missing emails_sent in {data}"
        assert isinstance(data["rides_reminded"], int)
        assert isinstance(data["emails_sent"], int)

    def test_trigger_with_seeded_ride(self, admin_headers, mongo_db):
        # find any existing ride
        ride = mongo_db.rides.find_one({})
        if not ride:
            pytest.skip("no rides in DB to seed the reminder window")
        target = datetime.now(timezone.utc) + timedelta(hours=24)
        mongo_db.rides.update_one(
            {"_id": ride["_id"]},
            {"$set": {"starts_at": target}, "$unset": {"reminder_sent_at": ""}},
        )
        r = requests.post(f"{BASE_URL}/api/admin/send-ride-reminders", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        if "reason" in data and data.get("reason") == "no-resend-key":
            pytest.skip("RESEND_API_KEY not configured")
        assert "rides_reminded" in data
        assert "emails_sent" in data
        # If the ride's going list has users, we expect >=1 reminded; otherwise 0 is fine.
        going = ride.get("going") or []
        if going:
            assert data["rides_reminded"] >= 1, f"expected at least 1 ride reminded, got {data}"
        # rides_reminded is non-negative
        assert data["rides_reminded"] >= 0
