# GLCC Test Credentials

Backend seeded these accounts on startup. All passwords are for development only.

## Admin (President — JB)
- Email: `jb@glcc.club`
- Password: `president123`
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

## WebSocket
- `wss://<host>/api/ws?token=<JWT>` — broadcasts `chat.message`, `coffee.round`, `ride.updated`, `rider.updated`, `rider.pending`.
