"""In-process regression: POST /api/chat/mechanical/{id}/resolve fires
push_to_all_except with the correct title/body/data.type.

We run the FastAPI app in-process via httpx ASGITransport so we can
monkey-patch `server.push_to_all_except` and observe the call args.
The endpoint schedules push via asyncio.create_task, so we `await
asyncio.sleep(0)` a few times to let the task run before asserting.
"""
import os
import sys
import asyncio
from unittest.mock import AsyncMock

import pytest
import httpx

sys.path.insert(0, "/app/backend")
import server  # noqa: E402



@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped loop so motor client (bound at import) keeps working
    across all async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


BASE = "http://test"


@pytest.mark.asyncio(loop_scope="session")
async def test_resolve_triggers_push_fixed(monkeypatch):
    push_mock = AsyncMock()
    monkeypatch.setattr(server, "push_to_all_except", push_mock)

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
        # Login as reporter (member)
        r = await client.post("/api/auth/login", json={
            "email": "mika@glcc.club", "password": "cycle123"
        })
        if r.status_code != 200:
            pytest.skip(f"mika login not available: {r.status_code}")
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}

        # Create mechanical (no location, keeps things simple for resolve)
        cr = await client.post("/api/chat/mechanical", json={}, headers=h)
        assert cr.status_code == 200, cr.text
        mid = cr.json()["id"]
        # There should be exactly one create-push call
        # (either from the create endpoint or none, but ensure it's tracked separately).
        create_calls = list(push_mock.call_args_list)

        # Resolve as fixed
        rr = await client.post(
            f"/api/chat/mechanical/{mid}/resolve",
            json={"status": "fixed"},
            headers=h,
        )
        assert rr.status_code == 200, rr.text

        # let scheduled push task run
        for _ in range(20):
            await asyncio.sleep(0.05)
            if len(push_mock.call_args_list) > len(create_calls):
                break

        assert len(push_mock.call_args_list) > len(create_calls), (
            f"push_to_all_except not called on resolve. Total calls: {push_mock.call_args_list}"
        )

        resolve_call = push_mock.call_args_list[-1]
        args, kwargs = resolve_call
        # signature: push_to_all_except(exclude_user_id, title, body, data)
        exclude_uid, title, body_str, data = args
        assert title == "🔧 Mechanical resolved", f"unexpected title: {title!r}"
        assert "Fixed" in body_str and "on their way" in body_str, f"unexpected body: {body_str!r}"
        assert isinstance(data, dict)
        assert data.get("type") == "chat.mechanical.resolved"
        assert data.get("status") == "fixed"
        assert data.get("original_id") == mid


@pytest.mark.asyncio(loop_scope="session")
async def test_resolve_triggers_push_carry_on(monkeypatch):
    push_mock = AsyncMock()
    monkeypatch.setattr(server, "push_to_all_except", push_mock)

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
        r = await client.post("/api/auth/login", json={
            "email": "mika@glcc.club", "password": "cycle123"
        })
        if r.status_code != 200:
            pytest.skip(f"mika login not available: {r.status_code}")
        h = {"Authorization": f"Bearer {r.json()['token']}"}

        cr = await client.post("/api/chat/mechanical", json={}, headers=h)
        assert cr.status_code == 200
        mid = cr.json()["id"]
        before = len(push_mock.call_args_list)

        rr = await client.post(
            f"/api/chat/mechanical/{mid}/resolve",
            json={"status": "carry_on"},
            headers=h,
        )
        assert rr.status_code == 200, rr.text
        for _ in range(20):
            await asyncio.sleep(0.05)
            if len(push_mock.call_args_list) > before:
                break

        assert len(push_mock.call_args_list) > before, "no resolve push fired"
        args, _ = push_mock.call_args_list[-1]
        _, title, body_str, data = args
        assert title == "🔧 Mechanical resolved"
        assert "Carrying on" in body_str, f"unexpected body: {body_str!r}"
        assert data.get("status") == "carry_on"
        assert data.get("type") == "chat.mechanical.resolved"


@pytest.mark.asyncio(loop_scope="session")
async def test_create_mechanical_push_signature_with_location(monkeypatch):
    """Regression: create endpoint still fires push with title '🔧 Mechanical'
    and includes maps_link in data when lat/lng are supplied."""
    push_mock = AsyncMock()
    monkeypatch.setattr(server, "push_to_all_except", push_mock)

    transport = httpx.ASGITransport(app=server.app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE) as client:
        r = await client.post("/api/auth/login", json={
            "email": "mika@glcc.club", "password": "cycle123"
        })
        if r.status_code != 200:
            pytest.skip(f"mika login not available: {r.status_code}")
        h = {"Authorization": f"Bearer {r.json()['token']}"}

        cr = await client.post(
            "/api/chat/mechanical",
            json={"lat": -36.87, "lng": 174.75},
            headers=h,
        )
        assert cr.status_code == 200, cr.text
        for _ in range(20):
            await asyncio.sleep(0.05)
            if push_mock.call_args_list:
                break

        assert push_mock.call_args_list, "create endpoint didn't fire push"
        args, _ = push_mock.call_args_list[-1]
        _, title, body_str, data = args
        assert title == "🔧 Mechanical", f"unexpected title: {title!r}"
        assert isinstance(data, dict)
        assert data.get("type") == "chat.mechanical"
        assert "maps_link" in data and data["maps_link"], "maps_link missing from push data"

        # cleanup: resolve so DB doesn't accumulate open mechanicals
        mid = cr.json()["id"]
        await client.post(
            f"/api/chat/mechanical/{mid}/resolve",
            json={"status": "fixed"}, headers=h,
        )
