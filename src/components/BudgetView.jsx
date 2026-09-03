import {
  Bed,
  CalendarCheck,
  Flag,
  Home,
  Landmark,
  Route,
  Wallet,
} from "lucide-react";
import {
  dayKey,
  destinationCost,
  effectiveLastStop,
  getDay,
  legTotals,
  num,
  sleepingCost,
} from "../lib/store.js";
import { formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

/* Each category keeps its own tint everywhere in the app (day cards, docs,
   this chart) rather than walking the brand ramp — one consistent legend. */
const CATEGORIES = [
  {
    id: "sleeping",
    key: "budget.sleeping",
    icon: Bed,
    color: "var(--color-cat-sleeping)",
  },
  {
    id: "transport",
    key: "budget.transport",
    icon: Route,
    color: "var(--color-cat-transport)",
  },
  {
    id: "attractions",
    key: "budget.attractions",
    icon: Landmark,
    color: "var(--color-cat-attractions)",
  },
  {
    id: "reservations",
    key: "budget.reserved",
    icon: CalendarCheck,
    color: "var(--color-cat-reservations)",
  },
];

/** A stop's cost split the same way the trip-wide stats are, for the
 * by-destination breakdown table. */
function categoryCosts(trip, dest) {
  const days = Array.from({ length: dest.nights }, (_, n) =>
    getDay(trip, dayKey(dest.id, n)),
  );
  return {
    sleeping: sleepingCost(trip, dest),
    transport: legTotals(dest).cost,
    attractions: days.reduce(
      (s, day) => s + day.attractions.reduce((s2, a) => s2 + num(a.cost), 0),
      0,
    ),
    reservations: days.reduce(
      (s, day) => s + day.reservations.reduce((s2, r) => s2 + num(r.cost), 0),
      0,
    ),
  };
}

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
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-5 md:px-8">
      <section className="card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="col-head">
              <Wallet size={13} /> {t("budget.total")}
            </h2>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <p className="tabular text-3xl font-bold tracking-tight text-fg md:text-4xl">
                {formatMoney(stats.total, currency)}
              </p>
              <span className="tabular rounded-full bg-raised px-3 py-1 text-sm font-medium text-muted">
                {formatMoney(perNight, currency)} {t("budget.perNight")}
              </span>
            </div>
          </div>
          {stats.unplannedNights > 0 && (
            <p className="tabular text-end text-sm text-muted">
              {t("budget.unplannedNights", { n: stats.unplannedNights })}
            </p>
          )}
        </div>

        {/* Share-of-total bar */}
        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-accent-soft shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.12)]">
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
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CATEGORIES.map((cat) => {
          const share = stats.total
            ? Math.round((totals[cat.id] / stats.total) * 100)
            : 0;
          const Icon = cat.icon;
          return (
            <div
              key={cat.id}
              className="card p-4 transition hover:shadow-md"
              style={{
                borderInlineStartWidth: 4,
                borderInlineStartColor: cat.color,
              }}
            >
              <div className="flex items-start justify-between">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-full"
                  style={{
                    background: `color-mix(in srgb, ${cat.color} 22%, transparent)`,
                    color: "var(--color-fg)",
                  }}
                >
                  <Icon size={18} />
                </span>
                {stats.total > 0 && (
                  <span className="tabular text-sm font-semibold text-muted">
                    {share}%
                  </span>
                )}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-fg">
                {t(cat.key)}
              </h3>
              <p className="tabular mt-0.5 text-lg font-semibold text-fg">
                {formatMoney(totals[cat.id], currency)}
              </p>
            </div>
          );
        })}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-start text-sm">
              <thead>
                <tr className="border-b border-line bg-raised text-[11px] font-semibold uppercase tracking-wider text-muted">
                  <th className="px-5 py-3 text-start font-semibold">
                    {t("budget.destination")}
                  </th>
                  {CATEGORIES.map((cat) => (
                    <th
                      key={cat.id}
                      className="px-4 py-3 text-end font-semibold"
                    >
                      {t(cat.key)}
                    </th>
                  ))}
                  <th className="px-5 py-3 text-end font-semibold text-fg">
                    {t("budget.total")}
                  </th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {trip.origin && (
                  <tr>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-semibold text-muted">
                        <Home size={13} className="shrink-0" />
                        <span className="truncate">
                          {trip.origin.name || t("budget.origin")}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end text-subtle">–</td>
                    <td className="px-4 py-3 text-end text-muted">
                      {formatMoney(legTotals(trip.origin).cost, currency)}
                    </td>
                    <td className="px-4 py-3 text-end text-subtle">–</td>
                    <td className="px-4 py-3 text-end text-subtle">–</td>
                    <td className="px-5 py-3 text-end font-semibold text-muted">
                      {formatMoney(legTotals(trip.origin).cost, currency)}
                    </td>
                  </tr>
                )}
                {destinations.map((dest, i) => {
                  const c = categoryCosts(trip, dest);
                  const total = destinationCost(trip, dest);
                  return (
                    <tr
                      key={dest.id}
                      className="transition-colors hover:bg-raised"
                    >
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-semibold text-fg">
                          <span className="tabular grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-fg">
                            {i + 1}
                          </span>
                          <span className="truncate">{dest.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end text-muted">
                        {formatMoney(c.sleeping, currency)}
                      </td>
                      <td className="px-4 py-3 text-end text-muted">
                        {formatMoney(c.transport, currency)}
                      </td>
                      <td className="px-4 py-3 text-end text-muted">
                        {formatMoney(c.attractions, currency)}
                      </td>
                      <td className="px-4 py-3 text-end text-muted">
                        {formatMoney(c.reservations, currency)}
                      </td>
                      <td className="px-5 py-3 text-end font-bold text-fg">
                        {formatMoney(total, currency)}
                      </td>
                    </tr>
                  );
                })}
                {trip.lastStop && (
                  <tr>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-semibold text-muted">
                        <Flag size={13} className="shrink-0" />
                        <span className="truncate">
                          {effectiveLastStop(trip)?.name ||
                            t("budget.lastStop")}
                        </span>
                      </span>
                    </td>
                    <td
                      colSpan={4}
                      className="px-4 py-3 text-end text-xs text-subtle"
                    >
                      {t("budget.lastStopNote")}
                    </td>
                    <td className="px-5 py-3 text-end text-subtle">–</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="tabular border-t-2 border-line bg-raised">
                  <td className="px-5 py-3 font-semibold text-fg">
                    {t("budget.total")}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-muted">
                    {formatMoney(stats.sleeping, currency)}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-muted">
                    {formatMoney(stats.transport, currency)}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-muted">
                    {formatMoney(stats.attractions, currency)}
                  </td>
                  <td className="px-4 py-3 text-end font-semibold text-muted">
                    {formatMoney(stats.reservations, currency)}
                  </td>
                  <td className="px-5 py-3 text-end text-base font-bold text-accent">
                    {formatMoney(stats.total, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="px-1 text-xs text-subtle">{t("budget.note")}</p>
    </div>
  );
}
