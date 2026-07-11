import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getSession, type Session } from "@/lib/auth";
import type { Role } from "@/lib/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// Returns the session, or a ready-to-return error response. Pass no roles to
// accept any signed-in user. Checks the account still exists and is not
// suspended, so an admin suspension takes effect immediately — not only at
// the next sign-in.
export async function requireRole(
  ...roles: Role[]
): Promise<
  | { session: Session; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = await getSession();
  if (!session) return { error: jsonError(401, "Not signed in") };
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!u) return { error: jsonError(401, "Account no longer exists") };
  if (u.suspended) return { error: jsonError(403, "This account has been suspended") };
  if (roles.length > 0 && !roles.includes(session.role))
    return {
      error: jsonError(403, `This action requires a ${roles.join(" or ")} account`),
    };
  return { session };
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function isValidDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}
