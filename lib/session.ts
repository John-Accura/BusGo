// JWT session helpers. No next/headers imports so edge middleware can use it.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "busgo_session";

const secret = () =>
  new TextEncoder().encode(
    process.env.AUTH_SECRET || "busgo-dev-secret-change-in-production",
  );

export type Role = "customer" | "owner" | "agent" | "driver" | "admin";

export const ROLES: Role[] = ["customer", "owner", "agent", "driver", "admin"];

export interface Session {
  userId: number;
  name: string;
  role: Role;
}

export async function createSessionToken(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.userId !== "number") return null;
    const role = ROLES.includes(payload.role as Role)
      ? (payload.role as Role)
      : "customer";
    return { userId: payload.userId, name: String(payload.name ?? ""), role };
  } catch {
    return null;
  }
}

export function roleHome(role: Role): string {
  switch (role) {
    case "owner":
      return "/owner";
    case "agent":
      return "/agent";
    case "driver":
      return "/driver";
    case "admin":
      return "/admin";
    default:
      return "/";
  }
}
