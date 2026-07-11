"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PayTag, StatusTag } from "@/components/ui";
import type { BookingDTO } from "@/lib/server/bookings";
import { fmtDate, fmtINR, TRIP_TYPES } from "@/lib/shared/fare";

export default function BookingsPage() {
  const [list, setList] = useState<BookingDTO[] | null>(null);
  const [role, setRole] = useState("customer");

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => {
        setList(d.bookings ?? []);
        setRole(d.role ?? "customer");
      })
      .catch(() => setList([]));
  }, []);

  return (
    <>
      <TopNav active="/bookings" />
      <div className="shell shell-narrow">
        <div className="eyebrow" style={{ marginTop: 10 }}>
          {role === "driver" ? "Assigned trips" : "Bookings"}
        </div>
        <h1 className="page-title">Your bookings</h1>

        {list === null && (
          <div className="row" style={{ marginTop: 20 }}>
            <div className="spinner" />
            <span className="muted">Loading…</span>
          </div>
        )}

        {list?.length === 0 && (
          <div className="banner banner-info" style={{ marginTop: 20 }}>
            No bookings yet. <Link href="/">Search for a vehicle</Link> to get started.
          </div>
        )}

        {list?.map((b) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            className="card card-hover"
            style={{ display: "block", marginTop: 12, color: "var(--text)" }}
          >
            <div className="row spread wrap">
              <span className="row">
                <span style={{ fontSize: "1.4rem" }}>{b.vehicle?.emoji}</span>
                <span>
                  <strong style={{ fontFamily: "Syne" }}>{b.vehicle?.name}</strong>
                  <span className="dim small"> · {b.code}</span>
                </span>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <StatusTag status={b.status} />
                <PayTag status={b.paymentStatus} />
              </span>
            </div>
            <p className="small muted" style={{ margin: "8px 0 4px" }}>
              {TRIP_TYPES[b.tripType]} · {fmtDate(b.startDate)}
              {b.endDate !== b.startDate && ` – ${fmtDate(b.endDate)}`} · {b.passengers}{" "}
              pax · {b.pickup.addr} → {b.drop.addr}
            </p>
            <div className="row spread">
              <span className="dim small">{b.customer.name}</span>
              <strong style={{ color: "var(--accent)" }}>{fmtINR(b.fare.totalFare)}</strong>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
