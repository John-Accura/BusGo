"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Me {
  name: string;
  role: string;
  home: string;
}

const LINKS: Record<string, [string, string][]> = {
  customer: [
    ["/", "Search"],
    ["/bookings", "My bookings"],
  ],
  agent: [
    ["/", "Search & book"],
    ["/agent", "Agent desk"],
  ],
  owner: [
    ["/owner", "Dashboard"],
    ["/owner/vehicles", "Fleet"],
    ["/owner/drivers", "Drivers"],
  ],
  driver: [["/driver", "My trips"]],
  admin: [["/admin", "Admin"]],
};

export default function TopNav({ active }: { active?: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.session))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  const links = me ? (LINKS[me.role] ?? []) : [];

  return (
    <nav className="topnav">
      <Link href={me?.home ?? "/"} className="logo">
        <span className="logo-icon">B</span>
        BusGo
      </Link>
      <span className="topnav-links">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={`navlink ${active === href ? "on" : ""}`}>
            {label}
          </Link>
        ))}
        {me === null && (
          <>
            <Link href="/login" className="navlink">
              Sign in
            </Link>
            <Link href="/register" className="navlink on">
              Register
            </Link>
          </>
        )}
        {me && (
          <>
            <Link href="/account" className={`navlink ${active === "/account" ? "on" : ""}`}>
              {me.name.split(" ")[0]} · {me.role}
            </Link>
            <button className="navlink" onClick={logout}>
              Logout
            </button>
          </>
        )}
      </span>
    </nav>
  );
}
