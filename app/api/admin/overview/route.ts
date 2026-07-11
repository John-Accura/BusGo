import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bookings,
  disputes,
  ownerProfiles,
  stateTaxes,
  users,
  vehicles,
} from "@/lib/db/schema";
import { requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";
import {
  settlementSplit,
  VEHICLE_CLASSES,
  type VehicleClass,
} from "@/lib/shared/fare";

export async function GET() {
  const { error } = await requireRole("admin");
  if (error) return error;

  const db = await getDb();

  const allUsers = await db.select().from(users);
  const allVehicles = await db.select().from(vehicles);
  const allBookings = await db
    .select()
    .from(bookings)
    .orderBy(desc(bookings.id))
    .limit(200);

  const byRole: Record<string, number> = {};
  for (const u of allUsers) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  const byStatus: Record<string, number> = {};
  let gmv = 0;
  let platformRevenue = 0;
  for (const b of allBookings) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    if (b.status === "completed") {
      gmv += b.totalFare;
      platformRevenue += b.platformFee;
    }
  }

  // Verification queue with owner context.
  const pendingVehicles = [];
  for (const v of allVehicles.filter((v) => v.verifyStatus === "pending")) {
    const [owner] = await db.select().from(users).where(eq(users.id, v.ownerId));
    const [op] = await db
      .select()
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, v.ownerId));
    pendingVehicles.push({
      id: v.id,
      name: v.name,
      emoji: VEHICLE_CLASSES[v.vclass as VehicleClass]?.emoji ?? "🚌",
      classLabel: VEHICLE_CLASSES[v.vclass as VehicleClass]?.label ?? v.vclass,
      seats: v.seats,
      regNo: v.regNo,
      permitType: v.permitType,
      permitExpiry: v.permitExpiry,
      insuranceExpiry: v.insuranceExpiry,
      fitnessExpiry: v.fitnessExpiry,
      pucExpiry: v.pucExpiry,
      owner: { name: owner?.name ?? "", company: op?.company ?? null },
    });
  }

  // Open disputes with booking context.
  const disputeRows = await db
    .select()
    .from(disputes)
    .orderBy(desc(disputes.id))
    .limit(50);
  const disputeList = [];
  for (const d of disputeRows) {
    const [b] = await db.select().from(bookings).where(eq(bookings.id, d.bookingId));
    const [raiser] = d.raisedBy
      ? await db.select().from(users).where(eq(users.id, d.raisedBy))
      : [null];
    disputeList.push({
      id: d.id,
      status: d.status,
      message: d.message,
      resolution: d.resolution,
      bookingCode: b?.code ?? "?",
      bookingId: d.bookingId,
      raisedBy: raiser?.name ?? "Unknown",
    });
  }

  // Settlement ledger for completed bookings.
  const settlements = allBookings
    .filter((b) => b.status === "completed")
    .map((b) => ({
      bookingId: b.id,
      code: b.code,
      totalFare: b.totalFare,
      ...settlementSplit(b),
    }));

  const taxes = await db.select().from(stateTaxes);
  const recent = await Promise.all(allBookings.slice(0, 12).map(bookingDTO));

  // Full platform fleet with owner + home-state levy context.
  const ownerUsers = allUsers.filter((u) => u.role === "owner");
  const ownerProfileRows = await db.select().from(ownerProfiles);
  const profileByUser = new Map(ownerProfileRows.map((p) => [p.userId, p]));
  const taxByState = new Map(taxes.map((t) => [t.state.toLowerCase(), t]));
  const fleet = allVehicles
    .map((v) => {
      const owner = allUsers.find((u) => u.id === v.ownerId);
      const tax = taxByState.get(v.baseState.toLowerCase());
      return {
        id: v.id,
        name: v.name,
        make: v.make ?? v.name.split(" ")[0],
        model: v.model ?? v.name.split(" ").slice(1).join(" "),
        emoji: VEHICLE_CLASSES[v.vclass as VehicleClass]?.emoji ?? "🚌",
        classLabel: VEHICLE_CLASSES[v.vclass as VehicleClass]?.label ?? v.vclass,
        seats: v.seats,
        regNo: v.regNo,
        baseState: v.baseState,
        perKm: v.perKm,
        perDay: v.perDay,
        verifyStatus: v.verifyStatus,
        ownerActive: v.ownerActive,
        owner: {
          name: owner?.name ?? "",
          company: profileByUser.get(v.ownerId)?.company ?? null,
        },
        stateTax: tax
          ? { entryTax: tax.entryTax, perPassenger: tax.perPassenger }
          : null,
      };
    })
    .sort((a, b) => a.id - b.id);
  const owners = ownerUsers.map((u) => ({
    id: u.id,
    name: u.name,
    company: profileByUser.get(u.id)?.company ?? null,
  }));

  return NextResponse.json({
    stats: {
      users: byRole,
      vehicles: {
        total: allVehicles.length,
        pending: pendingVehicles.length,
        approved: allVehicles.filter((v) => v.verifyStatus === "approved").length,
      },
      bookings: byStatus,
      gmv,
      platformRevenue,
    },
    pendingVehicles,
    disputes: disputeList,
    settlements,
    taxes: taxes.sort((a, b) => a.state.localeCompare(b.state)),
    recentBookings: recent,
    fleet,
    owners,
  });
}
