"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";
import { PayTag, StatusTag } from "@/components/ui";
import type { BookingDTO } from "@/lib/server/bookings";
import {
  fmtDate,
  fmtINR,
  VEHICLE_CLASSES,
  VEHICLE_CLASS_LIST,
  type VehicleClass,
} from "@/lib/shared/fare";

interface Overview {
  stats: {
    users: Record<string, number>;
    vehicles: { total: number; pending: number; approved: number };
    bookings: Record<string, number>;
    gmv: number;
    platformRevenue: number;
  };
  pendingVehicles: {
    id: number;
    name: string;
    emoji: string;
    classLabel: string;
    seats: number;
    regNo: string;
    permitType: string;
    permitExpiry: string | null;
    insuranceExpiry: string | null;
    fitnessExpiry: string | null;
    pucExpiry: string | null;
    owner: { name: string; company: string | null };
  }[];
  disputes: {
    id: number;
    status: string;
    message: string;
    resolution: string | null;
    bookingCode: string;
    bookingId: number;
    raisedBy: string;
  }[];
  settlements: {
    bookingId: number;
    code: string;
    totalFare: number;
    ownerPayout: number;
    agentPayout: number;
    platformRevenue: number;
  }[];
  taxes: { state: string; entryTax: number; perPassenger: number }[];
  recentBookings: BookingDTO[];
  fleet: {
    id: number;
    make: string;
    model: string;
    emoji: string;
    classLabel: string;
    seats: number;
    regNo: string;
    baseState: string;
    perKm: number;
    perDay: number;
    verifyStatus: string;
    ownerActive: boolean;
    owner: { name: string; company: string | null };
    stateTax: { entryTax: number; perPassenger: number } | null;
  }[];
  owners: { id: number; name: string; company: string | null }[];
}

type Tab =
  | "overview"
  | "users"
  | "fleet"
  | "queue"
  | "disputes"
  | "settlements"
  | "taxes";

const TABS: [Tab, string][] = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["fleet", "Fleet"],
  ["queue", "Verification queue"],
  ["disputes", "Disputes"],
  ["settlements", "Settlements"],
  ["taxes", "State taxes"],
];

interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  suspended: boolean;
  joined: string | null;
  details: [string, string][];
}

const ROLE_TAG: Record<string, string> = {
  owner: "tag-accent",
  agent: "tag-info",
  driver: "tag-warm",
  customer: "tag-dim",
};

const emptyUser = {
  role: "owner",
  name: "",
  email: "",
  phone: "",
  password: "",
  company: "",
  city: "",
  gstNo: "",
  agency: "",
  serviceValue: "5",
  licenseNo: "",
  experienceYears: "5",
  ownerId: "",
};

const VERIFY_TAG: Record<string, string> = {
  approved: "tag-accent",
  pending: "tag-warm",
  rejected: "tag-rose",
};

const inOneYear = () => new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

const emptyVehicle = {
  ownerId: "",
  make: "",
  model: "",
  vclass: "tempo_traveller" as VehicleClass,
  seats: "17",
  regNo: "",
  baseState: "",
  perKm: "30",
  perDay: "9000",
  validTill: inOneYear(),
};

