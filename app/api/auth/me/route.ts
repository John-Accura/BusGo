import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { roleHome } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    session: session
      ? { name: session.name, role: session.role, home: roleHome(session.role) }
      : null,
  });
}
