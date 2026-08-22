from dotenv import load_dotenv
load_dotenv()

import os
import re
import asyncio
import json
import secrets
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Annotated
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import bcrypt
import httpx
import jwt
import resend
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, BeforeValidator, EmailStr, Field, ConfigDict

# ---------- Config ----------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 24 * 7  # 7 days for a mobile app

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
EXPO_ACCESS_TOKEN = os.environ.get("EXPO_ACCESS_TOKEN") or None

# ---------- Web Push (VAPID) ----------
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_PEM = os.environ.get("VAPID_PRIVATE_KEY_PEM", "").replace("\\n", "\n")
VAPID_CONTACT_EMAIL = os.environ.get("VAPID_CONTACT_EMAIL", "mailto:jason@greylynncc.com")

# ---------- Resend Email ----------
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL", "no-reply@greylynncc.com")
PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "https://greylynncc.com").rstrip("/")
PASSWORD_RESET_TTL_MIN = 60  # 1-hour token expiry
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

log = logging.getLogger("glcc.push")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---------- Helpers ----------
def obj_id_str(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    return str(v)

PyObjectId = Annotated[str, BeforeValidator(obj_id_str)]

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": now_utc() + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "iat": now_utc(),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def serialize_rider(doc: dict, *, viewer: Optional[dict] = None) -> dict:
    if not doc:
        return doc
    # Email is private: only the rider themselves or an admin can see it.
    show_email = True
    if viewer is not None:
        show_email = bool(viewer.get("is_admin")) or str(viewer.get("_id")) == str(doc.get("_id"))
    return {
        "id": str(doc["_id"]),
        "email": doc.get("email") if show_email else None,
        "name": doc.get("name"),
        "role": doc.get("role", "Member"),
        "bio": doc.get("bio", ""),
        "coffee": doc.get("coffee", "Medium Flat White"),
        "photo": doc.get("photo"),
        "is_admin": doc.get("is_admin", False),
        "is_president": doc.get("is_president", False),
        "status": doc.get("status", "approved"),  # approved | pending | invited
        "member_no": doc.get("member_no"),
        "ride_reminders": doc.get("ride_reminders", True),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
    }

def serialize_ride(doc: dict) -> dict:
    starts_at = doc.get("starts_at")
    return {
        "id": str(doc["_id"]),
        "day": doc.get("day"),
        "date": doc.get("date"),
        "time": doc.get("time"),
        "starts_at": starts_at.isoformat() if isinstance(starts_at, datetime) else starts_at,
        "name": doc.get("name"),
        "distance": doc.get("distance"),
        "elevation": doc.get("elevation"),
        "location": doc.get("location"),
        "route": doc.get("route"),
        "route_description": doc.get("route_description"),
        "cafe": doc.get("cafe"),
        "pace": doc.get("pace", "28–31 kph"),
        "rsvps": doc.get("rsvps", {}),  # {user_id: "going"|"maybe"|"no"}
        "source": doc.get("source", "manual"),
        "strava_event_id": doc.get("strava_event_id"),
        "strava_url": doc.get("strava_url"),
        "map_url": doc.get("map_url"),
        "polyline": doc.get("polyline"),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
    }

def serialize_round(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "rider_id": doc.get("rider_id"),
        "rider_name": doc.get("rider_name"),
        "rider_photo": doc.get("rider_photo"),
        "coffee": doc.get("coffee"),
        "ride_name": doc.get("ride_name"),
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
    }

def serialize_message(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "user_id": doc.get("user_id"),
        "name": doc.get("name"),
        "text": doc.get("text"),
        "system": doc.get("system", False),
        "announcement": doc.get("announcement", False),
        "mechanical": doc.get("mechanical") or None,
        "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
    }

# ---------- Auth ----------
security = HTTPBearer(auto_error=False)

async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except InvalidId:
        raise HTTPException(status_code=401, detail="Invalid user id")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user

async def require_approved(user: dict = Depends(get_current_user)) -> dict:
    if user.get("status") == "pending":
        raise HTTPException(status_code=403, detail="Your account is pending admin approval — you can browse but cannot post yet")
    return user

async def decode_token_ws(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        return user
    except Exception:
        return None

# ---------- Weather (OpenWeather) ----------
OPENWEATHER_API_KEY = os.environ.get("OPENWEATHER_API_KEY", "")
WEATHER_LAT = os.environ.get("WEATHER_LAT", "-36.8485")
WEATHER_LON = os.environ.get("WEATHER_LON", "174.7633")
_weather_cache = {"data": None, "at": None}
_WEATHER_TTL = timedelta(minutes=10)


def _wind_dir(deg: float) -> str:
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = int((deg % 360) / 22.5 + 0.5) % 16
    return dirs[idx]


def _describe_wind(kph: float) -> str:
    if kph < 5: return "calm"
    if kph < 12: return "light"
    if kph < 20: return "moderate"
    if kph < 30: return "brisk"
    return "strong"


async def _fetch_openweather() -> Optional[dict]:
    if not OPENWEATHER_API_KEY:
        return None
    base = "https://api.openweathermap.org/data/2.5"
    params = {"lat": WEATHER_LAT, "lon": WEATHER_LON, "units": "metric", "appid": OPENWEATHER_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=8.0) as h:
            cur_r = await h.get(f"{base}/weather", params=params)
            cur_r.raise_for_status()
            cur = cur_r.json()
            fc_r = await h.get(f"{base}/forecast", params={**params, "cnt": 2})
            fc_r.raise_for_status()
            fc = fc_r.json()
    except Exception as exc:
        log.warning("OpenWeather fetch failed: %s", exc)
        return None

    main = cur.get("main", {})
    weather_arr = cur.get("weather", [{}])
    wind = cur.get("wind", {})
    wind_ms = wind.get("speed") or 0
    wind_kph = round(wind_ms * 3.6)
    wind_deg = wind.get("deg") or 0
    condition = (weather_arr[0].get("description") or "").strip().capitalize()
    icon = weather_arr[0].get("icon")

    pops = [entry.get("pop", 0) for entry in fc.get("list", [])[:2]]
    rain_chance = round(max(pops) * 100) if pops else 0

    return {
        "location": cur.get("name") or "Auckland",
        "temp_c": round(main.get("temp", 0)),
        "feels_like_c": round(main.get("feels_like", 0)),
        "humidity": main.get("humidity"),
        "condition": condition or "Unknown",
        "icon": icon,
        "wind": f"{_describe_wind(wind_kph)} {_wind_dir(wind_deg)}",
        "wind_kph": wind_kph,
        "rain_chance": rain_chance,
        "source": "openweather",
    }


async def _fetch_forecast_at(when: datetime) -> Optional[dict]:
    """Return an OpenWeather forecast summary for the 3-hour window closest to `when`."""
    if not OPENWEATHER_API_KEY:
        return None
    params = {"lat": WEATHER_LAT, "lon": WEATHER_LON, "units": "metric", "appid": OPENWEATHER_API_KEY}
    try:
        async with httpx.AsyncClient(timeout=8.0) as h:
            r = await h.get("https://api.openweathermap.org/data/2.5/forecast", params=params)
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        log.warning("OpenWeather forecast failed: %s", exc)
        return None
    target = when.timestamp()
    best = None
    for entry in data.get("list", []):
        gap = abs(entry.get("dt", 0) - target)
        if best is None or gap < best[0]:
            best = (gap, entry)
    if not best:
        return None
    entry = best[1]
    m = entry.get("main", {}) or {}
    w = (entry.get("weather") or [{}])[0]
    wind = entry.get("wind", {}) or {}
    wind_kph = round((wind.get("speed") or 0) * 3.6)
    return {
        "temp_c": round(m.get("temp", 0)),
        "condition": (w.get("description") or "").capitalize() or "—",
        "wind_kph": wind_kph,
        "rain_chance": round((entry.get("pop") or 0) * 100),
    }


async def _going_user_docs(ride: dict) -> list[dict]:
    """Resolve the list of user documents who RSVP'd `going` to this ride.
    Reads from the canonical `rsvps` dict (older docs may also carry a
    legacy `going` list) so downstream callers don't need to care."""
    ids: set[str] = set(ride.get("going", []) or [])
    rsvps = ride.get("rsvps") or {}
    for uid, st in rsvps.items():
        if st == "going":
            ids.add(str(uid))
    if not ids:
        return []
    oids = []
    for i in ids:
        try:
            oids.append(ObjectId(i))
        except Exception:
            pass
    if not oids:
        return []
    return await db.users.find({"_id": {"$in": oids}}).to_list(200)


async def _send_ride_reminder(ride: dict, going_users: list[dict]) -> int:
    """Email each `going` rider (with a real email + password_hash) a reminder."""
    if not RESEND_API_KEY:
        return 0
    starts_at = ride.get("starts_at")
    if not isinstance(starts_at, datetime):
        return 0
    forecast = await _fetch_forecast_at(starts_at)
    going_names = ", ".join(u.get("name") or "" for u in going_users) or "You're the only one so far"
    time_label = starts_at.astimezone().strftime("%A %-d %b · %H:%M")
    forecast_line = (
        f"{forecast['temp_c']}°C · {forecast['condition']} · {forecast['rain_chance']}% rain · wind {forecast['wind_kph']}kph"
        if forecast else "Weather forecast unavailable"
    )
    cafe_line = f"{ride.get('cafe') or 'Café TBC'}"
    ride_id = str(ride.get("_id"))
    ride_url = f"{PUBLIC_APP_URL}/r/{ride_id}" if ride_id else PUBLIC_APP_URL
    sent = 0
    for u in going_users:
        to_email = u.get("email")
        if not to_email or not u.get("password_hash"):
            continue
        if u.get("ride_reminders") is False:
            continue
        html = f"""
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0b0d10;padding:32px 16px;color:#e6edf3">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#12151a;border-radius:20px;border:1px solid #2a2e36">
            <tr><td style="padding:28px 28px 8px 28px">
              <div style="font-family:Impact,'Arial Black',sans-serif;font-size:32px;letter-spacing:2px;color:#D4FF00">GLCC.</div>
              <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8b949e;margin-top:2px">Ride tomorrow</div>
            </td></tr>
            <tr><td style="padding:12px 28px">
              <h1 style="font-size:22px;color:#e6edf3;margin:0 0 10px 0">{ride.get('name') or 'Ride'}</h1>
              <p style="color:#c9d1d9;line-height:1.5;margin:0 0 16px 0">Kia ora {u.get('name') or 'rider'} — you&#39;re marked <b style="color:#22c55e">Going</b> for tomorrow.</p>
              <div style="border:1px solid #2a2e36;border-radius:14px;padding:16px;margin-bottom:12px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b949e">When</div>
                <div style="color:#e6edf3;margin-top:2px">{time_label}</div>
              </div>
              <div style="border:1px solid #2a2e36;border-radius:14px;padding:16px;margin-bottom:12px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b949e">Weather</div>
                <div style="color:#e6edf3;margin-top:2px">{forecast_line}</div>
              </div>
              <div style="border:1px solid #2a2e36;border-radius:14px;padding:16px;margin-bottom:12px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b949e">Café stop</div>
                <div style="color:#e6edf3;margin-top:2px">{cafe_line}</div>
              </div>
              <div style="border:1px solid #2a2e36;border-radius:14px;padding:16px;margin-bottom:20px">
                <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#8b949e">Riders going</div>
                <div style="color:#e6edf3;margin-top:2px">{going_names}</div>
              </div>
              <a href="{ride_url}" style="display:inline-block;background:#D4FF00;color:#0b0d10;font-weight:800;text-transform:uppercase;letter-spacing:2px;font-size:13px;padding:14px 24px;border-radius:12px;text-decoration:none">Open ride in GLCC</a>
            </td></tr>
            <tr><td style="padding:16px 28px 28px 28px;border-top:1px solid #2a2e36">
              <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6e7681">GLCC · 4th best cycle club in Grey Lynn</div>
            </td></tr>
          </table>
        </div>"""
        text = f"GLCC Ride Tomorrow — {ride.get('name')}\n{time_label}\nWeather: {forecast_line}\nCafé: {cafe_line}\nGoing: {going_names}\n\nOpen: {ride_url}"
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": f"GLCC <{SENDER_EMAIL}>",
                "to": [to_email],
                "subject": f"GLCC · {ride.get('name')} · Ride tomorrow",
                "html": html,
                "text": text,
            })
            sent += 1
        except Exception as exc:
            log.warning("ride reminder to %s failed: %s", to_email, exc)
    return sent


