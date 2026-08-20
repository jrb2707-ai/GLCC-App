"""Tests for coffee-round auto-populate flow (rider-saved coffee) and modal-selected coffee."""
import os
import time
import pytest
import requests

def _read_env(path, key):
    with open(path) as f:
        for line in f:
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    raise KeyError(key)

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_env("/app/frontend/.env", "REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"

JB_EMAIL = "jb@glcc.club"
JB_PASSWORD = "president123"
SAM_EMAIL = "sam@glcc.club"
SAM_PASSWORD = "cycle123"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"], r.json()["user"]


@pytest.fixture(scope="module")
def jb():
    tok, user = _login(JB_EMAIL, JB_PASSWORD)
    return {"token": tok, "user": user, "h": {"Authorization": f"Bearer {tok}"}}


def test_jb_saved_coffee_is_long_black(jb):
    # Reset JB's coffee to Long Black to make the test deterministic
    r = requests.patch(f"{API}/riders/me", json={"coffee": "Long Black"}, headers=jb["h"], timeout=15)
    assert r.status_code == 200
    assert r.json()["coffee"] == "Long Black"


def test_rides_list_has_strava_weekday_with_brunchery(jb):
    r = requests.get(f"{API}/rides", headers=jb["h"], timeout=15)
    assert r.status_code == 200
    rides = r.json()["rides"]
    assert len(rides) >= 1, "expected at least one ride from Strava"
    weekday_rides = [x for x in rides if x.get("cafe") and "Brunchery" in x["cafe"]]
    assert len(weekday_rides) >= 1, f"expected at least one weekday ride with The Brunchery cafe; got cafes={[x.get('cafe') for x in rides]}"
    # Assert Strava fields present
    r0 = weekday_rides[0]
    assert r0["source"] == "strava"
    assert r0.get("distance"), "distance from Strava missing"
    assert r0.get("elevation"), "elevation from Strava missing"


def test_order_my_coffee_uses_saved_coffee_long_black(jb):
    # POST /coffee/rounds with only ride_id (mimic RidesTab.sendRound)
    rides = requests.get(f"{API}/rides", headers=jb["h"], timeout=15).json()["rides"]
    ride = next(x for x in rides if x.get("cafe") and "Brunchery" in x["cafe"])
    r = requests.post(f"{API}/coffee/rounds", json={"ride_id": ride["id"]}, headers=jb["h"], timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["coffee"] == "Long Black", body
    assert body["rider_name"] == "JB"
    assert body["ride_name"] == ride["name"]

    # Verify feed shows it at top
    feed = requests.get(f"{API}/coffee/rounds", headers=jb["h"], timeout=15).json()["rounds"]
    assert feed[0]["id"] == body["id"]
    assert feed[0]["coffee"] == "Long Black"


def test_order_my_coffee_reflects_saved_coffee_change(jb):
    # Change JB's coffee to Piccolo
    r = requests.patch(f"{API}/riders/me", json={"coffee": "Piccolo"}, headers=jb["h"], timeout=15)
    assert r.status_code == 200
    assert r.json()["coffee"] == "Piccolo"

    rides = requests.get(f"{API}/rides", headers=jb["h"], timeout=15).json()["rides"]
    ride = next(x for x in rides if x.get("cafe") and "Brunchery" in x["cafe"])
    r = requests.post(f"{API}/coffee/rounds", json={"ride_id": ride["id"]}, headers=jb["h"], timeout=15)
    assert r.status_code == 200
    assert r.json()["coffee"] == "Piccolo"

    # Restore
    requests.patch(f"{API}/riders/me", json={"coffee": "Long Black"}, headers=jb["h"], timeout=15)


def test_modal_selected_coffee_overrides_saved(jb):
    # Modal flow sends explicit coffee
    r = requests.post(f"{API}/coffee/rounds", json={"coffee": "Cortado"}, headers=jb["h"], timeout=15)
    assert r.status_code == 200
    assert r.json()["coffee"] == "Cortado"


def test_round_broadcast_to_second_user():
    # Just verify a second user (Sam) can see JB's rounds in the feed (WS broadcast covered separately)
    tok, _ = _login(SAM_EMAIL, SAM_PASSWORD)
    h = {"Authorization": f"Bearer {tok}"}
    feed = requests.get(f"{API}/coffee/rounds", headers=h, timeout=15).json()["rounds"]
    assert len(feed) >= 1
    assert any(x["rider_name"] == "JB" for x in feed)
