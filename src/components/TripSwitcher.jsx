import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import TripAvatar from "./TripAvatar.jsx";
import {
  createTrip,
  deleteTrip,
  switchTrip,
  useTripList,
} from "../lib/store.js";
import { useClampToViewport } from "../lib/useClampToViewport.js";
import { useI18n } from "../lib/i18n.js";

/**
 * Switch between trips, create a new one, or delete one.
 *
 * The active trip is what every other screen reads, so this is the only place
 * that touches the trip *registry* rather than a trip's contents. It mirrors
 * AppControls' dropdown behaviour — click-away + Escape to close, logical
 * properties so it mirrors correctly in Hebrew.
 */
export default function TripSwitcher() {
  const { t } = useI18n();
  const { activeId, trips } = useTripList();

  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  const shift = useClampToViewport(open, menuRef);

  useEffect(() => {
    if (!open) return undefined;
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = trips.find((trip) => trip.id === activeId);

  const handleDelete = (trip) => {
    // Deleting a trip takes its stops, days and budget with it — guard it.
    if (!window.confirm(t("trips.confirmDelete", { name: trip.title }))) return;
    deleteTrip(trip.id);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t("trips.switch")}
        className="inline-flex max-w-[12rem] items-center gap-1.5 rounded-full border border-line-strong
                   bg-surface px-2.5 py-2 text-xs font-semibold text-fg transition hover:border-accent lg:py-1.5
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <TripAvatar trip={active} size={16} />
        <span className="truncate">{active?.title}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" />
      </button>

      {open && (
        <ul
          ref={menuRef}
          role="listbox"
          aria-label={t("trips.label")}
          style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}
          className="absolute top-full z-50 mt-1 max-h-[70vh] min-w-[15rem] overflow-y-auto rounded-xl
                     border border-line bg-surface shadow-lg shadow-brand-950/20 end-0"
        >
          {trips.map((trip) => {
            const current = trip.id === activeId;
            return (
              <li
                key={trip.id}
                role="option"
                aria-selected={current}
                className="flex items-stretch"
              >
                <button
                  type="button"
                  onClick={() => {
                    switchTrip(trip.id);
                    setOpen(false);
                  }}
                  className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-start text-sm transition ${
                    current
                      ? "bg-accent-soft font-semibold text-fg"
                      : "text-muted hover:bg-raised hover:text-fg"
                  }`}
                >
                  <TripAvatar trip={trip} size={16} />
                  <span className="truncate">{trip.title}</span>
                  {current && <Check size={14} className="ms-auto shrink-0" />}
                </button>
                {/* The last trip has nowhere to fall back to, so it can't be
                    deleted — the store always keeps at least one trip. */}
                {trips.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleDelete(trip)}
                    aria-label={t("trips.delete", { name: trip.title })}
                    className="grid w-9 shrink-0 place-items-center text-subtle transition
                               hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2
                               focus-visible:outline-accent"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}

          <li className="border-t border-line">
            <button
              type="button"
              onClick={() => {
                createTrip({ title: t("trips.newTitle") });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm font-medium text-accent
                         transition hover:bg-raised"
            >
              <Plus size={15} className="shrink-0" />
              {t("trips.new")}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
