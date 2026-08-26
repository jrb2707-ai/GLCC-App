# GLCC Test Credentials

Backend seeded these accounts on startup. All passwords are for development only.

## Admin (President — Jason Bryant)
- Email: `jb@greylynncc.com`  (was `jb@glcc.club` prior to 2026-08-26 migration)
- Password: `Roenick2707`
- Name: Jason Bryant
- Role: El Presidente (is_admin=true, is_president=true)
- Special powers: can make/remove admins, delete riders, send password reset links.

## Ride Captain (Admin)
- Email: `aroha@glcc.club`
- Password: `cycle123`
- Role: Ride Captain (is_admin=true)

## Regular Members
- `sam@glcc.club` / `cycle123` — Sweep
- `mika@glcc.club` / `cycle123` — Member
- `leo@glcc.club` / `cycle123` — Member

## App Store Reviewer (Apple)
Both accounts are re-seeded on every backend startup so credentials are always live.

- **Regular member**: `apple-review@glcc.club` / `GreyLynn2026!` — approved, is_admin=false. Use this to demo the day-to-day rider experience + Apple 1.2 report/block flows.
- **Admin**: `apple-review-admin@glcc.club` / `GreyLynn2026!` — approved, is_admin=true, Ride Captain. Use this to demo announce/moderate/delete flows.

## Auth Endpoints
- `POST /api/auth/register` — new rider signup (starts in `pending` status)
- `POST /api/auth/login` — returns `{ token, user }`
- `GET  /api/auth/me` — requires `Authorization: Bearer <token>`
- `POST /api/auth/forgot-password` — body `{ email }`. Always returns 200 (email enumeration protection). Sends Resend email with reset link.
- `POST /api/auth/reset-password` — body `{ token, password }`. Consumes reset token, sets new password.
- `POST /api/auth/change-password` — body `{ current_password, new_password }`. Auth required. Self-service change.
- `POST /api/riders/reset-password` — body `{ target_id }`. Admin-only. Emails reset link to that rider.

## Password Reset Flow
1. User taps "Forgot password" on AuthScreen → `POST /api/auth/forgot-password`.
2. Backend creates row in `password_resets` (sha256-hashed token, 60-min TTL) and calls Resend.
3. Email contains link `https://greylynncc.com/reset-password?token=<raw>`.
4. Landing on `/reset-password?token=…` renders `ResetPasswordScreen`.
5. `POST /api/auth/reset-password` verifies, hashes new password, marks token used.
6. Admin equivalent: from Riders tab → open a rider profile → "Send reset link" button (only shown for approved riders with an email on file).

**Resend config** (backend/.env):
- `RESEND_API_KEY` — from https://resend.com dashboard.
- `SENDER_EMAIL` — currently `no-reply@greylynncc.com` (requires DNS verification in Resend dashboard for delivery to work).
- `PUBLIC_APP_URL` — production URL used to build reset links (default `https://greylynncc.com`).

## Push Notification Endpoints (Expo Push)
- `POST   /api/push/register` — body `{ expo_push_token, platform, project_id? }` (auth required). `expo_push_token` must start with `ExponentPushToken[`.
- `DELETE /api/push/unregister` — body `{ expo_push_token }` (auth required)
- `POST   /api/push/test` — sends a test ping to the caller's registered devices

## WebSocket
- `wss://<host>/api/ws?token=<JWT>` — broadcasts `chat.message`, `chat.mention` (targeted), `coffee.round`, `ride.updated`, `rider.updated`, `rider.pending`.
