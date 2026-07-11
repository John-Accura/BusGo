import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell shell-narrow" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 44 }}>🗺️</div>
      <h1 className="page-title">Page not found</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        This route doesn&apos;t exist — maybe the link is old.
      </p>
      <Link href="/" className="btn btn-primary">
        Back to search
      </Link>
    </div>
  );
}
