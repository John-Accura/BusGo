import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSessionToken, roleHome, type Role } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";
import { jsonError } from "@/lib/server/api";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp(req)}`, 15, 10 * 60 * 1000))
    return jsonError(429, "Too many sign-in attempts — try again in a few minutes");

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!rateLimit(`login:${email}`, 10, 10 * 60 * 1000))
    return jsonError(429, "Too many sign-in attempts — try again in a few minutes");

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    return jsonError(401, "Incorrect email or password");
  if (user.suspended) return jsonError(403, "This account has been suspended");

  const role = user.role as Role;
  const token = await createSessionToken({ userId: user.id, name: user.name, role });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, role, home: roleHome(role) });
}
