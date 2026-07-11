import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { stateTaxes } from "@/lib/db/schema";
import { jsonError, requireRole } from "@/lib/server/api";

// Admin upserts a state entry-tax rate (PRD §08 inter-state tax handling).
export async function PUT(req: NextRequest) {
  const { error } = await requireRole("admin");
  if (error) return error;

  const body = await req.json().catch(() => null);
  const state = String(body?.state ?? "").trim();
  const entryTax = Number(body?.entryTax);
  const perPassenger = Number(body?.perPassenger ?? 0);
  if (state.length < 2) return jsonError(400, "Enter the state name");
  if (!Number.isInteger(entryTax) || entryTax < 0 || entryTax > 100000)
    return jsonError(400, "Enter a valid entry tax amount");
  if (!Number.isInteger(perPassenger) || perPassenger < 0 || perPassenger > 10000)
    return jsonError(400, "Enter a valid per-passenger amount");

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(stateTaxes)
    .where(eq(stateTaxes.state, state));
  if (existing) {
    await db
      .update(stateTaxes)
      .set({ entryTax, perPassenger })
      .where(eq(stateTaxes.state, state));
  } else {
    await db.insert(stateTaxes).values({ state, entryTax, perPassenger });
  }

  const all = await db.select().from(stateTaxes);
  return NextResponse.json({
    taxes: all.sort((a, b) => a.state.localeCompare(b.state)),
  });
}
