"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";
import { fallbackKm, fetchRoute } from "@/lib/client/geo";
import {
  decodeTrip,
  routePoints,
  stateTaxTotal,
  tripStates,
  type TripQuery,
} from "@/lib/client/tripquery";
import {
  calcFare,
  daysBetween,
  fmtDate,
  fmtINR,
  fmtKm,
  TRIP_TYPES,
  VEHICLE_CLASSES,
  VEHICLE_CLASS_LIST,
  type StateTaxRate,
  type VehicleClass,
} from "@/lib/shared/fare";

interface ResultVehicle {
  id: number;
  name: string;
  vclass: string;
  emoji: string;
  classLabel: string;
  seats: number;
  ac: boolean;
  amenities: string;
  permitType: string;
  perKm: number;
  perDay: number;
  minFare: number;
  bataPerDay: number;
  nightPct: number;
  baseCity: string;
  rating: number | null;
  distanceKm: number | null;
  owner: {
    name: string;
    company: string | null;
    paysCommission: boolean;
    commissionType: string;
    commissionValue: number;
  };
}

function SearchResults() {
  const sp = useSearchParams();
  const trip = useMemo(() => decodeTrip(new URLSearchParams(sp.toString())), [sp]);
  const [results, setResults] = useState<ResultVehicle[] | null>(null);
  const [taxes, setTaxes] = useState<Record<string, StateTaxRate>>({});
  const [agentMode, setAgentMode] = useState(false);
  const [km, setKm] = useState<number | null>(null);
  const [fClass, setFClass] = useState("");
  const [fAc, setFAc] = useState(false);

  useEffect(() => {
    if (!trip) return;
    const q = new URLSearchParams({
      passengers: String(trip.passengers),
      start: trip.startDate,
      end: trip.endDate,
      lat: String(trip.pickup.lat),
      lng: String(trip.pickup.lng),
    });
    if (fClass) q.set("vclass", fClass);
    if (fAc) q.set("ac", "1");
    fetch("/api/search?" + q.toString())
      .then((r) => r.json())
      .then((d) => {
        setResults(d.results ?? []);
        setTaxes(d.stateTaxes ?? {});
        setAgentMode(d.agentMode === true);
      })
      .catch(() => setResults([]));
  }, [trip, fClass, fAc]);

  useEffect(() => {
    if (!trip) return;
    const pts = routePoints(trip);
    fetchRoute(pts).then((r) => setKm(r ? r.km : fallbackKm(pts)));
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
  const states = tripStates(trip);
  const taxTotal = stateTaxTotal(trip, taxes);

  return (
    <div className="shell">
      <div className="eyebrow">Step 2 — vehicle discovery</div>
      <h1 className="page-title">Available vehicles</h1>
      <p className="lead small">
        {TRIP_TYPES[trip.tripType]} · {trip.pickup.addr} → {trip.drop.addr}
        {trip.stops.length > 0 && ` (+${trip.stops.length} stops)`} ·{" "}
        {fmtDate(trip.startDate)}
        {trip.endDate !== trip.startDate && ` – ${fmtDate(trip.endDate)}`} ·{" "}
        {trip.passengers} pax
        {km !== null && <> · ≈{fmtKm(km)} by road</>}
        {states.length > 1 && <> · states: {states.join(", ")}</>}
      </p>

      <div className="row wrap" style={{ marginBottom: 18 }}>
        <select
          value={fClass}
          onChange={(e) => setFClass(e.target.value)}
          style={{ width: "auto" }}
        >
          <option value="">All vehicle classes</option>
          {VEHICLE_CLASS_LIST.map((c) => (
            <option key={c} value={c}>
              {VEHICLE_CLASSES[c].label}
            </option>
          ))}
        </select>
        <button
          className={`btn btn-sm ${fAc ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setFAc(!fAc)}
        >
          ❄ AC only
        </button>
        <Link href="/" className="btn btn-ghost btn-sm">
          Edit trip
        </Link>
      </div>

      {results === null && (
        <div className="row">
          <div className="spinner" />
          <span className="muted">Finding vehicles…</span>
        </div>
      )}

      {results?.length === 0 && (
        <div className="banner banner-warn">
          No vehicles match this trip. Try different dates, fewer passengers, or
          another vehicle class.
        </div>
      )}

      {results?.map((v) => {
        const est =
          km !== null
            ? calcFare(
                {
                  perKm: v.perKm,
                  perDay: v.perDay,
                  minFare: v.minFare,
                  bataPerDay: v.bataPerDay,
                  nightPct: v.nightPct,
                },
                {
                  tripType: trip.tripType,
                  km,
                  days,
                  nightTravel: trip.night,
                  stateTaxes: taxTotal,
                  agent: null,
                },
              )
            : null;
        return (
          <div className="veh-card" key={v.id} style={{ marginBottom: 12 }}>
            <div className="veh-thumb">{v.emoji}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row spread wrap">
                <strong style={{ fontFamily: "Syne", fontSize: "1.02rem" }}>
                  {v.name}
                </strong>
                <span className="row" style={{ gap: 6 }}>
                  {v.rating != null && <span className="tag tag-warm">★ {v.rating}</span>}
                  <span className="tag tag-dim">{v.permitType} permit</span>
                  {agentMode && v.owner.paysCommission && (
                    <span className="tag tag-accent">
                      {v.owner.commissionType === "percent"
                        ? `${v.owner.commissionValue}% commission`
                        : `${fmtINR(v.owner.commissionValue)} commission`}
                    </span>
                  )}
                </span>
              </div>
              <p className="small muted" style={{ margin: "3px 0" }}>
                {v.classLabel} · {v.seats} seats · {v.ac ? "AC" : "Non-AC"} ·{" "}
                {v.owner.company ?? v.owner.name}
                {v.baseCity && ` · based in ${v.baseCity}`}
                {v.distanceKm !== null && ` (${v.distanceKm} km from pickup)`}
              </p>
              {v.amenities && (
                <p className="dim small" style={{ marginBottom: 6 }}>
                  {v.amenities}
                </p>
              )}
              <div className="row spread wrap">
                <span className="mono dim">
                  ₹{v.perKm}/km · ₹{v.perDay.toLocaleString("en-IN")}/day
                </span>
                <span className="row" style={{ gap: 12 }}>
                  {est && (
                    <strong style={{ color: "var(--accent)", fontSize: "1.05rem" }}>
                      {fmtINR(est.totalFare)}
                    </strong>
                  )}
                  <Link
                    href={`/book/${v.id}?${sp.toString()}`}
                    className="btn btn-primary btn-sm"
                  >
                    Book →
                  </Link>
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SearchPage() {
  return (
    <>
      <TopNav active="/" />
      <Suspense>
        <SearchResults />
      </Suspense>
    </>
  );
}
