import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vehicles } from "@/lib/db/schema";
import { isValidDate, jsonError, requireRole } from "@/lib/server/api";

// Owner updates a vehicle: pricing, docs, instant block toggle.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const { id } = await ctx.params;
  const vehicleId = Number(id);
  if (!Number.isInteger(vehicleId)) return jsonError(400, "Invalid vehicle id");
  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const db = await getDb();
  const [v] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, vehicleId), eq(vehicles.ownerId, session.userId)));
  if (!v) return jsonError(404, "Vehicle not found");

  const set: Record<string, unknown> = {};
  if (typeof body.ownerActive === "boolean") set.ownerActive = body.ownerActive;
  for (const k of ["perKm", "perDay", "minFare", "bataPerDay", "nightPct"] as const) {
    if (body[k] !== undefined) {
      const n = Number(body[k]);
      if (!Number.isFinite(n) || n < 0) return jsonError(400, `Invalid ${k}`);
      set[k] = Math.round(n);
    }
  }
  for (const k of [
    "permitExpiry",
    "insuranceExpiry",
    "fitnessExpiry",
    "pucExpiry",
  ] as const) {
    if (body[k] !== undefined) {
      if (!isValidDate(body[k])) return jsonError(400, `Invalid ${k}`);
      set[k] = body[k];
    }
  }
  if (body.amenities !== undefined) set.amenities = String(body.amenities).slice(0, 300);
  if (Object.keys(set).length === 0) return jsonError(400, "Nothing to update");

  // A rejected vehicle re-enters the verification queue after edits.
  if (v.verifyStatus === "rejected") set.verifyStatus = "pending";

  await db.update(vehicles).set(set).where(eq(vehicles.id, vehicleId));
  return NextResponse.json({ ok: true });
}
