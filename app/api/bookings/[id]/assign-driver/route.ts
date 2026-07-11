import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, lte, gte, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, driverProfiles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Owner assigns one of their fleet drivers to a confirmed booking.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  const body = await req.json().catch(() => null);
  const driverId = Number(body?.driverId);
  if (!Number.isInteger(bookingId) || !Number.isInteger(driverId))
    return jsonError(400, "Invalid request");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.ownerId !== session.userId) return jsonError(404, "Booking not found");
  if (b.status !== "confirmed")
    return jsonError(409, "Assign a driver after confirming the booking");

  const [dp] = await db
    .select()
    .from(driverProfiles)
    .where(
      and(eq(driverProfiles.userId, driverId), eq(driverProfiles.ownerId, session.userId)),
    );
  if (!dp) return jsonError(404, "This driver is not in your fleet");

  // The driver must be free for these dates.
  const clash = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.driverId, driverId),
        inArray(bookings.status, ["confirmed", "started"]),
        lte(bookings.startDate, b.endDate),
        gte(bookings.endDate, b.startDate),
        ne(bookings.id, b.id),
      ),
    );
  if (clash.length > 0)
    return jsonError(409, "This driver already has a trip on those dates");

  const [row] = await db
    .update(bookings)
    .set({ driverId })
    .where(eq(bookings.id, bookingId))
    .returning();

  return NextResponse.json({ booking: await bookingDTO(row) });
}
