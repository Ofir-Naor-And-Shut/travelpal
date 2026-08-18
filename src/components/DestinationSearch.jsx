import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { searchLocal, searchRemote } from "../lib/places.js";
import {
  autocompleteGooglePlaces,
  hasGoogleKey,
  resolveGooglePlace,
} from "../lib/googlePlaces.js";
import { useI18n } from "../lib/i18n.js";

export default function DestinationSearch({ onSelect, placeholder, label }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    // Show the built-in matches immediately, then top up from the geocoder.
    const local = searchLocal(q);
    setResults(local);
    setHighlight(0);

    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Google, when a key is present, is the far better geocoder — fall
        // back to the free OSM lookup if it errors or there's no key.
        // Autocomplete predictions carry no coordinates yet; `choose` resolves
        // them (one billed Details call) only for the option actually picked.
        const remote = hasGoogleKey()
          ? await autocompleteGooglePlaces(q, {
              signal: controller.signal,
              // Localities/admin areas/countries only — no streets or businesses.
              types: ["(regions)"],
            }).catch(() => searchRemote(q, controller.signal))
          : await searchRemote(q, controller.signal);
        const seen = new Set(local.map((r) => `${r.name}|${r.country}`));
        const merged = [
          ...local,
          ...remote.filter((r) => !seen.has(`${r.name}|${r.country}`)),
        ];
        setResults(merged.slice(0, 8));
      } catch {
        // Offline or rate-limited — the local list still stands.
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setLoading(false);
    };
  }, [query]);

  useEffect(() => {
    const onClickAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  async function choose(place) {
    // Autocomplete predictions have no coordinates yet — resolve them now,
    // the one Details call this pick actually costs.
    const resolved =
      place.source === "google" && place.placeId
        ? await resolveGooglePlace(place.placeId).catch(() => place)
        : place;

    onSelect({
      name: resolved.name,
      country: resolved.country || place.address,
      lat: resolved.lat,
      lng: resolved.lng,
    });
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        // No match to pick — add a free-text stop the user can place later.
        choose({ name: query.trim(), country: "", lat: 0, lng: 0 });
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <Search size={17} className="shrink-0 text-subtle" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? t("plan.addPlaceholder")}
          aria-label={label ?? t("plan.searchLabel")}
          aria-expanded={open && results.length > 0}
          role="combobox"
          aria-controls="destination-results"
          className="w-full bg-transparent text-sm text-fg placeholder:text-subtle focus:outline-none"
        />
        {loading && (
          <Loader2 size={15} className="shrink-0 animate-spin text-subtle" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="destination-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg shadow-brand-950/20"
        >
          {results.map((place, i) => (
            <li key={place.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(place)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition ${
                  i === highlight ? "bg-accent-soft" : "hover:bg-raised"
                }`}
              >
                <MapPin size={15} className="shrink-0 text-muted" />
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate">
                  <span className="font-medium text-fg">{place.name}</span>
                  {(place.country || place.address) && (
                    <span className="truncate text-xs text-accent">
                      {place.country || place.address}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
