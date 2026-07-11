import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ownerProfiles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Owner's agent-commission settings (PRD §3.5).
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const set: Record<string, unknown> = {};
  if (typeof body.paysCommission === "boolean") set.paysCommission = body.paysCommission;
  if (["fixed", "percent"].includes(body.commissionType))
    set.commissionType = body.commissionType;
  if (body.commissionValue !== undefined) {
    const n = Number(body.commissionValue);
    if (!Number.isFinite(n) || n < 0 || n > 100000)
      return jsonError(400, "Invalid commission value");
    set.commissionValue = Math.round(n);
  }
  if (Object.keys(set).length === 0) return jsonError(400, "Nothing to update");

  const db = await getDb();
  await db
    .update(ownerProfiles)
    .set(set)
    .where(eq(ownerProfiles.userId, session.userId));
  return NextResponse.json({ ok: true });
}
