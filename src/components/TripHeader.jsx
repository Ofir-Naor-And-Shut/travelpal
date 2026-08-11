import { useState } from "react";
import { addDays, format, parseISO } from "date-fns";
import { Check, Pencil } from "lucide-react";
import ProgressRing from "./ProgressRing.jsx";
import AppControls from "./AppControls.jsx";
import TripSwitcher from "./TripSwitcher.jsx";
import TripMenu from "./TripMenu.jsx";
import { CURRENCIES, updateTrip } from "../lib/store.js";
import { currencySymbol, formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

export default function TripHeader({
  trip,
  stats,
  view,
  onChangeView,
  onBackToTrips,
}) {
  const [editing, setEditing] = useState(false);
  const { t } = useI18n();

  // Fixed dd/MM/yy on purpose — the trip range reads the same in both
  // languages (the digits carry it), so it isn't run through dateLocale.
  const range = `${format(parseISO(trip.startDate), "dd/MM/yy")} – ${format(
    parseISO(trip.endDate),
    "dd/MM/yy",
  )}`;

  return (
    <header className="border-b border-line bg-surface px-5 pt-4 md:px-8">
      {/* Language + theme sit at the inline-start of the header. On phones the
          row wraps so the trip switcher drops to its own line rather than being
          clipped off the edge; on desktop it stays a single row. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:flex-nowrap">
        <div className="flex items-center gap-2">
          <TripMenu
            trip={trip}
            view={view}
            onChangeView={onChangeView}
            onBackToTrips={onBackToTrips}
          />
          <AppControls />
        </div>
        {/* Full-width on its own wrapped line on phones; natural width inline
            on desktop. */}
        <div className="min-w-0 basis-full lg:basis-auto">
          <TripSwitcher />
        </div>
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
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-fg md:text-2xl">
                <span className="truncate">{trip.title}</span>
                <span aria-hidden>{trip.emoji}</span>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  onClick={() => setEditing(true)}
                  aria-label={t("header.editTrip")}
                >
                  <Pencil size={15} />
                </button>
              </h1>
              <p className="tabular mt-0.5 text-sm text-muted">{range}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-6">
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
                  <option key={c.code} value={c.code}>
                    {c.code} {currencySymbol(c.code)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2.5 border-s border-line ps-6">
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
              <p className="font-semibold text-fg">{t("header.nights")}</p>
              <p className="text-muted">{t("header.planned")}</p>
            </div>
          </div>
        </div>
      </div>

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
