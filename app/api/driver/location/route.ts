import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { driverProfiles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Driver location heartbeat — surfaces on the customer's live-tracking map.
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("driver");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180)
    return jsonError(400, "Invalid coordinates");

  const db = await getDb();
  await db
    .update(driverProfiles)
    .set({ currentLat: lat, currentLng: lng, locationAt: new Date() })
    .where(eq(driverProfiles.userId, session.userId));

  return NextResponse.json({ ok: true });
}
