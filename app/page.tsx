"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/components/TopNav";
import LocationSearch from "@/components/LocationSearch";
import { TRIP_TYPES, type TripType } from "@/lib/shared/fare";
import { encodeTrip, type TripPoint } from "@/lib/client/tripquery";

const today = () => new Date().toISOString().slice(0, 10);

export default function LandingPage() {
  const router = useRouter();
  const [tripType, setTripType] = useState<TripType>("one_way");
  const [pickup, setPickup] = useState<TripPoint | null>(null);
  const [drop, setDrop] = useState<TripPoint | null>(null);
  const [stops, setStops] = useState<TripPoint[]>([]);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [passengers, setPassengers] = useState(10);
  const [night, setNight] = useState(false);
  const [err, setErr] = useState("");

  const multiDay = tripType !== "one_way";

  function search() {
    if (!pickup) return setErr("Choose a pickup location");
    if (!drop) return setErr("Choose a destination");
    if (!startDate) return setErr("Pick a start date");
    const end = multiDay ? (endDate < startDate ? startDate : endDate) : startDate;
    router.push(
      "/search?" +
        encodeTrip({
          tripType,
          pickup,
          drop,
          stops: tripType === "multi_city" ? stops : [],
          startDate,
          endDate: end,
          passengers,
          night,
        }),
    );
  }

  return (
    <>
      <TopNav active="/" />
      <div className="hero-wrap">
        <div className="shell" style={{ padding: 0 }}>
          <div className="eyebrow">7–55+ seats · tourists, groups &amp; bulk transfers</div>
          <h1 className="hero-title">
            Move the whole group. <span>One booking.</span>
          </h1>
          <p className="lead" style={{ marginTop: 14 }}>
            Urbania, tempo travellers, mini-buses and luxury coaches with transparent
            all-inclusive pricing — taxes, tolls and driver bata included upfront.
          </p>
        </div>
      </div>

      <div className="shell" style={{ paddingTop: 0 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="seg" style={{ maxWidth: 560 }}>
            {(Object.keys(TRIP_TYPES) as TripType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={tripType === t ? "on" : ""}
                onClick={() => setTripType(t)}
              >
                {TRIP_TYPES[t]}
              </button>
            ))}
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Pickup location</label>
              <LocationSearch
                placeholder="City, hotel, airport…"
                value={pickup?.addr ?? ""}
                onSelect={(r) =>
                  setPickup({ lat: r.lat, lng: r.lng, addr: r.label, state: r.state })
                }
              />
            </div>
            <div className="field">
              <label>{tripType === "round_trip" ? "Destination (and back)" : "Destination"}</label>
              <LocationSearch
                placeholder="Where to?"
                value={drop?.addr ?? ""}
                onSelect={(r) =>
                  setDrop({ lat: r.lat, lng: r.lng, addr: r.label, state: r.state })
                }
              />
            </div>
          </div>

          {tripType === "multi_city" && (
            <div className="field">
              <label>Stops along the way</label>
              {stops.map((s, i) => (
                <div className="row" key={i} style={{ marginBottom: 8 }}>
                  <span className="tag tag-warm">{i + 1}</span>
                  <span className="small muted" style={{ flex: 1 }}>
                    {s.addr}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setStops(stops.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <LocationSearch
                placeholder="Add a stop…"
                value=""
                onSelect={(r) =>
                  setStops([
                    ...stops,
                    { lat: r.lat, lng: r.lng, addr: r.label, state: r.state },
                  ])
                }
              />
            </div>
          )}

          <div className="form-grid">
            <div className="field">
              <label>Start date</label>
              <input
                type="date"
                value={startDate}
                min={today()}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {multiDay ? (
              <div className="field">
                <label>End date</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label>Passengers</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          {multiDay && (
            <div className="form-grid">
              <div className="field">
                <label>Passengers</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={passengers}
                  onChange={(e) => setPassengers(Number(e.target.value))}
                />
              </div>
              <div className="field row" style={{ paddingTop: 22 }}>
                <button
                  type="button"
                  className={`switch ${night ? "on" : ""}`}
                  onClick={() => setNight(!night)}
                  aria-label="Night travel"
                />
                <span className="small muted">Includes night travel (10 PM – 6 AM)</span>
              </div>
            </div>
          )}

          <div className="err">{err}</div>
          <button className="btn btn-primary btn-block" onClick={search}>
            Find vehicles →
          </button>
        </div>

        <div className="grid4" style={{ marginTop: 28 }}>
          {[
            ["7–55+", "Seat range"],
            ["₹0", "Hidden charges"],
            ["4+1", "Platform modules"],
            ["Live", "Trip tracking"],
          ].map(([v, l]) => (
            <div className="stat-card" key={l}>
              <div className="stat-value">{v}</div>
              <div className="stat-label">{l}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
