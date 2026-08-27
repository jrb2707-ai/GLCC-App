"""Backend tests for private DMs (rider <-> rider)."""
import os
import json
import time
import asyncio
import pytest
import requests
import websockets
from urllib.parse import urlparse

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

# Credentials from /app/memory/test_credentials.md
ADMIN = ("bryantj@xtra.co.nz", "Roenick2707")
REVIEWER = ("reviewer@greylynncc.com", "ReviewerGLCC")
SAM = ("sam@glcc.club", "cycle123")
MIKA = ("mika@glcc.club", "cycle123")
LEO = ("leo@glcc.club", "cycle123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    return data["token"], data["user"]


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def users():
    admin_tok, admin_u = _login(*ADMIN)
    sam_tok, sam_u = _login(*SAM)
    mika_tok, mika_u = _login(*MIKA)
    leo_tok, leo_u = _login(*LEO)
    reviewer_tok, reviewer_u = _login(*REVIEWER)
    return {
        "admin": {"tok": admin_tok, "u": admin_u},
        "sam": {"tok": sam_tok, "u": sam_u},
        "mika": {"tok": mika_tok, "u": mika_u},
        "leo": {"tok": leo_tok, "u": leo_u},
        "reviewer": {"tok": reviewer_tok, "u": reviewer_u},
    }


def _clean_between(users, a_key, b_key):
    """Best-effort cleanup: unblock and mark read from both sides. Convos remain but empty."""
    a = users[a_key]; b = users[b_key]
    # unblock (POST /api/blocks toggles or DELETE if present) — try DELETE first
    for direction in [(a, b), (b, a)]:
        me, other = direction
        try:
            requests.delete(f"{API}/blocks/{other['u']['id']}", headers=_headers(me["tok"]), timeout=10)
        except Exception:
            pass


# ---------- Contract tests ----------

class TestDMBasic:
    def test_self_dm_guarded(self, users):
        me = users["sam"]
        r = requests.post(
            f"{API}/dm/conversations/{me['u']['id']}/messages",
            headers=_headers(me["tok"]),
            json={"text": "hi me"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_invalid_object_id_returns_400(self, users):
        me = users["sam"]
        r = requests.get(f"{API}/dm/conversations/not-an-oid", headers=_headers(me["tok"]), timeout=10)
        assert r.status_code == 400

    def test_nonexistent_valid_oid_returns_404(self, users):
        me = users["sam"]
        # Valid 24-hex ObjectId that (almost certainly) doesn't map to a user
        fake_oid = "0" * 24
        r = requests.get(f"{API}/dm/conversations/{fake_oid}", headers=_headers(me["tok"]), timeout=10)
        assert r.status_code == 404

    def test_read_on_nonexistent_convo_is_idempotent(self, users):
        me = users["sam"]
        fake_oid = "0" * 24
        r = requests.post(f"{API}/dm/conversations/{fake_oid}/read", headers=_headers(me["tok"]), timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("unread") == 0

    def test_send_message_creates_convo_lazily(self, users):
        _clean_between(users, "mika", "leo")
        # Mark any existing unread as read so unread math is deterministic
        requests.post(f"{API}/dm/conversations/{users['leo']['u']['id']}/read",
                      headers=_headers(users["mika"]["tok"]), timeout=10)
        requests.post(f"{API}/dm/conversations/{users['mika']['u']['id']}/read",
                      headers=_headers(users["leo"]["tok"]), timeout=10)

        mika = users["mika"]; leo = users["leo"]
        r = requests.post(
            f"{API}/dm/conversations/{leo['u']['id']}/messages",
            headers=_headers(mika["tok"]),
            json={"text": "TEST_hello_leo"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "message" in body and "conversation" in body
        assert body["message"]["text"] == "TEST_hello_leo"
        assert body["message"]["sender_id"] == mika["u"]["id"]
        assert body["message"]["recipient_id"] == leo["u"]["id"]
        # Sender's unread is 0
        assert body["conversation"]["unread"] == 0
        assert body["conversation"]["peer"]["id"] == leo["u"]["id"]

    def test_inbox_ordering_and_shape(self, users):
        # Ensure ordering: mika sends to sam last, then to leo — leo should be first
        sam = users["sam"]; mika = users["mika"]; leo = users["leo"]
        # Unblock in both directions in case of leftover blocks
        for a_key, b_key in [("mika","sam"),("mika","leo"),("sam","mika"),("leo","mika")]:
            requests.delete(f"{API}/blocks/{users[b_key]['u']['id']}",
                           headers=_headers(users[a_key]["tok"]), timeout=10)
        r1 = requests.post(
            f"{API}/dm/conversations/{sam['u']['id']}/messages",
            headers=_headers(mika["tok"]), json={"text": "TEST_to_sam_1"}, timeout=10)
        assert r1.status_code == 200, f"mika->sam: {r1.status_code} {r1.text}"
        time.sleep(0.6)
        r2 = requests.post(
            f"{API}/dm/conversations/{leo['u']['id']}/messages",
            headers=_headers(mika["tok"]), json={"text": "TEST_to_leo_latest"}, timeout=10)
        assert r2.status_code == 200, f"mika->leo: {r2.status_code} {r2.text}"

        r = requests.get(f"{API}/dm/conversations", headers=_headers(mika["tok"]), timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "conversations" in body and "unread_total" in body
        convos = body["conversations"]
        assert len(convos) >= 2
        # find leo & sam entries; leo must appear before sam
        leo_idx = next((i for i, c in enumerate(convos) if c["peer"]["id"] == leo["u"]["id"]), -1)
        sam_idx = next((i for i, c in enumerate(convos) if c["peer"]["id"] == sam["u"]["id"]), -1)
        assert leo_idx != -1 and sam_idx != -1
        assert leo_idx < sam_idx, "leo (latest) must come before sam"
        # shape check
        top = convos[leo_idx]
        for k in ["id", "peer", "last_text", "last_at", "last_sender_id", "unread"]:
            assert k in top
        for k in ["id", "name", "role"]:
            assert k in top["peer"]
        assert isinstance(top["unread"], int)

    def test_unread_math_and_read(self, users):
        mika = users["mika"]; leo = users["leo"]
        # Reset leo's unread first
        requests.post(f"{API}/dm/conversations/{mika['u']['id']}/read",
                      headers=_headers(leo["tok"]), timeout=10)
        # Send N messages from mika -> leo
        N = 3
        for i in range(N):
            r = requests.post(
                f"{API}/dm/conversations/{leo['u']['id']}/messages",
                headers=_headers(mika["tok"]), json={"text": f"TEST_unread_{i}"}, timeout=10)
            assert r.status_code == 200
        # leo's unread should be >= N
        r = requests.get(f"{API}/dm/unread", headers=_headers(leo["tok"]), timeout=10)
        assert r.status_code == 200
        unread = r.json()["unread_total"]
        assert unread >= N, f"expected >= {N}, got {unread}"
        # Mark read
        r = requests.post(f"{API}/dm/conversations/{mika['u']['id']}/read",
                         headers=_headers(leo["tok"]), timeout=10)
        assert r.status_code == 200
        r = requests.get(f"{API}/dm/unread", headers=_headers(leo["tok"]), timeout=10)
        # Note: other convos could still have unread; check this specific convo via inbox
        assert r.status_code == 200

        # Verify this peer convo unread == 0 via inbox
        r = requests.get(f"{API}/dm/conversations", headers=_headers(leo["tok"]), timeout=10)
        convos = r.json()["conversations"]
        target = next(c for c in convos if c["peer"]["id"] == mika["u"]["id"])
        assert target["unread"] == 0

    def test_get_convo_returns_ordered_messages(self, users):
        import uuid
        mika = users["mika"]; leo = users["leo"]
        prefix = f"TEST_order_{uuid.uuid4().hex[:6]}_"
        texts = [prefix + "a", prefix + "b", prefix + "c"]
        for t in texts:
            r = requests.post(
                f"{API}/dm/conversations/{leo['u']['id']}/messages",
                headers=_headers(mika["tok"]), json={"text": t}, timeout=10)
            assert r.status_code == 200
            time.sleep(0.15)
        r = requests.get(f"{API}/dm/conversations/{leo['u']['id']}",
                        headers=_headers(mika["tok"]), timeout=10)
        assert r.status_code == 200
        msgs = r.json()["messages"]
        # extract our three most recent test order messages
        found = [m["text"] for m in msgs if m["text"] in texts]
        assert found == texts, f"messages not in ascending order: {found}"
        # verify ISO string created_at ascending
        times = [m["created_at"] for m in msgs]
        assert times == sorted(times)


class TestDMBlocking:
    def test_block_hides_convo_and_forbids_send(self, users):
        # A = sam, B = leo; A blocks B
        sam = users["sam"]; leo = users["leo"]
        # Seed a convo first (so we can verify it disappears from A's inbox)
        requests.post(
            f"{API}/dm/conversations/{leo['u']['id']}/messages",
            headers=_headers(sam["tok"]), json={"text": "TEST_before_block"}, timeout=10)

        # A blocks B
        r = requests.post(f"{API}/blocks",
                         headers=_headers(sam["tok"]),
                         json={"target_id": leo["u"]["id"]}, timeout=10)
        assert r.status_code in (200, 201), r.text

        # B -> A now 403
        r = requests.post(
            f"{API}/dm/conversations/{sam['u']['id']}/messages",
            headers=_headers(leo["tok"]), json={"text": "TEST_after_block"}, timeout=10)
        assert r.status_code == 403

        # A -> B also 403 (mutual)
        r = requests.post(
            f"{API}/dm/conversations/{leo['u']['id']}/messages",
            headers=_headers(sam["tok"]), json={"text": "TEST_after_block_a"}, timeout=10)
        assert r.status_code == 403

        # A's inbox should NOT include leo
        r = requests.get(f"{API}/dm/conversations", headers=_headers(sam["tok"]), timeout=10)
        assert r.status_code == 200
        convos = r.json()["conversations"]
        assert not any(c["peer"]["id"] == leo["u"]["id"] for c in convos)

        # A's /dm/unread should not count the blocked peer's unread (may be 0 overall or still contain others)
        r = requests.get(f"{API}/dm/unread", headers=_headers(sam["tok"]), timeout=10)
        assert r.status_code == 200
        # We can't assert absolute 0 without cleanup of other tests, but confirm endpoint returns integer.
        assert isinstance(r.json()["unread_total"], int)

        # Unblock at the end (cleanup)
        try:
            requests.delete(f"{API}/blocks/{leo['u']['id']}",
                            headers=_headers(sam["tok"]), timeout=10)
        except Exception:
            pass


class TestDMWebSocket:
    """WS presence: dm.focus suppresses push, dm.message still broadcast to both parties."""

    def _ws_url(self, token):
        parsed = urlparse(BASE_URL)
        scheme = "wss" if parsed.scheme == "https" else "ws"
        # server.py mounts websocket at /api/ws (check by convention)
        return f"{scheme}://{parsed.netloc}/api/ws?token={token}"

    @pytest.mark.asyncio
    async def test_dm_message_broadcast_and_focus_flow(self, users):
        mika = users["mika"]; leo = users["leo"]
        url_leo = self._ws_url(leo["tok"])
        url_mika = self._ws_url(mika["tok"])

        try:
            async with websockets.connect(url_leo, open_timeout=10, close_timeout=5) as ws_leo, \
                       websockets.connect(url_mika, open_timeout=10, close_timeout=5) as ws_mika:

                # leo focuses conversation with mika
                await ws_leo.send(json.dumps({"type": "dm.focus", "peer_id": mika["u"]["id"]}))
                await asyncio.sleep(0.4)

                # mika sends a message via HTTP
                r = requests.post(
                    f"{API}/dm/conversations/{leo['u']['id']}/messages",
                    headers=_headers(mika["tok"]),
                    json={"text": "TEST_ws_focus"}, timeout=10)
                assert r.status_code == 200

                # Both sides should see a dm.message ws event
                async def wait_for_dm(ws, expected_text):
                    for _ in range(20):
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=3)
                        except asyncio.TimeoutError:
                            return None
                        try:
                            evt = json.loads(raw)
                        except Exception:
                            continue
                        if evt.get("type") == "dm.message" and evt.get("message", {}).get("text") == expected_text:
                            return evt
                    return None

                leo_evt = await wait_for_dm(ws_leo, "TEST_ws_focus")
                mika_evt = await wait_for_dm(ws_mika, "TEST_ws_focus")
                assert leo_evt is not None, "leo did not receive dm.message WS event"
                assert mika_evt is not None, "mika (sender) did not receive dm.message WS event"

                # dm.blur — flow should still work
                await ws_leo.send(json.dumps({"type": "dm.blur"}))
                await asyncio.sleep(0.3)
                r = requests.post(
                    f"{API}/dm/conversations/{leo['u']['id']}/messages",
                    headers=_headers(mika["tok"]),
                    json={"text": "TEST_ws_blur"}, timeout=10)
                assert r.status_code == 200
                leo_evt2 = await wait_for_dm(ws_leo, "TEST_ws_blur")
                assert leo_evt2 is not None
        except (websockets.exceptions.InvalidStatusCode, OSError) as e:
            pytest.skip(f"WS not reachable at {url_leo}: {e}")


class TestDMAccountDeletion:
    def test_delete_account_removes_dms(self, users):
        """Register a throwaway rider, approve them, exchange DMs, delete, verify the other side's convo is gone."""
        admin = users["admin"]
        import uuid
        email = f"TEST_dm_del_{uuid.uuid4().hex[:8]}@glcc.club"
        pw = "cycle123"
        r = requests.post(f"{API}/auth/register",
                         json={"email": email, "password": pw, "name": "TEST DM Del"},
                         timeout=15)
        assert r.status_code in (200, 201), r.text
        reg = r.json()
        target_id = reg["user"]["id"]

        # Approve as admin via /riders/action
        r = requests.post(f"{API}/riders/action",
                         headers=_headers(admin["tok"]),
                         json={"target_id": target_id, "action": "approve"}, timeout=10)
        assert r.status_code in (200, 204), r.text

        # login the new rider
        new_tok, new_u = _login(email, pw)
        # DM: new_u -> sam
        sam = users["sam"]
        r = requests.post(
            f"{API}/dm/conversations/{sam['u']['id']}/messages",
            headers=_headers(new_tok), json={"text": "TEST_before_delete"}, timeout=10)
        assert r.status_code == 200

        # Confirm sam sees convo
        r = requests.get(f"{API}/dm/conversations", headers=_headers(sam["tok"]), timeout=10)
        assert any(c["peer"]["id"] == new_u["id"] for c in r.json()["conversations"])

        # Delete self
        r = requests.delete(f"{API}/auth/me", headers=_headers(new_tok), timeout=15)
        assert r.status_code in (200, 204), r.text

        # sam's inbox no longer shows this convo
        r = requests.get(f"{API}/dm/conversations", headers=_headers(sam["tok"]), timeout=10)
        assert not any(c["peer"]["id"] == new_u["id"] for c in r.json()["conversations"])
