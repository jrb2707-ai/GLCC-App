"""Regression: WebSocket coffee.round broadcast + rides null starts_at filter."""
import os, json, asyncio, pytest, requests
import websockets

def _env(k):
    with open("/app/frontend/.env") as f:
        for l in f:
            if l.startswith(k+"="):
                return l.split("=",1)[1].strip().strip('"')
BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _env("REACT_APP_BACKEND_URL")).rstrip("/")
API = f"{BASE}/api"
WS = BASE.replace("https://","wss://").replace("http://","ws://") + "/api/ws"

def _login(e,p):
    r = requests.post(f"{API}/auth/login", json={"email":e,"password":p}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]

def test_rides_only_future_and_no_null_crash():
    tok = _login("jb@glcc.club","president123")
    r = requests.get(f"{API}/rides", headers={"Authorization":f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    rides = r.json()["rides"]
    # no crash on null starts_at & only future (or null)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for rd in rides:
        s = rd.get("starts_at")
        if s:
            # allow same-day
            dt = datetime.fromisoformat(s.replace("Z","+00:00"))
            assert dt.date() >= now.date(), f"past ride returned: {rd.get('name')} {s}"

def test_ws_coffee_round_broadcast():
    jb = _login("jb@glcc.club","president123")
    sam = _login("sam@glcc.club","cycle123")
    async def run():
        async with websockets.connect(f"{WS}?token={sam}") as sam_ws:
            # small drain of any initial messages
            await asyncio.sleep(0.3)
            # JB posts a coffee round
            r = requests.post(f"{API}/coffee/rounds", json={"coffee":"Flat White"},
                              headers={"Authorization":f"Bearer {jb}"}, timeout=15)
            assert r.status_code == 200
            round_id = r.json()["id"]
            # Wait up to 5s for coffee.round event on sam's socket
            got = None
            for _ in range(50):
                try:
                    msg = await asyncio.wait_for(sam_ws.recv(), timeout=0.2)
                    data = json.loads(msg)
                    if data.get("type") == "coffee.round" and data.get("round",{}).get("id")==round_id:
                        got = data; break
                except asyncio.TimeoutError:
                    continue
            assert got is not None, "Did not receive coffee.round WS event"
            assert got["round"]["rider_name"] == "JB"
            assert got["round"]["coffee"] == "Flat White"
    asyncio.get_event_loop().run_until_complete(run())

def test_auth_me_returns_profile():
    tok = _login("jb@glcc.club","president123")
    r = requests.get(f"{API}/auth/me", headers={"Authorization":f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["email"] == "jb@glcc.club"
    assert d.get("is_admin") is True
