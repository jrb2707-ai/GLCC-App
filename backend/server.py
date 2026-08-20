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

def serialize_rider(doc: dict) -> dict:
    if not doc:
        return doc
    return {
        "id": str(doc["_id"]),
        "email": doc.get("email"),
        "name": doc.get("name"),
        "role": doc.get("role", "Member"),
        "bio": doc.get("bio", ""),
        "coffee": doc.get("coffee", "Medium Flat White"),
        "photo": doc.get("photo"),
        "is_admin": doc.get("is_admin", False),
        "is_president": doc.get("is_president", False),
        "status": doc.get("status", "approved"),  # approved | pending
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
        {"to": t, "title": title, "body": body, "data": data or {}, "sound": "default"}
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


async def push_to_users(user_ids: List[str], title: str, body: str, data: Optional[dict] = None) -> None:
    if not user_ids:
        return
    docs = await db.push_tokens.find({"user_id": {"$in": list(map(str, user_ids))}}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    if tokens:
        await send_expo_push(tokens, title, body, data)


async def push_to_all_except(exclude_user_id: str, title: str, body: str, data: Optional[dict] = None) -> None:
    docs = await db.push_tokens.find({"user_id": {"$ne": str(exclude_user_id)}}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    if tokens:
        await send_expo_push(tokens, title, body, data)


# ---------- Mention parsing ----------
MENTION_RE = re.compile(r"(?<!\w)@([A-Za-z][A-Za-z0-9_\-\.]*)")

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

class AdminActionIn(BaseModel):
    action: str  # approve | deny | make_admin | remove_admin | delete
    target_id: str

class CoffeeRoundIn(BaseModel):
    coffee: Optional[str] = None
    ride_id: Optional[str] = None

class ChatMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=800)

class PushRegisterIn(BaseModel):
    expo_push_token: str = Field(min_length=20)
    platform: str = Field(pattern="^(ios|android|web)$")
    project_id: Optional[str] = None

class PushUnregisterIn(BaseModel):
    expo_push_token: str = Field(min_length=20)

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

# ---------- App ----------
app = FastAPI(title="GLCC API")
api = APIRouter(prefix="/api")

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
    if not doc or not doc.get("refresh_token"):
        raise HTTPException(status_code=409, detail="Strava is not connected")
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
        }},
    )
    return data["access_token"]


async def _fetch_route_stats(route_id: str, token: str) -> Optional[dict]:
    """Fetch full route detail for distance/elevation. Cached in strava_routes."""
    if not route_id:
        return None
    cached = await db.strava_routes.find_one({"_id": route_id})
    if cached and cached.get("cached_at"):
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
    # Weekday rides (Mon–Fri) always stop at The Brunchery
    cafe = None
    if weekday is not None and weekday <= 4:
        cafe = "The Brunchery · 318 Richmond Rd, Grey Lynn"
    strava_url = f"https://www.strava.com/clubs/{STRAVA_CLUB_ID}/group_events/{event_id}"
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
        "route": (route.get("name") if isinstance(route, dict) and route.get("name") else strava_url),
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
    token_doc = await db.strava_tokens.find_one({"_id": "club"}, {"refresh_token": 1})
    meta = await db.strava_meta.find_one({"_id": "club"})
    return {
        "connected": bool(token_doc and token_doc.get("refresh_token")),
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
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email, user.get("role", "Member"))
    return {"token": token, "user": serialize_rider(user)}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_rider(user)

# ---------- Riders ----------
@api.get("/riders")
async def list_riders(user: dict = Depends(get_current_user)):
    approved = []
    pending = []
    async for r in db.users.find({}).sort("created_at", 1):
        if r.get("status") == "pending":
            pending.append(serialize_rider(r))
        else:
            approved.append(serialize_rider(r))
    return {"riders": approved, "pending": pending if user.get("is_admin") else []}

@api.patch("/riders/me")
async def update_me(body: ProfileUpdateIn, user: dict = Depends(require_approved)):
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in {"name", "bio", "coffee", "photo"}}
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
    update = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in {"name", "role", "bio", "coffee", "photo"}}
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

@api.post("/rides")
async def create_ride(body: RideCreateIn, admin: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["rsvps"] = {}
    doc["created_at"] = now_utc()
    doc["sort_key"] = doc["created_at"].isoformat()
    r = await db.rides.insert_one(doc)
    doc["_id"] = r.inserted_id
    await manager.broadcast({"type": "ride.created", "ride": serialize_ride(doc)})
    return serialize_ride(doc)

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

# ---------- Chat ----------
@api.get("/chat/messages")
async def list_messages(user: dict = Depends(get_current_user)):
    msgs = []
    async for m in db.messages.find({}).sort("created_at", -1).limit(100):
        msgs.append(serialize_message(m))
    msgs.reverse()
    return {"messages": msgs}

@api.post("/chat/messages")
async def post_message(body: ChatMessageIn, user: dict = Depends(require_approved)):
    text = body.text.strip()
    doc = {
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "text": text,
        "system": False,
        "created_at": now_utc(),
    }
    r = await db.messages.insert_one(doc)
    doc["_id"] = r.inserted_id
    payload = serialize_message(doc)
    await manager.broadcast({"type": "chat.message", "message": payload})

    # Resolve @mentions (skip self-mention)
    mentioned = await resolve_mentions(text)
    mention_user_ids = [str(m["_id"]) for m in mentioned if str(m["_id"]) != str(user["_id"])]
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
    return payload

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
    """Send a test push to the current user's registered devices."""
    docs = await db.push_tokens.find({"user_id": str(user["_id"])}).to_list(None)
    tokens = [d["expo_push_token"] for d in docs]
    if not tokens:
        return {"ok": False, "detail": "No registered devices"}
    await send_expo_push(
        tokens,
        "GLCC test ping",
        "If you can read this, push is wired ✅",
        {"type": "test"},
    )
    return {"ok": True, "sent": len(tokens)}

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
    await db.users.create_index("email", unique=True)
    await db.rides.create_index("sort_key")
    await db.rides.create_index("strava_event_id", unique=True, sparse=True)
    await db.messages.create_index("created_at")
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

    admin_email = os.environ.get("ADMIN_EMAIL", "jb@glcc.club").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "president123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "JB",
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
        # Ensure JB stays admin+president
        await db.users.update_one({"email": admin_email}, {"$set": {"is_admin": True, "is_president": True, "status": "approved"}})
        if not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

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

@app.on_event("shutdown")
async def on_shutdown():
    task = getattr(app.state, "strava_task", None)
    if task:
        task.cancel()
        try:
            await task
        except Exception:
            pass
    client.close()
