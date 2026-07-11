import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  agentProfiles,
  bookings,
  ownerProfiles,
  stateTaxes,
  users,
  vehicles,
} from "@/lib/db/schema";
import { isValidDate, jsonError, requireRole } from "@/lib/server/api";
import {
  bookingDTO,
  newBookingCode,
  vehicleBookedForDates,
} from "@/lib/server/bookings";
import {
  advanceAmount,
  calcFare,
  daysBetween,
  TRIP_TYPES,
  vehicleCompliance,
  type AgentTerms,
  type TripType,
} from "@/lib/shared/fare";

interface PointInput {
  addr?: unknown;
  lat?: unknown;
  lng?: unknown;
  state?: unknown;
}

function parsePoint(p: PointInput | undefined) {
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  return {
    addr: String(p.addr ?? "").slice(0, 300),
    lat: p.lat,
    lng: p.lng,
    state: String(p.state ?? "").slice(0, 60),
  };
}

function chainKm(pts: { lat: number; lng: number }[]): number {
  const R = 6371;
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    km += 2 * R * Math.asin(Math.sqrt(s));
  }
  return km;
}

// Create a booking request. The server recomputes the entire fare from its
// own data (vehicle rates, owner/agent terms, tax table) — the client's
// numbers are display-only except the routed distance, which is clamped.
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("customer", "agent");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const tripType = body.tripType as TripType;
  if (!TRIP_TYPES[tripType]) return jsonError(400, "Invalid trip type");
  const vehicleId = Number(body.vehicleId);
  if (!Number.isInteger(vehicleId)) return jsonError(400, "Invalid vehicle");

  const pickup = parsePoint(body.pickup);
  const drop = parsePoint(body.drop);
  if (!pickup) return jsonError(400, "Please set a pickup location");
  if (!drop) return jsonError(400, "Please set a destination");
  const stops = Array.isArray(body.stops)
    ? (body.stops.map(parsePoint).filter(Boolean) as NonNullable<
        ReturnType<typeof parsePoint>
      >[])
    : [];

  const startDate = body.startDate;
  const endDate = body.endDate || body.startDate;
  if (!isValidDate(startDate) || !isValidDate(endDate))
    return jsonError(400, "Please pick valid trip dates");
  const today = new Date().toISOString().slice(0, 10);
  if (startDate < today) return jsonError(400, "Trip start date is in the past");
  if (endDate < startDate) return jsonError(400, "Trip end date is before the start");

  const passengers = Number(body.passengers);
  if (!Number.isInteger(passengers) || passengers < 1)
    return jsonError(400, "Enter the number of passengers");

  const db = await getDb();
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
  if (!v || v.verifyStatus !== "approved" || !v.ownerActive)
    return jsonError(404, "This vehicle is not available");
  if (!vehicleCompliance(v).ok)
    return jsonError(409, "This vehicle's documents have expired");
  if (passengers > v.seats)
    return jsonError(400, `This vehicle seats ${v.seats} passengers`);
  if (await vehicleBookedForDates(vehicleId, startDate, endDate))
    return jsonError(409, "This vehicle is already booked for those dates");

  // Distance: clamp the client's routed figure against the straight-line chain.
  const routePts = [pickup, ...stops, drop];
  if (tripType === "round_trip") routePts.push(pickup);
  const hav = chainKm(routePts);
  const lo = hav;
  const hi = Math.max(hav * 2.5, hav + 10);
  const claimed = Number(body.distanceKm);
  const distanceKm =
    Math.round(
      Math.min(Math.max(Number.isFinite(claimed) && claimed > 0 ? claimed : hav * 1.35, lo), hi) * 10,
    ) / 10;

  // Inter-state levies: every distinct state beyond the origin state pays its
  // flat entry tax plus a per-passenger charge.
  const taxRows = await db.select().from(stateTaxes);
  const taxMap = new Map(taxRows.map((t) => [t.state.toLowerCase(), t]));
  const states = [...new Set(routePts.map((p) => p.state).filter(Boolean))];
  const originState = pickup.state;
  let stateTaxTotal = 0;
  for (const s of states) {
    if (s === originState) continue;
    const rate = taxMap.get(s.toLowerCase());
    stateTaxTotal += (rate?.entryTax ?? 500) + (rate?.perPassenger ?? 0) * passengers;
  }

  // Agent terms come from the database, never the client.
  let agentTerms: AgentTerms | null = null;
  if (session.role === "agent") {
    const [op] = await db
      .select()
      .from(ownerProfiles)
      .where(eq(ownerProfiles.userId, v.ownerId));
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

  const days = daysBetween(startDate, endDate);
  const nightTravel = body.nightTravel === true;
  const fare = calcFare(
    {
      perKm: v.perKm,
      perDay: v.perDay,
      minFare: v.minFare,
      bataPerDay: v.bataPerDay,
      nightPct: v.nightPct,
    },
    {
      tripType,
      km: distanceKm,
      days,
      nightTravel,
      stateTaxes: stateTaxTotal,
      agent: agentTerms,
    },
  );

  const [row] = await db
    .insert(bookings)
    .values({
      code: newBookingCode(),
      tripType,
      customerId: session.role === "customer" ? session.userId : null,
      customerName:
        session.role === "agent"
          ? String(body.customerName ?? "").slice(0, 120)
          : session.name,
      customerPhone:
        session.role === "agent" ? String(body.customerPhone ?? "").slice(0, 20) : "",
      agentId: session.role === "agent" ? session.userId : null,
      ownerId: v.ownerId,
      vehicleId: v.id,
      startDate,
      endDate,
      days,
      passengers,
      purpose: String(body.purpose ?? "Tourism").slice(0, 40),
      pickupAddr: pickup.addr,
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      dropAddr: drop.addr,
      dropLat: drop.lat,
      dropLng: drop.lng,
      stopsJson: JSON.stringify(stops),
      statesJson: JSON.stringify(states),
      distanceKm,
      nightTravel,
      baseFare: fare.baseFare,
      driverBata: fare.driverBata,
      nightSurcharge: fare.nightSurcharge,
      stateTaxes: fare.stateTaxes,
      tollEst: fare.tollEst,
      platformFee: fare.platformFee,
      agentServiceCharge: fare.agentServiceCharge,
      agentCommission: fare.agentCommission,
      totalFare: fare.totalFare,
      advanceRequired: advanceAmount(fare.totalFare, startDate),
      status: "requested",
    })
    .returning();

  return NextResponse.json({ booking: await bookingDTO(row) });
}

// List bookings for the signed-in user, by role.
export async function GET() {
  const { session, error } = await requireRole();
  if (error) return error;

  const db = await getDb();
  const col =
    session.role === "owner"
      ? bookings.ownerId
      : session.role === "agent"
        ? bookings.agentId
        : session.role === "driver"
          ? bookings.driverId
          : bookings.customerId;

  const rows =
    session.role === "admin"
      ? await db.select().from(bookings).orderBy(desc(bookings.id)).limit(100)
      : await db
          .select()
          .from(bookings)
          .where(eq(col, session.userId))
          .orderBy(desc(bookings.id))
          .limit(100);

  const list = await Promise.all(rows.map(bookingDTO));
  return NextResponse.json({ bookings: list, role: session.role });
}
