import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ownerProfiles, stateTaxes, users, vehicles } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { avgRating, vehicleBookedForDates } from "@/lib/server/bookings";
import {
  VEHICLE_CLASSES,
  vehicleCompliance,
  type VehicleClass,
} from "@/lib/shared/fare";

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Vehicle discovery (PRD §4.1 Step 2): approved + compliant + not blocked +
// free on the requested dates, sorted by proximity → rating → price.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const q = req.nextUrl.searchParams;
  const passengers = Number(q.get("passengers") ?? 1);
  const startDate = q.get("start") ?? "";
  const endDate = q.get("end") ?? startDate;
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const vclass = q.get("vclass") ?? "";
  const acOnly = q.get("ac") === "1";

  const db = await getDb();
  const rows = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.verifyStatus, "approved"), eq(vehicles.ownerActive, true)));

  const results = [];
  for (const v of rows) {
    if (passengers > v.seats) continue;
    if (vclass && v.vclass !== vclass) continue;
    if (acOnly && !v.ac) continue;
    const compliance = vehicleCompliance(v);
    if (!compliance.ok) continue; // auto-expiry system: expired docs = not bookable
    if (startDate && (await vehicleBookedForDates(v.id, startDate, endDate)))
      continue;

    const [owner] = await db.select().from(users).where(eq(users.id, v.ownerId));
    const [op] = await db
      .select()
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, v.ownerId));

    const distanceKm =
      Number.isFinite(lat) && Number.isFinite(lng) && v.baseLat !== null && v.baseLng !== null
        ? Math.round(haversineKm(lat, lng, v.baseLat, v.baseLng) * 10) / 10
        : null;

    results.push({
      id: v.id,
      name: v.name,
      vclass: v.vclass,
      emoji: VEHICLE_CLASSES[v.vclass as VehicleClass]?.emoji ?? "🚌",
      classLabel: VEHICLE_CLASSES[v.vclass as VehicleClass]?.label ?? v.vclass,
      seats: v.seats,
      ac: v.ac,
      amenities: v.amenities,
      permitType: v.permitType,
      perKm: v.perKm,
      perDay: v.perDay,
      minFare: v.minFare,
      bataPerDay: v.bataPerDay,
      nightPct: v.nightPct,
      baseCity: v.baseCity,
      rating: avgRating(v.ratingSum, v.ratingCount),
      distanceKm,
      owner: {
        name: owner?.name ?? "",
        company: op?.company ?? null,
        paysCommission: op?.paysCommission ?? false,
        commissionType: op?.commissionType ?? "percent",
        commissionValue: op?.commissionValue ?? 0,
      },
    });
  }

  // Sort: proximity → rating → price (PRD sort priority).
  results.sort(
    (a, b) =>
      (a.distanceKm ?? 9e9) - (b.distanceKm ?? 9e9) ||
      (b.rating ?? 0) - (a.rating ?? 0) ||
      a.perKm - b.perKm,
  );

  const taxRows = await db.select().from(stateTaxes);
  return NextResponse.json({
    results,
    agentMode: session?.role === "agent",
    stateTaxes: Object.fromEntries(
      taxRows.map((t) => [t.state, { entryTax: t.entryTax, perPassenger: t.perPassenger }]),
    ),
  });
}
