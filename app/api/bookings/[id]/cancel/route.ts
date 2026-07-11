import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, payments } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Customer/agent cancels before the trip starts. Anything already paid is
// refunded in full (simulated refund entry).
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("customer", "agent");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || (b.customerId !== session.userId && b.agentId !== session.userId))
    return jsonError(404, "Booking not found");

  const [row] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      paymentStatus: b.amountPaid > 0 ? "refunded" : b.paymentStatus,
    })
    .where(
      and(
        eq(bookings.id, bookingId),
        inArray(bookings.status, ["requested", "confirmed"]),
      ),
    )
    .returning();
  if (!row) return jsonError(409, "This booking can no longer be cancelled");

  if (b.amountPaid > 0) {
    await db.insert(payments).values({
      bookingId: b.id,
      payerId: session.userId,
      amount: -b.amountPaid,
      method: "refund",
      note: "Full refund on cancellation",
    });
  }

  return NextResponse.json({ booking: await bookingDTO(row) });
}
