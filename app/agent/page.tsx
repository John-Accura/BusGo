"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PayTag, StatusTag } from "@/components/ui";
import type { BookingDTO } from "@/lib/server/bookings";
import { fmtDate, fmtINR } from "@/lib/shared/fare";

interface Summary {
  profile: {
    name: string;
    agency: string | null;
    serviceType: string;
    serviceValue: number;
  };
  bookings: BookingDTO[];
  earnings: { earned: number; pending: number };
}

export default function AgentPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [charge, setCharge] = useState({ type: "percent", value: 5 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/summary");
      const d = await res.json();
      if (res.ok) {
        setS(d);
        setCharge({ type: d.profile.serviceType, value: d.profile.serviceValue });
      }
    } catch {
      // Empty/invalid body (dev-server restart, network blip) — retry shortly.
      setTimeout(load, 2500);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveCharge() {
    setBusy(true);
    await fetch("/api/agent/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType: charge.type, serviceValue: charge.value }),
    });
    setBusy(false);
    load();
  }

  if (!s)
    return (
      <>
        <TopNav active="/agent" />
        <div className="shell">
          <div className="row" style={{ marginTop: 30 }}>
            <div className="spinner" />
            <span className="muted">Loading agent desk…</span>
          </div>
        </div>
      </>
    );

  return (
    <>
      <TopNav active="/agent" />
      <div className="shell">
        <div className="eyebrow" style={{ marginTop: 8 }}>
          Travel agent / hotel module
        </div>
        <h1 className="page-title">{s.profile.agency ?? s.profile.name}</h1>
        <p className="lead small">
          Book on behalf of customers — your service charge is added to the fare, and
          owner-paid commissions are credited to you after trip completion.
        </p>

        <div className="grid3">
          <div className="stat-card">
            <div className="stat-value">{fmtINR(s.earnings.earned)}</div>
            <div className="stat-label">Commission earned</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtINR(s.earnings.pending)}</div>
            <div className="stat-label">Pending (active bookings)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{s.bookings.length}</div>
            <div className="stat-label">Bookings made</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="row wrap">
            <span className="small muted" style={{ flex: 1, minWidth: 160 }}>
              Your service charge (added to the customer&apos;s fare)
            </span>
            <select
              value={charge.type}
              onChange={(e) => setCharge({ ...charge, type: e.target.value })}
              style={{ width: "auto" }}
            >
              <option value="percent">% of base fare</option>
              <option value="fixed">Fixed ₹ per booking</option>
            </select>
            <input
              type="number"
              min={0}
              value={charge.value}
              onChange={(e) => setCharge({ ...charge, value: Number(e.target.value) })}
              style={{ width: 90 }}
            />
            <button className="btn btn-ghost btn-sm" onClick={saveCharge} disabled={busy}>
              Save
            </button>
            <Link href="/" className="btn btn-primary btn-sm">
              + Book for a customer
            </Link>
          </div>
        </div>

        <h3 style={{ margin: "24px 0 10px" }}>Your bookings</h3>
        {s.bookings.length === 0 && (
          <div className="banner banner-info">
            No bookings yet. Search for a vehicle and book on behalf of a customer —
            vehicles with owner-paid commission show a{" "}
            <span className="tag tag-accent">commission</span> badge.
          </div>
        )}
        {s.bookings.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Customer</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Fare</th>
                  <th>Your cut</th>
                </tr>
              </thead>
              <tbody>
                {s.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/bookings/${b.id}`}>{b.code}</Link>
                    </td>
                    <td className="small">{b.customer.name}</td>
                    <td className="small">{fmtDate(b.startDate)}</td>
                    <td>
                      <StatusTag status={b.status} />
                    </td>
                    <td>
                      <PayTag status={b.paymentStatus} />
                    </td>
                    <td>{fmtINR(b.fare.totalFare)}</td>
                    <td style={{ color: "var(--accent)" }}>
                      {fmtINR(b.fare.agentServiceCharge + b.fare.agentCommission)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
