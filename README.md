# BusGo — Large Vehicle Booking Platform

Working implementation of the BusGo PRD (v1.0): a booking marketplace for
7–55+ seat vehicles — Urbania, tempo travellers, mini-buses and luxury
coaches — for tourists, corporate groups and bulk transfers. All five PRD
modules are implemented in one web app with role-based portals.

## Modules

| Role | Portal | What they do |
| --- | --- | --- |
| Customer | `/` → `/search` → `/book` → `/bookings` | Search by trip (one-way, round trip, multi-city, full-day charter), see the transparent fare breakdown, request, pay tiered advance, track live, rate, dispute |
| Vehicle owner | `/owner` | Fleet + compliance documents (auto-expiry blocks search), pricing (per-km/per-day/min fare/bata/night %), confirm/decline requests, assign drivers, agent commission opt-in, earnings |
| Travel agent / hotel | `/agent` + same search flow | Book on behalf of customers, configurable service charge, owner-paid commissions, earnings dashboard |
| Driver | `/driver` | Assigned trips, odometer-verified start/complete, expense logging (tolls/parking/fuel), GPS heartbeat streamed to the customer |
| Admin | `/admin` | Vehicle verification queue, dispute resolution, settlement splits (owner/agent/platform), state entry-tax table, platform analytics |

## Stack

Next.js 15 (App Router) + TypeScript, Drizzle ORM — embedded **PGlite** locally
(`.data/pglite`, auto-created/seeded), **Neon/Postgres** in production via
`DATABASE_URL`. Auth via bcrypt + jose JWT cookie, middleware role-routing.
Maps/routing/geocoding: Leaflet + OSRM + Nominatim, all browser-side (no API
keys). Payments are **simulated** (no real gateway).

## Run

```bash
npm install
npm run dev   # http://localhost:3300
```

## Demo accounts (password `bus2026`)

| Role | Email |
| --- | --- |
| Customer | customer@demo.local |
| Agent | agent@demo.local (Meera Tours & Travels, 5% service charge) |
| Owner | owner@demo.local (Malabar Travels — pays 8% agent commission) |
| Owner | owner2@demo.local (Kerala Coach Co — no commission) |
| Drivers | driver@demo.local, driver2@demo.local (Malabar), driver3@demo.local (KCC) |
| Admin | admin@busgo.local / `admin@123` (env: ADMIN_EMAIL / ADMIN_PASSWORD) |

Seeded fleet: 5 vehicles around Kochi (one pending admin verification, one with
insurance expiring in 5 days to demo the auto-expiry warning).

## Fare engine (PRD §08)

```
BASE  = full-day charter: per-day × days
        multi-day trips:  max(per-km × km, per-day × days)
        single-day trips: per-km × km          (minimum fare floors all)
TOTAL = BASE
      + driver bata × days
      + night surcharge (%)            [10 PM–6 AM legs]
      + inter-state levies              [entry tax + ₹/passenger, per state crossed]
      + toll estimate                   [₹1.8/km]
      + platform fee                    [10% of base + bata]
      + agent service charge            [if booked via agent]
```

Advance tiers: 100% within 48 h of travel · 75% within 7 days · 50% earlier.
Balance must be settled before the driver can start the trip. On completion the
settlement splits into owner payout, agent payout (service charge + owner-paid
commission) and platform revenue — visible in `/admin` → Settlements.

## Production

1. **Database**: set `DATABASE_URL` (Neon or any Postgres). The embedded PGlite
   fallback is for local development only. Tables, the admin account and the
   state-tax table auto-create on first request.
2. **Secrets**: strong `AUTH_SECRET`, your own `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. **Payments**: set `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` to switch from
   simulated test-mode to real Razorpay checkout (orders created and signatures
   verified server-side).
4. Demo data never seeds in production unless `SEED_DEMO=1`.
5. `npm run build && npm start` (HTTPS required — session cookies are `Secure`).

Hardening in place: per-IP/per-account rate limiting on auth endpoints,
immediate enforcement of admin suspensions on every API call, security headers,
error/404 pages, `/api/health` for uptime probes, self-service password change
(`/account`) and admin password reset from the Users tab.

## Smoke test

`npm run smoke` (or `BASE_URL=https://… node scripts/smoke.mjs`) runs the full
lifecycle against a live server with throwaway accounts: owner → vehicle →
admin approval → search → booking → payments → driver trip → rating →
settlement. 24 assertions; exits non-zero on failure. Expects the simulated
payment gateway (i.e. no Razorpay keys on the target server).

Known limits at scale (fine for a pilot): Nominatim/OSRM public instances for
geocoding/routing (swap for Google Maps/MapMyIndia per PRD §10), polling-based
live updates, and no outbound email — password resets are handled by the admin.
