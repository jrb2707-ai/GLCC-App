"""
Backend tests for GLCC push notifications + @mention routing.
Regression smoke for auth, rides, coffee, chat, riders.
"""
import asyncio
import json
import os
import time
import uuid
import pytest
import requests
import websockets

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"

JB = {"email": "jb@glcc.club", "password": "president123"}
AROHA = {"email": "aroha@glcc.club", "password": "cycle123"}
SAM = {"email": "sam@glcc.club", "password": "cycle123"}

FAKE_TOKEN = "ExponentPushToken[TEST-DEVICE-abcdefghij]"


def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


def auth_h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Auth smoke ----------------
class TestAuthSmoke:
    def test_login_jb(self):
        token, user = login(JB)
        assert user["is_admin"] and user["is_president"]

    def test_me(self):
        token, _ = login(SAM)
        r = requests.get(f"{API}/auth/me", headers=auth_h(token))
        assert r.status_code == 200
        assert r.json()["email"] == SAM["email"]


# ---------------- Push register/unregister/test ----------------
class TestPushEndpoints:
    def test_no_auth_guards(self):
        r1 = requests.post(f"{API}/push/register", json={"expo_push_token": FAKE_TOKEN, "platform": "ios"})
        r2 = requests.delete(f"{API}/push/unregister", json={"expo_push_token": FAKE_TOKEN})
        r3 = requests.post(f"{API}/push/test")
        assert r1.status_code in (401, 403), r1.text
        assert r2.status_code in (401, 403), r2.text
        assert r3.status_code in (401, 403), r3.text

    def test_invalid_token_format(self):
        token, _ = login(JB)
        # Fails pydantic min_length -> 422
        r = requests.post(f"{API}/push/register",
                          json={"expo_push_token": "nope", "platform": "ios"},
                          headers=auth_h(token))
        assert r.status_code in (400, 422)
        # Long enough but wrong prefix -> 400
        r2 = requests.post(f"{API}/push/register",
                           json={"expo_push_token": "X" * 30, "platform": "ios"},
                           headers=auth_h(token))
        assert r2.status_code == 400
        assert "Invalid Expo push token" in r2.text

    def test_invalid_platform(self):
        token, _ = login(JB)
        r = requests.post(f"{API}/push/register",
                          json={"expo_push_token": FAKE_TOKEN, "platform": "windows"},
                          headers=auth_h(token))
        assert r.status_code == 422

    def test_register_happy_and_idempotent_and_test_and_cleanup(self):
        token, user = login(JB)
        # Ensure clean slate
        requests.delete(f"{API}/push/unregister",
                        json={"expo_push_token": FAKE_TOKEN}, headers=auth_h(token))

        # 1st register
        r = requests.post(f"{API}/push/register",
                          json={"expo_push_token": FAKE_TOKEN, "platform": "ios", "project_id": "glcc-demo"},
                          headers=auth_h(token))
        assert r.status_code == 200 and r.json() == {"ok": True}

        # 2nd register (idempotent)
        r2 = requests.post(f"{API}/push/register",
                           json={"expo_push_token": FAKE_TOKEN, "platform": "ios", "project_id": "glcc-demo"},
                           headers=auth_h(token))
        assert r2.status_code == 200 and r2.json() == {"ok": True}

        # /push/test — real HTTP to exp.host with fake token; Expo will reply DeviceNotRegistered
        # backend must auto-delete the token from push_tokens.
        rt = requests.post(f"{API}/push/test", headers=auth_h(token))
        assert rt.status_code == 200, rt.text
        body = rt.json()
        assert body.get("ok") is True
        assert body.get("sent") == 1

        # Give the backend a moment to process the ticket cleanup.
        time.sleep(1.5)

        # Unregister should return deleted:false because it was auto-cleaned
        ru = requests.delete(f"{API}/push/unregister",
                             json={"expo_push_token": FAKE_TOKEN},
                             headers=auth_h(token))
        assert ru.status_code == 200
        assert ru.json().get("ok") is True
        assert ru.json().get("deleted") is False, f"Expected auto-cleanup, got {ru.json()}"

    def test_unregister_removes_token(self):
        token, _ = login(SAM)
        # Register
        requests.post(f"{API}/push/register",
                      json={"expo_push_token": FAKE_TOKEN, "platform": "android"},
                      headers=auth_h(token))
        # Unregister immediately (before test endpoint)
        r = requests.delete(f"{API}/push/unregister",
                            json={"expo_push_token": FAKE_TOKEN},
                            headers=auth_h(token))
        assert r.status_code == 200
        j = r.json()
        assert j["ok"] is True
        assert j["deleted"] is True


# ---------------- WebSocket helpers ----------------
async def _ws_connect(token):
    return await websockets.connect(f"{WS_URL}?token={token}", ping_interval=None)


async def _drain(ws, seconds=1.5):
    events = []
    end = time.time() + seconds
    while time.time() < end:
        try:
            msg = await asyncio.wait_for(ws.recv(), timeout=0.4)
            try:
                events.append(json.loads(msg))
            except Exception:
                pass
        except asyncio.TimeoutError:
            pass
    return events