async def send_pending_ride_reminders() -> dict:
    """Find rides starting in the next 12-30 hours whose reminders haven't been
    sent yet, and email every going rider. Idempotent via `reminder_sent_at`."""
    if not RESEND_API_KEY:
        return {"sent": 0, "skipped": 0, "reason": "no-resend-key"}
    now = now_utc()
    window_start = now + timedelta(hours=12)
    window_end = now + timedelta(hours=30)
    cursor = db.rides.find({
        "starts_at": {"$gte": window_start, "$lte": window_end},
        "reminder_sent_at": {"$exists": False},
    })
    total_sent = 0
    reminded = 0
    async for ride in cursor:
        users = await _going_user_docs(ride)
        if not users:
            continue
        sent = await _send_ride_reminder(ride, users)
        await db.rides.update_one({"_id": ride["_id"]}, {"$set": {"reminder_sent_at": now_utc(), "reminder_recipients": sent}})
        total_sent += sent
        reminded += 1
    return {"rides_reminded": reminded, "emails_sent": total_sent}


# ---------- Morning-of weather alert ----------
WEATHER_ALERT_RAIN_PCT = 60
WEATHER_ALERT_WIND_KPH = 40


async def send_pending_ride_1h_pushes() -> dict:
    """Every ride starting in the next 55–90 minutes gets one "starts in 1h"
    push per RSVP='going' rider — includes weather + cafe. Idempotent via
    `hour_reminder_sent_at`."""
    now = now_utc()
    window_start = now + timedelta(minutes=55)
    window_end = now + timedelta(minutes=90)
    cursor = db.rides.find({
        "starts_at": {"$gte": window_start, "$lte": window_end},
        "hour_reminder_sent_at": {"$exists": False},
    })
    pushes = 0
    rides = 0
    async for ride in cursor:
        users = await _going_user_docs(ride)
        if not users:
            # still mark as sent so we don't recheck endlessly
            await db.rides.update_one(
                {"_id": ride["_id"]},
                {"$set": {"hour_reminder_sent_at": now_utc(), "hour_reminder_recipients": 0}},
            )
            continue
        forecast = await _fetch_forecast_at(ride["starts_at"])
        parts = []
        if forecast:
            temp = forecast.get("temp_c")
            rain = forecast.get("rain_chance")
            wind = forecast.get("wind_kph")
            if temp is not None:
                parts.append(f"{round(temp)}°C")
            if rain is not None:
                parts.append(f"{rain}% rain")
            if wind is not None:
                parts.append(f"{wind} kph wind")
        cafe = ride.get("cafe")
        if cafe:
            parts.append(f"☕ {cafe}")
        ride_name = ride.get("name") or "Club ride"
        title = f"⏰ {ride_name} in 1h"
        body = " · ".join(parts) if parts else "See you at the start."
        await push_to_users(
            [str(u["_id"]) for u in users],
            title,
            body,
            {"type": "ride.hour_reminder", "ride_id": str(ride["_id"])},
        )
        await db.rides.update_one(
            {"_id": ride["_id"]},
            {"$set": {
                "hour_reminder_sent_at": now_utc(),
                "hour_reminder_recipients": len(users),
            }},
        )
        pushes += len(users)
        rides += 1
    return {"rides_notified": rides, "pushes_sent": pushes}


async def send_pending_weather_alerts() -> dict:
    """Every ride starting in the next 2-14 hours whose forecast turns nasty
    (rain > 60% or wind > 40 kph) gets one push per going rider so they can
    bail early. Idempotent via `weather_alert_sent_at`."""
    now = now_utc()
    window_start = now + timedelta(hours=2)
    window_end = now + timedelta(hours=14)
    cursor = db.rides.find({
        "starts_at": {"$gte": window_start, "$lte": window_end},
        "weather_alert_sent_at": {"$exists": False},
    })
    alerts_sent = 0
    rides_alerted = 0
    async for ride in cursor:
        forecast = await _fetch_forecast_at(ride["starts_at"])
        if not forecast:
            continue
        rain = forecast.get("rain_chance") or 0
        wind = forecast.get("wind_kph") or 0
        if rain < WEATHER_ALERT_RAIN_PCT and wind < WEATHER_ALERT_WIND_KPH:
            continue
        users = await _going_user_docs(ride)
        if not users:
            continue
        user_ids = [str(u["_id"]) for u in users]
        reason = "rain" if rain >= WEATHER_ALERT_RAIN_PCT else "wind"
        ride_name = ride.get("name") or "today's ride"
        title = f"Ugly forecast for {ride_name}"
        if reason == "rain":
            body = f"{rain}% rain expected. Tap to view ride, bail or reconfirm."
        else:
            body = f"{wind} kph wind expected. Tap to view ride, bail or reconfirm."
        await push_to_users(
            user_ids,
            title,
            body,
            {"type": "ride.weather_alert", "ride_id": str(ride["_id"])},
        )
        await db.rides.update_one(
            {"_id": ride["_id"]},
            {"$set": {
                "weather_alert_sent_at": now_utc(),
                "weather_alert_recipients": len(user_ids),
                "weather_alert_reason": reason,
            }},
        )
        alerts_sent += len(user_ids)
        rides_alerted += 1
    return {"rides_alerted": rides_alerted, "pushes_sent": alerts_sent}


async def get_weather() -> dict:
    now = now_utc()
    cached = _weather_cache["data"]
    at = _weather_cache["at"]
    if cached and at and (now - at) < _WEATHER_TTL:
        return cached
    fresh = await _fetch_openweather()
    if fresh:
        _weather_cache["data"] = fresh
        _weather_cache["at"] = now
        return fresh
    # Fallback: last cached, else safe static
    return cached or {
        "location": "Auckland",
        "temp_c": 14,
        "condition": "Partly cloudy",
        "wind": "light SW",
        "wind_kph": 10,
        "rain_chance": 10,
        "source": "fallback",
    }


# ---------- WebSocket Manager ----------
class ConnectionManager:
    def __init__(self):
        # list of {"ws", "user"} — plus we track by user_id for targeted sends
        self.active: List[Dict[str, Any]] = []
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user: dict):
        await websocket.accept()
        async with self.lock:
            self.active.append({"ws": websocket, "user": user})

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            self.active = [c for c in self.active if c["ws"] is not websocket]

    async def _send(self, ws: WebSocket, payload: str) -> bool:
        try:
            await ws.send_text(payload)
            return True
        except Exception:
            return False

    async def broadcast(self, event: dict):
        payload = json.dumps(event, default=str)
        stale = []
        for c in list(self.active):
            ok = await self._send(c["ws"], payload)
            if not ok:
                stale.append(c["ws"])
        for ws in stale:
            await self.disconnect(ws)

    async def send_user(self, user_id: str, event: dict):
        payload = json.dumps(event, default=str)
        stale = []
        for c in list(self.active):
            if str(c["user"].get("_id")) == str(user_id):
                ok = await self._send(c["ws"], payload)
                if not ok:
                    stale.append(c["ws"])
        for ws in stale:
            await self.disconnect(ws)

    async def broadcast_except(self, exclude_user_id: str, event: dict):
        payload = json.dumps(event, default=str)
        stale = []
        for c in list(self.active):
            if str(c["user"].get("_id")) == str(exclude_user_id):
                continue
            ok = await self._send(c["ws"], payload)
            if not ok:
                stale.append(c["ws"])
        for ws in stale:
            await self.disconnect(ws)

manager = ConnectionManager()


# ---------- Expo Push ----------
async def send_expo_push(tokens: List[str], title: str, body: str, data: Optional[dict] = None) -> None:
    """Send Expo Push messages in batches of 100. Removes DeviceNotRegistered tokens."""
    tokens = [t for t in tokens if t and t.startswith("ExponentPushToken[")]
    if not tokens:
        return
    messages = [
        {
            "to": t,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "priority": "high",            # iOS + Android lock-screen delivery
            "channelId": "default",        # Android channel bind
            "_displayInForeground": True,  # legacy iOS foreground display hint
            "_contentAvailable": True,     # wake iOS app in background
            "interruptionLevel": "active", # iOS 15+ Focus/lock-screen visibility
        }
        for t in tokens
    ]
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if EXPO_ACCESS_TOKEN:
        headers["Authorization"] = f"Bearer {EXPO_ACCESS_TOKEN}"
    async with httpx.AsyncClient(timeout=15.0) as h:
        for start in range(0, len(messages), 100):
            batch = messages[start : start + 100]
            try:
                r = await h.post(EXPO_PUSH_URL, json=batch, headers=headers)
                r.raise_for_status()
                payload = r.json()
            except Exception as exc:
                log.warning("Expo push failed: %s", exc)
                continue
            tickets = payload.get("data", [])
            if isinstance(tickets, dict):
                tickets = [tickets]
            for token, ticket in zip([m["to"] for m in batch], tickets):
                if ticket.get("status") == "error":
                    err = (ticket.get("details") or {}).get("error")
                    log.warning("Expo ticket error token=%s err=%s", token[-8:], err)
                    if err == "DeviceNotRegistered":
                        await db.push_tokens.delete_many({"expo_push_token": token})


async def send_web_push(subs: List[dict], title: str, body: str, data: Optional[dict] = None) -> None:
    """Fan out a Web Push notification via VAPID. `subs` are docs pulled from
    `web_push_subscriptions`. Stale endpoints (410/404) are removed."""
    if not subs or not VAPID_PRIVATE_KEY_PEM:
        return
    from pywebpush import webpush, WebPushException  # local import — cheap
    payload = json.dumps({"title": title, "body": body, "data": data or {}})
    claims = {"sub": VAPID_CONTACT_EMAIL}
    stale_ids: list = []
    for sub in subs:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {"p256dh": sub.get("p256dh"), "auth": sub.get("auth")},
        }
        try:
            await asyncio.to_thread(
                webpush,
                subscription_info,
                payload,
                vapid_private_key=VAPID_PRIVATE_KEY_PEM,
                vapid_claims=dict(claims),  # pywebpush mutates the dict
                ttl=3600,
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):
                stale_ids.append(sub["_id"])
            else:
                log.warning("Web push failed status=%s err=%s", status, exc)
        except Exception as exc:
            log.warning("Web push send error: %s", exc)
    if stale_ids:
        await db.web_push_subscriptions.delete_many({"_id": {"$in": stale_ids}})


