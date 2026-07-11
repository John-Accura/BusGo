"use client";

import { useRef, useState } from "react";
import { searchPlaces, type GeocodeResult } from "@/lib/client/geo";

interface Props {
  placeholder: string;
  value: string;
  onSelect: (r: GeocodeResult) => void;
}

export default function LocationSearch({ placeholder, value, onSelect }: Props) {
  // null = not editing (input mirrors the parent-provided value)
  const [query, setQuery] = useState<string | null>(null);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      setResults(await searchPlaces(q.trim()));
    }, 450);
  }

  return (
    <div className="loc-search">
      <input
        value={query ?? value}
        placeholder={placeholder}
        onChange={onChange}
        onBlur={() => {
          setTimeout(() => {
            setQuery(null);
            setResults([]);
          }, 250);
        }}
      />
      {results.length > 0 && (
        <div className="loc-results">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => {
                setQuery(null);
                setResults([]);
                onSelect(r);
              }}
            >
              {r.label}
              {r.state ? <span className="dim"> · {r.state}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
