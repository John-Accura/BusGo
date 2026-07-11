import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";
import { recordDuePayment, verifyRazorpaySignature } from "@/lib/server/payments";

// Razorpay checkout callback: verify the HMAC signature server-side, then
// record the payment. Never trusts the client's word that a payment happened.
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
  const orderId = String(body?.razorpay_order_id ?? "");
  const paymentId = String(body?.razorpay_payment_id ?? "");
  const signature = String(body?.razorpay_signature ?? "");
  if (!orderId || !paymentId || !signature)
    return jsonError(400, "Missing payment confirmation fields");

  if (!verifyRazorpaySignature(orderId, paymentId, signature))
    return jsonError(400, "Payment signature verification failed");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || (b.customerId !== session.userId && b.agentId !== session.userId))
    return jsonError(404, "Booking not found");

  const row = await recordDuePayment(
    b,
    session.userId,
    "razorpay",
    `Razorpay ${paymentId}`,
  );
  if (!row) return jsonError(409, "This booking is already fully paid");

  return NextResponse.json({ booking: await bookingDTO(row) });
}
