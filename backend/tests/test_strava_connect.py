"""Regression tests for Strava OAuth connect endpoint APP_URL fallback."""
import os
import subprocess
import sys
from urllib.parse import urlparse, parse_qs

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "jb@glcc.club"
ADMIN_PASSWORD = "Roenick2707"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_strava_connect_returns_200_with_url(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/strava/connect")
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    # Ensure we did NOT return the specific 500 error
    assert "APP_URL not set for OAuth callback" not in r.text
    data = r.json()
    assert "url" in data
    url = data["url"]
    assert url.startswith("https://www.strava.com/oauth/authorize")
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    assert "redirect_uri" in qs
    redirect = qs["redirect_uri"][0]
    assert redirect.endswith("/api/strava/callback"), redirect
    rp = urlparse(redirect)
    assert rp.scheme == "https"
    assert rp.netloc  # non-empty host


def test_public_app_url_fallback_in_subprocess():
    """Import server with APP_URL unset and PUBLIC_APP_URL set; APP_URL should fall back."""
    code = (
        "import os, sys; "
        "sys.path.insert(0, '/app/backend'); "
        "import server; "
        "print('APP_URL=' + server.APP_URL)"
    )
    env = {k: v for k, v in os.environ.items() if k != "APP_URL"}
    env["PUBLIC_APP_URL"] = "https://greylynncc.com"
    # Load MONGO_URL/DB_NAME from backend/.env if not already in env
    from dotenv import dotenv_values
    for k, v in dotenv_values("/app/backend/.env").items():
        if k == "APP_URL":
            continue
        env.setdefault(k, v)
    env.pop("APP_URL", None)
    result = subprocess.run(
        [sys.executable, "-c", code],
        env=env, capture_output=True, text=True, timeout=30,
        cwd="/tmp",
    )
    assert result.returncode == 0, f"stderr: {result.stderr}\nstdout: {result.stdout}"
    assert "APP_URL=https://greylynncc.com" in result.stdout, result.stdout
