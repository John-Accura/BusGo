import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";
import {
  createRazorpayOrder,
  dueNow,
  razorpayEnabled,
  razorpayKeyId,
  recordDuePayment,
} from "@/lib/server/payments";

// Start a payment. With Razorpay keys configured this creates a gateway
// order for the client checkout; otherwise it settles instantly in
// simulated (test) mode. The server decides what is due: the tiered advance
// first (PRD §4.1 Step 4), then the balance.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("customer", "agent");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");
  const body = await req.json().catch(() => ({}));
  const method = ["upi", "card", "netbanking", "wallet"].includes(body?.method)
    ? body.method
    : "upi";

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || (b.customerId !== session.userId && b.agentId !== session.userId))
    return jsonError(404, "Booking not found");
  if (b.status !== "confirmed" && b.status !== "started")
    return jsonError(409, "Payment opens once the owner confirms the booking");

  const due = dueNow(b);
  if (due <= 0) return jsonError(409, "This booking is already fully paid");

  if (razorpayEnabled()) {
    try {
      const order = await createRazorpayOrder(due, b.code);
      return NextResponse.json({
        gateway: "razorpay",
        keyId: razorpayKeyId(),
        orderId: order.id,
        amountPaise: order.amount,
        amount: due,
      });
    } catch {
      return jsonError(502, "Payment gateway is unreachable — try again shortly");
    }
  }

  // Simulated gateway (test mode).
  const row = await recordDuePayment(
    b,
    session.userId,
    method,
    b.amountPaid < b.advanceRequired
      ? `Advance payment (${Math.round((b.advanceRequired / b.totalFare) * 100)}%) — test mode`
      : "Balance payment — test mode",
  );
  if (!row) return jsonError(409, "This booking is already fully paid");
  return NextResponse.json({ gateway: "simulated", booking: await bookingDTO(row) });
}