async def push_to_users(user_ids: List[str], title: str, body: str, data: Optional[dict] = None) -> None:
    if not user_ids:
        return
    uid_list = list(map(str, user_ids))
    docs = await db.push_tokens.find({"user_id": {"$in": uid_list}}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    if tokens:
        await send_expo_push(tokens, title, body, data)
    subs = await db.web_push_subscriptions.find({"user_id": {"$in": uid_list}}).to_list(None)
    if subs:
        await send_web_push(subs, title, body, data)


async def push_to_all_except(exclude_user_id: str, title: str, body: str, data: Optional[dict] = None) -> None:
    excl = str(exclude_user_id)
    docs = await db.push_tokens.find({"user_id": {"$ne": excl}}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    if tokens:
        await send_expo_push(tokens, title, body, data)
    subs = await db.web_push_subscriptions.find({"user_id": {"$ne": excl}}).to_list(None)
    if subs:
        await send_web_push(subs, title, body, data)


# ---------- Café auto-suggest ----------
# Small curated map of Auckland cycling neighbourhoods → the café GLCC
# tends to stop at. Ordered specific → generic; first match wins so
# "Grey Lynn West" beats "West Auckland". Editable via `CAFE_OVERRIDES`
# env var: "neighbourhood=Café Name, neighbourhood=Café Name".
_CAFE_MAP: list[tuple[str, str]] = [
    # Named ride shortcuts — checked first via ordering so route-specific
    # rules beat generic neighbourhoods.
    ("julie andrews", "Daily Bread · Britomart"),
    ("airport loop", "Daily Bread · Britomart"),
    ("airport ride", "Daily Bread · Britomart"),
    ("gentle sunday spin", "Daily Bread · Britomart"),
    ("sunday spin", "Daily Bread · Britomart"),
    ("up and over", "Little Sister · 91 Central Park Dr, Henderson"),
    ("up'n'over", "Little Sister · 91 Central Park Dr, Henderson"),
    ("up 'n' over", "Little Sister · 91 Central Park Dr, Henderson"),
    ("up n over", "Little Sister · 91 Central Park Dr, Henderson"),
    ("upnover", "Little Sister · 91 Central Park Dr, Henderson"),
    ("jailbreak", "Little Sister · 91 Central Park Dr, Henderson"),
    ("jail break", "Little Sister · 91 Central Park Dr, Henderson"),
    ("struggle street", "Little Sister · 91 Central Park Dr, Henderson"),
    ("devonport loop", "Calliope Rd Cafe · Devonport"),
    # Anywhere out west or through the Waitakere Ranges we stop at Little
    # Sister on the way home.
    ("waitakere", "Little Sister · 91 Central Park Dr, Henderson"),
    ("waitakeres", "Little Sister · 91 Central Park Dr, Henderson"),
    ("scenic drive", "Little Sister · 91 Central Park Dr, Henderson"),
    ("henderson valley", "Little Sister · 91 Central Park Dr, Henderson"),
    ("west auckland", "Little Sister · 91 Central Park Dr, Henderson"),
    ("out west", "Little Sister · 91 Central Park Dr, Henderson"),
    # Neighbourhood defaults
    ("grey lynn", "The Brunchery · 318 Richmond Rd, Grey Lynn"),
    ("ponsonby", "Ceremony Coffee · Ponsonby"),
    ("freemans bay", "Ceremony Coffee · Ponsonby"),
    ("westmere", "Daily Bread · Westmere"),
    ("herne bay", "Little & Friday · Herne Bay"),
    ("pt chevalier", "The Original · Pt Chevalier"),
    ("point chevalier", "The Original · Pt Chevalier"),
    ("sandringham", "Duo Sandringham"),
    ("mt eden", "Circus Circus · Mt Eden"),
    ("mount eden", "Circus Circus · Mt Eden"),
    ("kingsland", "Kokako Café · Kingsland"),
    ("newmarket", "Best Ugly Bagels · Newmarket"),
    ("parnell", "Coffee Supreme · Parnell"),
    ("mission bay", "Bird On A Wire · Mission Bay"),
    ("kohimarama", "Ripe Deli · Kohimarama"),
    ("st heliers", "Sisters Yarn · St Heliers"),
    ("devonport", "Calliope Rd Cafe · Devonport"),
    ("takapuna", "Takapuna Beach Cafe"),
    ("browns bay", "Deco Eatery · Browns Bay"),
    ("titirangi", "Deco Eatery · Titirangi"),
    ("piha", "Piha Café"),
    ("muriwai", "Sand Dunz Beach Cafe · Muriwai"),
    ("bethells", "Bethells Beach Café"),
    ("whangaparaoa", "Silo Cafe · Whangaparaoa"),
    ("waiheke", "Charlie Farley's · Waiheke"),
    ("cornwall park", "Cornerstone · One Tree Hill"),
    ("one tree hill", "Cornerstone · One Tree Hill"),
]


def _load_cafe_overrides() -> list[tuple[str, str]]:
    raw = os.environ.get("CAFE_OVERRIDES", "")
    out: list[tuple[str, str]] = []
    for pair in raw.split(","):
        if "=" not in pair:
            continue
        k, v = pair.split("=", 1)
        if k.strip() and v.strip():
            out.append((k.strip().lower(), v.strip()))
    return out


# In-memory cache of DB-backed cafe rules, refreshed on write.
# Falls back to _CAFE_MAP if the DB is empty or unavailable.
_cafe_rules_cache: list[tuple[str, str]] = list(_CAFE_MAP)


async def refresh_cafe_rules_cache() -> None:
    """Reload the cafe rules cache from Mongo, ordered by `order` ascending
    then created_at. If the collection is empty we keep the seed list."""
    global _cafe_rules_cache
    try:
        rules = await db.cafe_rules.find().sort([("order", 1), ("created_at", 1)]).to_list(500)
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("cafe_rules cache load failed: %s", exc)
        return
    if not rules:
        _cafe_rules_cache = list(_CAFE_MAP)
        return
    _cafe_rules_cache = [
        (str(r.get("pattern", "")).lower(), str(r.get("cafe", "")))
        for r in rules
        if r.get("pattern") and r.get("cafe")
    ]


async def seed_cafe_rules_if_empty() -> None:
    """First-boot seed: copies the hard-coded `_CAFE_MAP` into Mongo so admins
    can edit it via the app afterwards. Idempotent — later calls are no-ops."""
    try:
        count = await db.cafe_rules.count_documents({})
    except Exception:
        return
    if count:
        return
    now = now_utc()
    docs = [
        {
            "pattern": needle.lower(),
            "cafe": cafe,
            "order": i,
            "created_at": now,
            "updated_at": now,
        }
        for i, (needle, cafe) in enumerate(_CAFE_MAP)
    ]
    if docs:
        await db.cafe_rules.insert_many(docs)


def suggest_cafe(*fields: Optional[str]) -> Optional[str]:
    """Given any combination of ride text (name, route, location, city),
    return the neighbourhood's default café if we recognise it. Returns
    None if no keyword matches so callers can fall back to their own default."""
    blob = " ".join((f or "").lower() for f in fields if f)
    if not blob.strip():
        return None
    for needle, cafe in _load_cafe_overrides() + _cafe_rules_cache:
        if needle in blob:
            return cafe
    return None


# ---------- Content filter (Apple 1.2 fallback) ----------
# Small NZ/AU-flavoured list. Can be overridden via PROFANITY_WORDS env var
# (comma-separated) so admins can tune without a redeploy.
_DEFAULT_PROFANITY = (
    "fuck,shit,bitch,cunt,bastard,dick,piss,asshole,arsehole,whore,slut,"
    "faggot,nigger,retard,twat,wanker"
)
PROFANITY_WORDS = [
    w.strip().lower()
    for w in (os.environ.get("PROFANITY_WORDS") or _DEFAULT_PROFANITY).split(",")
    if w.strip()
]
_PROFANITY_RE = re.compile(
    # Match each stem plus any trailing word characters so "fuck" catches
    # "fucking" / "fucked" too. Boundaries stop it firing inside benign
    # words that happen to contain the stem in the middle.
    r"\b(" + "|".join(re.escape(w) for w in PROFANITY_WORDS) + r")\w*\b",
    re.IGNORECASE,
) if PROFANITY_WORDS else None


def _mask(word: str) -> str:
    if len(word) <= 2:
        return "*" * len(word)
    return word[0] + "*" * (len(word) - 2) + word[-1]


def filter_profanity(text: str) -> str:
    """Replace profanity with masked equivalents. Non-destructive so admins
    can still audit chat_reports — we filter on display and on the way in."""
    if not _PROFANITY_RE or not text:
        return text
    return _PROFANITY_RE.sub(lambda m: _mask(m.group(0)), text)


# ---------- Mention parsing ----------
MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z][A-Za-z0-9_\-\.]*)")


async def _blocked_pair_ids(viewer_id: str) -> set[str]:
    """Users the viewer has blocked OR who have blocked the viewer. Chat
    messages from any of these are hidden from the viewer's feed."""
    vid = str(viewer_id)
    out: set[str] = set()
    async for b in db.blocks.find({"$or": [{"user_id": vid}, {"target_id": vid}]}):
        out.add(b.get("target_id") if b.get("user_id") == vid else b.get("user_id"))
    out.discard(vid)
    return out

async def resolve_mentions(text: str) -> List[dict]:
    """Return list of mentioned user docs. Matches on first-token lowercase of the rider's name."""
    handles = {m.lower() for m in MENTION_RE.findall(text or "")}
    if not handles:
        return []
    users: List[dict] = []
    async for u in db.users.find({"status": "approved"}):
        first = (u.get("name") or "").strip().split(" ")[0].lower()
        if first and first in handles:
            users.append(u)
    return users

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    coffee: str = "Medium Flat White"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class RSVPIn(BaseModel):
    status: str  # going | maybe | no

class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    bio: Optional[str] = None
    coffee: Optional[str] = None
    photo: Optional[str] = None
    ride_reminders: Optional[bool] = None

class AdminActionIn(BaseModel):
    action: str  # approve | deny | make_admin | remove_admin | delete
    target_id: str

class RiderInviteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    coffee: str = "Medium Flat White"
    role: str = "Member"
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=32)
    photo: Optional[str] = Field(default=None, max_length=800_000)
    send_email: bool = False

class CoffeeRoundIn(BaseModel):
    coffee: Optional[str] = None
    ride_id: Optional[str] = None

class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=800)
    announcement: bool = False


class MechanicalIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    text: Optional[str] = Field(default=None, max_length=200)
    ride_id: Optional[str] = None

class PushRegisterIn(BaseModel):
    expo_push_token: str = Field(min_length=20)
    platform: str = Field(pattern="^(ios|android|web)$")
    project_id: Optional[str] = None

class PushUnregisterIn(BaseModel):
    expo_push_token: str = Field(min_length=20)

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20)
    password: str = Field(min_length=8)

class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)

class ChangeEmailIn(BaseModel):
    current_password: str = Field(min_length=1)
    new_email: EmailStr

class AdminResetPasswordIn(BaseModel):
    target_id: str

class RideCreateIn(BaseModel):
    day: str
    date: str
    time: str
    name: str
    distance: str
    elevation: str
    location: str
    route: str
    cafe: Optional[str] = None
    pace: str = "28–31 kph"

class ReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

class BlockIn(BaseModel):
    target_id: str

class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1)

# ---------- App ----------
app = FastAPI(title="GLCC API")
api = APIRouter(prefix="/api")

# Kubernetes liveness/readiness probe — must return 200 at root path.
@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Strava Integration ----------
STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
STRAVA_CLUB_ID = os.environ.get("STRAVA_CLUB_ID", "50775")
STRAVA_STATE_SECRET = os.environ.get("STRAVA_STATE_SECRET", "change-me")
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_API = "https://www.strava.com/api/v3"
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
# In production PUBLIC_APP_URL is already the canonical app URL; use it as a
# safe fallback so the Strava OAuth redirect works even if APP_URL wasn't set.
if not APP_URL:
    APP_URL = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
FRONTEND_URL = os.environ.get("FRONTEND_URL", APP_URL).rstrip("/")


def _strava_state(app_user_id: str) -> str:
    nonce = secrets.token_urlsafe(24)
    sig = hashlib.sha256(f"{nonce}|{app_user_id}|{STRAVA_STATE_SECRET}".encode()).hexdigest()
    return f"{nonce}.{app_user_id}.{sig}"


def _verify_strava_state(state: str) -> Optional[str]:
    try:
        nonce, app_user_id, sig = state.rsplit(".", 2)
        expected = hashlib.sha256(f"{nonce}|{app_user_id}|{STRAVA_STATE_SECRET}".encode()).hexdigest()
        if secrets.compare_digest(expected, sig):
            return app_user_id
    except ValueError:
        pass
    return None


def _now_ts() -> int:
    return int(now_utc().timestamp())


