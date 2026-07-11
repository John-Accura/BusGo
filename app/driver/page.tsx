"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PayTag, StatusTag } from "@/components/ui";
import type { BookingDTO } from "@/lib/server/bookings";
import { fmtDate, fmtINR, fmtKm, TRIP_TYPES } from "@/lib/shared/fare";

export default function DriverPage() {
  const [list, setList] = useState<BookingDTO[] | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/bookings")
        .then((r) => r.json())
        .then((d) => setList(d.bookings ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const active = list?.filter((b) => ["confirmed", "started"].includes(b.status)) ?? [];
  const past = list?.filter((b) => !["confirmed", "started"].includes(b.status)) ?? [];

  return (
    <>
      <TopNav active="/driver" />
      <div className="shell shell-narrow">
        <div className="eyebrow" style={{ marginTop: 8 }}>
          Driver module
        </div>
        <h1 className="page-title">Your trips</h1>
        <p className="lead small">
          Start each trip with the odometer reading, log tolls and parking as you go,
          and close it out with the final reading. Your GPS position streams to the
          customer while the trip runs.
        </p>

        {list === null && (
          <div className="row">
            <div className="spinner" />
            <span className="muted">Loading trips…</span>
          </div>
        )}

        {list !== null && active.length === 0 && (
          <div className="banner banner-info">
            No assigned trips right now — your fleet owner assigns you to confirmed
            bookings.
          </div>
        )}

        {active.map((b) => (
          <Link
            key={b.id}
            href={`/bookings/${b.id}`}
            className="card card-hover"
            style={{ display: "block", marginTop: 12, color: "var(--text)" }}
          >
            <div className="row spread wrap">
              <strong style={{ fontFamily: "Syne" }}>
                {b.vehicle?.emoji} {b.vehicle?.name}
              </strong>
              <span className="row" style={{ gap: 6 }}>
                <StatusTag status={b.status} />
                <PayTag status={b.paymentStatus} />
              </span>
            </div>
            <p className="small muted" style={{ margin: "8px 0 4px" }}>
              {TRIP_TYPES[b.tripType]} · {fmtDate(b.startDate)}
              {b.endDate !== b.startDate && ` – ${fmtDate(b.endDate)}`} ·{" "}
              {fmtKm(b.distanceKm)} · {b.passengers} pax
            </p>
            <p className="small" style={{ margin: 0 }}>
              {b.pickup.addr} → {b.drop.addr}
            </p>
            <p className="dim small" style={{ margin: "6px 0 0" }}>
              Customer: {b.customer.name}
              {b.customer.phone && ` · ${b.customer.phone}`} · bata included:{" "}
              {fmtINR(b.fare.driverBata)}
            </p>
          </Link>
        ))}

        {past.length > 0 && (
          <>
            <h3 style={{ margin: "24px 0 8px" }}>Past trips</h3>
            {past.map((b) => (
              <Link
                key={b.id}
                href={`/bookings/${b.id}`}
                className="card card-hover row spread wrap"
                style={{ marginTop: 8, color: "var(--text)" }}
              >
                <span className="small">
                  {b.vehicle?.emoji} {b.code} · {fmtDate(b.startDate)} ·{" "}
                  {b.pickup.addr.split(",")[0]} → {b.drop.addr.split(",")[0]}
                </span>
                <StatusTag status={b.status} />
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  );
}
