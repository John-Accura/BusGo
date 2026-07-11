"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="shell shell-narrow" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 44 }}>🚧</div>
      <h1 className="page-title">Something went wrong</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        The page hit an unexpected error. Your bookings and data are safe.
        {error.digest && (
          <>
            {" "}
            <span className="mono dim">Ref: {error.digest}</span>
          </>
        )}
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <a href="/" className="btn btn-ghost">
          Go home
        </a>
      </div>
    </div>
  );
}