export default function AdminPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [resolution, setResolution] = useState<Record<number, string>>({});
  const [taxEdit, setTaxEdit] = useState<Record<string, string>>({});
  const [newTax, setNewTax] = useState({ state: "", entryTax: "", perPassenger: "" });
  const [vform, setVform] = useState(emptyVehicle);
  const [vehicleOk, setVehicleOk] = useState("");
  const [usersData, setUsersData] = useState<AdminUser[] | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  const [uform, setUform] = useState(emptyUser);
  const [userOk, setUserOk] = useState("");
  const [pwEdit, setPwEdit] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/overview");
      const data = await res.json();
      if (res.ok) setD(data);
    } catch {
      // Empty/invalid body (dev-server restart, network blip) — retry shortly.
      setTimeout(load, 2500);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsersData(data.users);
    } catch {
      // Empty/invalid body (dev-server restart, network blip) — retry shortly.
      setTimeout(loadUsers, 2500);
    }
  }, []);

  // The user directory loads lazily, the first time the tab opens.
  useEffect(() => {
    if (tab === "users" && usersData === null) loadUsers();
  }, [tab, usersData, loadUsers]);

  async function createUser() {
    setBusy(true);
    setErr("");
    setUserOk("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...uform, ownerId: Number(uform.ownerId) || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not create the account");
        return;
      }
      setUserOk(`${uform.role} account created — sign-in: ${uform.email}`);
      setUform({ ...emptyUser, role: uform.role });
      loadUsers();
      load(); // owner lists etc. may have changed
    } finally {
      setBusy(false);
    }
  }

  async function patchUser(userId: number, body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Update failed");
        return false;
      }
      loadUsers();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function verdict(id: number, approve: boolean) {
    setBusy(true);
    await fetch(`/api/admin/vehicles/${id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    setBusy(false);
    load();
  }

  async function resolve(id: number) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/admin/disputes/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution: resolution[id] ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error ?? "Failed");
      return;
    }
    load();
  }

  async function addVehicle() {
    setBusy(true);
    setErr("");
    setVehicleOk("");
    try {
      const res = await fetch("/api/admin/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...vform,
          ownerId: Number(vform.ownerId),
          seats: Number(vform.seats),
          perKm: Number(vform.perKm),
          perDay: Number(vform.perDay),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error ?? "Could not add the vehicle");
        return;
      }
      setVehicleOk(`${vform.make} ${vform.model} added and approved — live in search.`);
      setVform({ ...emptyVehicle, validTill: inOneYear() });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function saveTax(state: string, entryTax: string, perPassenger: string) {
    setBusy(true);
    await fetch("/api/admin/taxes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        state,
        entryTax: Number(entryTax),
        perPassenger: Number(perPassenger || 0),
      }),
    });
    setBusy(false);
    load();
  }

  if (!d)
    return (
      <>
        <TopNav active="/admin" />
        <div className="shell">
          <div className="row" style={{ marginTop: 30 }}>
            <div className="spinner" />
            <span className="muted">Loading admin dashboard…</span>
          </div>
        </div>
      </>
    );

  const openDisputes = d.disputes.filter((x) => x.status === "open");

  return (
    <>
      <TopNav active="/admin" />
      <div className="shell">
        <div className="eyebrow" style={{ marginTop: 8 }}>
          Central admin control
        </div>
        <h1 className="page-title">Platform operations</h1>

        <div className="row wrap" style={{ margin: "14px 0 20px" }}>
          {TABS.map(([t, label]) => (
            <button
              key={t}
              className={`navlink ${tab === t ? "on" : ""}`}
              onClick={() => setTab(t)}
            >
              {label}
              {t === "queue" && d.pendingVehicles.length > 0 && ` (${d.pendingVehicles.length})`}
              {t === "disputes" && openDisputes.length > 0 && ` (${openDisputes.length})`}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="grid4">
              <div className="stat-card">
                <div className="stat-value">{fmtINR(d.stats.gmv)}</div>
                <div className="stat-label">GMV (completed)</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{fmtINR(d.stats.platformRevenue)}</div>
                <div className="stat-label">Platform revenue</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{d.stats.vehicles.approved}</div>
                <div className="stat-label">Live vehicles</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">
                  {Object.values(d.stats.bookings).reduce((a, b) => a + b, 0)}
                </div>
                <div className="stat-label">Total bookings</div>
              </div>
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <div className="card">
                <div className="eyebrow">Users</div>
                {Object.entries(d.stats.users).map(([role, n]) => (
                  <div className="fare-line" key={role}>
                    <span>{role}</span>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="eyebrow">Bookings by status</div>
                {Object.entries(d.stats.bookings).map(([st, n]) => (
                  <div className="fare-line" key={st}>
                    <span>{st}</span>
                    <strong>{n}</strong>
                  </div>
                ))}
              </div>
            </div>
            <h3 style={{ margin: "22px 0 10px" }}>Recent bookings</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Route</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Fare</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentBookings.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link href={`/bookings/${b.id}`}>{b.code}</Link>
                      </td>
                      <td className="small">
                        {b.pickup.addr.split(",")[0]} → {b.drop.addr.split(",")[0]}
                      </td>
                      <td className="small">{fmtDate(b.startDate)}</td>
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
          </>
        )}

        {tab === "users" && (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 12 }}>Create an account</h3>
              <div className="seg" style={{ maxWidth: 420 }}>
                {["owner", "agent", "driver"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={uform.role === r ? "on" : ""}
                    onClick={() => setUform({ ...uform, role: r })}
                  >
                    {r === "owner" ? "🚐 Owner" : r === "agent" ? "🏨 Agent" : "🧑‍✈️ Driver"}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Name</label>
                  <input
                    value={uform.name}
                    onChange={(e) => setUform({ ...uform, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input
                    value={uform.phone}
                    onChange={(e) => setUform({ ...uform, phone: e.target.value })}
                    placeholder="+91…"
                  />
                </div>
                <div className="field">
                  <label>Login email</label>
                  <input
                    type="email"
                    value={uform.email}
                    onChange={(e) => setUform({ ...uform, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Login password (min 6)</label>
                  <input
                    value={uform.password}
                    onChange={(e) => setUform({ ...uform, password: e.target.value })}
                  />
                </div>

                {uform.role === "owner" && (
                  <>
                    <div className="field">
                      <label>Company / fleet name</label>
                      <input
                        value={uform.company}
                        onChange={(e) => setUform({ ...uform, company: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Operating city</label>
                      <input
                        value={uform.city}
                        onChange={(e) => setUform({ ...uform, city: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>GST number (optional)</label>
                      <input
                        value={uform.gstNo}
                        onChange={(e) => setUform({ ...uform, gstNo: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {uform.role === "agent" && (
                  <>
                    <div className="field">
                      <label>Agency / hotel name</label>
                      <input
                        value={uform.agency}
                        onChange={(e) => setUform({ ...uform, agency: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Service charge (% of base)</label>
                      <input
                        type="number"
                        value={uform.serviceValue}
                        onChange={(e) =>
                          setUform({ ...uform, serviceValue: e.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label>GST number (optional)</label>
                      <input
                        value={uform.gstNo}
                        onChange={(e) => setUform({ ...uform, gstNo: e.target.value })}
                      />
                    </div>
                  </>
                )}
                {uform.role === "driver" && (
                  <>
                    <div className="field">
                      <label>Fleet owner</label>
                      <select
                        value={uform.ownerId}
                        onChange={(e) => setUform({ ...uform, ownerId: e.target.value })}
                      >
                        <option value="">Pick an owner…</option>
                        {d.owners.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.company ?? o.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>Driving license no.</label>
                      <input
                        value={uform.licenseNo}
                        onChange={(e) => setUform({ ...uform, licenseNo: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Experience (years)</label>
                      <input
                        type="number"
                        value={uform.experienceYears}
                        onChange={(e) =>
                          setUform({ ...uform, experienceYears: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="err">{err}</div>
              {userOk && (
                <p className="ok-msg" style={{ marginBottom: 8 }}>
                  {userOk}
                </p>
              )}
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !uform.name ||
                  !uform.email ||
                  uform.password.length < 6 ||
                  (uform.role === "driver" && !uform.ownerId)
                }
                onClick={createUser}
              >
                {busy ? "Creating…" : `Create ${uform.role} account`}
              </button>
            </div>

            <div className="row wrap" style={{ marginBottom: 12 }}>
              {["all", "owner", "agent", "driver", "customer"].map((r) => (
                <button
                  key={r}
                  className={`navlink ${roleFilter === r ? "on" : ""}`}
                  onClick={() => setRoleFilter(r)}
                >
                  {r === "all" ? "All users" : `${r}s`}
                </button>
              ))}
            </div>

            {usersData === null && (
              <div className="row">
                <div className="spinner" />
                <span className="muted">Loading users…</span>
              </div>
            )}

            {usersData
              ?.filter((u) => roleFilter === "all" || u.role === roleFilter)
              .map((u) => (
                <div className="card" key={u.id}>
                  <div className="row spread wrap">
                    <span>
                      <strong style={{ fontFamily: "Plus Jakarta Sans" }}>{u.name}</strong>
                      <span className="dim small">
                        {" "}
                        · {u.email}
                        {u.phone && ` · ${u.phone}`}
                        {u.joined && ` · joined ${fmtDate(u.joined.slice(0, 10))}`}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <span className={`tag ${ROLE_TAG[u.role] ?? "tag-dim"}`}>{u.role}</span>
                      {u.suspended && <span className="tag tag-rose">suspended</span>}
                      <button
                        className={`btn btn-sm ${u.suspended ? "btn-primary" : "btn-danger"}`}
                        disabled={busy}
                        onClick={() => patchUser(u.id, { suspended: !u.suspended })}
                      >
                        {u.suspended ? "Reactivate" : "Suspend"}
                      </button>
                    </span>
                  </div>
                  <p className="small muted" style={{ margin: "8px 0 8px" }}>
                    {u.details.map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                  <div className="row wrap">
                    <input
                      placeholder="New password…"
                      value={pwEdit[u.id] ?? ""}
                      onChange={(e) => setPwEdit({ ...pwEdit, [u.id]: e.target.value })}
                      style={{ width: 180 }}
                    />
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy || (pwEdit[u.id] ?? "").length < 6}
                      onClick={async () => {
                        if (await patchUser(u.id, { password: pwEdit[u.id] }))
                          setPwEdit({ ...pwEdit, [u.id]: "" });
                      }}
                    >
                      Reset password
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}

        {tab === "fleet" && (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <h3 style={{ marginBottom: 12 }}>Add a vehicle to the fleet</h3>
              <div className="form-grid">
                <div className="field">
                  <label>Owner</label>
                  <select
                    value={vform.ownerId}
                    onChange={(e) => setVform({ ...vform, ownerId: e.target.value })}
                  >
                    <option value="">Pick an owner…</option>
                    {d.owners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.company ?? o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Registration number</label>
                  <input
                    value={vform.regNo}
                    onChange={(e) => setVform({ ...vform, regNo: e.target.value })}
                    placeholder="KL-07-AB-1234"
                  />
                </div>
                <div className="field">
                  <label>Make</label>
                  <input
                    value={vform.make}
                    onChange={(e) => setVform({ ...vform, make: e.target.value })}
                    placeholder="Force"
                  />
                </div>
                <div className="field">
                  <label>Model</label>
                  <input
                    value={vform.model}
                    onChange={(e) => setVform({ ...vform, model: e.target.value })}
                    placeholder="Urbania 4020"
                  />
                </div>
                <div className="field">
                  <label>Class</label>
                  <select
                    value={vform.vclass}
                    onChange={(e) =>
                      setVform({ ...vform, vclass: e.target.value as VehicleClass })
                    }
                  >
                    {VEHICLE_CLASS_LIST.map((c) => (
                      <option key={c} value={c}>
                        {VEHICLE_CLASSES[c].emoji} {VEHICLE_CLASSES[c].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Seating capacity (7–60)</label>
                  <input
                    type="number"
                    min={7}
                    max={60}
                    value={vform.seats}
                    onChange={(e) => setVform({ ...vform, seats: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>State (tax jurisdiction)</label>
                  <select
                    value={vform.baseState}
                    onChange={(e) => setVform({ ...vform, baseState: e.target.value })}
                  >
                    <option value="">Pick a state…</option>
                    {d.taxes.map((t) => (
                      <option key={t.state} value={t.state}>
                        {t.state}
                      </option>
                    ))}
                  </select>
                  {vform.baseState &&
                    (() => {
                      const t = d.taxes.find((x) => x.state === vform.baseState);
                      return t ? (
                        <p className="dim small" style={{ marginTop: 4 }}>
                          Entry tax {fmtINR(t.entryTax)} + {fmtINR(t.perPassenger)}
                          /passenger when other trips cross into {t.state}.
                        </p>
                      ) : null;
                    })()}
                </div>
                <div className="field">
                  <label>Documents valid till</label>
                  <input
                    type="date"
                    value={vform.validTill}
                    onChange={(e) => setVform({ ...vform, validTill: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Per-km rate (₹)</label>
                  <input
                    type="number"
                    value={vform.perKm}
                    onChange={(e) => setVform({ ...vform, perKm: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Per-day rate (₹)</label>
                  <input
                    type="number"
                    value={vform.perDay}
                    onChange={(e) => setVform({ ...vform, perDay: e.target.value })}
                  />
                </div>
              </div>
              <div className="err">{err}</div>
              {vehicleOk && <p className="ok-msg" style={{ marginBottom: 8 }}>{vehicleOk}</p>}
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !vform.ownerId ||
                  !vform.make ||
                  !vform.model ||
                  !vform.regNo ||
                  !vform.baseState
                }
                onClick={addVehicle}
              >
                {busy ? "Adding…" : "Add vehicle (auto-approved)"}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Reg no</th>
                    <th>Make</th>
                    <th>Model</th>
                    <th>Class</th>
                    <th>Seats</th>
                    <th>Owner</th>
                    <th>State</th>
                    <th>State tax</th>
                    <th>Rates</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.fleet.map((v) => (
                    <tr key={v.id}>
                      <td>{v.regNo}</td>
                      <td className="small">{v.make}</td>
                      <td className="small">
                        {v.emoji} {v.model}
                      </td>
                      <td className="small">{v.classLabel}</td>
                      <td className="small">{v.seats}</td>
                      <td className="small">{v.owner.company ?? v.owner.name}</td>
                      <td className="small">{v.baseState || "—"}</td>
                      <td className="small">
                        {v.stateTax
                          ? `${fmtINR(v.stateTax.entryTax)} + ${fmtINR(v.stateTax.perPassenger)}/pax`
                          : "—"}
                      </td>
                      <td className="small">
                        ₹{v.perKm}/km · ₹{v.perDay.toLocaleString("en-IN")}/day
                      </td>
                      <td>
                        <span className={`tag ${VERIFY_TAG[v.verifyStatus] ?? "tag-dim"}`}>
                          {v.ownerActive ? v.verifyStatus : "blocked"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "queue" && (
          <>
            {d.pendingVehicles.length === 0 && (
              <div className="banner banner-accent">
                Verification queue is empty — every listed vehicle is reviewed.
              </div>
            )}
            {d.pendingVehicles.map((v) => (
              <div className="card" key={v.id}>
                <div className="row spread wrap">
                  <span>
                    {v.emoji} <strong>{v.name}</strong>
                    <span className="dim small">
                      {" "}
                      · {v.regNo} · {v.classLabel} · {v.seats} seats ·{" "}
                      {v.owner.company ?? v.owner.name}
                    </span>
                  </span>
                  <span className="row">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => verdict(v.id, true)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={busy}
                      onClick={() => verdict(v.id, false)}
                    >
                      Reject
                    </button>
                  </span>
                </div>
                <p className="dim small" style={{ marginTop: 8 }}>
                  {v.permitType} permit (exp {v.permitExpiry}) · insurance exp{" "}
                  {v.insuranceExpiry} · fitness exp {v.fitnessExpiry} · PUC exp{" "}
                  {v.pucExpiry}
                </p>
              </div>
            ))}
          </>
        )}

        {tab === "disputes" && (
          <>
            <div className="err">{err}</div>
            {d.disputes.length === 0 && (
              <div className="banner banner-accent">No disputes filed.</div>
            )}
            {d.disputes.map((x) => (
              <div className="card" key={x.id}>
                <div className="row spread wrap">
                  <span>
                    <span className={`tag ${x.status === "open" ? "tag-warm" : "tag-accent"}`}>
                      {x.status}
                    </span>{" "}
                    <Link href={`/bookings/${x.bookingId}`} className="mono">
                      {x.bookingCode}
                    </Link>
                    <span className="dim small"> · raised by {x.raisedBy}</span>
                  </span>
                </div>
                <p className="small muted" style={{ margin: "8px 0" }}>
                  {x.message}
                </p>
                {x.status === "open" ? (
                  <div className="row wrap">
                    <input
                      placeholder="Resolution note…"
                      value={resolution[x.id] ?? ""}
                      onChange={(e) =>
                        setResolution({ ...resolution, [x.id]: e.target.value })
                      }
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={busy || !(resolution[x.id] ?? "").trim()}
                      onClick={() => resolve(x.id)}
                    >
                      Resolve
                    </button>
                  </div>
                ) : (
                  <p className="ok-msg small">Resolution: {x.resolution}</p>
                )}
              </div>
            ))}
          </>
        )}

        {tab === "settlements" && (
          <>
            {d.settlements.length === 0 && (
              <div className="banner banner-info">
                Settlements appear here once trips complete.
              </div>
            )}
            {d.settlements.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Booking</th>
                      <th>Total fare</th>
                      <th>Owner payout</th>
                      <th>Agent payout</th>
                      <th>Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.settlements.map((s) => (
                      <tr key={s.bookingId}>
                        <td>
                          <Link href={`/bookings/${s.bookingId}`}>{s.code}</Link>
                        </td>
                        <td>{fmtINR(s.totalFare)}</td>
                        <td style={{ color: "var(--accent)" }}>{fmtINR(s.ownerPayout)}</td>
                        <td style={{ color: "var(--info)" }}>{fmtINR(s.agentPayout)}</td>
                        <td style={{ color: "var(--warm)" }}>
                          {fmtINR(s.platformRevenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "taxes" && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="eyebrow">
              Inter-state levies (charged per state crossed)
            </div>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="small dim" style={{ flex: 1 }} />
              <span className="mono dim" style={{ width: 110, textAlign: "center" }}>
                Entry tax ₹
              </span>
              <span className="mono dim" style={{ width: 110, textAlign: "center" }}>
                ₹ / passenger
              </span>
              <span style={{ width: 62 }} />
            </div>
            {d.taxes.map((t) => (
              <div className="row" key={t.state} style={{ marginBottom: 8 }}>
                <span className="small" style={{ flex: 1 }}>
                  {t.state}
                </span>
                <input
                  type="number"
                  value={taxEdit[`${t.state}|entry`] ?? String(t.entryTax)}
                  onChange={(e) =>
                    setTaxEdit({ ...taxEdit, [`${t.state}|entry`]: e.target.value })
                  }
                  style={{ width: 110 }}
                />
                <input
                  type="number"
                  value={taxEdit[`${t.state}|pax`] ?? String(t.perPassenger)}
                  onChange={(e) =>
                    setTaxEdit({ ...taxEdit, [`${t.state}|pax`]: e.target.value })
                  }
                  style={{ width: 110 }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    saveTax(
                      t.state,
                      taxEdit[`${t.state}|entry`] ?? String(t.entryTax),
                      taxEdit[`${t.state}|pax`] ?? String(t.perPassenger),
                    )
                  }
                >
                  Save
                </button>
              </div>
            ))}
            <div className="row" style={{ marginTop: 14 }}>
              <input
                placeholder="State name"
                value={newTax.state}
                onChange={(e) => setNewTax({ ...newTax, state: e.target.value })}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                placeholder="Entry ₹"
                value={newTax.entryTax}
                onChange={(e) => setNewTax({ ...newTax, entryTax: e.target.value })}
                style={{ width: 110 }}
              />
              <input
                type="number"
                placeholder="₹/pax"
                value={newTax.perPassenger}
                onChange={(e) => setNewTax({ ...newTax, perPassenger: e.target.value })}
                style={{ width: 110 }}
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || !newTax.state || !newTax.entryTax}
                onClick={async () => {
                  await saveTax(newTax.state, newTax.entryTax, newTax.perPassenger);
                  setNewTax({ state: "", entryTax: "", perPassenger: "" });
                }}
              >
                Add
              </button>
            </div>
            <p className="dim small" style={{ marginTop: 10 }}>
              Tax per crossed state = entry tax + (₹/passenger × passenger count).
              The pickup state is never charged.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
