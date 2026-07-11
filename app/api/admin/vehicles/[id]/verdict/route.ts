import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { vehicles } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Admin approves or rejects a vehicle in the verification queue.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const { id } = await ctx.params;
  const vehicleId = Number(id);
  if (!Number.isInteger(vehicleId)) return jsonError(400, "Invalid vehicle id");
  const body = await req.json().catch(() => null);
  const approve = body?.approve === true;

  const db = await getDb();
  const [row] = await db
    .update(vehicles)
    .set({ verifyStatus: approve ? "approved" : "rejected" })
    .where(eq(vehicles.id, vehicleId))
    .returning();
  if (!row) return jsonError(404, "Vehicle not found");

  return NextResponse.json({ ok: true, verifyStatus: row.verifyStatus });
}
