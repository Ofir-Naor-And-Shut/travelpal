import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { format, isSameDay } from 'date-fns'
import {
  Bed,
  CalendarCheck,
  ChevronDown,
  GripVertical,
  Landmark,
  MapPin,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react'
import { TransportIcon } from './TransportLeg.jsx'
import DocumentsPanel from './DocumentsPanel.jsx'
import AttractionSearch from './AttractionSearch.jsx'
import AttractionLeg from './AttractionLeg.jsx'
import TimeField from './TimeField.jsx'
import {
  addAttraction,
  addDayAccommodation,
  addDayAccommodationDoc,
  addReservation,
  addReservationDoc,
  isPlaced,
  modeColor,
  num,
  removeAttraction,
  removeDayAccommodation,
  removeDayAccommodationDoc,
  removeReservation,
  removeReservationDoc,
  reorderAttraction,
  updateAttraction,
  updateDayAccommodation,
  updateReservation,
} from '../lib/store.js'
import { distanceShort } from '../lib/places.js'
import { useDragReorder } from '../lib/useDragReorder.js'
import { formatDuration, formatMoney } from '../lib/money.js'
import { useI18n } from '../lib/i18n.js'

/**
 * Day-by-day view: the itinerary expanded into one card per night, each of
 * which can carry its own attractions and reservations.
 */
export default function ItineraryView({
  days,
  currency,
  focusDestId,
  onFocusHandled,
  onDayFocus,
}) {
  const { t } = useI18n()

  if (days.length === 0) {
    return (
      <p className="px-8 py-12 text-center text-sm text-muted">
        {t('day.empty')}
      </p>
    )
  }

  const today = new Date()
  // Double-clicking a destination lands on its first night.
  const focusKey = focusDestId
    ? days.find((d) => d.dest.id === focusDestId)?.key
    : null

  return (
    <div className="mx-auto max-w-3xl px-5 py-5 md:px-8">
      <ol className="space-y-2">
        {days.map((day, i) => (
          <li key={day.key}>
            <DayCard
              day={day}
              dayNumber={i + 1}
              currency={currency}
              isToday={isSameDay(day.date, today)}
              focused={day.key === focusKey}
              onFocusHandled={onFocusHandled}
              onDayFocus={onDayFocus}
            />

            {day.leg.length > 0 && day.next && (
              <p
                className="my-1 ms-16 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs"
                style={{
                  borderColor: `${modeColor(day.leg[0].mode)}66`,
                  color: modeColor(day.leg[0].mode),
                }}
              >
                {/* One icon per hop, so a connection reads as a connection. */}
                {day.leg.map((segment, s) => (
                  <span key={segment.id} className="flex items-center gap-1">
                    {s > 0 && (
                      <span aria-hidden className="text-[9px] text-subtle">
                        ›
                      </span>
                    )}
                    <TransportIcon
                      mode={segment.mode}
                      size={13}
                      style={{ color: modeColor(segment.mode) }}
                    />
                  </span>
                ))}
                <span className="tabular">
                  {t('day.to', { name: day.next.name })}
                  {day.leg.reduce((s, x) => s + num(x.durationMin), 0)
                    ? ` · ${formatDuration(
                        day.leg.reduce((s, x) => s + num(x.durationMin), 0),
                      )}`
                    : ''}
                </span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

function DayCard({
  day,
  dayNumber,
  currency,
  isToday,
  focused,
  onFocusHandled,
  onDayFocus,
}) {
  const { t, dateLocale } = useI18n()
  const { attractions, reservations, accommodation } = day.entry
  const totalItems = attractions.length + reservations.length
  const doneItems =
    attractions.filter((a) => a.done).length +
    reservations.filter((r) => r.done).length

  const [open, setOpen] = useState(totalItems > 0)
  const cardRef = useRef(null)

  // Arriving from a double-click: reveal the day, scroll it into view and let
  // the map switch to this day's route.
  useEffect(() => {
    if (!focused) return
    setOpen(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => onFocusHandled?.(), 2000)
    return () => clearTimeout(timer)
  }, [focused, onFocusHandled])

  // Keep the map in step with whichever day is open — and hand it back when
  // this day collapses.
  useEffect(() => {
    onDayFocus?.(day.key, open)
  }, [open, day.key, onDayFocus])

  return (
    <div
      ref={cardRef}
      className={`card transition-shadow ${
        focused
          ? 'ring-2 ring-accent'
          : isToday
            ? 'ring-2 ring-accent/40'
            : ''
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <div className="tabular w-12 shrink-0 text-center">
          <p className="text-[11px] font-medium uppercase text-muted">
            {format(day.date, 'EEE', { locale: dateLocale })}
          </p>
          <p className="text-xl font-semibold leading-tight">
            {format(day.date, 'd', { locale: dateLocale })}
          </p>
          <p className="text-[11px] text-muted">
            {format(day.date, 'MMM', { locale: dateLocale })}
          </p>
        </div>

        <div className="min-w-0 flex-1 border-s border-line ps-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {t('day.number', { n: dayNumber })}
          </p>
          <p className="truncate text-[15px] font-semibold">{day.dest.name}</p>

          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {/* The night's own accommodation wins over the destination's. */}
            {(accommodation?.name || day.dest.sleeping?.name) && (
              <span className="inline-flex items-center gap-1.5">
                <Bed size={13} />
                {accommodation?.name || day.dest.sleeping.name}
                {accommodation?.name && (
                  <span className="rounded-full bg-accent-soft px-1.5 text-[9px] font-bold uppercase text-accent">
                    {t('dayStay.badge')}
                  </span>
                )}
              </span>
            )}
            {accommodation?.documents.length > 0 && (
              <span className="tabular inline-flex items-center gap-1.5">
                <Paperclip size={13} /> {accommodation.documents.length}
              </span>
            )}
            {totalItems > 0 && (
              <span className="tabular inline-flex items-center gap-1.5">
                <CalendarCheck size={13} />{' '}
                {t('day.done', { done: doneItems, total: totalItems })}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={t('day.toggle', {
            action: open ? t('day.hide') : t('day.show'),
            n: dayNumber,
          })}
          className="btn-ghost !px-2 shrink-0"
        >
          <ChevronDown
            size={18}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line p-4 pt-3">
          <AttractionsSection
            dayKeyValue={day.key}
            attractions={attractions}
            currency={currency}
            center={day.dest}
          />
          <ReservationsSection
            dayKeyValue={day.key}
            reservations={reservations}
            currency={currency}
          />
          <AccommodationSection
            dayKeyValue={day.key}
            accommodation={accommodation}
            inherited={day.dest.sleeping}
            currency={currency}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Accommodation for one night.
 *
 * Off by default: a night normally inherits the destination's hotel, and the
 * inherited name is shown so it is clear nothing is missing. Opting in
 * overrides just this night — for a mid-stay move — and its cost replaces the
 * destination's nightly rate rather than adding to it.
 */
function AccommodationSection({
  dayKeyValue,
  accommodation,
  inherited,
  currency,
}) {
  const { t } = useI18n()

  const handleAdd = useCallback(
    (meta) => addDayAccommodationDoc(dayKeyValue, meta),
    [dayKeyValue],
  )
  const handleRemove = useCallback(
    (doc) => removeDayAccommodationDoc(dayKeyValue, doc.id),
    [dayKeyValue],
  )

  if (!accommodation) {
    return (
      <section className="rounded-xl border border-line bg-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="col-head">
            <Bed size={13} /> {t('dayStay.title')}
          </h4>
          <button
            type="button"
            className="btn-soft !py-1 !text-xs"
            onClick={() => addDayAccommodation(dayKeyValue)}
          >
            <Plus size={14} /> {t('dayStay.add')}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          {inherited?.name
            ? t('dayStay.inherited', { name: inherited.name })
            : t('dayStay.inheritedNone')}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="col-head">
          <Bed size={13} /> {t('dayStay.title')}
        </h4>
        <button
          type="button"
          className="btn-ghost !px-2 !py-0.5"
          onClick={() => removeDayAccommodation(dayKeyValue)}
          aria-label={t('dayStay.remove')}
          title={t('dayStay.remove')}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <label className="text-[11px] font-medium text-muted">
          {t('dayStay.name')}
          <input
            className="field mt-1 !py-1 !text-xs"
            placeholder={t('sleeping.placeholder')}
            value={accommodation.name}
            onChange={(e) =>
              updateDayAccommodation(dayKeyValue, { name: e.target.value })
            }
          />
        </label>
        <label className="text-[11px] font-medium text-muted">
          {t('dayStay.cost')} ({currency})
          <input
            type="number"
            min="0"
            step="0.01"
            className="field tabular mt-1 !py-1 !text-xs"
            placeholder="0"
            value={accommodation.cost || ''}
            onChange={(e) =>
              updateDayAccommodation(dayKeyValue, { cost: num(e.target.value) })
            }
          />
        </label>
      </div>

      <label className="mt-2 block text-[11px] font-medium text-muted">
        {t('dayStay.address')}
        <input
          className="field mt-1 !py-1 !text-xs"
          placeholder={t('dayStay.addressPlaceholder')}
          value={accommodation.address}
          onChange={(e) =>
            updateDayAccommodation(dayKeyValue, { address: e.target.value })
          }
        />
      </label>

      <div className="mt-2 border-t border-line pt-2">
        <DocumentsPanel
          docs={accommodation.documents}
          onAdd={handleAdd}
          onRemove={handleRemove}
          label={t('dayStay.docs')}
          hint={t('dayStay.docsHint')}
          icon={Bed}
          compact
        />
      </div>
    </section>
  )
}

function AttractionsSection({ dayKeyValue, attractions, currency, center }) {
  const { t } = useI18n()
  const total = attractions.reduce((s, a) => s + num(a.cost), 0)

  const reorder = useCallback(
    (from, to) => reorderAttraction(dayKeyValue, from, to),
    [dayKeyValue],
  )
  const drag = useDragReorder(reorder)

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="col-head">
          <Landmark size={13} /> {t('attractions.title')}
        </h4>
        {total > 0 && (
          <span className="tabular text-xs font-semibold text-fg">
            {formatMoney(total, currency)}
          </span>
        )}
      </div>

      <ol className="mb-2">
        {attractions.map((a, i) => {
          const next = attractions[i + 1]
          const suggestedKm =
            next && isPlaced(a) && isPlaced(next) ? distanceShort(a, next) : 0

          return (
            <Fragment key={a.id}>
              <li
                {...drag.itemProps(i)}
                className={`relative rounded-lg p-1.5 transition-colors ${
                  drag.dragIndex === i ? 'opacity-40' : ''
                }`}
              >
                {drag.dragging && drag.overIndex === i && (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent ${
                      drag.overAfter ? '-bottom-px' : '-top-px'
                    }`}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    {...drag.gripProps()}
                    title={t('attractions.dragHint')}
                    aria-hidden
                    className="cursor-grab text-subtle transition hover:text-fg active:cursor-grabbing"
                  >
                    <GripVertical size={14} />
                  </span>

                  <span
                    aria-hidden
                    className="tabular grid size-6 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-[11px] font-semibold text-fg"
                  >
                    {i + 1}
                  </span>

                  <DoneCheckbox
                    checked={a.done}
                    onChange={(done) =>
                      updateAttraction(dayKeyValue, a.id, { done })
                    }
                    label={a.name || t('attractions.fallback')}
                  />

                  <input
                    className={`field min-w-0 flex-1 ${a.done ? 'text-subtle line-through' : ''}`}
                    placeholder={t('attractions.placeholder')}
                    value={a.name}
                    onChange={(e) =>
                      updateAttraction(dayKeyValue, a.id, {
                        name: e.target.value,
                      })
                    }
                  />
                  <TimeField
                    value={a.time}
                    onChange={(time) =>
                      updateAttraction(dayKeyValue, a.id, { time })
                    }
                    label={t('attractions.time')}
                    className="!w-20"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="field tabular !w-24"
                    placeholder="0"
                    value={a.cost || ''}
                    onChange={(e) =>
                      updateAttraction(dayKeyValue, a.id, {
                        cost: num(e.target.value),
                      })
                    }
                    aria-label={t('attractions.cost')}
                  />
                  <button
                    type="button"
                    className="btn-ghost !px-2"
                    onClick={() => removeAttraction(dayKeyValue, a.id)}
                    aria-label={t('attractions.remove', {
                      name: a.name || t('attractions.fallback'),
                    })}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                {a.address && (
                  <p className="ms-14 mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                    <MapPin size={11} className="shrink-0" />
                    {a.address}
                  </p>
                )}
              </li>

              {/* Stays mounted while dragging so rows don't shift underneath
                  the cursor mid-gesture. */}
              {next && (
                <li className={drag.dragging ? 'pointer-events-none opacity-30' : ''}>
                  <AttractionLeg
                    dayKeyValue={dayKeyValue}
                    from={a}
                    suggestedKm={suggestedKm}
                  />
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>

      <AttractionSearch
        center={center}
        onSelect={(place) => addAttraction(dayKeyValue, place)}
      />

      <button
        type="button"
        className="btn-soft mt-2"
        onClick={() => addAttraction(dayKeyValue)}
      >
        <Plus size={15} /> {t('attractions.addBlank')}
      </button>
    </section>
  )
}

function ReservationsSection({ dayKeyValue, reservations, currency }) {
  const { t } = useI18n()
  const total = reservations.reduce((s, r) => s + num(r.cost), 0)

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="col-head">
          <CalendarCheck size={13} /> {t('reserved.title')}
        </h4>
        {total > 0 && (
          <span className="tabular text-xs font-semibold text-fg">
            {formatMoney(total, currency)}
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {reservations.map((r) => (
          <ReservationRow
            key={r.id}
            dayKeyValue={dayKeyValue}
            reservation={r}
          />
        ))}
      </ul>

      <button
        type="button"
        className="btn-soft mt-2"
        onClick={() => addReservation(dayKeyValue)}
      >
        <Plus size={15} /> {t('reserved.add')}
      </button>
    </section>
  )
}

function ReservationRow({ dayKeyValue, reservation: r }) {
  const { t } = useI18n()
  const [showDocs, setShowDocs] = useState(false)
  const name = r.name || t('reserved.fallback')

  const handleAdd = useCallback(
    (meta) => addReservationDoc(dayKeyValue, r.id, meta),
    [dayKeyValue, r.id],
  )
  const handleRemove = useCallback(
    (doc) => removeReservationDoc(dayKeyValue, r.id, doc.id),
    [dayKeyValue, r.id],
  )

  return (
    <li className="rounded-lg border border-line bg-surface p-2">
      <div className="flex flex-wrap items-center gap-2">
        <DoneCheckbox
          checked={r.done}
          onChange={(done) => updateReservation(dayKeyValue, r.id, { done })}
          label={name}
        />
        <input
          className={`field min-w-0 flex-1 ${r.done ? 'text-subtle line-through' : ''}`}
          placeholder={t('reserved.placeholder')}
          value={r.name}
          onChange={(e) =>
            updateReservation(dayKeyValue, r.id, { name: e.target.value })
          }
        />
        <TimeField
          value={r.time}
          onChange={(time) => updateReservation(dayKeyValue, r.id, { time })}
          label={t('reserved.time')}
          className="!w-20"
        />
        <input
          type="number"
          min="0"
          step="0.01"
          className="field tabular !w-24"
          placeholder="0"
          value={r.cost || ''}
          onChange={(e) =>
            updateReservation(dayKeyValue, r.id, { cost: num(e.target.value) })
          }
          aria-label={t('reserved.cost')}
        />
        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          aria-expanded={showDocs}
          aria-label={t('reserved.docs', { name })}
          title={t('reserved.docLabel')}
          className={`relative grid size-8 shrink-0 place-items-center rounded-full border transition
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              showDocs
                ? 'border-accent bg-accent text-on-accent'
                : r.documents.length > 0
                  ? 'border-line-strong bg-accent-soft text-fg'
                  : 'border-line-strong bg-surface text-subtle hover:border-accent'
            }`}
        >
          <Paperclip size={14} />
          {r.documents.length > 0 && (
            <span className="tabular absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-on-accent ring-2 ring-surface">
              {r.documents.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className="btn-ghost !px-2"
          onClick={() => removeReservation(dayKeyValue, r.id)}
          aria-label={t('reserved.remove', { name })}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {showDocs && (
        <div className="mt-2 border-t border-line pt-2">
          <DocumentsPanel
            docs={r.documents}
            onAdd={handleAdd}
            onRemove={handleRemove}
            label={t('reserved.docLabel')}
            hint={t('reserved.docHint')}
            compact
          />
        </div>
      )}
    </li>
  )
}

function DoneCheckbox({ checked, onChange, label }) {
  const { t } = useI18n()
  return (
    <label className="grid shrink-0 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={t('reserved.markDone', { name: label })}
        className="size-4 cursor-pointer accent-[var(--color-accent)]"
      />
    </label>
  )
}
