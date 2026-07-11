import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  agentProfiles,
  ownerProfiles,
  stateTaxes,
  users,
  vehicles,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { jsonError } from "@/lib/server/api";
import { avgRating } from "@/lib/server/bookings";
import { VEHICLE_CLASSES, type VehicleClass } from "@/lib/shared/fare";

// Vehicle details for the booking page, including the data the client needs
// to compute the fare breakdown (rates, owner commission terms, agent charge,
// and the state entry-tax table).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const vehicleId = Number(id);
  if (!Number.isInteger(vehicleId)) return jsonError(400, "Invalid vehicle id");

  const db = await getDb();
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!v || v.verifyStatus !== "approved") return jsonError(404, "Vehicle not found");

  const [owner] = await db.select().from(users).where(eq(users.id, v.ownerId));
  const [op] = await db
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, v.ownerId));
  const taxRows = await db.select().from(stateTaxes);

  const session = await getSession();
  let agentTerms = null;
  if (session?.role === "agent") {
    const [ap] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, session.userId));
    agentTerms = {
      ownerPaysCommission: op?.paysCommission ?? false,
      commissionType: (op?.commissionType ?? "percent") as "fixed" | "percent",
      commissionValue: op?.commissionValue ?? 0,
      serviceType: (ap?.serviceType ?? "percent") as "fixed" | "percent",
      serviceValue: ap?.serviceValue ?? 0,
    };
  }

  return NextResponse.json({
    vehicle: {
      id: v.id,
      name: v.name,
      vclass: v.vclass,
      emoji: VEHICLE_CLASSES[v.vclass as VehicleClass]?.emoji ?? "🚌",
      classLabel: VEHICLE_CLASSES[v.vclass as VehicleClass]?.label ?? v.vclass,
      seats: v.seats,
      ac: v.ac,
      amenities: v.amenities,
      permitType: v.permitType,
      regNo: v.regNo,
      baseCity: v.baseCity,
      baseState: v.baseState,
      rating: avgRating(v.ratingSum, v.ratingCount),
      rates: {
        perKm: v.perKm,
        perDay: v.perDay,
        minFare: v.minFare,
        bataPerDay: v.bataPerDay,
        nightPct: v.nightPct,
      },
      owner: { name: owner?.name ?? "", company: op?.company ?? null },
    },
    stateTaxes: Object.fromEntries(
      taxRows.map((t) => [t.state, { entryTax: t.entryTax, perPassenger: t.perPassenger }]),
    ),
    agentTerms,
  });
}
