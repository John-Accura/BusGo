import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

// Uptime probe: confirms the app responds and the database is reachable.
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        db: false,
        // Boolean only — helps distinguish "no DATABASE_URL configured" from
        // "configured but unreachable" without exposing anything sensitive.
        databaseUrlConfigured: !!process.env.DATABASE_URL,
        time: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
