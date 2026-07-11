"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PayTag, StatusTag } from "@/components/ui";
import type { BookingDTO } from "@/lib/server/bookings";
import { fmtDate, fmtINR } from "@/lib/shared/fare";

interface Dash {
  profile: {
    name: string;
    company: string | null;
    paysCommission: boolean;
    commissionType: string;
    commissionValue: number;
  };
  vehicles: { id: number; verifyStatus: string }[];
  drivers: { userId: number; name: string; licenseNo: string | null }[];
  bookings: BookingDTO[];
  earnings: { total: number; pending: number };
}

export default function OwnerDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [pickDriver, setPickDriver] = useState<Record<number, string>>({});
  const [commission, setCommission] = useState({ pays: false, type: "percent", value: 0 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/dashboard");
      const data = await res.json();
      if (res.ok) {
        setD(data);
        setCommission({
          pays: data.profile.paysCommission,
          type: data.profile.commissionType,
          value: data.profile.commissionValue,
        });
      }
    } catch {
      /* transient (dev restart / network) — the 8s poll retries */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // new requests appear live
    return () => clearInterval(t);
  }, [load]);

  async function act(bookingId: number, path: string, body?: unknown) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/bookings/${bookingId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Action failed");
      return;
    }
    load();
  }

  async function saveCommission() {
    setBusy(true);
    await fetch("/api/owner/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paysCommission: commission.pays,
        commissionType: commission.type,
        commissionValue: commission.value,
      }),
    });
    setBusy(false);
    load();
  }

  if (!d)
    return (
      <>
        <TopNav active="/owner" />
        <div className="shell">
          <div className="row" style={{ marginTop: 30 }}>
            <div className="spinner" />
            <span className="muted">Loading dashboard…</span>
          </div>
        </div>
      </>
    );

  const requests = d.bookings.filter((b) => b.status === "requested");
  const toAssign = d.bookings.filter((b) => b.status === "confirmed" && !b.driver);
  const active = d.bookings.filter((b) => ["confirmed", "started"].includes(b.status));

  return (
    <>
      <TopNav active="/owner" />
      <div className="shell">
        <div className="eyebrow" style={{ marginTop: 8 }}>
          Owner module
        </div>
        <h1 className="page-title">{d.profile.company ?? d.profile.name}</h1>

        <div className="grid4" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{fmtINR(d.earnings.total)}</div>
            <div className="stat-label">Settled earnings</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtINR(d.earnings.pending)}</div>
            <div className="stat-label">Upcoming payouts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{d.vehicles.length}</div>
            <div className="stat-label">Vehicles listed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{d.drivers.length}</div>
            <div className="stat-label">Fleet drivers</div>
          </div>
        </div>

        <div className="err">{err}</div>

        {requests.length > 0 && (
          <>
            <h3 style={{ margin: "20px 0 10px" }}>
              🔔 Booking requests ({requests.length})
            </h3>
            {requests.map((b) => (
              <div className="card" key={b.id}>
                <div className="row spread wrap">
                  <span>
                    {b.vehicle?.emoji} <strong>{b.vehicle?.name}</strong>
                    <span className="dim small"> · {b.code}</span>
                  </span>
                  <strong style={{ color: "var(--accent)" }}>
                    {fmtINR(b.fare.totalFare)}
                  </strong>
                </div>
                <p className="small muted" style={{ margin: "6px 0" }}>
                  {fmtDate(b.startDate)}
                  {b.endDate !== b.startDate && ` – ${fmtDate(b.endDate)}`} ·{" "}
                  {b.passengers} pax · {b.pickup.addr} → {b.drop.addr} · by{" "}
                  {b.agent ? `agent ${b.agent.agency ?? b.agent.name}` : b.customer.name}
                  {b.fare.agentCommission > 0 &&
                    ` · agent commission ${fmtINR(b.fare.agentCommission)}`}
                </p>
                <div className="row wrap">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => act(b.id, "confirm")}
                    disabled={busy}
                  >
                    Confirm
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => act(b.id, "decline", { reason: "Not available" })}
                    disabled={busy}
                  >
                    Decline
                  </button>
                  <Link href={`/bookings/${b.id}`} className="btn btn-ghost btn-sm">
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </>
        )}

        {toAssign.length > 0 && (
          <>
            <h3 style={{ margin: "20px 0 10px" }}>🧑‍✈️ Needs a driver</h3>
            {toAssign.map((b) => (
              <div className="card" key={b.id}>
                <div className="row spread wrap">
                  <span className="small">
                    {b.vehicle?.emoji} <strong>{b.vehicle?.name}</strong> ·{" "}
                    {fmtDate(b.startDate)} · {b.code}
                  </span>
                  <span className="row wrap">
                    <select
                      value={pickDriver[b.id] ?? ""}
                      onChange={(e) =>
                        setPickDriver({ ...pickDriver, [b.id]: e.target.value })
                      }
                      style={{ width: "auto" }}
                    >
                      <option value="">Pick driver…</option>
                      {d.drivers.map((dr) => (
                        <option key={dr.userId} value={dr.userId}>
                          {dr.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!pickDriver[b.id] || busy}
                      onClick={() =>
                        act(b.id, "assign-driver", {
                          driverId: Number(pickDriver[b.id]),
                        })
                      }
                    >
                      Assign
                    </button>
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        <h3 style={{ margin: "24px 0 10px" }}>Agent commission (PRD §3.5)</h3>
        <div className="card">
          <div className="row wrap">
            <button
              type="button"
              className={`switch ${commission.pays ? "on" : ""}`}
              onClick={() => setCommission({ ...commission, pays: !commission.pays })}
              aria-label="Pay agent commission"
            />
            <span className="small muted" style={{ flex: 1, minWidth: 160 }}>
              Pay commission to travel agents who bring bookings
            </span>
            {commission.pays && (
              <>
                <select
                  value={commission.type}
                  onChange={(e) => setCommission({ ...commission, type: e.target.value })}
                  style={{ width: "auto" }}
                >
                  <option value="percent">% of base fare</option>
                  <option value="fixed">Fixed ₹ per booking</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={commission.value}
                  onChange={(e) =>
                    setCommission({ ...commission, value: Number(e.target.value) })
                  }
                  style={{ width: 90 }}
                />
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={saveCommission} disabled={busy}>
              Save
            </button>
          </div>
        </div>

        <h3 style={{ margin: "24px 0 10px" }}>All bookings</h3>
        {d.bookings.length === 0 && (
          <div className="banner banner-info">
            No bookings yet. Once customers find your vehicles in search, requests
            appear here.
          </div>
        )}
        {d.bookings.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Vehicle</th>
                  <th>Dates</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Fare</th>
                </tr>
              </thead>
              <tbody>
                {d.bookings.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/bookings/${b.id}`}>{b.code}</Link>
                    </td>
                    <td>{b.vehicle?.name}</td>
                    <td className="small">
                      {fmtDate(b.startDate)}
                      {b.endDate !== b.startDate && ` – ${fmtDate(b.endDate)}`}
                    </td>
                    <td className="small">
                      {b.pickup.addr.split(",")[0]} → {b.drop.addr.split(",")[0]}
                    </td>
                    <td>
                      <StatusTag status={b.status} />
                    </td>
                    <td>
                      <PayTag status={b.paymentStatus} />
                    </td>
                    <td>{fmtINR(b.fare.totalFare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {active.length === 0 && requests.length === 0 && (
          <p className="dim small" style={{ marginTop: 16 }}>
            Tip: keep your vehicles&apos; documents valid — expired documents remove a
            vehicle from search automatically.
          </p>
        )}
      </div>
    </>
  );
}
