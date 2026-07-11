import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, roleHome, type Role } from "@/lib/session";

// Path prefix → role that owns it. /bookings is shared by every signed-in role.
const ROLE_AREAS: [string, Role][] = [
  ["/owner", "owner"],
  ["/agent", "agent"],
  ["/driver", "driver"],
  ["/admin", "admin"],
];

const AUTH_PAGES = ["/login", "/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const needsAuth =
    pathname.startsWith("/bookings") ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/account") ||
    ROLE_AREAS.some(([p]) => pathname === p || pathname.startsWith(p + "/"));

  if (needsAuth && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (session) {
    for (const [prefix, role] of ROLE_AREAS) {
      if (
        (pathname === prefix || pathname.startsWith(prefix + "/")) &&
        session.role !== role
      ) {
        return NextResponse.redirect(new URL(roleHome(session.role), req.url));
      }
    }
    // Booking creation is for customers and agents only.
    if (pathname.startsWith("/book/") && !["customer", "agent"].includes(session.role)) {
      return NextResponse.redirect(new URL(roleHome(session.role), req.url));
    }
    if (AUTH_PAGES.includes(pathname)) {
      return NextResponse.redirect(new URL(roleHome(session.role), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/owner/:path*",
    "/agent/:path*",
    "/driver/:path*",
    "/admin/:path*",
    "/bookings/:path*",
    "/book/:path*",
    "/account/:path*",
    "/login",
    "/register",
  ],
};
