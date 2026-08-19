import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import AppControls from "./AppControls.jsx";
import TripLogo from "./TripLogo.jsx";
import { fetchSharedTrip } from "../lib/sharing.js";
import {
  formatDay,
  normalize,
  tripDays,
  tripStats,
  withDates,
} from "../lib/store.js";
import { formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

/**
 * The public, unauthenticated view for a `#/shared/<token>` link — read-only,
 * no sign-in, no editor. Deliberately its own simple page rather than reusing
 * the editor's view components, which are all wired to the active trip in the
 * store and its mutation functions.
 */
export default function SharedTripView({ token }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "loading", trip: null });

  useEffect(() => {
    let cancelled = false;
    fetchSharedTrip(token)
      .then((data) => {
        if (cancelled) return;
        setState(
          data
            ? { status: "ready", trip: normalize(data) }
            : { status: "notfound", trip: null },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", trip: null });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-full place-items-center app-canvas">
        <span className="animate-pulse text-3xl" aria-hidden>
          🌍
        </span>
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 app-canvas px-5 text-center">
        <p className="text-lg font-semibold text-fg">
          {t(
            state.status === "notfound"
              ? "shared.notFoundTitle"
              : "shared.loadError",
          )}
        </p>
        {state.status === "notfound" && (
          <p className="max-w-sm text-sm text-muted">
            {t("shared.notFoundBody")}
          </p>
        )}
        <a href="#" className="btn-soft mt-2">
          {t("shared.openApp", { app: t("app.name") })}
        </a>
      </div>
    );
  }

  const trip = state.trip;
  const destinations = withDates(trip);
  const days = tripDays(trip, destinations);
  const stats = tripStats(trip);

  return (
    <div className="min-h-full app-canvas">
      <div className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <TripLogo />
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-fg">
              {t("shared.badge")}
            </span>
            <AppControls />
          </div>
        </div>

        <header className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-fg">
            <span className="truncate">{trip.title}</span>
            <span aria-hidden>{trip.emoji}</span>
          </h1>
          <p className="tabular mt-1 text-sm text-muted">
            {format(parseISO(trip.startDate), "dd/MM/yy")} –{" "}
            {format(parseISO(trip.endDate), "dd/MM/yy")}
          </p>
        </header>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">
            {t("tab.destinations")}
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {destinations.map((d) => (
              <li key={d.id} className="card p-4">
                <p className="truncate font-medium text-fg">
                  {d.name}
                  {d.country ? `, ${d.country}` : ""}
                </p>
                <p className="text-sm text-muted">
                  {t("picker.nights", { count: d.nights })}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">
            {t("tab.dayByDay")}
          </h2>
          <ul className="space-y-3">
            {days.map((day) => {
              const items = [
                ...day.entry.attractions,
                ...day.entry.reservations,
              ];
              return (
                <li key={day.key} className="card p-4">
                  <p className="mb-2 text-sm font-semibold text-fg">
                    {day.dest.name} · {formatDay(day.date)}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-sm text-muted">{t("pdf.noPlans")}</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 text-fg"
                        >
                          <span className="truncate">
                            {item.name || t("pdf.attraction")}
                          </span>
                          <span className="tabular shrink-0 text-muted">
                            {[
                              item.time,
                              item.cost
                                ? formatMoney(item.cost, trip.currency)
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">
            {t("tab.budget")}
          </h2>
          <p className="tabular text-xl font-semibold text-fg">
            {formatMoney(stats.total, trip.currency)}
          </p>
        </section>
      </div>
    </div>
  );
}