async def get_strava_access_token() -> str:
    """Load stored token, refresh if expiring in <1h. Raises 409 if not connected."""
    doc = await db.strava_tokens.find_one({"_id": "club"})
    if not doc or not doc.get("refresh_token") or doc.get("refresh_token") == "MANUAL_TOKEN_NO_REFRESH":
        raise HTTPException(status_code=401, detail="Strava authorization expired; please reconnect")
    if doc.get("access_token") and doc.get("expires_at", 0) > _now_ts() + 3600:
        return doc["access_token"]
    async with httpx.AsyncClient(timeout=20) as h:
        r = await h.post(STRAVA_TOKEN_URL, data={
            "client_id": STRAVA_CLIENT_ID,
            "client_secret": STRAVA_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": doc["refresh_token"],
        })
    if r.status_code in (400, 401):
        # Persist so /strava/status can surface a Reconnect prompt without a fresh sync attempt.
        await db.strava_tokens.update_one({"_id": "club"}, {"$set": {"last_refresh_error": now_utc().isoformat()}})
        raise HTTPException(status_code=401, detail="Strava authorization expired; please reconnect")
    r.raise_for_status()
    data = r.json()
    await db.strava_tokens.update_one(
        {"_id": "club"},
        {"$set": {
            "access_token": data["access_token"],
            "expires_at": data.get("expires_at", _now_ts() + data.get("expires_in", 21600)),
            "refresh_token": data.get("refresh_token", doc["refresh_token"]),
            "updated_at": now_utc(),
        }, "$unset": {"last_refresh_error": ""}},
    )
    return data["access_token"]


async def _fetch_route_stats(route_id: str, token: str) -> Optional[dict]:
    """Fetch full route detail for distance/elevation. Cached in strava_routes."""
    if not route_id:
        return None
    cached = await db.strava_routes.find_one({"_id": route_id})
    if cached and cached.get("cached_at") and "description" in cached:
        cached_at = cached["cached_at"]
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        if (now_utc() - cached_at) < timedelta(days=7):
            return cached
    try:
        async with httpx.AsyncClient(timeout=15) as h:
            r = await h.get(
                f"{STRAVA_API}/routes/{route_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
        if r.status_code != 200:
            return cached
        d = r.json()
    except Exception:
        return cached
    doc = {
        "_id": route_id,
        "distance_m": d.get("distance"),
        "elevation_m": d.get("elevation_gain"),
        "name": d.get("name"),
        "description": d.get("description"),
        "cached_at": now_utc(),
    }
    await db.strava_routes.update_one({"_id": route_id}, {"$set": doc}, upsert=True)
    return doc


def _event_to_ride(ev: dict, route_stats: Optional[dict] = None) -> dict:
    """Convert a Strava group_event into our ride shape."""
    event_id = str(ev.get("id"))
    occ = (ev.get("upcoming_occurrences") or [None])[0]
    day = date_str = time_str = None
    starts_at = None
    weekday = None  # 0=Mon .. 6=Sun (local)
    if occ:
        try:
            dt_utc = datetime.fromisoformat(occ.replace("Z", "+00:00"))
            starts_at = dt_utc
            dt = dt_utc
            tz = ev.get("zone")
            if tz:
                try:
                    dt = dt_utc.astimezone(ZoneInfo(tz))
                except Exception:
                    pass
            day = dt.strftime("%a").upper()
            date_str = dt.strftime("%-d %b")
            time_str = dt.strftime("%-I:%M %p")
            weekday = dt.weekday()
        except Exception:
            pass
    route = ev.get("route") or {}
    distance = None
    elevation = None
    map_url = None
    polyline = None
    if isinstance(route, dict):
        m = route.get("map") or {}
        polyline = m.get("summary_polyline") if isinstance(m, dict) else None
        map_urls = route.get("map_urls") or {}
        if isinstance(map_urls, dict):
            map_url = map_urls.get("dark_url") or map_urls.get("light_url") or map_urls.get("url")
    if route_stats:
        d_m = route_stats.get("distance_m")
        e_m = route_stats.get("elevation_m")
        if isinstance(d_m, (int, float)) and d_m > 0:
            distance = f"{round(d_m / 1000)} km"
        if isinstance(e_m, (int, float)) and e_m > 0:
            elevation = f"{round(e_m)} m"
    # Weekday rides (Mon–Fri) always stop at The Brunchery. Weekend rides
    # try to guess from the neighbourhood the route ends in so ride
    # captains don't have to hand-set a café every Sunday.
    cafe = None
    if weekday is not None and weekday <= 4:
        cafe = "The Brunchery · 318 Richmond Rd, Grey Lynn"
    else:
        cafe = suggest_cafe(
            ev.get("address"),
            ev.get("title"),
            route.get("name") if isinstance(route, dict) else None,
        )
    strava_url = f"https://www.strava.com/clubs/{STRAVA_CLUB_ID}/group_events/{event_id}"
    # Prefer the authoritative Strava route name (fetched from /routes/{id}),
    # fall back to the event-embedded route name, then to the event
    # description. Never fall back to the raw URL — that used to show up on
    # rides that had a description-only event which looked awful on the card.
    route_label = None
    if route_stats and route_stats.get("name"):
        route_label = route_stats["name"]
    elif isinstance(route, dict) and route.get("name"):
        route_label = route["name"]
    elif ev.get("description"):
        # Take just the first sentence so the card stays clean.
        desc = str(ev["description"]).strip()
        route_label = re.split(r"[.\n]", desc, maxsplit=1)[0][:120]
    # Full route description (from the fetched Strava route) so the app can
    # reveal it on tap without a Strava round-trip.
    route_description = None
    if route_stats and route_stats.get("description"):
        route_description = route_stats["description"]
    elif ev.get("description"):
        route_description = str(ev["description"]).strip() or None
    return {
        "strava_event_id": event_id,
        "source": "strava",
        "day": day,
        "date": date_str,
        "time": time_str,
        "starts_at": starts_at,
        "name": ev.get("title") or "Strava club ride",
        "distance": distance,
        "elevation": elevation,
        "location": ev.get("address"),
        "route": route_label,
        "route_description": route_description,
        "strava_url": strava_url,
        "map_url": map_url,
        "polyline": polyline,
        "cafe": cafe,
        "pace": None,
        "updated_at": now_utc(),
        "sort_key": starts_at.isoformat() if starts_at else f"z-{event_id}",
    }


async def sync_club_events() -> dict:
    token = await get_strava_access_token()
    async with httpx.AsyncClient(timeout=30) as h:
        r = await h.get(
            f"{STRAVA_API}/clubs/{STRAVA_CLUB_ID}/group_events",
            params={"upcoming": "true", "per_page": 200},
            headers={"Authorization": f"Bearer {token}"},
        )
    if r.status_code == 401:
        raise HTTPException(status_code=401, detail="Strava authorization expired; please reconnect")
    if r.status_code == 429:
        raise HTTPException(status_code=429, detail="Strava rate limit hit, try again shortly")
    r.raise_for_status()
    events = r.json() if isinstance(r.json(), list) else []
    ids: List[str] = []
    upserted = 0
    for ev in events:
        route_id = ev.get("route_id") or ((ev.get("route") or {}).get("id"))
        route_stats = await _fetch_route_stats(str(route_id), token) if route_id else None
        ride = _event_to_ride(ev, route_stats)
        ids.append(ride["strava_event_id"])
        await db.rides.update_one(
            {"strava_event_id": ride["strava_event_id"]},
            {"$set": ride, "$setOnInsert": {"rsvps": {}, "created_at": now_utc()}},
            upsert=True,
        )
        upserted += 1
    deleted = 0
    if ids:
        res = await db.rides.delete_many({"source": "strava", "strava_event_id": {"$nin": ids}})
        deleted = res.deleted_count
    await db.strava_meta.update_one(
        {"_id": "club"},
        {"$set": {"last_sync_at": now_utc(), "event_count": len(events)}},
        upsert=True,
    )
    await manager.broadcast({"type": "rides.synced", "count": len(events), "deleted": deleted})
    return {"synced": upserted, "deleted": deleted, "total": len(events)}


@api.get("/strava/status")
async def strava_status(user: dict = Depends(get_current_user)):
    token_doc = await db.strava_tokens.find_one({"_id": "club"}, {"refresh_token": 1, "expires_at": 1, "last_refresh_error": 1})
    meta = await db.strava_meta.find_one({"_id": "club"})
    refresh_token = (token_doc or {}).get("refresh_token")
    # A placeholder / missing refresh token means we cannot renew — the club needs to reconnect.
    invalid_refresh = (not refresh_token) or refresh_token == "MANUAL_TOKEN_NO_REFRESH"
    has_recent_error = bool((token_doc or {}).get("last_refresh_error"))
    needs_reconnect = bool(token_doc) and (invalid_refresh or has_recent_error)
    return {
        "connected": bool(token_doc and not invalid_refresh and not has_recent_error),
        "needs_reconnect": needs_reconnect,
        "last_sync_at": meta.get("last_sync_at").isoformat() if meta and meta.get("last_sync_at") else None,
        "event_count": (meta or {}).get("event_count", 0),
        "club_id": STRAVA_CLUB_ID,
    }


@api.get("/strava/connect")
async def strava_connect(admin: dict = Depends(require_admin)):
    if not STRAVA_CLIENT_ID or not STRAVA_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Strava is not configured")
    if not APP_URL:
        raise HTTPException(status_code=500, detail="APP_URL not set for OAuth callback")
    params = {
        "client_id": STRAVA_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": f"{APP_URL}/api/strava/callback",
        "approval_prompt": "auto",
        "scope": "read",
        "state": _strava_state(str(admin["_id"])),
    }
    return {"url": f"https://www.strava.com/oauth/authorize?{urlencode(params)}"}


@app.get("/api/strava/callback")
async def strava_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    redirect = f"{FRONTEND_URL or APP_URL}/?strava=denied"
    if error:
        return RedirectResponse(redirect)
    if not code or not state or not _verify_strava_state(state):
        return RedirectResponse(f"{FRONTEND_URL or APP_URL}/?strava=error")
    try:
        async with httpx.AsyncClient(timeout=20) as h:
            r = await h.post(STRAVA_TOKEN_URL, data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            })
        r.raise_for_status()
        data = r.json()
        scope = data.get("scope") or ""
        await db.strava_tokens.update_one(
            {"_id": "club"},
            {"$set": {
                "refresh_token": data["refresh_token"],
                "access_token": data.get("access_token"),
                "expires_at": data.get("expires_at", _now_ts() + data.get("expires_in", 21600)),
                "scope": scope,
                "athlete_id": (data.get("athlete") or {}).get("id"),
                "updated_at": now_utc(),
            }},
            upsert=True,
        )
        # Immediate first sync in background
        asyncio.create_task(sync_club_events())
        return RedirectResponse(f"{FRONTEND_URL or APP_URL}/?strava=connected")
    except Exception as exc:
        log.exception("Strava callback failed: %s", exc)
        return RedirectResponse(f"{FRONTEND_URL or APP_URL}/?strava=error")


@api.post("/strava/sync")
async def strava_sync_now(admin: dict = Depends(require_admin)):
    result = await sync_club_events()
    return result


@api.post("/strava/disconnect")
async def strava_disconnect(admin: dict = Depends(require_admin)):
    await db.strava_tokens.delete_many({"_id": "club"})
    return {"ok": True}


# ---------- Health ----------
@api.get("/")
async def root():
    return {"ok": True, "app": "GLCC", "time": now_utc().isoformat()}

# ---------- Auth Routes ----------
async def _next_member_no() -> int:
    """Return the next unused member number. Numbers are permanent once assigned."""
    top = await db.users.find({"member_no": {"$exists": True}}).sort("member_no", -1).limit(1).to_list(1)
    return (top[0]["member_no"] + 1) if top else 1


