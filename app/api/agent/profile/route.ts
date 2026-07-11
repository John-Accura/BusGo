import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentProfiles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Agent's own service-charge configuration.
export async function PATCH(req: NextRequest) {
  const { session, error } = await requireRole("agent");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const set: Record<string, unknown> = {};
  if (["fixed", "percent"].includes(body.serviceType)) set.serviceType = body.serviceType;
  if (body.serviceValue !== undefined) {
    const n = Number(body.serviceValue);
    if (!Number.isFinite(n) || n < 0 || n > 100000)
      return jsonError(400, "Invalid service charge");
    set.serviceValue = Math.round(n);
  }
  if (Object.keys(set).length === 0) return jsonError(400, "Nothing to update");

  const db = await getDb();
  await db
    .update(agentProfiles)
    .set(set)
    .where(eq(agentProfiles.userId, session.userId));
  return NextResponse.json({ ok: true });
}
