import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bookings,
  driverProfiles,
  ownerProfiles,
  users,
  vehicles,
} from "@/lib/db/schema";
import { requireRole } from "@/lib/server/api";
import { avgRating, bookingDTO } from "@/lib/server/bookings";
import {
  docStatus,
  settlementSplit,
  VEHICLE_CLASSES,
  type VehicleClass,
} from "@/lib/shared/fare";

export async function GET() {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const db = await getDb();
  const [profile] = await db
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, session.userId));

  const vehicleRows = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.ownerId, session.userId));

  const driverRows = await db
    .select({
      userId: driverProfiles.userId,
      licenseNo: driverProfiles.licenseNo,
      experienceYears: driverProfiles.experienceYears,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(driverProfiles)
    .innerJoin(users, eq(users.id, driverProfiles.userId))
    .where(eq(driverProfiles.ownerId, session.userId));

  const bookingRows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.ownerId, session.userId))
    .orderBy(desc(bookings.id))
    .limit(100);
  const bookingList = await Promise.all(bookingRows.map(bookingDTO));

  let totalEarnings = 0;
  let pendingSettlement = 0;
  for (const b of bookingRows) {
    if (b.status !== "completed") continue;
    totalEarnings += settlementSplit(b).ownerPayout;
  }
  for (const b of bookingRows) {
    if (b.status === "confirmed" || b.status === "started")
      pendingSettlement += settlementSplit(b).ownerPayout;
  }

  return NextResponse.json({
    profile: {
      name: session.name,
      company: profile?.company ?? null,
      city: profile?.city ?? null,
      paysCommission: profile?.paysCommission ?? false,
      commissionType: profile?.commissionType ?? "percent",
      commissionValue: profile?.commissionValue ?? 0,
    },
    vehicles: vehicleRows.map((v) => ({
      id: v.id,
      name: v.name,
      vclass: v.vclass,
      emoji: VEHICLE_CLASSES[v.vclass as VehicleClass]?.emoji ?? "🚌",
      classLabel: VEHICLE_CLASSES[v.vclass as VehicleClass]?.label ?? v.vclass,
      seats: v.seats,
      ac: v.ac,
      amenities: v.amenities,
      regNo: v.regNo,
      perKm: v.perKm,
      perDay: v.perDay,
      minFare: v.minFare,
      bataPerDay: v.bataPerDay,
      nightPct: v.nightPct,
      baseCity: v.baseCity,
      baseState: v.baseState,
      baseLat: v.baseLat,
      baseLng: v.baseLng,
      permitType: v.permitType,
      permitExpiry: v.permitExpiry,
      insuranceExpiry: v.insuranceExpiry,
      fitnessExpiry: v.fitnessExpiry,
      pucExpiry: v.pucExpiry,
      docs: {
        permit: docStatus(v.permitExpiry),
        insurance: docStatus(v.insuranceExpiry),
        fitness: docStatus(v.fitnessExpiry),
        puc: docStatus(v.pucExpiry),
      },
      verifyStatus: v.verifyStatus,
      ownerActive: v.ownerActive,
      rating: avgRating(v.ratingSum, v.ratingCount),
    })),
    drivers: driverRows,
    bookings: bookingList,
    earnings: { total: totalEarnings, pending: pendingSettlement },
  });
}
