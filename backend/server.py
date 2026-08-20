from dotenv import load_dotenv
load_dotenv()

import os
import re
import asyncio
import json
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Annotated

import bcrypt
import httpx
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
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
    return {
        "id": str(doc["_id"]),
        "day": doc.get("day"),
        "date": doc.get("date"),
        "time": doc.get("time"),
        "name": doc.get("name"),
        "distance": doc.get("distance"),
        "elevation": doc.get("elevation"),
        "location": doc.get("location"),
        "route": doc.get("route"),
        "cafe": doc.get("cafe"),
        "pace": doc.get("pace", "28–31 kph"),
        "rsvps": doc.get("rsvps", {}),  # {user_id: "going"|"maybe"|"no"}
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
async def update_me(body: ProfileUpdateIn, user: dict = Depends(get_current_user)):
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
    rides = []
    async for r in db.rides.find({}).sort("sort_key", 1):
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
async def rsvp(ride_id: str, body: RSVPIn, user: dict = Depends(get_current_user)):
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
async def send_round(body: CoffeeRoundIn, user: dict = Depends(get_current_user)):
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
async def post_message(body: ChatMessageIn, user: dict = Depends(get_current_user)):
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
    await db.messages.create_index("created_at")
    await db.coffee_rounds.create_index("created_at")
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

    # Seed rides if none
    if await db.rides.count_documents({}) == 0:
        for idx, ride in enumerate(SEED_RIDES):
            doc = {**ride, "rsvps": {}, "created_at": now_utc(), "sort_key": f"{idx:02d}"}
            await db.rides.insert_one(doc)

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

@app.on_event("shutdown")
async def on_shutdown():
    client.close()
