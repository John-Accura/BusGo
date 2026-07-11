import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Driver starts the trip: odometer photo stand-in = odometer reading + GPS.
// Balance must be settled before departure (PRD payment rules).
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("driver");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");
  const body = await req.json().catch(() => null);
  const odometer = Number(body?.odometer);
  if (!Number.isInteger(odometer) || odometer < 0)
    return jsonError(400, "Enter the starting odometer reading");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.driverId !== session.userId) return jsonError(404, "Trip not found");
  if (b.status !== "confirmed") return jsonError(409, "This trip cannot be started");
  if (b.paymentStatus !== "paid")
    return jsonError(409, "The customer must settle the full fare before departure");

  const [row] = await db
    .update(bookings)
    .set({ status: "started", startedAt: new Date(), odometerStart: odometer })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "confirmed")))
    .returning();
  if (!row) return jsonError(409, "Trip state changed, refresh and retry");

  return NextResponse.json({ booking: await bookingDTO(row) });
}
