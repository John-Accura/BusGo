import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, vehicles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Customer/agent rates a completed trip; feeds the vehicle's average rating.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("customer", "agent");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");
  const body = await req.json().catch(() => null);
  const rating = Number(body?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return jsonError(400, "Rating must be 1-5 stars");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || (b.customerId !== session.userId && b.agentId !== session.userId))
    return jsonError(404, "Booking not found");

  const [row] = await db
    .update(bookings)
    .set({ rating, ratingComment: String(body?.comment ?? "").slice(0, 500) || null })
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bookings.status, "completed"),
        isNull(bookings.rating),
      ),
    )
    .returning();
  if (!row) return jsonError(409, "This booking cannot be rated");

  await db
    .update(vehicles)
    .set({
      ratingSum: sql`${vehicles.ratingSum} + ${rating}`,
      ratingCount: sql`${vehicles.ratingCount} + 1`,
    })
    .where(eq(vehicles.id, b.vehicleId));

  return NextResponse.json({ booking: await bookingDTO(row) });
}
