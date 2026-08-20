# GLCC Test Credentials

Backend seeded these accounts on startup. All passwords are for development only.

## Admin (President — Jason Bryant)
- Email: `jb@glcc.club`
- Password: `Roenick2707`
- Name: Jason Bryant
- Role: El Presidente (is_admin=true, is_president=true)
- Special powers: can make/remove admins and delete riders (President-only actions).

## Ride Captain (Admin)
- Email: `aroha@glcc.club`
- Password: `cycle123`
- Role: Ride Captain (is_admin=true)

## Regular Members
- `sam@glcc.club` / `cycle123` — Sweep
- `mika@glcc.club` / `cycle123` — Member
- `leo@glcc.club` / `cycle123` — Member

## Auth Endpoints
- `POST /api/auth/register` — new rider signup (starts in `pending` status)
- `POST /api/auth/login` — returns `{ token, user }`
- `GET  /api/auth/me` — requires `Authorization: Bearer <token>`

## Push Notification Endpoints (Expo Push)
- `POST   /api/push/register` — body `{ expo_push_token, platform, project_id? }` (auth required). `expo_push_token` must start with `ExponentPushToken[`.
- `DELETE /api/push/unregister` — body `{ expo_push_token }` (auth required)
- `POST   /api/push/test` — sends a test ping to the caller's registered devices

### Push Triggers
- **Coffee round** — every `POST /api/coffee/rounds` fires an Expo push to *all users except the sender*, plus the existing WebSocket broadcast. Web preview uses `new Notification(...)` (bell icon in the app header must be enabled).
- **Chat @mention** — `POST /api/chat/messages` with text containing `@firstname` (case-insensitive, matches the rider's first name) triggers a targeted `chat.mention` WebSocket event to that rider and an Expo push to their devices. Self-mentions are skipped.

## WebSocket
- `wss://<host>/api/ws?token=<JWT>` — broadcasts `chat.message`, `chat.mention` (targeted), `coffee.round`, `ride.updated`, `rider.updated`, `rider.pending`.
