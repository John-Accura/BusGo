"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import TopNav from "@/components/TopNav";
import { FareLines, PayTag, StatusTag } from "@/components/ui";
import type { MapMarker } from "@/components/MapView";
import { fetchRoute } from "@/lib/client/geo";
import type { BookingDTO } from "@/lib/server/bookings";
import { fmtDate, fmtINR, fmtKm, TRIP_TYPES } from "@/lib/shared/fare";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const ACTIVE = ["requested", "confirmed", "started"];

// Razorpay's checkout script, loaded on demand the first time it's needed.
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const EXPENSE_TYPES = [
  ["toll", "Toll"],
  ["parking", "Parking"],
  ["fuel", "Fuel"],
  ["other", "Other"],
] as const;

interface OwnerDriver {
  userId: number;
  name: string;
  licenseNo: string | null;
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<BookingDTO | null>(null);
  const [viewerRole, setViewerRole] = useState("");
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [ownerDrivers, setOwnerDrivers] = useState<OwnerDriver[]>([]);
  const [pickDriver, setPickDriver] = useState("");
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState("upi");
  const [odometer, setOdometer] = useState("");
  const [expType, setExpType] = useState("toll");
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [disputeMsg, setDisputeMsg] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${id}`);
      const d = await res.json();
      if (res.ok) {
        setB(d.booking);
        setViewerRole(d.viewerRole);
      } else setErr(d.error ?? "Not found");
    } catch {
      /* retry next poll */
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates while the booking is in motion.
  const status = b?.status;
  useEffect(() => {
    if (!status || !ACTIVE.includes(status)) return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [status, load]);

  // Route line for the map.
  const routeKey = b ? `${b.id}` : "";
  useEffect(() => {
    if (!b) return;
    const pts = [b.pickup, ...b.stops, b.drop].filter(
      (p) => p.lat != null && p.lng != null,
    ) as { lat: number; lng: number }[];
    if (b.tripType === "round_trip") pts.push(pts[0]);
    let alive = true;
    fetchRoute(pts).then((r) => {
      if (alive && r) setRoute(r.coords);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  // Driver on an active trip: share GPS position (heartbeat every ~5s).
  const isAssignedDriver = viewerRole === "driver" && b?.status === "started";
  const lastSent = useRef(0);
  useEffect(() => {
    if (!isAssignedDriver) return;
    const geo = navigator.geolocation;
    const watchId = geo?.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 5000) return;
        lastSent.current = now;
        fetch("/api/driver/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true },
    );
    return () => {
      if (geo && watchId !== undefined) geo.clearWatch(watchId);
    };
  }, [isAssignedDriver]);

  // Owner needs their driver list to assign.
  const needDrivers = viewerRole === "owner" && b?.status === "confirmed" && !b.driver;
  useEffect(() => {
    if (!needDrivers) return;
    fetch("/api/owner/dashboard")
      .then((r) => r.json())
      .then((d) => setOwnerDrivers(d.drivers ?? []))
      .catch(() => {});
  }, [needDrivers]);

  async function payNow() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/bookings/${id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: payMethod }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Payment failed");
        return;
      }
      if (d.gateway === "razorpay") {
        if (!(await loadRazorpay())) {
          setErr("Could not load the payment gateway — check your connection");
          return;
        }
        setShowPay(false);
        const Razorpay = (window as unknown as { Razorpay: new (o: object) => { open: () => void } })
          .Razorpay;
        new Razorpay({
          key: d.keyId,
          order_id: d.orderId,
          amount: d.amountPaise,
          currency: "INR",
          name: "BusGo",
          description: `Booking ${b?.code ?? ""}`,
          handler: async (resp: Record<string, string>) => {
            const v = await fetch(`/api/bookings/${id}/pay/verify`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(resp),
            });
            const vd = await v.json().catch(() => ({}));
            if (v.ok && vd.booking) setB(vd.booking);
            else setErr(vd.error ?? "Payment verification failed");
          },
        }).open();
      } else if (d.booking) {
        setB(d.booking);
        setShowPay(false);
      }
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/bookings/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Action failed");
        return false;
      }
      if (d.booking) setB(d.booking);
      else await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (!b)
    return (
      <>
        <TopNav />
        <div className="shell shell-narrow">
          {err ? (
            <div className="banner banner-warn" style={{ marginTop: 30 }}>
              {err}
            </div>
          ) : (
            <div className="row" style={{ marginTop: 30 }}>
              <div className="spinner" />
              <span className="muted">Loading booking…</span>
            </div>
          )}
        </div>
      </>
    );

  const isBooker = viewerRole === "customer" || viewerRole === "agent";
  const canPay =
    isBooker && ["confirmed", "started"].includes(b.status) && b.balanceDue > 0;
  const payAmount =
    b.amountPaid < b.advanceRequired ? b.advanceRequired - b.amountPaid : b.balanceDue;
  const payLabel =
    b.amountPaid < b.advanceRequired
      ? `Pay advance ${fmtINR(payAmount)}`
      : `Pay balance ${fmtINR(payAmount)}`;

  const steps: [string, boolean][] = [
    ["Requested", true],
    ["Owner confirmed", !!b.confirmedAt || ["started", "completed"].includes(b.status)],
    ["Paid", b.paymentStatus === "paid"],
    ["Driver assigned", !!b.driver],
    ["Trip started", ["started", "completed"].includes(b.status)],
    ["Completed", b.status === "completed"],
  ];

  const markers: MapMarker[] = [];
  if (b.pickup.lat != null)
    markers.push({ id: "p", kind: "pickup", lat: b.pickup.lat, lng: b.pickup.lng! });
  b.stops.forEach((s, i) =>
    markers.push({ id: `s${i}`, kind: "stop", lat: s.lat, lng: s.lng }),
  );
  if (b.drop.lat != null)
    markers.push({ id: "d", kind: "drop", lat: b.drop.lat, lng: b.drop.lng! });
  if (b.status === "started" && b.driver?.lat != null && b.driver?.lng != null)
    markers.push({ id: "drv", kind: "driver", lat: b.driver.lat, lng: b.driver.lng });

  const expensesTotal = b.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <TopNav active="/bookings" />
      <div className="shell">
        <div className="row spread wrap" style={{ marginBottom: 4 }}>
          <div>
            <div className="eyebrow">Booking {b.code}</div>
            <h1 className="page-title">
              {b.vehicle?.emoji} {b.vehicle?.name}
            </h1>
          </div>
          <span className="row" style={{ gap: 6 }}>
            <StatusTag status={b.status} />
            <PayTag status={b.paymentStatus} />
          </span>
        </div>

        <div className="timeline">
          {steps.map(([label, done], i) => (
            <span key={label} className="row" style={{ gap: 0 }}>
              {i > 0 && <span className="tl-arrow">→</span>}
              <span className={`tl-step ${done ? "done" : ""}`}>{label}</span>
            </span>
          ))}
        </div>

        {b.status === "declined" && (
          <div className="banner banner-warn">
            Declined by the owner{b.declineReason ? `: ${b.declineReason}` : "."} Try
            another vehicle from search.
          </div>
        )}
        {b.status === "cancelled" && (
          <div className="banner banner-warn">
            This booking was cancelled.
            {b.paymentStatus === "refunded" && " All payments have been refunded."}
          </div>
        )}
        {b.status === "started" && (
          <div className="banner banner-accent">
            🛣️ Trip in progress — the map shows the vehicle&apos;s live position.
          </div>
        )}

        <div className="grid2" style={{ alignItems: "start", marginTop: 10 }}>
          {/* left column: trip + map + parties */}
          <div>
            <div className="card">
              <div className="eyebrow">Trip</div>
              <p className="small muted" style={{ marginBottom: 8 }}>
                {TRIP_TYPES[b.tripType]} · {fmtDate(b.startDate)}
                {b.endDate !== b.startDate && ` – ${fmtDate(b.endDate)}`} · {b.days} day
                {b.days > 1 ? "s" : ""} · {b.passengers} pax · {b.purpose} ·{" "}
                {fmtKm(b.distanceKm)}
                {b.nightTravel && " · night travel"}
              </p>
              <div className="row" style={{ marginBottom: 5 }}>
                <span className="mk mk-pickup" style={{ width: 10, height: 10 }} />
                <span className="small">{b.pickup.addr}</span>
              </div>
              {b.stops.map((s, i) => (
                <div className="row" key={i} style={{ marginBottom: 5 }}>
                  <span className="mk mk-stop" style={{ width: 10, height: 10 }} />
                  <span className="small muted">{s.addr}</span>
                </div>
              ))}
              <div className="row" style={{ marginBottom: 10 }}>
                <span className="mk mk-drop" style={{ width: 10, height: 10 }} />
                <span className="small">{b.drop.addr}</span>
              </div>
              {b.states.length > 1 && (
                <p className="dim small" style={{ marginBottom: 10 }}>
                  States: {b.states.join(" → ")}
                </p>
              )}
              <div className="map-box">
                <MapView
                  markers={markers}
                  route={route}
                  fitKey={`${b.id}-${route ? "r" : "m"}`}
                />
              </div>
            </div>

            <div className="card">
              <div className="eyebrow">Parties</div>
              <table style={{ fontSize: "0.85rem" }}>
                <tbody>
                  <tr>
                    <td>Customer</td>
                    <td>
                      {b.customer.name}
                      {b.customer.phone && (
                        <a href={`tel:${b.customer.phone}`} className="dim">
                          {" "}
                          · {b.customer.phone}
                        </a>
                      )}
                    </td>
                  </tr>
                  {b.agent && (
                    <tr>
                      <td>Agent</td>
                      <td>
                        {b.agent.agency ?? b.agent.name}
                        {b.agent.phone && <span className="dim"> · {b.agent.phone}</span>}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td>Owner</td>
                    <td>
                      {b.owner.company ?? b.owner.name}
                      {b.owner.phone && <span className="dim"> · {b.owner.phone}</span>}
                    </td>
                  </tr>
                  <tr>
                    <td>Vehicle</td>
                    <td>
                      {b.vehicle?.name} · {b.vehicle?.seats} seats ·{" "}
                      {b.vehicle?.ac ? "AC" : "Non-AC"} · {b.vehicle?.regNo}
                    </td>
                  </tr>
                  <tr>
                    <td>Driver</td>
                    <td>
                      {b.driver ? (
                        <>
                          {b.driver.name}
                          {b.driver.phone && (
                            <span className="dim"> · {b.driver.phone}</span>
                          )}
                        </>
                      ) : (
                        <span className="dim">Not assigned yet</span>
                      )}
                    </td>
                  </tr>
                  {b.odometerStart !== null && (
                    <tr>
                      <td>Odometer</td>
                      <td>
                        {b.odometerStart}
                        {b.odometerEnd !== null &&
                          ` → ${b.odometerEnd} (${b.actualKm} km actual)`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* right column: fare + payments + actions */}
          <div>
            <FareLines fare={b.fare} showCommission={viewerRole !== "customer"} />

            <div className="card" style={{ marginTop: 14 }}>
              <div className="eyebrow">Payments</div>
              <div className="fare-line">
                <span>Advance required</span>
                <strong>{fmtINR(b.advanceRequired)}</strong>
              </div>
              <div className="fare-line">
                <span>Paid so far</span>
                <strong style={{ color: "var(--accent)" }}>{fmtINR(b.amountPaid)}</strong>
              </div>
              <div className="fare-line">
                <span>Balance due</span>
                <strong style={{ color: b.balanceDue > 0 ? "var(--warm)" : "var(--accent)" }}>
                  {fmtINR(b.balanceDue)}
                </strong>
              </div>
              {b.payments.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {b.payments.map((p, i) => (
                    <p className="dim small" key={i} style={{ margin: "2px 0" }}>
                      {p.amount < 0 ? "↩" : "✓"} {fmtINR(Math.abs(p.amount))} ·{" "}
                      {p.method.toUpperCase()} · {p.note}
                    </p>
                  ))}
                </div>
              )}
              {canPay && (
                <button
                  className="btn btn-primary btn-block"
                  style={{ marginTop: 12 }}
                  onClick={() => setShowPay(true)}
                  disabled={busy}
                >
                  {payLabel}
                </button>
              )}
            </div>

            {b.expenses.length > 0 && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="eyebrow">Trip expenses (pass-through)</div>
                {b.expenses.map((e) => (
                  <div className="fare-line" key={e.id}>
                    <span>
                      {EXPENSE_TYPES.find(([t]) => t === e.etype)?.[1] ?? e.etype}
                      {e.note && <span className="dim"> · {e.note}</span>}
                    </span>
                    <strong>{fmtINR(e.amount)}</strong>
                  </div>
                ))}
                <div className="fare-line fare-total">
                  <span>Expenses total</span>
                  <span>{fmtINR(expensesTotal)}</span>
                </div>
              </div>
            )}

            {/* ----- actions ----- */}
            <div className="card" style={{ marginTop: 14 }}>
              <div className="eyebrow">Actions</div>
              <div className="err">{err}</div>

              {/* owner */}
              {viewerRole === "owner" && b.status === "requested" && (
                <div className="row wrap">
                  <button
                    className="btn btn-primary"
                    onClick={() => act("confirm")}
                    disabled={busy}
                  >
                    Confirm booking
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => act("decline", { reason: "Not available" })}
                    disabled={busy}
                  >
                    Decline
                  </button>
                </div>
              )}
              {needDrivers && (
                <div className="row wrap" style={{ marginTop: 8 }}>
                  <select
                    value={pickDriver}
                    onChange={(e) => setPickDriver(e.target.value)}
                    style={{ flex: 1, minWidth: 180 }}
                  >
                    <option value="">Assign a driver…</option>
                    {ownerDrivers.map((d) => (
                      <option key={d.userId} value={d.userId}>
                        {d.name} ({d.licenseNo})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!pickDriver || busy}
                    onClick={() => act("assign-driver", { driverId: Number(pickDriver) })}
                  >
                    Assign
                  </button>
                </div>
              )}

              {/* driver */}
              {viewerRole === "driver" && b.status === "confirmed" && (
                <>
                  {b.paymentStatus !== "paid" && (
                    <p className="small muted" style={{ marginBottom: 8 }}>
                      Waiting for the customer to settle the full fare before
                      departure.
                    </p>
                  )}
                  <div className="row wrap">
                    <input
                      type="number"
                      placeholder="Odometer at start (km)"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy || !odometer || b.paymentStatus !== "paid"}
                      onClick={async () => {
                        if (await act("start", { odometer: Number(odometer) }))
                          setOdometer("");
                      }}
                    >
                      Start trip
                    </button>
                  </div>
                </>
              )}
              {viewerRole === "driver" && b.status === "started" && (
                <>
                  <div className="row wrap" style={{ marginBottom: 10 }}>
                    <select
                      value={expType}
                      onChange={(e) => setExpType(e.target.value)}
                      style={{ width: 110 }}
                    >
                      {EXPENSE_TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="₹"
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      style={{ width: 90 }}
                    />
                    <input
                      placeholder="Note"
                      value={expNote}
                      onChange={(e) => setExpNote(e.target.value)}
                      style={{ flex: 1, minWidth: 100 }}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy || !expAmount}
                      onClick={async () => {
                        if (
                          await act("expenses", {
                            etype: expType,
                            amount: Number(expAmount),
                            note: expNote,
                          })
                        ) {
                          setExpAmount("");
                          setExpNote("");
                        }
                      }}
                    >
                      Log expense
                    </button>
                  </div>
                  <div className="row wrap">
                    <input
                      type="number"
                      placeholder="Odometer at end (km)"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy || !odometer}
                      onClick={async () => {
                        if (await act("complete", { odometer: Number(odometer) }))
                          setOdometer("");
                      }}
                    >
                      Complete trip
                    </button>
                  </div>
                </>
              )}

              {/* customer / agent */}
              {isBooker && ["requested", "confirmed"].includes(b.status) && (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => act("cancel")}
                  disabled={busy}
                >
                  Cancel booking
                </button>
              )}
              {isBooker && b.status === "completed" && b.rating === null && (
                <div style={{ marginTop: 8 }}>
                  <div className="stars">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={n <= stars ? "on" : ""}
                        onClick={() => setStars(n)}
                      >
                        ⭐
                      </button>
                    ))}
                  </div>
                  <div className="row wrap" style={{ marginTop: 6 }}>
                    <input
                      placeholder="How was the trip? (optional)"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => act("rate", { rating: stars, comment })}
                    >
                      Submit rating
                    </button>
                  </div>
                </div>
              )}
              {b.rating !== null && (
                <p className="small muted" style={{ marginTop: 8 }}>
                  Rated {"★".repeat(b.rating)}
                  {b.ratingComment && ` — "${b.ratingComment}"`}
                </p>
              )}
              {isBooker &&
                ["started", "completed", "cancelled"].includes(b.status) &&
                !b.dispute && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => setShowDispute(true)}
                  >
                    Raise a dispute
                  </button>
                )}
              {b.dispute && (
                <div className="banner banner-warn" style={{ marginTop: 10 }}>
                  Dispute ({b.dispute.status}): {b.dispute.message}
                  {b.dispute.resolution && (
                    <>
                      <br />
                      <strong>Resolution:</strong> {b.dispute.resolution}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* payment modal (simulated gateway) */}
      {showPay && (
        <div className="modal-backdrop" onClick={() => setShowPay(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Simulated payment</div>
            <h3 style={{ marginBottom: 12 }}>{payLabel}</h3>
            <div className="field">
              <label>Payment method</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="upi">UPI</option>
                <option value="card">Credit / Debit card</option>
                <option value="netbanking">Net banking</option>
                <option value="wallet">Wallet</option>
              </select>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} onClick={payNow}>
              Pay {fmtINR(payAmount)}
            </button>
            <p className="dim small" style={{ marginTop: 10 }}>
              Runs in test mode unless a payment gateway is configured by the
              platform.
            </p>
          </div>
        </div>
      )}

      {/* dispute modal */}
      {showDispute && (
        <div className="modal-backdrop" onClick={() => setShowDispute(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="eyebrow">Dispute resolution center</div>
            <h3 style={{ marginBottom: 12 }}>Describe the issue</h3>
            <textarea
              rows={4}
              value={disputeMsg}
              onChange={(e) => setDisputeMsg(e.target.value)}
              placeholder="Fare dispute, vehicle condition, driver behaviour…"
            />
            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 12 }}
              disabled={busy || disputeMsg.trim().length < 5}
              onClick={async () => {
                if (await act("dispute", { message: disputeMsg })) setShowDispute(false);
              }}
            >
              File dispute
            </button>
          </div>
        </div>
      )}
    </>
  );
}