@api.post("/auth/register")
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name.strip(),
        "coffee": body.coffee,
        "role": "Member",
        "bio": "",
        "photo": None,
        "is_admin": False,
        "is_president": False,
        "status": "pending",  # requires admin approval
        "member_no": await _next_member_no(),
        "created_at": now_utc(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    token = create_access_token(str(result.inserted_id), email, "Member")
    # Notify admins over WS
    await manager.broadcast({
        "type": "rider.pending",
        "rider": serialize_rider(doc),
    })
    return {"token": token, "user": serialize_rider(doc)}

@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email, user.get("role", "Member"))
    return {"token": token, "user": serialize_rider(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_rider(user)


# ---------- Password reset (Resend email) ----------
def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

async def _send_reset_email(*, to_email: str, name: str, link: str) -> bool:
    """Send the reset email via Resend. Returns True on success, False otherwise. Never raises."""
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set — skipping email send")
        return False
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0b0d10;padding:32px 16px;color:#e6edf3">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#12151a;border-radius:20px;border:1px solid #2a2e36">
        <tr><td style="padding:28px 28px 8px 28px">
          <div style="font-family:Impact,'Arial Black',sans-serif;font-size:32px;letter-spacing:2px;color:#D4FF00">GLCC</div>
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8b949e;margin-top:2px">Grey Lynn Cycle Club</div>
        </td></tr>
        <tr><td style="padding:20px 28px">
          <h1 style="font-size:22px;color:#e6edf3;margin:0 0 8px 0">Reset your password</h1>
          <p style="color:#c9d1d9;line-height:1.5;margin:0 0 20px 0">Kia ora {name or 'rider'} — tap the button below to set a new password for your GLCC account. This link expires in {PASSWORD_RESET_TTL_MIN} minutes.</p>
          <a href="{link}" style="display:inline-block;background:#D4FF00;color:#0b0d10;font-weight:800;text-transform:uppercase;letter-spacing:2px;font-size:13px;padding:14px 24px;border-radius:12px;text-decoration:none">Reset password</a>
          <p style="color:#8b949e;font-size:12px;line-height:1.5;margin:24px 0 0 0">If the button doesn&#39;t work, paste this link into your browser:<br><a href="{link}" style="color:#D4FF00;word-break:break-all">{link}</a></p>
          <p style="color:#8b949e;font-size:12px;line-height:1.5;margin:20px 0 0 0">Didn&#39;t request this? Ignore this email — your password stays the same.</p>
        </td></tr>
        <tr><td style="padding:16px 28px 28px 28px;border-top:1px solid #2a2e36">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6e7681">GLCC · 4th best cycle club in Grey Lynn</div>
        </td></tr>
      </table>
    </div>"""
    text = f"Reset your GLCC password: {link} (expires in {PASSWORD_RESET_TTL_MIN} minutes). If you didn't request this, ignore this email."
    params = {
        "from": f"GLCC <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": "Reset your GLCC password",
        "html": html,
        "text": text,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        log.info("resend reset email sent: %s", result.get("id") if isinstance(result, dict) else result)
        return True
    except Exception as e:
        log.error("resend send failed: %s", e)
        return False

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn):
    """Always returns success to prevent email enumeration. Emails are sent only for real,
    non-invited users with a password_hash on file. Rate limited to 3 requests per email per hour."""
    email = body.email.lower().strip()
    # Rate limit: max 3 reset requests per email per rolling hour.
    since = now_utc() - timedelta(hours=1)
    recent = await db.password_reset_requests.count_documents({"email": email, "requested_at": {"$gte": since}})
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Too many reset requests — try again in an hour")
    await db.password_reset_requests.insert_one({"email": email, "requested_at": now_utc()})

    user = await db.users.find_one({"email": email})
    generic_ok = {"ok": True, "message": "If that email is on file, a reset link is on its way."}
    if not user or not user.get("password_hash"):
        return generic_ok
    # Invalidate any pending reset tokens for this user
    await db.password_resets.delete_many({"user_id": str(user["_id"])})
    raw_token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({
        "user_id": str(user["_id"]),
        "token_hash": _hash_token(raw_token),
        "expires_at": now_utc() + timedelta(minutes=PASSWORD_RESET_TTL_MIN),
        "used_at": None,
        "created_at": now_utc(),
    })
    link = f"{PUBLIC_APP_URL}/reset-password?token={raw_token}"
    # Fire-and-forget email so the response stays fast + timing-safe
    asyncio.create_task(_send_reset_email(to_email=email, name=user.get("name") or "", link=link))
    return generic_ok

@api.post("/auth/reset-password")
async def reset_password(body: ResetPasswordIn):
    row = await db.password_resets.find_one({"token_hash": _hash_token(body.token)})
    if not row or row.get("used_at") is not None:
        raise HTTPException(status_code=400, detail="This reset link is invalid or has already been used")
    expires_at = row.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now_utc():
            raise HTTPException(status_code=400, detail="This reset link has expired — request a new one")
    try:
        oid = ObjectId(row["user_id"])
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid reset token")
    await db.users.update_one({"_id": oid}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_resets.update_one({"_id": row["_id"]}, {"$set": {"used_at": now_utc()}})
    # Nuke any other unused tokens for that user
    await db.password_resets.delete_many({"user_id": row["user_id"], "used_at": None})
    return {"ok": True}

@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(require_approved)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from the current one")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api.post("/auth/change-email")
async def change_email(body: ChangeEmailIn, user: dict = Depends(require_approved)):
    if not user.get("password_hash") or not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_email = body.new_email.lower().strip()
    if new_email == (user.get("email") or "").lower():
        raise HTTPException(status_code=400, detail="This is already your email")
    clash = await db.users.find_one({"email": new_email, "_id": {"$ne": user["_id"]}})
    if clash:
        raise HTTPException(status_code=400, detail="That email is already in use")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"email": new_email}})
    updated = await db.users.find_one({"_id": user["_id"]})
    await manager.broadcast({"type": "rider.updated", "rider": serialize_rider(updated)})
    return {"ok": True, "user": serialize_rider(updated, viewer=updated)}

@api.post("/riders/reset-password")
async def admin_reset_password(body: AdminResetPasswordIn, admin: dict = Depends(require_admin)):
    """Admin sends a password-reset email to a rider on their behalf."""
    try:
        oid = ObjectId(body.target_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rider id")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="Rider not found")
    if not target.get("email"):
        raise HTTPException(status_code=400, detail="This rider has no email on file yet — ask them to self-register first")
    await db.password_resets.delete_many({"user_id": str(oid)})
    raw_token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({
        "user_id": str(oid),
        "token_hash": _hash_token(raw_token),
        "expires_at": now_utc() + timedelta(minutes=PASSWORD_RESET_TTL_MIN),
        "used_at": None,
        "created_at": now_utc(),
        "created_by_admin": str(admin["_id"]),
    })
    link = f"{PUBLIC_APP_URL}/reset-password?token={raw_token}"
    sent = await _send_reset_email(to_email=target["email"], name=target.get("name") or "", link=link)
    return {"ok": True, "email_sent": sent, "sent_to": target["email"]}


# ---------- Riders ----------
@api.get("/riders")
async def list_riders(user: dict = Depends(get_current_user)):
    approved = []
    pending = []
    # El Presidente always pinned at the top, then everyone else by created_at.
    async for r in db.users.find({}).sort([("is_president", -1), ("created_at", 1)]):
        if r.get("status") == "pending":
            pending.append(serialize_rider(r, viewer=user))
        else:
            approved.append(serialize_rider(r, viewer=user))
    return {"riders": approved, "pending": pending if user.get("is_admin") else []}

async def _send_invite_email(*, to_email: str, name: str, inviter_name: str, link: str) -> bool:
    """Send an invite email via Resend. Returns True on success."""
    if not RESEND_API_KEY:
        log.warning("RESEND_API_KEY not set — skipping invite email")
        return False
    html = f"""
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0b0d10;padding:32px 16px;color:#e6edf3">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#12151a;border-radius:20px;border:1px solid #2a2e36">
        <tr><td style="padding:28px 28px 8px 28px">
          <div style="font-family:Impact,'Arial Black',sans-serif;font-size:32px;letter-spacing:2px;color:#D4FF00">GLCC</div>
          <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8b949e;margin-top:2px">Grey Lynn Cycle Club</div>
        </td></tr>
        <tr><td style="padding:20px 28px">
          <h1 style="font-size:22px;color:#e6edf3;margin:0 0 8px 0">You're invited to GLCC</h1>
          <p style="color:#c9d1d9;line-height:1.5;margin:0 0 20px 0">Kia ora {name or 'rider'} — {inviter_name or 'an admin'} just added you to the Grey Lynn Cycle Club roster. Sign up with your own email to unlock rides, coffee rounds and the peloton chat.</p>
          <a href="{link}" style="display:inline-block;background:#D4FF00;color:#0b0d10;font-weight:800;text-transform:uppercase;letter-spacing:2px;font-size:13px;padding:14px 24px;border-radius:12px;text-decoration:none">Join the club</a>
          <p style="color:#8b949e;font-size:12px;line-height:1.5;margin:24px 0 0 0">If the button doesn&#39;t work, paste this link into your browser:<br><a href="{link}" style="color:#D4FF00;word-break:break-all">{link}</a></p>
        </td></tr>
        <tr><td style="padding:16px 28px 28px 28px;border-top:1px solid #2a2e36">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6e7681">GLCC · 4th best cycle club in Grey Lynn</div>
        </td></tr>
      </table>
    </div>"""
    text = f"You've been invited to GLCC by {inviter_name or 'an admin'}. Sign up: {link}"
    params = {
        "from": f"GLCC <{SENDER_EMAIL}>",
        "to": [to_email],
        "subject": "You're invited to GLCC",
        "html": html,
        "text": text,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        log.info("resend invite email sent: %s", result.get("id") if isinstance(result, dict) else result)
        return True
    except Exception as e:
        log.error("resend invite send failed: %s", e)
        return False


@api.post("/riders/invite")
async def invite_rider(body: RiderInviteIn, admin: dict = Depends(require_admin)):
    """Admin creates a placeholder rider that appears in the roster with status='invited'.
    Optionally emails an invite link if `send_email` is true and `email` is set. Always
    returns a shareable `invite_link` the admin can paste into a text message."""
    email = (body.email or "").strip().lower() or None
    phone = (body.phone or "").strip() or None
    if email:
        clash = await db.users.find_one({"email": email})
        if clash:
            raise HTTPException(status_code=409, detail="A rider with that email is already on the roster")
    doc = {
        "email": email,
        "password_hash": None,
        "name": body.name.strip(),
        "coffee": body.coffee,
        "role": body.role,
        "bio": "",
        "photo": body.photo or None,
        "phone": phone,
        "is_admin": False,
        "is_president": False,
        "status": "invited",
        "member_no": await _next_member_no(),
        "invited_by": str(admin["_id"]),
        "created_at": now_utc(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    await manager.broadcast({"type": "rider.updated", "rider": serialize_rider(doc)})
    invite_link = f"{PUBLIC_APP_URL}/?invite={result.inserted_id}"
    email_sent = False
    if body.send_email and email:
        email_sent = await _send_invite_email(
            to_email=email,
            name=doc["name"],
            inviter_name=admin.get("name") or "GLCC",
            link=invite_link,
        )
    return {
        **serialize_rider(doc, viewer=admin),
        "invite_link": invite_link,
        "email_sent": email_sent,
    }

@api.patch("/riders/me")
async def update_me(body: ProfileUpdateIn, user: dict = Depends(require_approved)):
    # Self-editable fields: name, coffee, photo, ride reminders. Role, bio,
    # join date and member number are managed via the admin route.
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in {"name", "coffee", "photo", "ride_reminders"}}
    if not update:
        return serialize_rider(user)
    await db.users.update_one({"_id": user["_id"]}, {"$set": update})
    updated = await db.users.find_one({"_id": user["_id"]})
    await manager.broadcast({"type": "rider.updated", "rider": serialize_rider(updated)})
    return serialize_rider(updated)

@api.patch("/riders/{rider_id}")
async def admin_update_rider(rider_id: str, body: ProfileUpdateIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(rider_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rider id")
    # Coffee is personal — admins can update name/role/bio/photo but not another rider's coffee order.
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in {"name", "role", "bio", "photo"}}
    if not update:
        target = await db.users.find_one({"_id": oid})
        return serialize_rider(target)
    await db.users.update_one({"_id": oid}, {"$set": update})
    updated = await db.users.find_one({"_id": oid})
    await manager.broadcast({"type": "rider.updated", "rider": serialize_rider(updated)})
    return serialize_rider(updated)

@api.post("/riders/action")
async def rider_admin_action(body: AdminActionIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(body.target_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rider id")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="Rider not found")
    # JB-only actions for admin promotion (matches mockup)
    if body.action in {"make_admin", "remove_admin"} and not admin.get("is_president"):
        raise HTTPException(status_code=403, detail="President only")
    if body.action == "approve":
        await db.users.update_one({"_id": oid}, {"$set": {"status": "approved"}})
    elif body.action == "deny":
        await db.users.delete_one({"_id": oid})
    elif body.action == "make_admin":
        await db.users.update_one({"_id": oid}, {"$set": {"is_admin": True}})
    elif body.action == "remove_admin":
        if target.get("is_president"):
            raise HTTPException(status_code=400, detail="Cannot demote the President")
        await db.users.update_one({"_id": oid}, {"$set": {"is_admin": False}})
    elif body.action == "delete":
        if target.get("is_president"):
            raise HTTPException(status_code=400, detail="Cannot delete the President")
        await db.users.delete_one({"_id": oid})
    else:
        raise HTTPException(status_code=400, detail="Unknown action")
    updated = await db.users.find_one({"_id": oid})
    await manager.broadcast({"type": "rider.updated" if updated else "rider.deleted", "rider": serialize_rider(updated) if updated else {"id": body.target_id}})
    return {"ok": True}

# ---------- Rides ----------
@api.get("/rides")
async def list_rides(user: dict = Depends(get_current_user)):
    # Show only today's and future rides (rides without a starts_at fall through).
    today_start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=12)
    query = {"$or": [{"starts_at": {"$gte": today_start}}, {"starts_at": None}, {"starts_at": {"$exists": False}}]}
    rides = []
    async for r in db.rides.find(query).sort("sort_key", 1):
        rides.append(serialize_ride(r))
    return {"rides": rides}


@api.get("/rides/public/{ride_id}")
async def public_ride(ride_id: str):
    """Auth-free ride preview for share links. Returns a small safe subset
    (no RSVP user ids, no personal data) so friends without the app can land
    on a proper preview instead of a bare 404."""
    try:
        oid = ObjectId(ride_id)
    except InvalidId:
        raise HTTPException(status_code=404, detail="Ride not found")
    doc = await db.rides.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Ride not found")
    users = await _going_user_docs(doc)
    starts_at = doc.get("starts_at")
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name"),
        "day": doc.get("day"),
        "date": doc.get("date"),
        "time": doc.get("time"),
        "starts_at": starts_at.isoformat() if isinstance(starts_at, datetime) else starts_at,
        "distance": doc.get("distance"),
        "elevation": doc.get("elevation"),
        "pace": doc.get("pace", "28-31 kph"),
        "location": doc.get("location"),
        "route": doc.get("route"),
        "route_description": doc.get("route_description"),
        "cafe": doc.get("cafe"),
        "source": doc.get("source", "manual"),
        "strava_url": doc.get("strava_url"),
        "map_url": doc.get("map_url"),
        "going_count": len(users),
        # First names only so we don't leak the roster.
        "going_first_names": [
            (u.get("name") or "").split(" ")[0] for u in users if u.get("name")
        ],
    }

@api.post("/rides")
async def create_ride(body: RideCreateIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    # If the captain didn't set a café, try to guess from the route/location.
    if not doc.get("cafe"):
        guess = suggest_cafe(doc.get("location"), doc.get("route"), doc.get("name"))
        if guess:
            doc["cafe"] = guess
    doc["rsvps"] = {}
    doc["created_at"] = now_utc()
    doc["sort_key"] = doc["created_at"].isoformat()
    r = await db.rides.insert_one(doc)
    doc["_id"] = r.inserted_id
    await manager.broadcast({"type": "ride.created", "ride": serialize_ride(doc)})
    return serialize_ride(doc)


@api.get("/rides/cafe-suggest")
async def rides_cafe_suggest(q: str = "", user: dict = Depends(get_current_user)):
    """Live suggestion for the manual create-ride form. Accepts any blob of
    route/location text and returns the matching neighbourhood café."""
    return {"suggestion": suggest_cafe(q)}


# ---------- Café Rules Admin ----------
class CafeRuleIn(BaseModel):
    pattern: str = Field(..., min_length=1, max_length=80)
    cafe: str = Field(..., min_length=1, max_length=160)
    order: Optional[int] = None


class CafeRulePatchIn(BaseModel):
    pattern: Optional[str] = Field(None, min_length=1, max_length=80)
    cafe: Optional[str] = Field(None, min_length=1, max_length=160)
    order: Optional[int] = None


def _serialize_cafe_rule(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "pattern": doc.get("pattern", ""),
        "cafe": doc.get("cafe", ""),
        "order": doc.get("order", 0),
        "updated_at": (doc.get("updated_at") or doc.get("created_at") or now_utc()).isoformat(),
    }


@api.get("/admin/cafe-rules")
async def admin_list_cafe_rules(admin: dict = Depends(require_admin)):
    rules = await db.cafe_rules.find().sort([("order", 1), ("created_at", 1)]).to_list(500)
    return {"rules": [_serialize_cafe_rule(r) for r in rules]}


@api.post("/admin/cafe-rules")
async def admin_create_cafe_rule(body: CafeRuleIn, admin: dict = Depends(require_admin)):
    pattern = body.pattern.strip().lower()
    cafe = body.cafe.strip()
    if not pattern or not cafe:
        raise HTTPException(status_code=400, detail="Pattern and café required")
    if await db.cafe_rules.find_one({"pattern": pattern}):
        raise HTTPException(status_code=409, detail="A rule with that pattern already exists")
    order = body.order
    if order is None:
        last = await db.cafe_rules.find().sort("order", -1).limit(1).to_list(1)
        order = (last[0].get("order", 0) + 1) if last else 0
    now = now_utc()
    doc = {"pattern": pattern, "cafe": cafe, "order": int(order), "created_at": now, "updated_at": now}
    r = await db.cafe_rules.insert_one(doc)
    doc["_id"] = r.inserted_id
    await refresh_cafe_rules_cache()
    return _serialize_cafe_rule(doc)


@api.patch("/admin/cafe-rules/{rule_id}")
async def admin_update_cafe_rule(rule_id: str, body: CafeRulePatchIn, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(rule_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rule id")
    update: dict = {}
    if body.pattern is not None:
        p = body.pattern.strip().lower()
        if not p:
            raise HTTPException(status_code=400, detail="Pattern required")
        clash = await db.cafe_rules.find_one({"pattern": p, "_id": {"$ne": oid}})
        if clash:
            raise HTTPException(status_code=409, detail="Another rule already uses that pattern")
        update["pattern"] = p
    if body.cafe is not None:
        c = body.cafe.strip()
        if not c:
            raise HTTPException(status_code=400, detail="Café required")
        update["cafe"] = c
    if body.order is not None:
        update["order"] = int(body.order)
    if not update:
        raise HTTPException(status_code=400, detail="Nothing to update")
    update["updated_at"] = now_utc()
    res = await db.cafe_rules.update_one({"_id": oid}, {"$set": update})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Rule not found")
    r = await db.cafe_rules.find_one({"_id": oid})
    await refresh_cafe_rules_cache()
    return _serialize_cafe_rule(r)


@api.delete("/admin/cafe-rules/{rule_id}")
async def admin_delete_cafe_rule(rule_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(rule_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rule id")
    r = await db.cafe_rules.delete_one({"_id": oid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Rule not found")
    await refresh_cafe_rules_cache()
    return {"ok": True}


@api.post("/rides/{ride_id}/rsvp")
async def rsvp(ride_id: str, body: RSVPIn, user: dict = Depends(require_approved)):
    if body.status not in {"going", "maybe", "no"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    try:
        oid = ObjectId(ride_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid ride id")
    key = f"rsvps.{str(user['_id'])}"
    await db.rides.update_one({"_id": oid}, {"$set": {key: body.status}})
    ride = await db.rides.find_one({"_id": oid})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    await manager.broadcast({"type": "ride.updated", "ride": serialize_ride(ride)})
    return serialize_ride(ride)

# ---------- Coffee Rounds ----------
@api.get("/coffee/rounds")
async def list_rounds(user: dict = Depends(get_current_user)):
    rounds = []
    async for r in db.coffee_rounds.find({}).sort("created_at", -1).limit(30):
        rounds.append(serialize_round(r))
    return {"rounds": rounds}

@api.post("/coffee/rounds")
async def send_round(body: CoffeeRoundIn, user: dict = Depends(require_approved)):
    coffee = body.coffee or user.get("coffee", "Medium Flat White")
    doc = {
        "rider_id": str(user["_id"]),
        "rider_name": user.get("name"),
        "rider_photo": user.get("photo"),
        "coffee": coffee,
        "ride_name": None,
        "created_at": now_utc(),
    }
    if body.ride_id:
        try:
            ride = await db.rides.find_one({"_id": ObjectId(body.ride_id)})
            if ride:
                doc["ride_name"] = ride.get("name")
        except InvalidId:
            pass
    result = await db.coffee_rounds.insert_one(doc)
    doc["_id"] = result.inserted_id
    payload_round = serialize_round(doc)
    await manager.broadcast({"type": "coffee.round", "round": payload_round})
    # Fire-and-forget Expo push to everyone except sender
    asyncio.create_task(push_to_all_except(
        str(user["_id"]),
        "Coffee round ☕",
        f"{user.get('name')} is buying — {coffee}",
        {"type": "coffee.round", "round_id": str(result.inserted_id)},
    ))
    return payload_round

@api.post("/admin/send-ride-reminders")
async def admin_send_ride_reminders(admin: dict = Depends(require_admin)):
    """Manual trigger for the evening-before ride reminder emails."""
    result = await send_pending_ride_reminders()
    return result


@api.post("/admin/send-weather-alerts")
async def admin_send_weather_alerts(admin: dict = Depends(require_admin)):
    """Manual trigger for the morning-of weather-alert push."""
    result = await send_pending_weather_alerts()
    return result


# ---------- Chat ----------
@api.get("/chat/messages")
async def list_messages(user: dict = Depends(get_current_user)):
    # Pending riders cannot read the chat — the feed only opens once an admin approves them.
    if user.get("status") == "pending":
        return {"messages": []}
    blocked = await _blocked_pair_ids(str(user["_id"]))
    query = {"user_id": {"$nin": list(blocked)}} if blocked else {}
    msgs = []
    async for m in db.messages.find(query).sort("created_at", -1).limit(100):
        msgs.append(serialize_message(m))
    msgs.reverse()
    return {"messages": msgs}

@api.post("/chat/messages")
async def post_message(body: ChatMessageIn, user: dict = Depends(require_approved)):
    text = filter_profanity(body.text.strip())
    # Only El Presidente can flag a message as an official club announcement.
    is_announcement = bool(body.announcement) and bool(user.get("is_president"))
    doc = {
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "text": text,
        "system": False,
        "announcement": is_announcement,
        "created_at": now_utc(),
    }
    r = await db.messages.insert_one(doc)
    doc["_id"] = r.inserted_id
    payload = serialize_message(doc)
    await manager.broadcast({"type": "chat.message", "message": payload})

    # Resolve @mentions (skip self-mention + anyone the sender is blocking or blocked by)
    mentioned = await resolve_mentions(text)
    sender_blocked = await _blocked_pair_ids(str(user["_id"]))
    mention_user_ids = [
        str(m["_id"]) for m in mentioned
        if str(m["_id"]) != str(user["_id"]) and str(m["_id"]) not in sender_blocked
    ]
    if mention_user_ids:
        preview = text[:140]
        # Targeted WS event (browser fallback)
        for uid in mention_user_ids:
            await manager.send_user(uid, {
                "type": "chat.mention",
                "message_id": payload["id"],
                "from": user.get("name"),
                "text": preview,
            })
        asyncio.create_task(push_to_users(
            mention_user_ids,
            f"{user.get('name')} mentioned you",
            preview,
            {"type": "chat.mention", "message_id": payload["id"]},
        ))

    # El Presidente announcements push to every rider except the sender.
    if is_announcement:
        asyncio.create_task(push_to_all_except(
            str(user["_id"]),
            "📣 GLCC Announcement",
            f"{user.get('name')}: {text[:140]}",
            {"type": "chat.announcement", "message_id": payload["id"]},
        ))
    return payload


class MechanicalPushException(HTTPException):
    pass


@api.post("/chat/mechanical")
async def report_mechanical(body: MechanicalIn, user: dict = Depends(require_approved)):
    """Broadcasts a mechanical alert to the whole club — creates a system chat
    message with the reporter's live location (if provided) and fires a push
    notification to everyone except the reporter."""
    lat = body.lat
    lng = body.lng
    maps_link: Optional[str] = None
    if lat is not None and lng is not None:
        # Universal Google Maps URL — iOS Safari and Android Chrome will
        # deep-link into the native Google Maps / Apple Maps apps if
        # installed. Falls back to google.com/maps in the browser.
        maps_link = f"https://www.google.com/maps/search/?api=1&query={lat:.6f}%2C{lng:.6f}"
    extra = (body.text or "").strip()[:200]
    text_parts = [f"🔧 {user.get('name')} has a mechanical."]
    if extra:
        text_parts.append(extra)
    if maps_link:
        text_parts.append(f"Location → {maps_link}")
    else:
        text_parts.append("(No location shared — reply if you know where they are.)")
    text = " ".join(text_parts)
    doc = {
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "text": text,
        "system": True,
        "announcement": False,
        "mechanical": {
            "lat": lat,
            "lng": lng,
            "maps_link": maps_link,
            "ride_id": body.ride_id,
        },
        "created_at": now_utc(),
    }
    r = await db.messages.insert_one(doc)
    doc["_id"] = r.inserted_id
    payload = serialize_message(doc)
    await manager.broadcast({"type": "chat.message", "message": payload})
    asyncio.create_task(push_to_all_except(
        str(user["_id"]),
        "🔧 Mechanical",
        f"{user.get('name')} has a mechanical — tap for location.",
        {
            "type": "chat.mechanical",
            "message_id": payload["id"],
            "maps_link": maps_link,
            "reporter": user.get("name"),
        },
    ))
    return payload


# ---------- Moderation (Apple Guideline 1.2) ----------
@api.post("/chat/messages/{message_id}/report")
async def report_message(message_id: str, body: ReportIn, user: dict = Depends(require_approved)):
    """File a report on a chat message. Snapshots the message so admins can
    review even if the author later deletes it. Emails all admins."""
    try:
        oid = ObjectId(message_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid message id")
    msg = await db.messages.find_one({"_id": oid})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if str(msg.get("user_id")) == str(user["_id"]):
        raise HTTPException(status_code=400, detail="You can't report your own message")
    report = {
        "reporter_id": str(user["_id"]),
        "reporter_name": user.get("name"),
        "message_id": str(oid),
        "message_snapshot": {
            "text": msg.get("text"),
            "user_id": str(msg.get("user_id")),
            "name": msg.get("name"),
            "created_at": msg.get("created_at"),
        },
        "reason": body.reason.strip()[:500],
        "status": "open",
        "created_at": now_utc(),
    }
    await db.chat_reports.insert_one(report)
    # Notify all admins via push + WS
    admin_ids = [str(a["_id"]) async for a in db.users.find({"is_admin": True})]
    if admin_ids:
        asyncio.create_task(push_to_users(
            admin_ids,
            "Message reported",
            f"{user.get('name')} reported a chat message",
            {"type": "chat.report"},
        ))
        for aid in admin_ids:
            await manager.send_user(aid, {"type": "chat.report"})
    return {"ok": True}


@api.get("/blocks")
async def list_blocks(user: dict = Depends(get_current_user)):
    docs = await db.blocks.find({"user_id": str(user["_id"])}).to_list(200)
    return {"blocked_ids": [d.get("target_id") for d in docs]}


# ---------- Admin moderation inbox ----------
def _serialize_report(doc: dict) -> dict:
    snap = doc.get("message_snapshot", {}) or {}
    created = snap.get("created_at")
    return {
        "id": str(doc["_id"]),
        "reporter_id": doc.get("reporter_id"),
        "reporter_name": doc.get("reporter_name"),
        "message_id": doc.get("message_id"),
        "reason": doc.get("reason"),
        "status": doc.get("status", "open"),
        "resolved_by": doc.get("resolved_by"),
        "resolved_at": doc.get("resolved_at").isoformat() if isinstance(doc.get("resolved_at"), datetime) else doc.get("resolved_at"),
        "message_snapshot": {
            "text": snap.get("text"),
            "name": snap.get("name"),
            "user_id": snap.get("user_id"),
            "created_at": created.isoformat() if isinstance(created, datetime) else created,
        },
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/admin/reports")
async def admin_list_reports(status_filter: Optional[str] = None, admin: dict = Depends(require_admin)):
    query: dict = {}
    if status_filter in {"open", "resolved"}:
        query["status"] = status_filter
    docs = await db.chat_reports.find(query).sort("created_at", -1).limit(100).to_list(100)
    open_count = await db.chat_reports.count_documents({"status": "open"})
    return {"reports": [_serialize_report(d) for d in docs], "open_count": open_count}


async def _resolve_report(oid: ObjectId, admin: dict, action: str) -> dict:
    """Shared handler for dismiss / delete-message actions on a report."""
    doc = await db.chat_reports.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Report not found")
    await db.chat_reports.update_one(
        {"_id": oid},
        {"$set": {
            "status": "resolved",
            "resolved_by": str(admin["_id"]),
            "resolved_at": now_utc(),
            "resolution": action,
        }},
    )
    return doc


@api.post("/admin/reports/{report_id}/dismiss")
async def admin_dismiss_report(report_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(report_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid report id")
    await _resolve_report(oid, admin, "dismissed")
    return {"ok": True}


@api.post("/admin/reports/{report_id}/delete-message")
async def admin_delete_reported_message(report_id: str, admin: dict = Depends(require_admin)):
    try:
        oid = ObjectId(report_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid report id")
    report = await _resolve_report(oid, admin, "message_deleted")
    msg_id = report.get("message_id")
    if msg_id:
        try:
            await db.messages.delete_one({"_id": ObjectId(msg_id)})
            await manager.broadcast({"type": "chat.deleted", "message_id": msg_id})
        except InvalidId:
            pass
    return {"ok": True}


@api.delete("/chat/messages")
async def wipe_chat(admin: dict = Depends(require_admin)):
    """Admin-only: nukes every chat message + associated reports. Broadcasts
    `chat.cleared` so every connected client empties its local state instantly."""
    deleted_msgs = await db.messages.delete_many({})
    deleted_reports = await db.chat_reports.delete_many({})
    await manager.broadcast({"type": "chat.cleared", "by": admin.get("name")})
    return {"messages_deleted": deleted_msgs.deleted_count, "reports_deleted": deleted_reports.deleted_count}


@api.post("/blocks")
async def create_block(body: BlockIn, user: dict = Depends(get_current_user)):
    if body.target_id == str(user["_id"]):
        raise HTTPException(status_code=400, detail="You can't block yourself")
    try:
        target_oid = ObjectId(body.target_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid rider id")
    target = await db.users.find_one({"_id": target_oid})
    if not target:
        raise HTTPException(status_code=404, detail="Rider not found")
    await db.blocks.update_one(
        {"user_id": str(user["_id"]), "target_id": body.target_id},
        {"$setOnInsert": {"created_at": now_utc()}},
        upsert=True,
    )
    return {"ok": True, "target_id": body.target_id}


@api.delete("/blocks/{target_id}")
async def remove_block(target_id: str, user: dict = Depends(get_current_user)):
    await db.blocks.delete_one({"user_id": str(user["_id"]), "target_id": target_id})
    return {"ok": True}


@api.delete("/auth/me")
async def delete_my_account(body: DeleteAccountIn, user: dict = Depends(get_current_user)):
    """Rider-initiated account deletion (Apple Guideline 5.1.1(v)). Removes
    the user + push tokens + password reset tokens + blocks + chat reports
    they filed. Chat messages the rider posted are anonymised so club
    history stays intact but their name is scrubbed."""
    if not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Password is incorrect")
    if user.get("is_president"):
        raise HTTPException(status_code=400, detail="El Presidente can't self-delete. Transfer the role first.")
    uid = str(user["_id"])
    # Anonymise messages instead of deleting so replies don't dangle.
    await db.messages.update_many(
        {"user_id": uid},
        {"$set": {"name": "Former rider", "user_id": None}},
    )
    await db.push_tokens.delete_many({"user_id": uid})
    await db.password_resets.delete_many({"user_id": uid})
    await db.blocks.delete_many({"$or": [{"user_id": uid}, {"target_id": uid}]})
    await db.chat_reports.delete_many({"reporter_id": uid})
    await db.coffee_rounds.delete_many({"rider_id": uid})
    # Pull user out of ride RSVPs so counts stay accurate.
    await db.rides.update_many(
        {f"rsvps.{uid}": {"$exists": True}},
        {"$unset": {f"rsvps.{uid}": ""}},
    )
    await db.users.delete_one({"_id": user["_id"]})
    await manager.broadcast({"type": "rider.deleted", "rider_id": uid})
    return {"ok": True}


# ---------- Push tokens ----------
@api.post("/push/register")
async def push_register(body: PushRegisterIn, user: dict = Depends(get_current_user)):
    if not body.expo_push_token.startswith("ExponentPushToken["):
        raise HTTPException(status_code=400, detail="Invalid Expo push token")
    ts = now_utc()
    await db.push_tokens.update_one(
        {"user_id": str(user["_id"]), "expo_push_token": body.expo_push_token},
        {
            "$set": {
                "platform": body.platform,
                "project_id": body.project_id,
                "updated_at": ts,
                "last_error": None,
            },
            "$setOnInsert": {"created_at": ts},
        },
        upsert=True,
    )
    return {"ok": True}


@api.delete("/push/unregister")
async def push_unregister(body: PushUnregisterIn, user: dict = Depends(get_current_user)):
    result = await db.push_tokens.delete_one(
        {"user_id": str(user["_id"]), "expo_push_token": body.expo_push_token}
    )
    return {"ok": True, "deleted": result.deleted_count > 0}


@api.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    """Send a test push to the current user's registered devices (native + web)."""
    docs = await db.push_tokens.find({"user_id": str(user["_id"])}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    web_subs = await db.web_push_subscriptions.find({"user_id": str(user["_id"])}).to_list(None)
    total = len(tokens) + len(web_subs)
    if total == 0:
        return {"ok": False, "detail": "No registered devices"}
    if tokens:
        await send_expo_push(tokens, "GLCC test ping", "If you can read this, push is wired ✅", {"type": "test"})
    if web_subs:
        await send_web_push(web_subs, "GLCC test ping", "If you can read this, push is wired ✅", {"type": "test"})
    return {"ok": True, "sent": total, "native": len(tokens), "web": len(web_subs)}


# ---------- Web Push (VAPID) ----------
class WebPushKeys(BaseModel):
    p256dh: str
    auth: str


class WebPushSubscribeIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    keys: WebPushKeys


class WebPushUnsubscribeIn(BaseModel):
    endpoint: str


@api.get("/webpush/vapid-key")
async def webpush_vapid_key():
    """Public key used by the browser to subscribe. Safe to expose unauthenticated."""
    return {"public_key": VAPID_PUBLIC_KEY}


@api.post("/webpush/subscribe")
async def webpush_subscribe(body: WebPushSubscribeIn, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": str(user["_id"]),
        "endpoint": body.endpoint,
        "p256dh": body.keys.p256dh,
        "auth": body.keys.auth,
        "created_at": now_utc(),
    }
    await db.web_push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api.delete("/webpush/unsubscribe")
async def webpush_unsubscribe(body: WebPushUnsubscribeIn, user: dict = Depends(get_current_user)):
    await db.web_push_subscriptions.delete_one({"endpoint": body.endpoint, "user_id": str(user["_id"])})
    return {"ok": True}

# ---------- Weather (static demo) ----------
@api.get("/weather")
async def weather():
    return await get_weather()

# ---------- WebSocket ----------
@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = ""):
    user = await decode_token_ws(token) if token else None
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await manager.connect(websocket, user)
    try:
        await websocket.send_text(json.dumps({"type": "hello", "user": serialize_rider(user)}))
        while True:
            # Keep-alive; clients can send pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        await manager.disconnect(websocket)

app.include_router(api)

# ---------- Seed ----------
COFFEES = [
    "Small Flat White", "Medium Flat White", "Large Flat White",
    "Small Cappuccino", "Medium Cappuccino", "Large Cappuccino",
    "Oat Flat White", "Espresso", "Piccolo", "Macchiato", "Cortado",
    "Long Black", "Americano", "Mochaccino",
]

SEED_RIDES = [
    {
        "day": "FRI", "date": "16 Jan", "time": "5:15 AM",
        "name": "Zone 2 Friday", "distance": "40 km", "elevation": "320 m",
        "location": "MyRide Grey Lynn, 376 Great North Rd",
        "route": "Grey Lynn — flat tempo loop through Westhaven",
        "cafe": "Daily Bread", "pace": "28–31 kph",
    },
    {
        "day": "SAT", "date": "17 Jan", "time": "6:00 AM",
        "name": "Struggle Street", "distance": "72 km", "elevation": "1120 m",
        "location": "MyRide Grey Lynn, 376 Great North Rd",
        "route": "West Coast loop via Scenic Drive — the struggle is real",
        "cafe": "Little Sister", "pace": "30–34 kph",
    },
    {
        "day": "SUN", "date": "18 Jan", "time": "7:30 AM",
        "name": "Café Cruise", "distance": "28 km", "elevation": "110 m",
        "location": "Grey Lynn Park",
        "route": "Coastal cruise via Tamaki Drive to Mission Bay",
        "cafe": "Cornerstone", "pace": "24–27 kph",
    },
    {
        "day": "TUE", "date": "20 Jan", "time": "5:45 AM",
        "name": "Chaingang Tuesday", "distance": "50 km", "elevation": "480 m",
        "location": "Point Chevalier lights",
        "route": "Rotating pace-line — 4km efforts around Meola",
        "cafe": None, "pace": "32–38 kph",
    },
    {
        "day": "THU", "date": "22 Jan", "time": "6:15 AM",
        "name": "Hill Reps Waiatarua", "distance": "60 km", "elevation": "980 m",
        "location": "Titirangi Village",
        "route": "3×Waiatarua repeats — max effort out, easy return",
        "cafe": "Deco Eatery", "pace": "26–30 kph",
    },
]

async def seed():
    # Email is unique for riders that have one — invited riders (no email) don't collide.
    try:
        info = await db.users.index_information()
        for name, meta in info.items():
            if name == "_id_":
                continue
            keys = meta.get("key", [])
            if keys and keys[0][0] == "email":
                # Recreate with partial filter so nulls don't collide
                await db.users.drop_index(name)
    except Exception:
        pass
    await db.users.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
    )
    await db.rides.create_index("sort_key")
    await db.rides.create_index("strava_event_id", unique=True, sparse=True)
    # Chat messages auto-expire 7 days (604800s) after creation
    try:
        idx = await db.messages.index_information()
        for name, info in idx.items():
            if name == "_id_":
                continue
            keys = info.get("key", [])
            if keys and keys[0][0] == "created_at" and info.get("expireAfterSeconds") != 604800:
                await db.messages.drop_index(name)
    except Exception:
        pass
    await db.messages.create_index("created_at", expireAfterSeconds=604800)
    # Coffee rounds auto-expire 1 hour after creation
    try:
        idx = await db.coffee_rounds.index_information()
        for name, info in idx.items():
            if name == "_id_":
                continue
            keys = info.get("key", [])
            if keys and keys[0][0] == "created_at" and info.get("expireAfterSeconds") != 3600:
                await db.coffee_rounds.drop_index(name)
    except Exception:
        pass
    await db.coffee_rounds.create_index("created_at", expireAfterSeconds=3600)
    await db.push_tokens.create_index([("user_id", 1), ("expo_push_token", 1)], unique=True)
    await db.push_tokens.create_index("expo_push_token")
    await db.web_push_subscriptions.create_index("endpoint", unique=True)
    await db.web_push_subscriptions.create_index("user_id")
    # Auto-delete used/expired password reset tokens
    await db.password_resets.create_index("expires_at", expireAfterSeconds=0)
    await db.password_resets.create_index("token_hash", unique=True)
    # Track forgot-password requests for rate limiting (auto-clean after 2h)
    await db.password_reset_requests.create_index("requested_at", expireAfterSeconds=7200)
    await db.blocks.create_index([("user_id", 1), ("target_id", 1)], unique=True)
    await db.chat_reports.create_index("created_at")
    await db.password_reset_requests.create_index("email")

    admin_email = os.environ.get("ADMIN_EMAIL", "jb@glcc.club").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Roenick2707")
    admin_name = os.environ.get("ADMIN_NAME", "Jason Bryant")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": admin_name,
            "role": "El Presidente",
            "coffee": "Long Black",
            "bio": "Founder. 4th best cyclist in Grey Lynn.",
            "photo": None,
            "is_admin": True,
            "is_president": True,
            "status": "approved",
            "created_at": now_utc(),
        })
    else:
        # Ensure the master admin stays admin+president and password is in sync
        await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True, "is_president": True, "status": "approved", "name": admin_name}})
        if not existing.get("password_hash") or not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

    # Any previous president that isn't the master admin gets demoted to plain admin (only one El Prez).
    await db.users.update_many(
        {"email": {"$ne": admin_email}, "is_president": True},
        {"$set": {"is_president": False}},
    )

    # Seed a few demo riders (approved)
    demo_members = [
        {"email": "aroha@glcc.club", "password": "cycle123", "name": "Aroha Ngata", "role": "Ride Captain", "coffee": "Medium Flat White", "is_admin": True},
        {"email": "sam@glcc.club", "password": "cycle123", "name": "Sam Whittaker", "role": "Sweep", "coffee": "Oat Flat White", "is_admin": False},
        {"email": "mika@glcc.club", "password": "cycle123", "name": "Mika Tanaka", "role": "Member", "coffee": "Small Cappuccino", "is_admin": False},
        {"email": "leo@glcc.club", "password": "cycle123", "name": "Leo Fifita", "role": "Member", "coffee": "Long Black", "is_admin": False},
    ]
    for m in demo_members:
        if not await db.users.find_one({"email": m["email"]}):
            await db.users.insert_one({
                "email": m["email"],
                "password_hash": hash_password(m["password"]),
                "name": m["name"],
                "role": m["role"],
                "coffee": m["coffee"],
                "bio": "",
                "photo": None,
                "is_admin": m["is_admin"],
                "is_president": False,
                "status": "approved",
                "created_at": now_utc(),
            })

    # Rides come from Strava sync (via /api/strava/connect). No demo seed rides.

    # ---- Membership numbers ----
    # JB (master admin) = 1, everyone else gets the next available number.
    # This runs on every startup, is idempotent, and only assigns numbers to
    # users that don't have one yet.
    master = await db.users.find_one({"email": admin_email})
    if master and master.get("member_no") != 1:
        # Clear anyone else who might be sitting on #1, then claim it.
        await db.users.update_many({"member_no": 1, "email": {"$ne": admin_email}}, {"$unset": {"member_no": ""}})
        await db.users.update_one({"_id": master["_id"]}, {"$set": {"member_no": 1}})

    # Highest number already assigned so we can hand out the next ones.
    top = await db.users.find({"member_no": {"$exists": True}}).sort("member_no", -1).limit(1).to_list(1)
    next_no = (top[0]["member_no"] + 1) if top else 2
    async for u in db.users.find({"member_no": {"$exists": False}}).sort("created_at", 1):
        if u["email"] == admin_email:
            continue
        await db.users.update_one({"_id": u["_id"]}, {"$set": {"member_no": next_no}})
        next_no += 1

    # Seed some feed
    if await db.messages.count_documents({}) == 0:
        await db.messages.insert_one({
            "user_id": None, "name": "GLCC",
            "text": "Welcome to the GLCC clubhouse. Rain check for Saturday? Watch this space.",
            "system": True, "created_at": now_utc(),
        })

