import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentProfiles, bookings } from "@/lib/db/schema";
import { requireRole } from "@/lib/server/api";
import { bookingDTO } from "@/lib/server/bookings";

export async function GET() {
  const { session, error } = await requireRole("agent");
  if (error) return error;

  const db = await getDb();
  const [profile] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.userId, session.userId));

  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.agentId, session.userId))
    .orderBy(desc(bookings.id))
    .limit(100);

  let earned = 0;
  let pending = 0;
  for (const b of rows) {
    const cut = b.agentServiceCharge + b.agentCommission;
    if (b.status === "completed") earned += cut;
    else if (["requested", "confirmed", "started"].includes(b.status)) pending += cut;
  }

  return NextResponse.json({
    profile: {
      name: session.name,
      agency: profile?.agency ?? null,
      serviceType: profile?.serviceType ?? "percent",
      serviceValue: profile?.serviceValue ?? 0,
    },
    bookings: await Promise.all(rows.map(bookingDTO)),
    earnings: { earned, pending },
  });
}
