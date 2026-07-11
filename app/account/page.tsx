"use client";

import { useEffect, useState } from "react";
import TopNav from "@/components/TopNav";

export default function AccountPage() {
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.session))
      .catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    if (next !== confirm) {
      setErr("New passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error ?? "Could not change the password");
        return;
      }
      setOk("Password updated.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopNav />
      <div className="shell shell-narrow" style={{ maxWidth: 440 }}>
        <div className="eyebrow" style={{ marginTop: 20 }}>
          Account
        </div>
        <h1 className="page-title">{me ? me.name : "Your account"}</h1>
        {me && (
          <p className="muted small" style={{ marginBottom: 16 }}>
            Signed in as {me.role}
          </p>
        )}
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginBottom: 12 }}>Change password</h3>
          <div className="field">
            <label>Current password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>New password (min 6)</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          <div className="err">{err}</div>
          {ok && <p className="ok-msg" style={{ marginBottom: 8 }}>{ok}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </>
  );
}
