import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO, canViewBooking } from "@/lib/server/bookings";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole();
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");

  const db = await getDb();
  const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!row) return jsonError(404, "Booking not found");
  if (!canViewBooking(session, row)) return jsonError(403, "This is not your booking");

  return NextResponse.json({ booking: await bookingDTO(row), viewerRole: session.role });
}