# ---------------- Chat @mention routing ----------------
class TestChatMentions:
    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)

    def test_mention_targets_aroha_only(self):
        jb_token, _ = login(JB)
        aroha_token, aroha_user = login(AROHA)

        async def flow():
            ws_jb = await _ws_connect(jb_token)
            ws_ar = await _ws_connect(aroha_token)
            await _drain(ws_jb, 0.5)
            await _drain(ws_ar, 0.5)

            unique = uuid.uuid4().hex[:6]
            r = requests.post(f"{API}/chat/messages",
                              json={"text": f"Hey @aroha ready? {unique}"},
                              headers=auth_h(jb_token))
            assert r.status_code == 200

            ar_events = await _drain(ws_ar, 2.0)
            jb_events = await _drain(ws_jb, 0.5)

            await ws_jb.close(); await ws_ar.close()

            ar_mentions = [e for e in ar_events if e.get("type") == "chat.mention"]
            jb_mentions = [e for e in jb_events if e.get("type") == "chat.mention"]
            ar_msgs = [e for e in ar_events if e.get("type") == "chat.message" and unique in e.get("message", {}).get("text", "")]
            assert len(ar_mentions) == 1, f"Aroha should receive one chat.mention, got: {ar_events}"
            assert ar_mentions[0]["from"] == "JB"
            assert unique in ar_mentions[0]["text"]
            assert len(ar_msgs) >= 1, "chat.message broadcast should reach Aroha"
            assert len(jb_mentions) == 0, f"JB should NOT receive chat.mention (self), got: {jb_events}"

        asyncio.run(flow())

    def test_self_mention_noop(self):
        jb_token, _ = login(JB)

        async def flow():
            ws_jb = await _ws_connect(jb_token)
            await _drain(ws_jb, 0.5)
            unique = uuid.uuid4().hex[:6]
            r = requests.post(f"{API}/chat/messages",
                              json={"text": f"@jb hi me {unique}"},
                              headers=auth_h(jb_token))
            assert r.status_code == 200
            events = await _drain(ws_jb, 1.5)
            await ws_jb.close()
            mentions = [e for e in events if e.get("type") == "chat.mention"]
            assert mentions == [], f"Self-mention must be a no-op, got: {mentions}"

        asyncio.run(flow())

    def test_unknown_mention_noop(self):
        jb_token, _ = login(JB)
        aroha_token, _ = login(AROHA)

        async def flow():
            ws_jb = await _ws_connect(jb_token)
            ws_ar = await _ws_connect(aroha_token)
            await _drain(ws_jb, 0.5); await _drain(ws_ar, 0.5)
            r = requests.post(f"{API}/chat/messages",
                              json={"text": "@ghostrider hi"},
                              headers=auth_h(jb_token))
            assert r.status_code == 200
            ar_events = await _drain(ws_ar, 1.5)
            jb_events = await _drain(ws_jb, 0.3)
            await ws_jb.close(); await ws_ar.close()
            all_mentions = [e for e in ar_events + jb_events if e.get("type") == "chat.mention"]
            assert all_mentions == [], f"Unknown mention should not fire chat.mention, got: {all_mentions}"

        asyncio.run(flow())


# ---------------- Coffee round WS broadcast (regression) ----------------
class TestCoffeeRoundBroadcast:
    def test_coffee_round_broadcasts_to_all(self):
        jb_token, _ = login(JB)
        aroha_token, _ = login(AROHA)

        async def flow():
            ws_jb = await _ws_connect(jb_token)
            ws_ar = await _ws_connect(aroha_token)
            await _drain(ws_jb, 0.5); await _drain(ws_ar, 0.5)

            r = requests.post(f"{API}/coffee/rounds",
                              json={"coffee": "Long Black"},
                              headers=auth_h(jb_token))
            assert r.status_code == 200, r.text

            ar_events = await _drain(ws_ar, 2.0)
            jb_events = await _drain(ws_jb, 0.5)
            await ws_jb.close(); await ws_ar.close()

            for events, who in ((ar_events, "aroha"), (jb_events, "jb")):
                types = [e.get("type") for e in events]
                assert "coffee.round" in types, f"{who} missing coffee.round: {types}"
                assert "chat.message" in types, f"{who} missing chat.message: {types}"

        asyncio.run(flow())


# ---------------- Regression smoke ----------------
class TestRegression:
    def test_rides_list(self):
        token, _ = login(SAM)
        r = requests.get(f"{API}/rides", headers=auth_h(token))
        assert r.status_code == 200
        assert len(r.json()["rides"]) >= 5

    def test_rsvp_persists(self):
        token, user = login(SAM)
        rides = requests.get(f"{API}/rides", headers=auth_h(token)).json()["rides"]
        ride_id = rides[0]["id"]
        r = requests.post(f"{API}/rides/{ride_id}/rsvp",
                          json={"status": "going"}, headers=auth_h(token))
        assert r.status_code == 200
        rsvps = r.json()["rsvps"]
        assert rsvps.get(user["id"]) == "going"

    def test_riders_list(self):
        token, _ = login(JB)
        r = requests.get(f"{API}/riders", headers=auth_h(token))
        assert r.status_code == 200
        assert len(r.json()["riders"]) >= 5

    def test_chat_persist(self):
        token, _ = login(SAM)
        text = f"regression ping {uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/chat/messages",
                          json={"text": text}, headers=auth_h(token))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/chat/messages", headers=auth_h(token))
        assert any(m["text"] == text for m in r2.json()["messages"])
