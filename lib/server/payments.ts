import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, payments } from "@/lib/db/schema";
import type { BookingRow } from "@/lib/server/bookings";

// Razorpay activates when both keys are present; otherwise the platform runs
// in simulated (test) payment mode. The last 5%: paste real keys into env.
export function razorpayEnabled(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export async function createRazorpayOrder(
  amountInr: number,
  receipt: string,
): Promise<{ id: string; amount: number }> {
  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
  ).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: Math.round(amountInr * 100), // paise
      currency: "INR",
      receipt: receipt.slice(0, 40),
    }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status})`);
  return res.json();
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// What the payer owes right now: the advance first (tiered by lead time),
// then the balance.
export function dueNow(b: BookingRow): number {
  return b.amountPaid < b.advanceRequired
    ? b.advanceRequired - b.amountPaid
    : b.totalFare - b.amountPaid;
}

// Records a successful payment and moves the booking's payment state —
// shared by the simulated gateway and Razorpay verification so both follow
// exactly the same rules.
export async function recordDuePayment(
  b: BookingRow,
  payerId: number,
  method: string,
  note: string,
): Promise<BookingRow | null> {
  const due = dueNow(b);
  if (due <= 0) return null;

  const amountPaid = b.amountPaid + due;
  const paymentStatus =
    amountPaid >= b.totalFare
      ? "paid"
      : amountPaid >= b.advanceRequired
        ? "advance_paid"
        : "unpaid";

  const db = await getDb();
  await db.insert(payments).values({
    bookingId: b.id,
    payerId,
    amount: due,
    method,
    note,
  });
  const [row] = await db
    .update(bookings)
    .set({ amountPaid, paymentStatus })
    .where(eq(bookings.id, b.id))
    .returning();
  return row;
}
