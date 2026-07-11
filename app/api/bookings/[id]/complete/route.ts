import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Driver completes the trip with the closing odometer reading.
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
    return jsonError(400, "Enter the closing odometer reading");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.driverId !== session.userId) return jsonError(404, "Trip not found");
  if (b.status !== "started") return jsonError(409, "This trip is not in progress");
  if (b.odometerStart !== null && odometer < b.odometerStart)
    return jsonError(400, "Closing odometer is below the starting reading");

  const [row] = await db
    .update(bookings)
    .set({ status: "completed", completedAt: new Date(), odometerEnd: odometer })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "started")))
    .returning();
  if (!row) return jsonError(409, "Trip state changed, refresh and retry");

  return NextResponse.json({ booking: await bookingDTO(row) });
}
