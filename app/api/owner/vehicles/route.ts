import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { vehicles } from "@/lib/db/schema";
import { isValidDate, jsonError, requireRole } from "@/lib/server/api";
import { VEHICLE_CLASSES, type VehicleClass } from "@/lib/shared/fare";

// Owner lists a new vehicle. It enters the admin verification queue.
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const name = String(body.name ?? "").trim();
  const vclass = body.vclass as VehicleClass;
  const seats = Number(body.seats);
  const regNo = String(body.regNo ?? "").trim().toUpperCase();
  const perKm = Number(body.perKm);
  const perDay = Number(body.perDay);

  if (name.length < 3) return jsonError(400, "Enter the vehicle name/model");
  if (!VEHICLE_CLASSES[vclass]) return jsonError(400, "Pick a vehicle class");
  if (!Number.isInteger(seats) || seats < 7 || seats > 60)
    return jsonError(400, "Seats must be between 7 and 60");
  if (regNo.length < 6) return jsonError(400, "Enter the registration number");
  if (!Number.isFinite(perKm) || perKm <= 0 || !Number.isFinite(perDay) || perDay <= 0)
    return jsonError(400, "Enter per-km and per-day rates");

  for (const k of ["permitExpiry", "insuranceExpiry", "fitnessExpiry", "pucExpiry"]) {
    if (!isValidDate(body[k]))
      return jsonError(400, "All four document expiry dates are required");
  }

  const db = await getDb();
  const [row] = await db
    .insert(vehicles)
    .values({
      ownerId: session.userId,
      name,
      vclass,
      seats,
      ac: body.ac !== false,
      amenities: String(body.amenities ?? "").slice(0, 300),
      regNo,
      perKm: Math.round(perKm),
      perDay: Math.round(perDay),
      minFare: Math.max(0, Math.round(Number(body.minFare) || 0)),
      bataPerDay: Math.max(0, Math.round(Number(body.bataPerDay) || 400)),
      nightPct: Math.min(50, Math.max(0, Math.round(Number(body.nightPct) || 10))),
      baseCity: String(body.baseCity ?? "").slice(0, 80),
      baseState: String(body.baseState ?? "").slice(0, 60),
      baseLat: Number.isFinite(Number(body.baseLat)) ? Number(body.baseLat) : null,
      baseLng: Number.isFinite(Number(body.baseLng)) ? Number(body.baseLng) : null,
      permitType: ["State", "All India", "National"].includes(body.permitType)
        ? body.permitType
        : "State",
      permitExpiry: body.permitExpiry,
      insuranceExpiry: body.insuranceExpiry,
      fitnessExpiry: body.fitnessExpiry,
      pucExpiry: body.pucExpiry,
      verifyStatus: "pending",
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id });
}
