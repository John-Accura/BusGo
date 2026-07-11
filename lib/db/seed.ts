import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./index";
import {
  agentProfiles,
  driverProfiles,
  ownerProfiles,
  stateTaxes,
  users,
  vehicles,
} from "./schema";

const DEMO_PASSWORD = "bus2026";

function daysFromNow(n: number): string {
  const d = new Date(Date.now() + n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Platform admin — created on any database, credentials via env.
export async function ensureAdmin(db: Db): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || "admin@busgo.local").toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return;
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "admin@123", 10);
  await db.insert(users).values({
    name: "Platform Admin",
    email,
    passwordHash: hash,
    role: "admin",
  });
}

// Inter-state entry tax table (PRD §08) — admin can edit from the dashboard.
export async function ensureStateTaxes(db: Db): Promise<void> {
  const rows = await db.execute(sql`SELECT count(*)::int AS n FROM state_taxes`);
  const n = (rows as unknown as { rows?: { n: number }[] }).rows?.[0]?.n ?? 0;
  if (n > 0) return;
  await db.insert(stateTaxes).values([
    { state: "Kerala", entryTax: 500, perPassenger: 50 },
    { state: "Tamil Nadu", entryTax: 800, perPassenger: 100 },
    { state: "Karnataka", entryTax: 600, perPassenger: 75 },
    { state: "Andhra Pradesh", entryTax: 500, perPassenger: 60 },
    { state: "Telangana", entryTax: 500, perPassenger: 60 },
    { state: "Goa", entryTax: 700, perPassenger: 50 },
    { state: "Maharashtra", entryTax: 1200, perPassenger: 120 },
    { state: "Puducherry", entryTax: 300, perPassenger: 25 },
  ]);
}

