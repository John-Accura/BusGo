import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  agentProfiles,
  bookings,
  driverProfiles,
  ownerProfiles,
  users,
  vehicles,
} from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";
import { iso } from "@/lib/server/bookings";
import { fmtINR, settlementSplit } from "@/lib/shared/fare";

// Full user directory for the admin: every account with role-specific
// details and activity, ready to render.
export async function GET() {
  const { error } = await requireRole("admin");
  if (error) return error;

  const db = await getDb();
  const allUsers = await db.select().from(users);
  const ownerRows = await db.select().from(ownerProfiles);
  const agentRows = await db.select().from(agentProfiles);
  const driverRows = await db.select().from(driverProfiles);
  const vehicleRows = await db.select().from(vehicles);
  const bookingRows = await db.select().from(bookings);

  const ownerByUser = new Map(ownerRows.map((p) => [p.userId, p]));
  const agentByUser = new Map(agentRows.map((p) => [p.userId, p]));
  const driverByUser = new Map(driverRows.map((p) => [p.userId, p]));
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  const list = allUsers
    .filter((u) => u.role !== "admin")
    .map((u) => {
      const details: [string, string][] = [];
      let mine = bookingRows.filter((b) => b.customerId === u.id);

      if (u.role === "owner") {
        const p = ownerByUser.get(u.id);
        mine = bookingRows.filter((b) => b.ownerId === u.id);
        const fleet = vehicleRows.filter((v) => v.ownerId === u.id);
        const earnings = mine
          .filter((b) => b.status === "completed")
          .reduce((s, b) => s + settlementSplit(b).ownerPayout, 0);
        if (p?.company) details.push(["Company", p.company]);
        if (p?.city) details.push(["City", p.city]);
        if (p?.gstNo) details.push(["GST", p.gstNo]);
        details.push([
          "Agent commission",
          p?.paysCommission
            ? p.commissionType === "percent"
              ? `${p.commissionValue}% of base`
              : `${fmtINR(p.commissionValue)}/booking`
            : "not offered",
        ]);
        details.push(["Vehicles", String(fleet.length)]);
        details.push(["Earnings settled", fmtINR(earnings)]);
      } else if (u.role === "agent") {
        const p = agentByUser.get(u.id);
        mine = bookingRows.filter((b) => b.agentId === u.id);
        const earned = mine
          .filter((b) => b.status === "completed")
          .reduce((s, b) => s + b.agentServiceCharge + b.agentCommission, 0);
        if (p?.agency) details.push(["Agency", p.agency]);
        if (p?.gstNo) details.push(["GST", p.gstNo]);
        details.push([
          "Service charge",
          p?.serviceType === "fixed"
            ? `${fmtINR(p?.serviceValue ?? 0)}/booking`
            : `${p?.serviceValue ?? 0}% of base`,
        ]);
        details.push(["Commission earned", fmtINR(earned)]);
      } else if (u.role === "driver") {
        const p = driverByUser.get(u.id);
        mine = bookingRows.filter((b) => b.driverId === u.id);
        const done = mine.filter((b) => b.status === "completed");
        const bata = done.reduce((s, b) => s + b.driverBata, 0);
        const fleetOwner = p ? userById.get(p.ownerId) : null;
        const fleetCompany = p ? ownerByUser.get(p.ownerId)?.company : null;
        if (p?.licenseNo) details.push(["License", p.licenseNo]);
        details.push(["Experience", `${p?.experienceYears ?? 0} yrs`]);
        details.push(["Fleet", fleetCompany ?? fleetOwner?.name ?? "—"]);
        details.push(["Trips completed", String(done.length)]);
        details.push(["Bata earned", fmtINR(bata)]);
      }

      details.push(["Bookings", String(mine.length)]);

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        suspended: u.suspended,
        joined: iso(u.createdAt),
        details,
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.id - b.id);

  return NextResponse.json({ users: list });
}

// Admin creates an owner, agent or driver account directly.
export async function POST(req: NextRequest) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "Invalid request body");

  const role = String(body.role ?? "");
  if (!["owner", "agent", "driver"].includes(role))
    return jsonError(400, "Role must be owner, agent or driver");

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");

  if (name.length < 2) return jsonError(400, "Enter the person's name");
  if (!/^\S+@\S+\.\S+$/.test(email)) return jsonError(400, "Enter a valid email");
  if (password.length < 6) return jsonError(400, "Password must be at least 6 characters");

  const db = await getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return jsonError(409, "An account with this email already exists");

  let driverOwnerId = 0;
  if (role === "driver") {
    driverOwnerId = Number(body.ownerId);
    if (!Number.isInteger(driverOwnerId))
      return jsonError(400, "Pick the fleet owner this driver belongs to");
    const [owner] = await db.select().from(users).where(eq(users.id, driverOwnerId));
    if (!owner || owner.role !== "owner")
      return jsonError(404, "That user is not a vehicle owner");
  }

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
      serviceValue: Math.min(100000, Math.max(0, Math.round(Number(body.serviceValue) || 5))),
    });
  } else {
    await db.insert(driverProfiles).values({
      userId: user.id,
      ownerId: driverOwnerId,
      licenseNo: String(body.licenseNo ?? "").trim() || null,
      experienceYears: Math.max(0, Math.round(Number(body.experienceYears) || 3)),
    });
  }

  return NextResponse.json({ ok: true, id: user.id });
}
