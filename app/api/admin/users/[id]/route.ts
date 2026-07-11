import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Admin account controls: suspend/reactivate, or reset a user's password.
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) return jsonError(400, "Invalid user id");
  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) return jsonError(404, "User not found");
  if (u.role === "admin") return jsonError(403, "Admin accounts cannot be modified here");

  const set: Record<string, unknown> = {};
  if (typeof body.suspended === "boolean") set.suspended = body.suspended;
  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 6) return jsonError(400, "Password must be at least 6 characters");
    set.passwordHash = await bcrypt.hash(pw, 10);
  }
  if (Object.keys(set).length === 0) return jsonError(400, "Nothing to update");

  await db.update(users).set(set).where(eq(users.id, userId));
  return NextResponse.json({ ok: true, suspended: u.suspended });
}
