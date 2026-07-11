import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO, vehicleBookedForDates } from "@/lib/server/bookings";

// Owner confirms a booking request.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.ownerId !== session.userId) return jsonError(404, "Booking not found");
  if (b.status !== "requested")
    return jsonError(409, "Only requested bookings can be confirmed");
  if (await vehicleBookedForDates(b.vehicleId, b.startDate, b.endDate, b.id))
    return jsonError(409, "The vehicle is already confirmed for overlapping dates");

  const [row] = await db
    .update(bookings)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "requested")))
    .returning();
  if (!row) return jsonError(409, "Booking state changed, refresh and retry");

  return NextResponse.json({ booking: await bookingDTO(row) });
}
