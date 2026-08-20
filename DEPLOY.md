# Wishubest (MedTravel) — Production Deployment Guide

This deployment is **native** (Node.js + PostgreSQL + pm2 + Caddy). Docker has
been fully removed from the server — the old Docker-based deploy flow is
obsolete.

## Production Topology (current VPS)

| Component   | What it is                                  | Runs as                     |
|-------------|---------------------------------------------|-----------------------------|
| Next.js app | `next start` on port 3000                   | pm2 process `wishubest`     |
| PostgreSQL  | native PostgreSQL 16, db `wishubest`        | systemd service `postgresql`|
| Caddy       | TLS + reverse proxy 443 → localhost:3000    | systemd service `caddy`     |
| Backups     | build tars + DB dumps in `/var/backups`     | deploy.sh / manual          |

## Deploy (one command)

```bash
cd /root/wiyobe
bash deploy.sh
```

`deploy.sh` does, in order:

1. Backs up the current `.next` build and the database (rollback point).
2. `git pull` (branch `main`, falls back to `opencode-work`).
3. `npm install`, then `npx prisma db push` (the project's migration tool).
4. `npm run build`, then **checks `.next/BUILD_ID` exists** — this is the
   **build gate**. If it's missing, the build is rolled back and the script
   exits non-zero. (This prevents the exact 502/crash-loop class of outage
   from Phase 0.)
5. `pm2 restart wishubest --max-restarts 10` — the process auto-shuts instead
   of crash-looping forever.
6. Waits up to 60s for `localhost:3000` to respond (health gate); exits
   non-zero if the app never comes up.

## Rollback

```bash
cd /root/wiyobe
bash rollback.sh        # restores newest build backup + restarts
```

Backups live in `/var/backups/wiyobe-deploy/` (last 5 builds, last 8 DB dumps).

## Manual operations

```bash
pm2 status              # is wishubest online?
pm2 logs wishubest      # app logs
pm2 restart wishubest   # restart after config-only change
npx prisma db push      # apply schema changes (project standard migration tool)
bash scripts/seed.ts    # re-seed demo data (npx tsx scripts/seed.ts)
```

## Environment Variables

See `.env` on the server — complete, all keys present. Current status:

| Variable | Status | Notes |
|----------|--------|-------|
| `DATABASE_URL` | ✅ set | native Postgres on localhost:5432 |
| `AUTH_SECRET` | ✅ set | also used for OTP HMAC + payload encryption |
| `NEXT_PUBLIC_APP_URL` | ✅ set | https://wishubest.com |
| `NEXT_PUBLIC_APP_NAME` | ✅ set | Wishubest |
| `NEXT_PUBLIC_CF_TURNSTILE_SITE_KEY` / `CF_TURNSTILE_SECRET_KEY` | ✅ set | Turnstile enabled |
| `SMTP_*`, `EMAIL_FROM` | ⬜ empty | emails log to console (dev mode) |
| `STRIPE_SECRET_KEY` | ⬜ empty | charges are mocked (`ch_mock_*`) |
| `GOOGLE_CLIENT_ID` | ⬜ empty | real Google OAuth disabled (demo login only in non-prod) |
| `GOOGLE_GEMINI_API_KEY` | ⬜ empty | AI triage uses fallback |
| `VIDEO_PROVIDER` | ✅ set | whereby (no API key) |
| `SUPABASE_URL` / key | ⬜ empty | uploads use local disk fallback |
| `TRANSLATION_*` | ⬜ empty | translations skipped |

## Security hardening applied (Phase 2)

- `handleError` no longer leaks internal error messages/stack traces to clients.
- Debug API route (`/api/debug/home`) deleted.
- Rate limiting (in-memory, per IP + per email): OTP send, OTP verify,
  sign-in, sign-up.
- OTP codes stored as HMAC hashes; signup payloads AES-256-GCM encrypted
  with `AUTH_SECRET` (plaintext never touches the DB).
- Google ID-token validation now requires: issuer = accounts.google.com,
  `aud` = `GOOGLE_CLIENT_ID` (real tokens rejected when unconfigured),
  `email_verified = true`.
- Booking slot claim is atomic (`UPDATE ... WHERE isBooked=false` inside a
  transaction) — concurrent double-booking of the same slot is impossible.
- Money arithmetic converted to integer cents (`src/lib/money.ts`,
  `src/lib/ledger.ts`); affiliate rate unified at 25% of platform commission.
- Email uniqueness enforced case-insensitively via `User.emailLower` unique
  index (added through the standard `prisma db push` + backfill script
  `scripts/migrate-email-lower.ts`).

## Default Admin Account (demo seed)

- Email: `admin@medtravel.com`
- Password: `admin123`
- **Change this immediately in production!**