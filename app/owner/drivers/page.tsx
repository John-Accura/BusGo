"use client";

import { useCallback, useEffect, useState } from "react";
import TopNav from "@/components/TopNav";

interface DriverRow {
  userId: number;
  name: string;
  email: string;
  phone: string | null;
  licenseNo: string | null;
  experienceYears: number;
}

export default function OwnerDriversPage() {
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    licenseNo: "",
    experienceYears: 3,
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/dashboard");
      const d = await res.json();
      if (res.ok) setDrivers(d.drivers);
    } catch {
      // Empty/invalid body (dev-server restart, network blip) — retry shortly.
      setTimeout(load, 2500);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setOk("");
    const res = await fetch("/api/owner/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(d.error ?? "Could not add the driver");
      return;
    }
    setOk(`Driver added — they sign in with ${form.email}`);
    setForm({ name: "", email: "", phone: "", password: "", licenseNo: "", experienceYears: 3 });
    load();
  }

  return (
    <>
      <TopNav active="/owner/drivers" />
      <div className="shell shell-narrow">
        <div className="eyebrow" style={{ marginTop: 8 }}>
          Fleet drivers
        </div>
        <h1 className="page-title">Drivers</h1>
        <p className="lead small">
          Drivers you add here get their own BusGo login for trip management —
          navigation, odometer verification and expense logging.
        </p>

        <form className="card" onSubmit={addDriver}>
          <h3 style={{ marginBottom: 12 }}>Add a driver</h3>
          <div className="form-grid">
            <div className="field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91…"
              />
            </div>
            <div className="field">
              <label>Login email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Login password</label>
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
              />
            </div>
            <div className="field">
              <label>Driving license no.</label>
              <input
                value={form.licenseNo}
                onChange={(e) => setForm({ ...form, licenseNo: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Experience (years)</label>
              <input
                type="number"
                min={0}
                value={form.experienceYears}
                onChange={(e) =>
                  setForm({ ...form, experienceYears: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="err">{err}</div>
          {ok && <p className="ok-msg">{ok}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add driver"}
          </button>
        </form>

        {drivers?.map((d) => (
          <div className="card" key={d.userId}>
            <div className="row spread wrap">
              <span>
                🧑‍✈️ <strong>{d.name}</strong>
                <span className="dim small">
                  {" "}
                  · {d.licenseNo} · {d.experienceYears} yrs
                </span>
              </span>
              <span className="dim small">
                {d.email}
                {d.phone && ` · ${d.phone}`}
              </span>
            </div>
          </div>
        ))}
        {drivers?.length === 0 && (
          <div className="banner banner-info">No drivers yet — add your first one above.</div>
        )}
      </div>
    </>
  );
}
