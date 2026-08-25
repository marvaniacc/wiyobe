# Wishubest — Production Deployment Guide

## Quick Deploy to Vercel (Recommended)

### 1. Prepare Environment Variables
Create a `.env` file (or set in Vercel dashboard) with:

```env
DATABASE_URL=postgresql://user:password@host:5432/wishubest
AUTH_SECRET=<generate with: openssl rand -hex 32>
STRIPE_SECRET_KEY=sk_live_your_live_key
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASSWORD=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

### 2. Switch to PostgreSQL
Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then run:
```bash
bun run db:push    # Push schema to PostgreSQL
bun run db:generate # Regenerate client
```

### 3. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo at https://vercel.com/new and auto-deploy on push.

### 4. Post-Deploy
- Run the seed script to create admin account:
  ```bash
  bun run scripts/seed.ts
  ```
- Set up Stripe webhooks (optional) at https://dashboard.stripe.com/webhooks
- Configure Google OAuth redirect URI in Google Cloud Console

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Yes | HMAC secret for session tokens |
| `STRIPE_SECRET_KEY` | No* | Stripe API key (empty = mock mode) |
| `GOOGLE_CLIENT_ID` | No* | Google OAuth client ID (empty = demo mode) |
| `SMTP_HOST` | No* | SMTP server for emails (empty = console log) |
| `SMTP_PORT` | No | SMTP port (default 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `EMAIL_FROM` | No | From email address |
| `NEXT_PUBLIC_APP_URL` | Yes | Public app URL for links |

*If empty, the feature uses a dev/mock mode that still works for testing.

## Features by Configuration

| Feature | Without Config | With Config |
|---------|---------------|-------------|
| Payments | Mock charges (`ch_mock_*`) | Real Stripe charges |
| Google Login | Demo dialog (enter email) | Real Google OAuth |
| Email OTP | Code shown in toast + console log | Real email sent |
| Database | SQLite (local file) | PostgreSQL (production) |

## Default Admin Account
After seeding:
- Email: `admin@wishubest.com`
- Password: `admin123`
- **Change this immediately after first login in production!**
