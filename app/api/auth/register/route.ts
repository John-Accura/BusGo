import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { agentProfiles, ownerProfiles, users } from "@/lib/db/schema";
import { createSessionToken, roleHome } from "@/lib/session";
import { setSessionCookie } from "@/lib/auth";
import { jsonError } from "@/lib/server/api";
import { clientIp, rateLimit } from "@/lib/server/ratelimit";

// Self-service registration for customers, owners and agents.
// Driver accounts are created by owners; the admin account is seeded.
export async function POST(req: NextRequest) {
  if (!rateLimit(`register:${clientIp(req)}`, 8, 10 * 60 * 1000))
    return jsonError(429, "Too many registrations from this address — try again later");

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const role = ["customer", "owner", "agent"].includes(body.role)
    ? (body.role as "customer" | "owner" | "agent")
    : "customer";

  if (name.length < 2) return jsonError(400, "Please enter your name");
  if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError(400, "Please enter a valid email");
  if (password.length < 6) return jsonError(400, "Password must be at least 6 characters");

  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return jsonError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ name, email, phone: phone || null, passwordHash, role })
    .returning();

  if (role === "owner") {
    await db.insert(ownerProfiles).values({
      userId: user.id,
      company: String(body.company ?? "").trim() || null,
      city: String(body.city ?? "").trim() || null,
      gstNo: String(body.gstNo ?? "").trim() || null,
    });
  } else if (role === "agent") {
    await db.insert(agentProfiles).values({
      userId: user.id,
      agency: String(body.agency ?? "").trim() || name,
      gstNo: String(body.gstNo ?? "").trim() || null,
    });
  }

  const token = await createSessionToken({ userId: user.id, name: user.name, role });
  await setSessionCookie(token);
  return NextResponse.json({ ok: true, role, home: roleHome(role) });
}
