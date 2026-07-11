"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import LocationSearch from "@/components/LocationSearch";
import {
  VEHICLE_CLASSES,
  VEHICLE_CLASS_LIST,
  type VehicleClass,
} from "@/lib/shared/fare";

interface VehicleRow {
  id: number;
  name: string;
  emoji: string;
  classLabel: string;
  seats: number;
  ac: boolean;
  amenities: string;
  regNo: string;
  perKm: number;
  perDay: number;
  minFare: number;
  bataPerDay: number;
  nightPct: number;
  baseCity: string;
  permitType: string;
  permitExpiry: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pucExpiry: string | null;
  docs: Record<"permit" | "insurance" | "fitness" | "puc", "valid" | "expiring" | "expired">;
  verifyStatus: string;
  ownerActive: boolean;
  rating: number | null;
}

const DOC_TAG = { valid: "tag-accent", expiring: "tag-warm", expired: "tag-rose" };
const VERIFY_TAG: Record<string, string> = {
  approved: "tag-accent",
  pending: "tag-warm",
  rejected: "tag-rose",
};

const emptyForm = {
  name: "",
  vclass: "tempo_traveller" as VehicleClass,
  seats: 17,
  ac: true,
  amenities: "",
  regNo: "",
  perKm: 30,
  perDay: 9000,
  minFare: 3000,
  bataPerDay: 400,
  nightPct: 10,
  baseCity: "",
  baseState: "",
  baseLat: null as number | null,
  baseLng: null as number | null,
  permitType: "All India",
  permitExpiry: "",
  insuranceExpiry: "",
  fitnessExpiry: "",
  pucExpiry: "",
};

