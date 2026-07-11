// Trip search state carried through the URL: landing → /search → /book/[id].

import { DEFAULT_STATE_TAX, type StateTaxRate, type TripType } from "@/lib/shared/fare";

export interface TripPoint {
  lat: number;
  lng: number;
  addr: string;
  state: string;
}

export interface TripQuery {
  tripType: TripType;
  pickup: TripPoint;
  drop: TripPoint;
  stops: TripPoint[];
  startDate: string;
  endDate: string;
  passengers: number;
  night: boolean;
}

export function encodeTrip(q: TripQuery): string {
  const sp = new URLSearchParams();
  sp.set("trip", q.tripType);
  sp.set("pickup", JSON.stringify(q.pickup));
  sp.set("drop", JSON.stringify(q.drop));
  if (q.stops.length) sp.set("stops", JSON.stringify(q.stops));
  sp.set("start", q.startDate);
  sp.set("end", q.endDate);
  sp.set("pax", String(q.passengers));
  if (q.night) sp.set("night", "1");
  return sp.toString();
}

export function decodeTrip(sp: URLSearchParams): TripQuery | null {
  try {
    const pickup = JSON.parse(sp.get("pickup") ?? "");
    const drop = JSON.parse(sp.get("drop") ?? "");
    const startDate = sp.get("start") ?? "";
    if (!pickup?.lat || !drop?.lat || !startDate) return null;
    return {
      tripType: (sp.get("trip") ?? "one_way") as TripType,
      pickup,
      drop,
      stops: JSON.parse(sp.get("stops") ?? "[]"),
      startDate,
      endDate: sp.get("end") || startDate,
      passengers: Number(sp.get("pax") ?? 1) || 1,
      night: sp.get("night") === "1",
    };
  } catch {
    return null;
  }
}

// Waypoint chain for routing (round trips return to the pickup point).
export function routePoints(q: TripQuery): TripPoint[] {
  const pts = [q.pickup, ...q.stops, q.drop];
  if (q.tripType === "round_trip") pts.push(q.pickup);
  return pts;
}

// Distinct states crossed, for the inter-state tax line.
export function tripStates(q: TripQuery): string[] {
  return [...new Set(routePoints(q).map((p) => p.state).filter(Boolean))];
}

export function stateTaxTotal(
  q: TripQuery,
  taxMap: Record<string, StateTaxRate>,
  passengers = q.passengers,
): number {
  const lower = Object.fromEntries(
    Object.entries(taxMap).map(([k, v]) => [k.toLowerCase(), v]),
  );
  let total = 0;
  for (const s of tripStates(q)) {
    if (s === q.pickup.state) continue;
    const rate = lower[s.toLowerCase()] ?? DEFAULT_STATE_TAX;
    total += rate.entryTax + rate.perPassenger * Math.max(1, passengers);
  }
  return total;
}
