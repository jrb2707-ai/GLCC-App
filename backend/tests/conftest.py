import asyncio
import pytest


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped loop so motor's AsyncIOMotorClient (bound at server
    import time) can be reused across async tests without hitting
    'Event loop is closed'."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