export default function OwnerVehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/dashboard");
      const d = await res.json();
      if (res.ok) setVehicles(d.vehicles);
    } catch {
      // Empty/invalid body (dev-server restart, network blip) — retry shortly.
      setTimeout(load, 2500);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function addVehicle() {
    setBusy(true);
    setErr("");
    const res = await fetch("/api/owner/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "Could not add the vehicle");
      return;
    }
    setForm(emptyForm);
    setShowAdd(false);
    load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/owner/vehicles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "Update failed");
      return;
    }
    setEditId(null);
    load();
  }

  return (
    <>
      <TopNav active="/owner/vehicles" />
      <div className="shell">
        <div className="row spread wrap" style={{ marginTop: 8 }}>
          <div>
            <div className="eyebrow">Fleet management</div>
            <h1 className="page-title">Your vehicles</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? "Close" : "+ List a vehicle"}
          </button>
        </div>
        <div className="err">{err}</div>

        {showAdd && (
          <div className="card" style={{ marginBottom: 18 }}>
            <h3 style={{ marginBottom: 12 }}>New vehicle → admin verification queue</h3>
            <div className="form-grid">
              <div className="field">
                <label>Vehicle name / model</label>
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="Force Urbania Premium"
                />
              </div>
              <div className="field">
                <label>Registration number</label>
                <input
                  value={form.regNo}
                  onChange={(e) => set("regNo", e.target.value)}
                  placeholder="KL-07-AB-1234"
                />
              </div>
              <div className="field">
                <label>Class</label>
                <select
                  value={form.vclass}
                  onChange={(e) => set("vclass", e.target.value as VehicleClass)}
                >
                  {VEHICLE_CLASS_LIST.map((c) => (
                    <option key={c} value={c}>
                      {VEHICLE_CLASSES[c].emoji} {VEHICLE_CLASSES[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Seats (7–60)</label>
                <input
                  type="number"
                  min={7}
                  max={60}
                  value={form.seats}
                  onChange={(e) => set("seats", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Per-km rate (₹)</label>
                <input
                  type="number"
                  value={form.perKm}
                  onChange={(e) => set("perKm", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Per-day rate (₹)</label>
                <input
                  type="number"
                  value={form.perDay}
                  onChange={(e) => set("perDay", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Minimum fare (₹)</label>
                <input
                  type="number"
                  value={form.minFare}
                  onChange={(e) => set("minFare", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Driver bata / day (₹)</label>
                <input
                  type="number"
                  value={form.bataPerDay}
                  onChange={(e) => set("bataPerDay", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Night surcharge (%)</label>
                <input
                  type="number"
                  value={form.nightPct}
                  onChange={(e) => set("nightPct", Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Permit type</label>
                <select
                  value={form.permitType}
                  onChange={(e) => set("permitType", e.target.value)}
                >
                  <option>State</option>
                  <option>All India</option>
                  <option>National</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Home base (for proximity in search)</label>
              <LocationSearch
                placeholder="City or depot location…"
                value={form.baseCity}
                onSelect={(r) => {
                  set("baseCity", r.label.split(",")[0]);
                  set("baseState", r.state);
                  set("baseLat", r.lat);
                  set("baseLng", r.lng);
                }}
              />
            </div>
            <div className="field">
              <label>Amenities</label>
              <input
                value={form.amenities}
                onChange={(e) => set("amenities", e.target.value)}
                placeholder="Pushback seats, WiFi, Icebox…"
              />
            </div>
            <div className="row" style={{ marginBottom: 10 }}>
              <button
                type="button"
                className={`switch ${form.ac ? "on" : ""}`}
                onClick={() => set("ac", !form.ac)}
                aria-label="AC"
              />
              <span className="small muted">Air conditioned</span>
            </div>
            <div className="eyebrow" style={{ marginTop: 8 }}>
              Compliance documents (expiry dates)
            </div>
            <div className="form-grid">
              {(
                [
                  ["permitExpiry", "Permit"],
                  ["insuranceExpiry", "Insurance"],
                  ["fitnessExpiry", "Fitness certificate"],
                  ["pucExpiry", "PUC"],
                ] as const
              ).map(([k, label]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <input
                    type="date"
                    value={form[k]}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={addVehicle} disabled={busy}>
              {busy ? "Submitting…" : "Submit for verification"}
            </button>
          </div>
        )}

        {vehicles === null && (
          <div className="row">
            <div className="spinner" />
            <span className="muted">Loading fleet…</span>
          </div>
        )}

        {vehicles?.map((v) => (
          <div className="card" key={v.id}>
            <div className="row spread wrap">
              <span className="row">
                <span style={{ fontSize: "1.6rem" }}>{v.emoji}</span>
                <span>
                  <strong style={{ fontFamily: "Syne" }}>{v.name}</strong>
                  <span className="dim small">
                    {" "}
                    · {v.regNo} · {v.classLabel} · {v.seats} seats ·{" "}
                    {v.ac ? "AC" : "Non-AC"}
                    {v.rating != null && ` · ★ ${v.rating}`}
                  </span>
                </span>
              </span>
              <span className="row" style={{ gap: 6 }}>
                <span className={`tag ${VERIFY_TAG[v.verifyStatus]}`}>
                  {v.verifyStatus}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`switch ${v.ownerActive ? "on" : ""}`}
                    title="Instant block toggle"
                    onClick={() => patch(v.id, { ownerActive: !v.ownerActive })}
                    aria-label="Vehicle active"
                  />
                  <span className="dim small">{v.ownerActive ? "live" : "blocked"}</span>
                </span>
              </span>
            </div>
            <div className="row wrap" style={{ margin: "10px 0" }}>
              <span className="mono dim">
                ₹{v.perKm}/km · ₹{v.perDay.toLocaleString("en-IN")}/day · min ₹
                {v.minFare.toLocaleString("en-IN")} · bata ₹{v.bataPerDay}/day
              </span>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {(
                [
                  ["permit", "Permit", v.permitExpiry],
                  ["insurance", "Insurance", v.insuranceExpiry],
                  ["fitness", "Fitness", v.fitnessExpiry],
                  ["puc", "PUC", v.pucExpiry],
                ] as const
              ).map(([key, label, expiry]) => (
                <span key={key} className={`tag ${DOC_TAG[v.docs[key]]}`}>
                  {label} {v.docs[key] === "valid" ? "✓" : `· ${v.docs[key]}`}
                  {expiry ? ` (${expiry})` : ""}
                </span>
              ))}
            </div>
            {Object.values(v.docs).some((s) => s !== "valid") && (
              <div className="banner banner-warn small" style={{ marginBottom: 0 }}>
                {Object.values(v.docs).includes("expired")
                  ? "⚠ Expired documents — this vehicle is hidden from search until renewed."
                  : "⚠ A document expires within 7 days. Renew it to avoid automatic deactivation."}
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              {editId === v.id ? (
                <div className="row wrap">
                  {(
                    [
                      ["perKm", "₹/km"],
                      ["perDay", "₹/day"],
                      ["permitExpiry", "Permit exp."],
                      ["insuranceExpiry", "Insurance exp."],
                      ["fitnessExpiry", "Fitness exp."],
                      ["pucExpiry", "PUC exp."],
                    ] as const
                  ).map(([k, ph]) => (
                    <input
                      key={k}
                      type={k.endsWith("Expiry") ? "date" : "number"}
                      placeholder={ph}
                      title={ph}
                      value={edit[k] ?? ""}
                      onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                      style={{ width: k.endsWith("Expiry") ? 160 : 100 }}
                    />
                  ))}
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => {
                      const body: Record<string, unknown> = {};
                      for (const [k, val] of Object.entries(edit))
                        if (val !== "") body[k] = k.endsWith("Expiry") ? val : Number(val);
                      patch(v.id, body);
                    }}
                  >
                    Save
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setEditId(v.id);
                    setEdit({
                      perKm: String(v.perKm),
                      perDay: String(v.perDay),
                      permitExpiry: v.permitExpiry ?? "",
                      insuranceExpiry: v.insuranceExpiry ?? "",
                      fitnessExpiry: v.fitnessExpiry ?? "",
                      pucExpiry: v.pucExpiry ?? "",
                    });
                  }}
                >
                  Edit rates / documents
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
