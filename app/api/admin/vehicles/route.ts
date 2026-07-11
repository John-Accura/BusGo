import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, vehicles } from "@/lib/db/schema";
import { isValidDate, jsonError, requireRole } from "@/lib/server/api";
import { VEHICLE_CLASSES, type VehicleClass } from "@/lib/shared/fare";

// Admin adds a vehicle to the platform fleet on behalf of an owner.
// Admin-created vehicles skip the verification queue (approved immediately).
export async function POST(req: NextRequest) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const ownerId = Number(body.ownerId);
  const make = String(body.make ?? "").trim();
  const model = String(body.model ?? "").trim();
  const vclass = body.vclass as VehicleClass;
  const seats = Number(body.seats);
  const regNo = String(body.regNo ?? "").trim().toUpperCase();
  const baseState = String(body.baseState ?? "").trim();
  const perKm = Number(body.perKm);
  const perDay = Number(body.perDay);
  const validTill = body.validTill;

  if (!Number.isInteger(ownerId)) return jsonError(400, "Pick the vehicle owner");
  if (make.length < 2) return jsonError(400, "Enter the vehicle make");
  if (model.length < 1) return jsonError(400, "Enter the vehicle model");
  if (!VEHICLE_CLASSES[vclass]) return jsonError(400, "Pick a vehicle class");
  if (!Number.isInteger(seats) || seats < 7 || seats > 60)
    return jsonError(400, "Seating capacity must be between 7 and 60");
  if (regNo.length < 6) return jsonError(400, "Enter the registration number");
  if (baseState.length < 2) return jsonError(400, "Pick the vehicle's state");
  if (!Number.isFinite(perKm) || perKm <= 0 || !Number.isFinite(perDay) || perDay <= 0)
    return jsonError(400, "Enter per-km and per-day rates");
  if (!isValidDate(validTill))
    return jsonError(400, "Pick the documents' valid-till date");

  const db = await getDb();
  const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
  if (!owner || owner.role !== "owner")
    return jsonError(404, "That user is not a vehicle owner");

  const [row] = await db
    .insert(vehicles)
    .values({
      ownerId,
      name: `${make} ${model}`,
      make,
      model,
      vclass,
      seats,
      ac: body.ac !== false,
      regNo,
      perKm: Math.round(perKm),
      perDay: Math.round(perDay),
      minFare: Math.max(0, Math.round(Number(body.minFare) || 2500)),
      bataPerDay: 400,
      nightPct: 10,
      baseCity: String(body.baseCity ?? "").slice(0, 80),
      baseState,
      // All four compliance documents assumed valid until the given date;
      // the owner can refine individual expiries from their fleet page.
      permitExpiry: validTill,
      insuranceExpiry: validTill,
      fitnessExpiry: validTill,
      pucExpiry: validTill,
      permitType: ["State", "All India", "National"].includes(body.permitType)
        ? body.permitType
        : "State",
      verifyStatus: "approved",
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id });
}
