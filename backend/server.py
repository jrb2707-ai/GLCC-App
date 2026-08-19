from dotenv import load_dotenv
load_dotenv()

import os
import asyncio
import json
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Annotated

import bcrypt
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

# ---------- WebSocket Manager ----------
class ConnectionManager:
    def __init__(self):
        self.active: List[Dict[str, Any]] = []
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user: dict):
        await websocket.accept()
        async with self.lock:
            self.active.append({"ws": websocket, "user": user})

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            self.active = [c for c in self.active if c["ws"] is not websocket]

    async def broadcast(self, event: dict):
        payload = json.dumps(event, default=str)
        stale = []
        for c in list(self.active):
            try:
                await c["ws"].send_text(payload)
            except Exception:
                stale.append(c["ws"])
        for ws in stale:
            await self.disconnect(ws)

manager = ConnectionManager()

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
    # Also add a system chat message
    system_msg = {
        "user_id": None,
        "name": "GLCC",
        "text": f"☕ {user.get('name')} is buying a round — {coffee}",
        "system": True,
        "created_at": now_utc(),
    }
    m = await db.messages.insert_one(system_msg)
    system_msg["_id"] = m.inserted_id
    payload_round = serialize_round(doc)
    await manager.broadcast({"type": "coffee.round", "round": payload_round})
    await manager.broadcast({"type": "chat.message", "message": serialize_message(system_msg)})
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
    doc = {
        "user_id": str(user["_id"]),
        "name": user.get("name"),
        "text": body.text.strip(),
        "system": False,
        "created_at": now_utc(),
    }
    r = await db.messages.insert_one(doc)
    doc["_id"] = r.inserted_id
    payload = serialize_message(doc)
    await manager.broadcast({"type": "chat.message", "message": payload})
    return payload

# ---------- Weather (static demo) ----------
@api.get("/weather")
async def weather():
    return {
        "location": "Auckland",
        "temp_c": 14,
        "condition": "Partly cloudy",
        "wind": "light SW",
        "rain_chance": 10,
    }

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
    "Small Cappuccino", "Medium Cappuccino", "Long Black",
    "Oat Flat White", "Espresso", "Cold Brew",
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
