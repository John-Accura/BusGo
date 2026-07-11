import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { disputes } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Admin resolves a dispute with a resolution note.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const { id } = await ctx.params;
  const disputeId = Number(id);
  if (!Number.isInteger(disputeId)) return jsonError(400, "Invalid dispute id");
  const body = await req.json().catch(() => null);
  const resolution = String(body?.resolution ?? "").trim();
  if (resolution.length < 3) return jsonError(400, "Enter a resolution note");

  const db = await getDb();
  const [row] = await db
    .update(disputes)
    .set({ status: "resolved", resolution: resolution.slice(0, 1000), resolvedAt: new Date() })
    .where(and(eq(disputes.id, disputeId), eq(disputes.status, "open")))
    .returning();
  if (!row) return jsonError(409, "Dispute not found or already resolved");

  return NextResponse.json({ ok: true });
}
