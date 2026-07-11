import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Any signed-in user changes their own password (current password required).
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (next.length < 6)
    return jsonError(400, "New password must be at least 6 characters");

  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!u || !(await bcrypt.compare(current, u.passwordHash)))
    return jsonError(401, "Current password is incorrect");

  const passwordHash = await bcrypt.hash(next, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, session.userId));
  return NextResponse.json({ ok: true });
}
