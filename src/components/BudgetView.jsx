import {
  Bed,
  CalendarCheck,
  Home,
  Landmark,
  Route,
  Wallet,
} from "lucide-react";
import { destinationCost, legTotals, num } from "../lib/store.js";
import { formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

/* The category swatches walk down the single brand ramp, so the chart reads as
   one sequential family rather than four unrelated hues. */
const CATEGORIES = [
  {
    id: "sleeping",
    key: "budget.sleeping",
    icon: Bed,
    color: "var(--color-brand-600)",
  },
  {
    id: "transport",
    key: "budget.transport",
    icon: Route,
    color: "var(--color-brand-500)",
  },
  {
    id: "attractions",
    key: "budget.attractions",
    icon: Landmark,
    color: "var(--color-brand-400)",
  },
  {
    id: "reservations",
    key: "budget.reserved",
    icon: CalendarCheck,
    color: "var(--color-brand-300)",
  },
];

export default function BudgetView({ trip, destinations, stats }) {
  const { t } = useI18n();
  const { currency } = trip;
  const totals = {
    sleeping: stats.sleeping,
    transport: stats.transport,
    attractions: stats.attractions,
    reservations: stats.reservations,
  };
  const perNight = stats.plannedNights ? stats.total / stats.plannedNights : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-5 py-5 md:px-8">
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="col-head">
              <Wallet size={13} /> {t("budget.total")}
            </h2>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight">
              {formatMoney(stats.total, currency)}
            </p>
          </div>
          <p className="tabular text-end text-sm text-muted">
            <span className="block font-semibold text-fg">
              {formatMoney(perNight, currency)}
            </span>
            {t("budget.perNight")}
          </p>
        </div>

        {/* Share-of-total bar */}
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-accent-soft">
          {CATEGORIES.map((cat) => {
            const share = stats.total
              ? (totals[cat.id] / stats.total) * 100
              : 0;
            if (share <= 0) return null;
            return (
              <span
                key={cat.id}
                style={{ width: `${share}%`, background: cat.color }}
                title={`${t(cat.key)}: ${formatMoney(totals[cat.id], currency)}`}
              />
            );
          })}
        </div>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => {
            const share = stats.total
              ? Math.round((totals[cat.id] / stats.total) * 100)
              : 0;
            return (
              <li
                key={cat.id}
                className="rounded-xl border border-line bg-raised p-3"
              >
                <span className="col-head">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: cat.color }}
                  />
                  {t(cat.key)}
                </span>
                <p className="tabular mt-1 text-lg font-semibold">
                  {formatMoney(totals[cat.id], currency)}
                </p>
                <p className="tabular text-xs text-muted">
                  {t("budget.shareOfTotal", { n: share })}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card overflow-hidden">
        <h2 className="col-head border-b border-line px-5 py-3">
          {t("budget.byDestination")}
        </h2>

        {destinations.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            {t("budget.empty")}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {trip.origin && (
              <li className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-line-strong text-subtle"
                  >
                    <Home size={12} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-muted">
                      {trip.origin.name || t("budget.origin")}
                    </span>
                    <span className="tabular block text-xs text-muted">
                      {t("budget.originTransport")}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(legTotals(trip.origin).cost, currency)}
                  </span>
                </div>
              </li>
            )}
            {destinations.map((dest, i) => {
              const cost = destinationCost(trip, dest);
              const share = stats.total ? (cost / stats.total) * 100 : 0;
              return (
                <li key={dest.id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line-strong text-[11px] font-semibold">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {dest.name}
                      </span>
                      <span className="tabular block text-xs text-muted">
                        {dest.nights}{" "}
                        {dest.nights === 1
                          ? t("plan.night")
                          : t("plan.nightsPlural")}
                        {num(dest.sleeping?.cost) > 0 &&
                          ` · ${t("budget.perNightRate", {
                            amount: formatMoney(
                              num(dest.sleeping.cost),
                              currency,
                            ),
                          })}`}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-sm font-semibold">
                      {formatMoney(cost, currency)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent-soft">
                    <span
                      className="block h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs text-subtle">{t("budget.note")}</p>
    </div>
  );
}
