import path from "node:path";
import * as schema from "./schema";
import { sql } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

export type Db =
  | PgliteDatabase<typeof schema>
  | NeonHttpDatabase<typeof schema>;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id            serial PRIMARY KEY,
    name          text NOT NULL,
    email         text UNIQUE NOT NULL,
    phone         text,
    password_hash text NOT NULL,
    role          text NOT NULL,
    suspended     boolean NOT NULL DEFAULT false,
    created_at    timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS owner_profiles (
    user_id          int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company          text,
    city             text,
    gst_no           text,
    pays_commission  boolean NOT NULL DEFAULT false,
    commission_type  text NOT NULL DEFAULT 'percent',
    commission_value int NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS agent_profiles (
    user_id       int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    agency        text,
    gst_no        text,
    service_type  text NOT NULL DEFAULT 'percent',
    service_value int NOT NULL DEFAULT 5
  )`,
  `CREATE TABLE IF NOT EXISTS driver_profiles (
    user_id          int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    owner_id         int NOT NULL REFERENCES users(id),
    license_no       text,
    experience_years int NOT NULL DEFAULT 3,
    current_lat      double precision,
    current_lng      double precision,
    location_at      timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS vehicles (
    id               serial PRIMARY KEY,
    owner_id         int NOT NULL REFERENCES users(id),
    name             text NOT NULL,
    make             text,
    model            text,
    vclass           text NOT NULL,
    seats            int NOT NULL,
    ac               boolean NOT NULL DEFAULT true,
    amenities        text NOT NULL DEFAULT '',
    reg_no           text NOT NULL,
    per_km           int NOT NULL,
    per_day          int NOT NULL,
    min_fare         int NOT NULL DEFAULT 0,
    bata_per_day     int NOT NULL DEFAULT 400,
    night_pct        int NOT NULL DEFAULT 10,
    base_city        text NOT NULL DEFAULT '',
    base_state       text NOT NULL DEFAULT '',
    base_lat         double precision,
    base_lng         double precision,
    permit_type      text NOT NULL DEFAULT 'State',
    permit_expiry    date,
    insurance_expiry date,
    fitness_expiry   date,
    puc_expiry       date,
    verify_status    text NOT NULL DEFAULT 'pending',
    owner_active     boolean NOT NULL DEFAULT true,
    rating_sum       int NOT NULL DEFAULT 0,
    rating_count     int NOT NULL DEFAULT 0,
    created_at       timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS bookings (
    id                   serial PRIMARY KEY,
    code                 text UNIQUE NOT NULL,
    status               text NOT NULL DEFAULT 'requested',
    trip_type            text NOT NULL,
    customer_id          int REFERENCES users(id),
    customer_name        text NOT NULL DEFAULT '',
    customer_phone       text NOT NULL DEFAULT '',
    agent_id             int REFERENCES users(id),
    owner_id             int NOT NULL REFERENCES users(id),
    vehicle_id           int NOT NULL REFERENCES vehicles(id),
    driver_id            int REFERENCES users(id),
    start_date           date NOT NULL,
    end_date             date NOT NULL,
    days                 int NOT NULL DEFAULT 1,
    passengers           int NOT NULL,
    purpose              text NOT NULL DEFAULT 'Tourism',
    pickup_addr          text NOT NULL,
    pickup_lat           double precision,
    pickup_lng           double precision,
    drop_addr            text NOT NULL,
    drop_lat             double precision,
    drop_lng             double precision,
    stops_json           text NOT NULL DEFAULT '[]',
    states_json          text NOT NULL DEFAULT '[]',
    distance_km          double precision NOT NULL,
    night_travel         boolean NOT NULL DEFAULT false,
    base_fare            int NOT NULL,
    driver_bata          int NOT NULL,
    night_surcharge      int NOT NULL DEFAULT 0,
    state_taxes          int NOT NULL DEFAULT 0,
    toll_est             int NOT NULL DEFAULT 0,
    platform_fee         int NOT NULL,
    agent_service_charge int NOT NULL DEFAULT 0,
    agent_commission     int NOT NULL DEFAULT 0,
    total_fare           int NOT NULL,
    advance_required     int NOT NULL,
    amount_paid          int NOT NULL DEFAULT 0,
    payment_status       text NOT NULL DEFAULT 'unpaid',
    odometer_start       int,
    odometer_end         int,
    started_at           timestamptz,
    completed_at         timestamptz,
    requested_at         timestamptz DEFAULT now(),
    confirmed_at         timestamptz,
    cancelled_at         timestamptz,
    decline_reason       text,
    rating               int,
    rating_comment       text
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id         serial PRIMARY KEY,
    booking_id int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    payer_id   int REFERENCES users(id),
    amount     int NOT NULL,
    method     text NOT NULL DEFAULT 'upi',
    note       text NOT NULL DEFAULT '',
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS expenses (
    id         serial PRIMARY KEY,
    booking_id int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    driver_id  int REFERENCES users(id),
    etype      text NOT NULL,
    amount     int NOT NULL,
    note       text NOT NULL DEFAULT '',
    created_at timestamptz DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS disputes (
    id          serial PRIMARY KEY,
    booking_id  int NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    raised_by   int REFERENCES users(id),
    message     text NOT NULL,
    status      text NOT NULL DEFAULT 'open',
    resolution  text,
    created_at  timestamptz DEFAULT now(),
    resolved_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS state_taxes (
    state         text PRIMARY KEY,
    entry_tax     int NOT NULL DEFAULT 500,
    per_passenger int NOT NULL DEFAULT 0
  )`,
  // Idempotent upgrades for databases created before these columns existed.
  `ALTER TABLE state_taxes ADD COLUMN IF NOT EXISTS per_passenger int NOT NULL DEFAULT 0`,
  `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS make text`,
  `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model text`,
  `CREATE INDEX IF NOT EXISTS bookings_status_idx  ON bookings(status)`,
  `CREATE INDEX IF NOT EXISTS bookings_owner_idx   ON bookings(owner_id)`,
  `CREATE INDEX IF NOT EXISTS bookings_vehicle_idx ON bookings(vehicle_id)`,
  `CREATE INDEX IF NOT EXISTS vehicles_owner_idx   ON vehicles(owner_id)`,
];

type GlobalWithDb = typeof globalThis & {
  __busgo_db?: Promise<Db>;
};

async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url && /^postgres/i.test(url)) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url), { schema });
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { mkdirSync } = await import("node:fs");
    const dataDir =
      process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dataDir, { recursive: true });
    const client = new PGlite(dataDir);
    db = drizzle(client, { schema });
  }
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
  const rows = await db.execute(sql`SELECT count(*)::int AS n FROM users`);
  const n = (rows as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ?? 0;
  // Demo data seeds in development by default; in production only when
  // explicitly requested with SEED_DEMO=1.
  const wantDemo =
    process.env.SEED_DEMO === "1" ||
    (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO !== "0");
  if (n === 0 && wantDemo) {
    const { seedDemo } = await import("./seed");
    await seedDemo(db);
  }
  // Admin account + state tax table exist on every database.
  const { ensureAdmin, ensureStateTaxes } = await import("./seed");
  await ensureAdmin(db);
  await ensureStateTaxes(db);
  return db;
}

export function getDb(): Promise<Db> {
  const g = globalThis as GlobalWithDb;
  if (!g.__busgo_db) {
    g.__busgo_db = createDb();
    // Don't cache failures — a transient init error would otherwise poison
    // every future request until the process restarts.
    g.__busgo_db.catch(() => {
      g.__busgo_db = undefined;
    });
  }
  return g.__busgo_db;
}

export { schema };
