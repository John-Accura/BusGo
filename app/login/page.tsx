"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "@/components/TopNav";

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    setIsLocal(["localhost", "127.0.0.1"].includes(window.location.hostname));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? "Sign in failed");
      setBusy(false);
      return;
    }
    window.location.href = params.get("next") || data.home || "/";
  }

  return (
    <div className="shell shell-narrow" style={{ maxWidth: 440 }}>
      <div className="eyebrow" style={{ marginTop: 30 }}>
        Welcome back
      </div>
      <h1 className="page-title">Sign in</h1>
      <form className="card" onSubmit={submit} style={{ marginTop: 14 }}>
        <div className="field">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="err">{err}</div>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="small muted" style={{ textAlign: "center", marginTop: 12 }}>
          New to BusGo? <Link href="/register">Create an account</Link>
        </p>
      </form>
      {isLocal && (
        <p className="dim small" style={{ marginTop: 14, lineHeight: 1.9 }}>
          Demo accounts (password <span className="mono">bus2026</span>):
          <br />
          customer@demo.local · owner@demo.local · agent@demo.local ·
          driver@demo.local
          <br />
          Admin: admin@busgo.local / <span className="mono">admin@123</span>
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <TopNav />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
