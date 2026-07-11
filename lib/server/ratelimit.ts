import type { NextRequest } from "next/server";

// Small in-memory sliding-window limiter for auth-sensitive endpoints.
// Per-instance on serverless (each lambda has its own window) — that still
// blunts brute force; swap for Upstash/Redis if you need a global limit.
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}
