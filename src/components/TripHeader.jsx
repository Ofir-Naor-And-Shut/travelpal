import { useEffect, useRef, useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { CalendarDays, Check, Moon, Pencil } from "lucide-react";
import ProgressRing from "./ProgressRing.jsx";
import AppControls from "./AppControls.jsx";
import TripMenu from "./TripMenu.jsx";
import TripPhotoControl from "./TripPhotoControl.jsx";
import { CURRENCIES, updateTrip } from "../lib/store.js";
import { currencySymbol, formatMoney } from "../lib/money.js";
import { useClampToViewport } from "../lib/useClampToViewport.js";
import { useI18n } from "../lib/i18n.js";

export default function TripHeader({ trip, stats, onBackToTrips }) {
  const [editing, setEditing] = useState(false);
  const { t } = useI18n();

  // Fixed dd/MM/yy on purpose — the trip range reads the same in both
  // languages (the digits carry it), so it isn't run through dateLocale.
  const range = `${format(parseISO(trip.startDate), "dd/MM/yy")} – ${format(
    parseISO(trip.endDate),
    "dd/MM/yy",
  )}`;

  return (
    <header className="border-b border-line bg-surface ps-5 pe-20 pt-6 md:ps-8 md:pe-24 lg:px-8">
      {/* Language + theme sit at the inline-start of the header; the app menu
          (with the way back to All trips) sits alongside it. */}
      <div className="mb-3 flex items-center gap-2">
        <TripMenu trip={trip} onBackToTrips={onBackToTrips} />
        <AppControls />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {editing ? (
            <div className="flex flex-wrap items-end gap-2">
              <input
                className="field !w-auto max-w-[16rem] text-lg font-semibold"
                value={trip.title}
                autoFocus
                onChange={(e) => updateTrip({ title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
                aria-label={t("header.title")}
              />
              <label className="flex flex-col text-xs font-medium text-muted">
                {t("header.startDate")}
                <input
                  type="date"
                  className="field tabular mt-1 !w-auto"
                  value={trip.startDate}
                  onChange={(e) => {
                    const startDate = e.target.value;
                    // Keep end date after start date — push it forward if the
                    // newly picked start date would land on or after it.
                    const endDate =
                      startDate >= trip.endDate
                        ? format(addDays(parseISO(startDate), 1), "yyyy-MM-dd")
                        : trip.endDate;
                    updateTrip({ startDate, endDate });
                  }}
                />
              </label>
              <label className="flex flex-col text-xs font-medium text-muted">
                {t("header.endDate")}
                <input
                  type="date"
                  className="field tabular mt-1 !w-auto"
                  value={trip.endDate}
                  min={trip.startDate}
                  onChange={(e) => updateTrip({ endDate: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="btn-soft"
                onClick={() => setEditing(false)}
              >
                <Check size={16} /> {t("header.done")}
              </button>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-accent md:text-2xl">
                <span className="truncate">{trip.title}</span>
                <TripPhotoControl trip={trip} />
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  onClick={() => setEditing(true)}
                  aria-label={t("header.editTrip")}
                >
                  <Pencil size={15} />
                </button>
              </h1>
              <p className="tabular mt-1 flex items-center gap-1.5 text-sm text-muted">
                <CalendarDays size={14} />
                {range}
              </p>
            </>
          )}
        </div>

        {/* Desktop keeps the full card inline; on phones it's replaced by the
            floating corner widget below so it doesn't crowd the title. */}
        <div className="glass-card hidden items-center gap-4 px-4 py-2.5 lg:flex">
          <BudgetProgressDetails trip={trip} stats={stats} t={t} />
        </div>
      </div>

      <MobileBudgetWidget trip={trip} stats={stats} t={t} />

      {stats.overplanned && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-fg">
          {t("header.overplanned", {
            planned: stats.plannedNights,
            total: stats.totalNights,
          })}
        </p>
      )}
    </header>
  );
}

/** The cost + currency and nights-ring blocks, shared by the desktop card and
 * the phone popover so they never drift apart. */
function BudgetProgressDetails({ trip, stats, t }) {
  return (
    <>
      <div className="text-end">
        <p className="tabular text-xl font-semibold text-fg">
          {formatMoney(stats.total, trip.currency)}
        </p>
        <label className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
          {t("header.costIn")}
          <select
            value={trip.currency}
            onChange={(e) => updateTrip({ currency: e.target.value })}
            className="cursor-pointer rounded border-none bg-transparent py-1 font-medium text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 lg:py-0"
            aria-label={t("header.currency")}
          >
            {CURRENCIES.map((c) => (
              <option
                key={c.code}
                value={c.code}
                style={{
                  background: "var(--color-surface)",
                  color: "var(--color-fg)",
                }}
              >
                {c.code} {currencySymbol(c.code)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2.5 border-s border-line ps-4">
        <ProgressRing
          value={stats.plannedNights}
          total={stats.totalNights}
          over={stats.overplanned}
          label={t("header.nightsPlanned", {
            value: stats.plannedNights,
            total: stats.totalNights,
          })}
        />
        <div className="text-sm leading-tight">
          <p className="flex items-center gap-1 font-semibold text-fg">
            <Moon size={13} className="text-muted" />
            {t("header.nights")}
          </p>
          <p className="text-muted">{t("header.planned")}</p>
        </div>
      </div>
    </>
  );
}

/**
 * Phone-only stand-in for the desktop budget card: a small pill fixed to the
 * top-right of the viewport (so it stays reachable while scrolling, like the
 * bottom nav), showing just the nights ring and total cost. Tapping it opens
 * the same details the desktop card shows, in a popover anchored beneath it.
 */
function MobileBudgetWidget({ trip, stats, t }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const panelRef = useRef(null);
  const shift = useClampToViewport(open, panelRef);

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

  return (
    <div ref={boxRef} className="fixed end-3 top-3 z-40 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("header.budgetSummary")}
        className="glass-card flex items-center gap-2 rounded-full px-2.5 py-1.5 shadow-md shadow-brand-950/10
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span aria-hidden="true">
          <ProgressRing
            value={stats.plannedNights}
            total={stats.totalNights}
            over={stats.overplanned}
            size={28}
            stroke={3}
          />
        </span>
        <span className="tabular pe-0.5 text-xs font-semibold text-fg">
          {formatMoney(stats.total, trip.currency)}
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}
          className="absolute top-full end-0 mt-2 flex items-center gap-4 rounded-2xl border border-line
                     bg-surface p-4 shadow-lg shadow-brand-950/20"
        >
          <BudgetProgressDetails trip={trip} stats={stats} t={t} />
        </div>
      )}
    </div>
  );
}
