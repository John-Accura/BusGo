"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";
import { FareLines } from "@/components/ui";
import type { MapMarker } from "@/components/MapView";
import { fallbackKm, fetchRoute } from "@/lib/client/geo";
import {
  decodeTrip,
  routePoints,
  stateTaxTotal,
  tripStates,
} from "@/lib/client/tripquery";
import {
  advanceAmount,
  calcFare,
  daysBetween,
  fmtDate,
  fmtINR,
  fmtKm,
  TRIP_TYPES,
  type AgentTerms,
  type StateTaxRate,
  type VehicleRates,
} from "@/lib/shared/fare";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const PURPOSES = ["Tourism", "Corporate", "Wedding", "Pilgrimage", "Transfer"];

interface VehicleInfo {
  id: number;
  name: string;
  emoji: string;
  classLabel: string;
  seats: number;
  ac: boolean;
  amenities: string;
  permitType: string;
  regNo: string;
  baseCity: string;
  rating: number | null;
  rates: VehicleRates;
  owner: { name: string; company: string | null };
}

function BookInner() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const trip = useMemo(() => decodeTrip(new URLSearchParams(sp.toString())), [sp]);

  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [taxes, setTaxes] = useState<Record<string, StateTaxRate>>({});
  const [agentTerms, setAgentTerms] = useState<AgentTerms | null>(null);
  const [route, setRoute] = useState<{ coords: [number, number][]; km: number } | null>(
    null,
  );
  const [passengers, setPassengers] = useState(trip?.passengers ?? 10);
  const [purpose, setPurpose] = useState("Tourism");
  const [night, setNight] = useState(trip?.night ?? false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/vehicles/${vehicleId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.vehicle) {
          setVehicle(d.vehicle);
          setTaxes(d.stateTaxes ?? {});
          setAgentTerms(d.agentTerms ?? null);
        } else setErr(d.error ?? "Vehicle not found");
      })
      .catch(() => setErr("Could not load the vehicle"));
  }, [vehicleId]);

  useEffect(() => {
    if (!trip) return;
    const pts = routePoints(trip);
    fetchRoute(pts).then((r) =>
      setRoute(
        r ?? {
          coords: pts.map((p) => [p.lat, p.lng] as [number, number]),
          km: fallbackKm(pts),
        },
      ),
    );
  }, [trip]);

  if (!trip)
    return (
      <div className="shell">
        <div className="banner banner-warn">
          Missing trip details. <Link href="/">Start a new search</Link>.
        </div>
      </div>
    );

  const days = daysBetween(trip.startDate, trip.endDate);
  const km = route?.km ?? null;
  const fare =
    vehicle && km !== null
      ? calcFare(vehicle.rates, {
          tripType: trip.tripType,
          km,
          days,
          nightTravel: night,
          // Live passenger count — per-passenger state levies follow the input.
          stateTaxes: stateTaxTotal(trip, taxes, passengers),
          agent: agentTerms,
        })
      : null;
  const advance = fare ? advanceAmount(fare.totalFare, trip.startDate) : null;

  const markers: MapMarker[] = [
    { id: "p", kind: "pickup", lat: trip.pickup.lat, lng: trip.pickup.lng },
    ...trip.stops.map((s, i) => ({
      id: `s${i}`,
      kind: "stop" as const,
      lat: s.lat,
      lng: s.lng,
    })),
    { id: "d", kind: "drop", lat: trip.drop.lat, lng: trip.drop.lng },
  ];

  async function book() {
    if (!vehicle || !fare || km === null) return;
    if (agentTerms && customerName.trim().length < 2)
      return setErr("Enter the customer's name");
    setBusy(true);
    setErr("");
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: vehicle.id,
        tripType: trip!.tripType,
        startDate: trip!.startDate,
        endDate: trip!.endDate,
        passengers,
        purpose,
        pickup: trip!.pickup,
        drop: trip!.drop,
        stops: trip!.stops,
        distanceKm: km,
        nightTravel: night,
        customerName,
        customerPhone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Could not create the booking");
      return;
    }
    router.push(`/bookings/${data.booking.id}`);
  }

  return (
    <div className="shell">
      <div className="eyebrow">Step 3 — transparent fare &amp; request</div>
      <h1 className="page-title">Review &amp; book</h1>
      <p className="lead small">
        {TRIP_TYPES[trip.tripType]} · {fmtDate(trip.startDate)}
        {trip.endDate !== trip.startDate && ` – ${fmtDate(trip.endDate)}`} · {days}{" "}
        day{days > 1 ? "s" : ""}
        {km !== null && ` · ${fmtKm(km)} by road`}
      </p>

      {err && !vehicle && <div className="banner banner-warn">{err}</div>}

      {vehicle && (
        <div className="grid2" style={{ alignItems: "start" }}>
          <div>
            <div className="veh-card" style={{ marginBottom: 14 }}>
              <div className="veh-thumb">{vehicle.emoji}</div>
              <div>
                <strong style={{ fontFamily: "Syne" }}>{vehicle.name}</strong>
                <p className="small muted" style={{ margin: "2px 0" }}>
                  {vehicle.classLabel} · {vehicle.seats} seats ·{" "}
                  {vehicle.ac ? "AC" : "Non-AC"} · {vehicle.regNo}
                </p>
                <p className="dim small">
                  {vehicle.owner.company ?? vehicle.owner.name} · {vehicle.permitType}{" "}
                  permit
                  {vehicle.rating != null && ` · ★ ${vehicle.rating}`}
                </p>
              </div>
            </div>

            <div className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <span className="mk mk-pickup" style={{ width: 10, height: 10 }} />
                <span className="small">{trip.pickup.addr}</span>
              </div>
              {trip.stops.map((s, i) => (
                <div className="row" key={i} style={{ marginBottom: 6 }}>
                  <span className="mk mk-stop" style={{ width: 10, height: 10 }} />
                  <span className="small muted">{s.addr}</span>
                </div>
              ))}
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="mk mk-drop" style={{ width: 10, height: 10 }} />
                <span className="small">{trip.drop.addr}</span>
              </div>
              <div className="map-box">
                <MapView
                  markers={markers}
                  route={route?.coords ?? null}
                  fitKey={route ? "r" : "m"}
                />
              </div>
            </div>

            <div className="card">
              <div className="form-grid">
                <div className="field">
                  <label>Passengers (max {vehicle.seats})</label>
                  <input
                    type="number"
                    min={1}
                    max={vehicle.seats}
                    value={passengers}
                    onChange={(e) => setPassengers(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>Purpose</label>
                  <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                    {PURPOSES.map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row" style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  className={`switch ${night ? "on" : ""}`}
                  onClick={() => setNight(!night)}
                  aria-label="Night travel"
                />
                <span className="small muted">
                  Trip includes night travel (10 PM – 6 AM) — {vehicle.rates.nightPct}%
                  surcharge
                </span>
              </div>
              {agentTerms && (
                <div className="form-grid" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>Customer name (booking on behalf)</label>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label>Customer phone</label>
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+91…"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            {fare ? (
              <>
                <FareLines fare={fare} showCommission={!!agentTerms} />
                <div className="card" style={{ marginTop: 14 }}>
                  <div className="fare-line">
                    <span>Advance to confirm ({fmtDate(trip.startDate)} start)</span>
                    <strong style={{ color: "var(--warm)" }}>{fmtINR(advance)}</strong>
                  </div>
                  <p className="dim small" style={{ margin: "6px 0 12px" }}>
                    100% within 48 hrs of travel · 75% within a week · 50% earlier.
                    Payment opens after the owner confirms.
                  </p>
                  <div className="err">{err}</div>
                  <button
                    className="btn btn-primary btn-block"
                    onClick={book}
                    disabled={busy}
                  >
                    {busy ? "Sending request…" : "Request booking"}
                  </button>
                  <p className="dim small" style={{ marginTop: 10 }}>
                    The owner confirms within 2–12 hours. You&apos;ll pay nothing until
                    then.
                  </p>
                </div>
              </>
            ) : (
              <div className="row card">
                <div className="spinner" />
                <span className="muted">Calculating route &amp; fare…</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <>
      <TopNav />
      <Suspense>
        <BookInner />
      </Suspense>
    </>
  );
}
