"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "pickup" | "drop" | "stop" | "driver";
}

interface Props {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  route?: [number, number][] | null;
  // When this string changes, the map re-fits to show all markers + route.
  fitKey?: string;
}

export const DEFAULT_CENTER: [number, number] = [9.9816, 76.2999]; // Kochi

function iconFor(kind: MapMarker["kind"]): L.DivIcon {
  if (kind === "driver") {
    return L.divIcon({
      className: "",
      html: '<div class="mk-driver">🚌</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
  const size = kind === "stop" ? 14 : 18;
  return L.divIcon({
    className: "",
    html: `<div class="mk mk-${kind}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function applyFit(map: L.Map, pts: [number, number][]) {
  if (pts.length === 0) return;
  if (pts.length === 1) map.setView(pts[0], 13);
  else map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 15 });
}

export default function MapView({
  center = DEFAULT_CENTER,
  zoom = 11,
  markers = [],
  route = null,
  fitKey,
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const routeRef = useRef<L.Polyline | null>(null);
  const lastFitRef = useRef<[number, number][] | null>(null);

  const markersJson = useMemo(() => JSON.stringify(markers), [markers]);
  const routeJson = useMemo(() => JSON.stringify(route ?? []), [route]);

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, { zoomControl: true }).setView(center, zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Recover from 0×0 init (CSS/chunk race): re-measure and re-apply the fit.
    const ro = new ResizeObserver(() => {
      const size = map.getSize();
      const wasBroken = size.x === 0 || size.y === 0;
      map.invalidateSize();
      if (wasBroken && lastFitRef.current) applyFit(map, lastFitRef.current);
    });
    ro.observe(divRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      routeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    const ms: MapMarker[] = JSON.parse(markersJson);
    for (const m of ms) {
      L.marker([m.lat, m.lng], { icon: iconFor(m.kind), interactive: false }).addTo(
        group,
      );
    }
  }, [markersJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeRef.current) {
      routeRef.current.remove();
      routeRef.current = null;
    }
    const pts: [number, number][] = JSON.parse(routeJson);
    if (pts.length > 1) {
      routeRef.current = L.polyline(pts, {
        color: "#4ade80",
        weight: 4,
        opacity: 0.85,
      }).addTo(map);
    }
  }, [routeJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || fitKey === undefined) return;
    const ms: MapMarker[] = JSON.parse(markersJson);
    const rt: [number, number][] = JSON.parse(routeJson);
    const pts: [number, number][] = [
      ...ms.map((m) => [m.lat, m.lng] as [number, number]),
      ...rt,
    ];
    if (pts.length === 0) return;
    lastFitRef.current = pts;
    applyFit(map, pts);
    // Deliberately only refit when fitKey changes, not on every location poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return <div ref={divRef} className="map-root" />;
}
