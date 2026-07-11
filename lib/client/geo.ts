// Browser-side routing + geocoding via free OSM services (build-time HTTPS
// fetches are broken on this machine, and this keeps the server stateless).

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  coords: [number, number][]; // [lat, lng]
  km: number;
  minutes: number;
}

// OSRM supports multiple waypoints in one call — used for multi-city trips
// and for round trips (A;B;A).
export async function fetchRoute(points: RoutePoint[]): Promise<RouteResult | null> {
  if (points.length < 2) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    return {
      coords: (route.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => [lat, lng],
      ),
      km: Math.round((route.distance / 1000) * 10) / 10,
      minutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  label: string;
  state: string; // Indian state, used for inter-state tax calculation
}

export async function searchPlaces(query: string): Promise<GeocodeResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&countrycodes=in&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: { state?: string };
    }[];
    return data.map((d) => ({
      lat: Number(d.lat),
      lng: Number(d.lon),
      label: shortLabel(d.display_name),
      state: d.address?.state ?? "",
    }));
  } catch {
    return [];
  }
}

function shortLabel(displayName: string): string {
  return displayName.split(",").slice(0, 3).join(",").trim();
}

// Straight-line fallback when OSRM is unreachable.
export function haversineKm(a: RoutePoint, b: RoutePoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function fallbackKm(points: RoutePoint[]): number {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  return Math.round(km * 1.35 * 10) / 10;
}
