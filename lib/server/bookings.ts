import { and, eq, inArray, lte, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  agentProfiles,
  bookings,
  disputes,
  driverProfiles,
  expenses,
  ownerProfiles,
  payments,
  users,
  vehicles,
} from "@/lib/db/schema";
import type { Session } from "@/lib/session";
import {
  VEHICLE_CLASSES,
  type BookingStatus,
  type PaymentStatus,
  type TripType,
  type VehicleClass,
} from "@/lib/shared/fare";

export type BookingRow = typeof bookings.$inferSelect;

export function iso(v: Date | string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

export function newBookingCode(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-5);
  const r = Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, "0");
  return `BG-${t}${r}`;
}

export function avgRating(sum: number, count: number): number | null {
  return count ? Math.round((sum / count) * 10) / 10 : null;
}

// A vehicle is unavailable for dates that overlap a confirmed/active booking.
export async function vehicleBookedForDates(
  vehicleId: number,
  startDate: string,
  endDate: string,
  excludeBookingId?: number,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.vehicleId, vehicleId),
        inArray(bookings.status, ["confirmed", "started"]),
        lte(bookings.startDate, endDate),
        gte(bookings.endDate, startDate),
      ),
    );
  return rows.some((r) => r.id !== excludeBookingId);
}

export function canViewBooking(session: Session, b: BookingRow): boolean {
  if (session.role === "admin") return true;
  return [b.customerId, b.agentId, b.ownerId, b.driverId].includes(session.userId);
}

export async function bookingDTO(row: BookingRow) {
  const db = await getDb();

  const userById = async (id: number | null) => {
    if (!id) return null;
    const [u] = await db.select().from(users).where(eq(users.id, id));
    return u ?? null;
  };

  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.id, row.vehicleId));
  const ownerUser = await userById(row.ownerId);
  const [ownerProfile] = await db
    .select()
    .from(ownerProfiles)
    .where(eq(ownerProfiles.userId, row.ownerId));
  const customerUser = await userById(row.customerId);
  const agentUser = await userById(row.agentId);
  let agentProfile = null;
  if (row.agentId) {
    const [ap] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, row.agentId));
    agentProfile = ap ?? null;
  }
  const driverUser = await userById(row.driverId);
  let driverProfile = null;
  if (row.driverId) {
    const [dp] = await db
      .select()
      .from(driverProfiles)
      .where(eq(driverProfiles.userId, row.driverId));
    driverProfile = dp ?? null;
  }

  const payRows = await db
    .select()
    .from(payments)
    .where(eq(payments.bookingId, row.id));
  const expRows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.bookingId, row.id));
  const [dispute] = await db
    .select()
    .from(disputes)
    .where(eq(disputes.bookingId, row.id));

  const vclass = (vehicle?.vclass ?? "tempo_traveller") as VehicleClass;

  return {
    id: row.id,
    code: row.code,
    status: row.status as BookingStatus,
    tripType: row.tripType as TripType,
    startDate: row.startDate,
    endDate: row.endDate,
    days: row.days,
    passengers: row.passengers,
    purpose: row.purpose,
    pickup: { addr: row.pickupAddr, lat: row.pickupLat, lng: row.pickupLng },
    drop: { addr: row.dropAddr, lat: row.dropLat, lng: row.dropLng },
    stops: JSON.parse(row.stopsJson || "[]") as {
      addr: string;
      lat: number;
      lng: number;
    }[],
    states: JSON.parse(row.statesJson || "[]") as string[],
    distanceKm: row.distanceKm,
    nightTravel: row.nightTravel,
    fare: {
      baseFare: row.baseFare,
      driverBata: row.driverBata,
      nightSurcharge: row.nightSurcharge,
      stateTaxes: row.stateTaxes,
      tollEst: row.tollEst,
      platformFee: row.platformFee,
      agentServiceCharge: row.agentServiceCharge,
      agentCommission: row.agentCommission,
      totalFare: row.totalFare,
    },
    advanceRequired: row.advanceRequired,
    amountPaid: row.amountPaid,
    balanceDue: Math.max(0, row.totalFare - row.amountPaid),
    paymentStatus: row.paymentStatus as PaymentStatus,
    odometerStart: row.odometerStart,
    odometerEnd: row.odometerEnd,
    actualKm:
      row.odometerStart !== null && row.odometerEnd !== null
        ? row.odometerEnd - row.odometerStart
        : null,
    startedAt: iso(row.startedAt),
    completedAt: iso(row.completedAt),
    requestedAt: iso(row.requestedAt),
    confirmedAt: iso(row.confirmedAt),
    cancelledAt: iso(row.cancelledAt),
    declineReason: row.declineReason,
    rating: row.rating,
    ratingComment: row.ratingComment,
    customer: {
      id: row.customerId,
      name: customerUser?.name || row.customerName || "Guest",
      phone: customerUser?.phone || row.customerPhone || null,
    },
    agent: agentUser
      ? {
          id: agentUser.id,
          name: agentUser.name,
          agency: agentProfile?.agency ?? null,
          phone: agentUser.phone,
        }
      : null,
    owner: {
      id: row.ownerId,
      name: ownerUser?.name ?? "",
      company: ownerProfile?.company ?? null,
      phone: ownerUser?.phone ?? null,
    },
    vehicle: vehicle
      ? {
          id: vehicle.id,
          name: vehicle.name,
          vclass,
          emoji: VEHICLE_CLASSES[vclass]?.emoji ?? "🚌",
          seats: vehicle.seats,
          ac: vehicle.ac,
          regNo: vehicle.regNo,
        }
      : null,
    driver: driverUser
      ? {
          id: driverUser.id,
          name: driverUser.name,
          phone: driverUser.phone,
          lat: driverProfile?.currentLat ?? null,
          lng: driverProfile?.currentLng ?? null,
          locationAt: iso(driverProfile?.locationAt ?? null),
        }
      : null,
    payments: payRows.map((p) => ({
      amount: p.amount,
      method: p.method,
      note: p.note,
      at: iso(p.createdAt),
    })),
    expenses: expRows.map((e) => ({
      id: e.id,
      etype: e.etype,
      amount: e.amount,
      note: e.note,
    })),
    dispute: dispute
      ? {
          id: dispute.id,
          status: dispute.status,
          message: dispute.message,
          resolution: dispute.resolution,
        }
      : null,
  };
}

export type BookingDTO = Awaited<ReturnType<typeof bookingDTO>>;
