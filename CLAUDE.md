# BusGo — project instructions

Large-vehicle (7–55 seat) booking platform built from the PRD at
`C:\Users\johna\OneDrive\Desktop\BusGo Ver 1.1 10Jun2026.html`. Five role
portals in one Next.js app: customer (`/`), owner (`/owner`), agent (`/agent`),
driver (`/driver`), admin (`/admin`). See README.md for the module map and
fare-engine spec.

## Commands

- `npm run dev` — dev server on **port 3300** (3000 = HRMonitor, 3200 = RideGo)
- `npm run build` — production build (must stay green)
- `npm run smoke` — 24-assertion full-lifecycle API test against a running
  server (`BASE_URL=` to target elsewhere). Creates throwaway accounts; expects
  the simulated payment gateway.

## Architecture notes

- DB: Drizzle ORM; embedded PGlite at `.data/pglite` locally, Neon/Postgres via
  `DATABASE_URL` in prod. Schema DDL + idempotent `ALTER TABLE … IF NOT EXISTS`
  upgrades live in `lib/db/index.ts` — **restart the dev server after DDL
  changes** (DB init is cached per process).
- Fare engine + booking status machine: `lib/shared/fare.ts` — shared
  client/server so estimates always match stored fares. Server recomputes
  everything on booking creation; never trust client fare numbers.
- Payments: `lib/server/payments.ts`. Razorpay activates when
  `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set; otherwise simulated test
  mode. Signature verification is server-side HMAC.
- Auth: jose JWT cookie `busgo_session`; `requireRole()` in `lib/server/api.ts`
  re-checks suspension on every call. Login/register are rate-limited
  (`lib/server/ratelimit.ts`).
- Maps/geocoding/routing: Leaflet + Nominatim + OSRM, all **browser-side**
  (this machine's TLS interception breaks server-side HTTPS fetches at build
  time — also why fonts load via `<link>`, not next/font).
- `.data/` is excluded from the dev file-watcher in `next.config.ts` — do not
  remove that, or every DB write triggers a Fast Refresh loop.

## Demo logins (dev; password `bus2026`)

customer@demo.local · owner@demo.local · owner2@demo.local · agent@demo.local ·
driver@demo.local/driver2/driver3 · admin: admin@busgo.local / admin@123
(env `ADMIN_EMAIL`/`ADMIN_PASSWORD`).

## Deploy

- GitHub: https://github.com/John-Accura/BusGo (public, branch `main`) —
  Vercel auto-deploys every push to main.
- Production: https://bus-go-taupe.vercel.app — env needs `DATABASE_URL`
  (Neon), `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`; `SEED_DEMO=1` only if
  demo data is wanted. `/api/health` reports db reachability and whether
  `DATABASE_URL` is configured.
