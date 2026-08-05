import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Check, LayoutGrid, Pencil } from 'lucide-react'
import ProgressRing from './ProgressRing.jsx'
import AppControls from './AppControls.jsx'
import TripSwitcher from './TripSwitcher.jsx'
import { CURRENCIES, updateTrip } from '../lib/store.js'
import { currencySymbol, formatMoney } from '../lib/money.js'
import { useI18n } from '../lib/i18n.js'

export default function TripHeader({ trip, stats, onBackToTrips }) {
  const [editing, setEditing] = useState(false)
  const { t, dateLocale } = useI18n()

  const opts = { locale: dateLocale }
  const range = `${format(parseISO(trip.startDate), 'dd MMM', opts)} – ${format(
    parseISO(trip.endDate),
    'dd MMM yyyy',
    opts,
  )}`

  return (
    <header className="border-b border-line bg-surface px-5 pt-4 md:px-8">
      {/* Language + theme sit at the inline-start of the header. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {onBackToTrips && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1.5 text-xs"
              onClick={onBackToTrips}
            >
              <LayoutGrid size={14} />
              {t('header.allTrips')}
            </button>
          )}
          <AppControls />
        </div>
        <TripSwitcher />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field !w-auto max-w-[16rem] text-lg font-semibold"
                value={trip.title}
                autoFocus
                onChange={(e) => updateTrip({ title: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
                aria-label={t('header.title')}
              />
              <input
                type="date"
                className="field !w-auto"
                value={trip.startDate}
                max={trip.endDate}
                onChange={(e) => updateTrip({ startDate: e.target.value })}
                aria-label={t('header.startDate')}
              />
              <input
                type="date"
                className="field !w-auto"
                value={trip.endDate}
                min={trip.startDate}
                onChange={(e) => updateTrip({ endDate: e.target.value })}
                aria-label={t('header.endDate')}
              />
              <button
                type="button"
                className="btn-soft"
                onClick={() => setEditing(false)}
              >
                <Check size={16} /> {t('header.done')}
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
                  aria-label={t('header.editTrip')}
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
              {t('header.costIn')}
              <select
                value={trip.currency}
                onChange={(e) => updateTrip({ currency: e.target.value })}
                className="cursor-pointer rounded border-none bg-transparent font-medium text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                aria-label={t('header.currency')}
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
              label={t('header.nightsPlanned', {
                value: stats.plannedNights,
                total: stats.totalNights,
              })}
            />
            <div className="text-sm leading-tight">
              <p className="font-semibold text-fg">{t('header.nights')}</p>
              <p className="text-muted">{t('header.planned')}</p>
            </div>
          </div>
        </div>
      </div>

      {stats.overplanned && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-fg">
          {t('header.overplanned', {
            planned: stats.plannedNights,
            total: stats.totalNights,
          })}
        </p>
      )}
    </header>
  )
}
