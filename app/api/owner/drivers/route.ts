import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { driverProfiles, users } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Owner adds a driver to their fleet — this creates the driver's login.
export async function POST(req: NextRequest) {
  const { session, error } = await requireRole("owner");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const licenseNo = String(body.licenseNo ?? "").trim();
  const experienceYears = Number(body.experienceYears) || 3;

  if (name.length < 2) return jsonError(400, "Enter the driver's name");
  if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError(400, "Enter a valid email");
  if (password.length < 6) return jsonError(400, "Password must be at least 6 characters");
  if (licenseNo.length < 5) return jsonError(400, "Enter the driving license number");

  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return jsonError(409, "An account with this email already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(users)
    .values({ name, email, phone: phone || null, passwordHash, role: "driver" })
    .returning();
  await db.insert(driverProfiles).values({
    userId: user.id,
    ownerId: session.userId,
    licenseNo,
    experienceYears: Math.max(0, Math.round(experienceYears)),
  });

  return NextResponse.json({ ok: true, driverId: user.id });
}