@app.on_event("startup")
async def on_startup():
    await seed()
    await db.cafe_rules.create_index("pattern", unique=True)
    await db.cafe_rules.create_index("order")
    await seed_cafe_rules_if_empty()
    await refresh_cafe_rules_cache()
    # Hourly Strava sync loop (silently skips if not connected)
    async def _sync_loop():
        # Small initial delay to let the app finish booting
        await asyncio.sleep(20)
        while True:
            try:
                await sync_club_events()
            except HTTPException:
                pass  # not connected or auth expired
            except Exception as exc:
                log.warning("Strava sync loop error: %s", exc)
            await asyncio.sleep(3600)
    app.state.strava_task = asyncio.create_task(_sync_loop())

    # Ride reminder loop — every 30 minutes we look for rides starting in the
    # next 12-30 hours and email their "going" list.
    async def _reminder_loop():
        await asyncio.sleep(60)
        while True:
            try:
                result = await send_pending_ride_reminders()
                if result.get("emails_sent"):
                    log.info("Ride reminders: %s", result)
            except Exception as exc:
                log.warning("Ride reminder loop error: %s", exc)
            await asyncio.sleep(1800)
    app.state.reminder_task = asyncio.create_task(_reminder_loop())

    # Morning-of weather alert loop — every 20 minutes we check rides
    # starting in the next 2-14 hours and push if the forecast turns bad.
    async def _weather_alert_loop():
        await asyncio.sleep(90)
        while True:
            try:
                result = await send_pending_weather_alerts()
                if result.get("pushes_sent"):
                    log.info("Weather alerts: %s", result)
            except Exception as exc:
                log.warning("Weather alert loop error: %s", exc)
            await asyncio.sleep(1200)
    app.state.weather_alert_task = asyncio.create_task(_weather_alert_loop())

    # 1-hour ride reminder loop — every 10 minutes we check rides starting
    # in the next 55–90 minutes and push a "starts in 1h + weather + cafe"
    # notification to each rider who RSVP'd going. Idempotent per ride.
    async def _hour_reminder_loop():
        await asyncio.sleep(120)
        while True:
            try:
                result = await send_pending_ride_1h_pushes()
                if result.get("pushes_sent"):
                    log.info("1h ride pushes: %s", result)
            except Exception as exc:
                log.warning("1h reminder loop error: %s", exc)
            await asyncio.sleep(600)
    app.state.hour_reminder_task = asyncio.create_task(_hour_reminder_loop())

@app.on_event("shutdown")
async def on_shutdown():
    for name in ("strava_task", "reminder_task", "weather_alert_task"):
        task = getattr(app.state, name, None)
        if task:
            task.cancel()
            try:
                await task
            except Exception:
                pass
    client.close()