export async function seedDemo(db: Db): Promise<void> {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const mkUser = async (
    name: string,
    email: string,
    phone: string,
    role: string,
  ) => {
    const [u] = await db
      .insert(users)
      .values({ name, email, phone, passwordHash: hash, role })
      .returning();
    return u;
  };

  // --- customer & agent ---
  await mkUser("Arjun Nair", "customer@demo.local", "+919800000101", "customer");

  const agent = await mkUser(
    "Meera Travels",
    "agent@demo.local",
    "+919800000102",
    "agent",
  );
  await db.insert(agentProfiles).values({
    userId: agent.id,
    agency: "Meera Tours & Travels",
    gstNo: "32MEERA1234A1Z5",
    serviceType: "percent",
    serviceValue: 5,
  });

  // --- owner 1: pays agent commission ---
  const owner1 = await mkUser(
    "Thomas Varghese",
    "owner@demo.local",
    "+919800000103",
    "owner",
  );
  await db.insert(ownerProfiles).values({
    userId: owner1.id,
    company: "Malabar Travels",
    city: "Kochi",
    gstNo: "32MALAB5678B1Z3",
    paysCommission: true,
    commissionType: "percent",
    commissionValue: 8,
  });

  // --- owner 2: no agent commission ---
  const owner2 = await mkUser(
    "Rafeeq K",
    "owner2@demo.local",
    "+919800000104",
    "owner",
  );
  await db.insert(ownerProfiles).values({
    userId: owner2.id,
    company: "Kerala Coach Co",
    city: "Ernakulam",
    paysCommission: false,
  });

  // --- drivers (fleet accounts created by owners) ---
  const d1 = await mkUser("Suresh Pillai", "driver@demo.local", "+919800000105", "driver");
  await db.insert(driverProfiles).values({
    userId: d1.id,
    ownerId: owner1.id,
    licenseNo: "KL-2020-0012345",
    experienceYears: 8,
  });
  const d2 = await mkUser("Anand Menon", "driver2@demo.local", "+919800000106", "driver");
  await db.insert(driverProfiles).values({
    userId: d2.id,
    ownerId: owner1.id,
    licenseNo: "KL-2018-0067890",
    experienceYears: 11,
  });
  const d3 = await mkUser("Fahad Ali", "driver3@demo.local", "+919800000107", "driver");
  await db.insert(driverProfiles).values({
    userId: d3.id,
    ownerId: owner2.id,
    licenseNo: "KL-2021-0034567",
    experienceYears: 5,
  });

  // --- vehicles (based around Kochi) ---
  const docsOk = {
    permitExpiry: daysFromNow(400),
    insuranceExpiry: daysFromNow(220),
    fitnessExpiry: daysFromNow(300),
    pucExpiry: daysFromNow(120),
  };

  await db.insert(vehicles).values([
    {
      ownerId: owner1.id,
      name: "Force Urbania Premium",
      vclass: "urbania",
      seats: 13,
      ac: true,
      amenities: "Pushback seats, USB charging, Music system",
      regNo: "KL-07-CQ-4501",
      perKm: 28,
      perDay: 7500,
      minFare: 2500,
      bataPerDay: 400,
      nightPct: 10,
      baseCity: "Kochi",
      baseState: "Kerala",
      baseLat: 9.9816,
      baseLng: 76.2999,
      permitType: "All India",
      ...docsOk,
      verifyStatus: "approved",
    },
    {
      ownerId: owner1.id,
      name: "Tempo Traveller 17-Seater",
      vclass: "tempo_traveller",
      seats: 17,
      ac: true,
      amenities: "Pushback seats, LED TV, First-aid kit",
      regNo: "KL-07-BX-2210",
      perKm: 32,
      perDay: 9000,
      minFare: 3000,
      bataPerDay: 450,
      nightPct: 10,
      baseCity: "Kochi",
      baseState: "Kerala",
      baseLat: 9.9712,
      baseLng: 76.2872,
      permitType: "All India",
      ...docsOk,
      verifyStatus: "approved",
    },
    {
      ownerId: owner1.id,
      name: "Volvo 9600 Luxury Coach",
      vclass: "luxury_coach",
      seats: 45,
      ac: true,
      amenities: "Recliner seats, WiFi, Washroom, Entertainment system",
      regNo: "KL-07-AZ-9004",
      perKm: 65,
      perDay: 22000,
      minFare: 8000,
      bataPerDay: 600,
      nightPct: 12,
      baseCity: "Kochi",
      baseState: "Kerala",
      baseLat: 10.0159,
      baseLng: 76.3419,
      permitType: "National",
      ...docsOk,
      verifyStatus: "approved",
    },
    {
      ownerId: owner2.id,
      name: "Mini Bus 30-Seater",
      vclass: "mini_bus",
      seats: 30,
      ac: false,
      amenities: "Standard seats, Luggage carrier",
      regNo: "KL-43-D-7788",
      perKm: 42,
      perDay: 12000,
      minFare: 4500,
      bataPerDay: 500,
      nightPct: 10,
      baseCity: "Ernakulam",
      baseState: "Kerala",
      baseLat: 9.9648,
      baseLng: 76.3186,
      permitType: "State",
      ...docsOk,
      // Insurance expiring within 7 days → shows the auto-expiry warning.
      insuranceExpiry: daysFromNow(5),
      verifyStatus: "approved",
    },
    {
      ownerId: owner2.id,
      name: "Bharat Benz Tourist Coach",
      vclass: "luxury_coach",
      seats: 49,
      ac: true,
      amenities: "Recliner seats, Reading lights, Icebox",
      regNo: "KL-43-E-1122",
      perKm: 58,
      perDay: 19000,
      minFare: 7000,
      bataPerDay: 600,
      nightPct: 12,
      baseCity: "Ernakulam",
      baseState: "Kerala",
      baseLat: 9.9894,
      baseLng: 76.3096,
      permitType: "All India",
      ...docsOk,
      // Awaiting admin verification → shows in the admin queue, not in search.
      verifyStatus: "pending",
    },
  ]);
}
