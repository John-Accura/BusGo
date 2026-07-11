import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Owner declines a booking request.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");
  const body = await req.json().catch(() => ({}));

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.ownerId !== session.userId) return jsonError(404, "Booking not found");

  const [row] = await db
    .update(bookings)
    .set({
      status: "declined",
      declineReason: String(body?.reason ?? "").slice(0, 300) || null,
    })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "requested")))
    .returning();
  if (!row) return jsonError(409, "Only requested bookings can be declined");

  return NextResponse.json({ booking: await bookingDTO(row) });
}
