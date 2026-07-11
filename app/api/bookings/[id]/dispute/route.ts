import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, disputes } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// File a dispute on a completed/cancelled booking (goes to the admin center).
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
  const message = String(body?.message ?? "").trim();
  if (message.length < 5) return jsonError(400, "Describe the issue");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || (b.customerId !== session.userId && b.agentId !== session.userId))
    return jsonError(404, "Booking not found");
  if (!["completed", "cancelled", "started"].includes(b.status))
    return jsonError(409, "Disputes can be filed once the trip has run");

  const [existing] = await db
    .select()
    .from(disputes)
    .where(eq(disputes.bookingId, bookingId));
  if (existing) return jsonError(409, "A dispute is already open for this booking");

  await db.insert(disputes).values({
    bookingId,
    raisedBy: session.userId,
    message: message.slice(0, 1000),
  });

  return NextResponse.json({ booking: await bookingDTO(b) });
}
