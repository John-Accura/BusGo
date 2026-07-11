import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookings, expenses } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

// Driver logs tolls / parking / fuel during an active trip (PRD §06).
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireRole("driver");
  if (error) return error;

  const { id } = await ctx.params;
  const bookingId = Number(id);
  if (!Number.isInteger(bookingId)) return jsonError(400, "Invalid booking id");
  const body = await req.json().catch(() => null);
  const etype = ["toll", "parking", "fuel", "other"].includes(body?.etype)
    ? body.etype
    : null;
  const amount = Number(body?.amount);
  if (!etype) return jsonError(400, "Pick an expense type");
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100000)
    return jsonError(400, "Enter a valid amount");

  const db = await getDb();
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.driverId !== session.userId) return jsonError(404, "Trip not found");
  if (b.status !== "started")
    return jsonError(409, "Expenses can be logged during an active trip");

  await db.insert(expenses).values({
    bookingId,
    driverId: session.userId,
    etype,
    amount,
    note: String(body?.note ?? "").slice(0, 200),
  });

  return NextResponse.json({ booking: await bookingDTO(b) });
}
