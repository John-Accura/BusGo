"use client";

import Link from "next/link";
import { useState } from "react";
import TopNav from "@/components/TopNav";

type Role = "customer" | "owner" | "agent";

const ROLE_INFO: Record<Role, [string, string]> = {
  customer: ["🧳 Customer", "Book vehicles for trips, tours and transfers"],
  owner: ["🚐 Vehicle owner", "List your fleet, set pricing, earn"],
  agent: ["🏨 Agent / Hotel", "Book for customers, earn commissions"],
};

export default function RegisterPage() {
  const [role, setRole] = useState<Role>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [city, setCity] = useState("");
  const [agency, setAgency] = useState("");
  const [gstNo, setGstNo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        name,
        email,
        phone,
        password,
        company,
        city,
        agency,
        gstNo,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? "Registration failed");
      setBusy(false);
      return;
    }
    window.location.href = data.home || "/";
  }

  return (
    <>
      <TopNav />
      <div className="shell shell-narrow" style={{ maxWidth: 480 }}>
        <div className="eyebrow" style={{ marginTop: 30 }}>
          Join the platform
        </div>
        <h1 className="page-title">Create an account</h1>
        <form className="card" onSubmit={submit} style={{ marginTop: 14 }}>
          <div className="field">
            <label>I am a…</label>
            {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className="row"
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: role === r ? "var(--accent-dim)" : "var(--surface)",
                  border: `1px solid ${role === r ? "var(--accent-mid)" : "var(--border)"}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 8,
                  color: "var(--text)",
                }}
              >
                <span style={{ fontFamily: "Syne", fontWeight: 700, fontSize: "0.9rem" }}>
                  {ROLE_INFO[r][0]}
                </span>
                <span className="dim small">— {ROLE_INFO[r][1]}</span>
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="field">
              <label>{role === "owner" ? "Owner name" : "Full name"}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </div>
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Password (min 6 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {role === "owner" && (
            <div className="form-grid">
              <div className="field">
                <label>Company / fleet name</label>
                <input value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="field">
                <label>Operating city</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
          )}
          {role === "agent" && (
            <div className="field">
              <label>Agency / hotel name</label>
              <input value={agency} onChange={(e) => setAgency(e.target.value)} />
            </div>
          )}
          {role !== "customer" && (
            <div className="field">
              <label>GST number (optional)</label>
              <input value={gstNo} onChange={(e) => setGstNo(e.target.value)} />
            </div>
          )}

          <div className="err">{err}</div>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
          <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}>
            Already registered? <Link href="/login">Sign in</Link>
          </p>
        </form>
        <p className="dim small" style={{ textAlign: "center", marginTop: 14 }}>
          Drivers receive their login from their fleet owner ·{" "}
          <Link href="/login?admin=1">Platform administrator sign-in</Link>
        </p>
      </div>
    </>
  );
}
