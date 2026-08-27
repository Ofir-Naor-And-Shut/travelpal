import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import {
  ArrowRight,
  Bed,
  CalendarCheck,
  ChevronDown,
  GripVertical,
  Landmark,
  MapPin,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { TransportIcon } from "./TransportLeg.jsx";
import DocumentsPanel from "./DocumentsPanel.jsx";
import AttractionSearch from "./AttractionSearch.jsx";
import AttractionLeg from "./AttractionLeg.jsx";
import TimeField from "./TimeField.jsx";
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
} from "../lib/store.js";
import { distanceShort } from "../lib/places.js";
import { openLightbox } from "../lib/lightbox.js";
import { useDragReorder } from "../lib/useDragReorder.js";
import { formatDuration, formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

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
  const { t } = useI18n();

  // Exactly one day open at a time — opening another closes whichever was
  // open. Starts on the first day that already has something planned, so the
  // view isn't all-collapsed on a trip that's already filled in.
  const [openKey, setOpenKey] = useState(
    () =>
      days.find(
        (d) => d.entry.attractions.length + d.entry.reservations.length > 0,
      )?.key ?? null,
  );

  const toggleDay = useCallback((key) => {
    setOpenKey((prev) => (prev === key ? null : key));
  }, []);

  // The map follows whichever single day is open.
  useEffect(() => {
    onDayFocus?.(openKey);
  }, [openKey, onDayFocus]);

  // Double-clicking a destination lands on its first night.
  const focusKey = focusDestId
    ? days.find((d) => d.dest.id === focusDestId)?.key
    : null;

  // Arriving via double-click reveals that day, closing whichever was open.
  useEffect(() => {
    if (focusKey) setOpenKey(focusKey);
  }, [focusKey]);

  if (days.length === 0) {
    return (
      <p className="px-8 py-12 text-center text-sm text-muted">
        {t("day.empty")}
      </p>
    );
  }

  const today = new Date();

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
              isOpen={openKey === day.key}
              onToggle={toggleDay}
              onFocusHandled={onFocusHandled}
            />

            {day.leg.length > 0 && day.next && (
              <div
                className="my-1.5 ms-16 flex items-center justify-between gap-3 rounded-xl border p-2.5 text-xs"
                style={{
                  borderColor: `${modeColor(day.leg[0].mode)}40`,
                  background: `${modeColor(day.leg[0].mode)}14`,
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {/* One icon per hop, so a connection reads as a connection. */}
                  <span
                    className="flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1.5"
                    style={{ background: `${modeColor(day.leg[0].mode)}26` }}
                  >
                    {day.leg.map((segment, s) => (
                      <span
                        key={segment.id}
                        className="flex items-center gap-0.5"
                      >
                        {s > 0 && (
                          <span aria-hidden className="text-[9px] text-subtle">
                            ›
                          </span>
                        )}
                        <TransportIcon
                          mode={segment.mode}
                          size={14}
                          style={{ color: modeColor(segment.mode) }}
                        />
                      </span>
                    ))}
                  </span>
                  <span
                    className="tabular min-w-0 truncate font-medium"
                    style={{ color: modeColor(day.leg[0].mode) }}
                  >
                    {t("day.to", { name: day.next.name })}
                    {day.leg.reduce((s, x) => s + num(x.durationMin), 0)
                      ? ` · ${formatDuration(
                          day.leg.reduce((s, x) => s + num(x.durationMin), 0),
                        )}`
                      : ""}
                  </span>
                </div>
                <ArrowRight
                  size={15}
                  className="shrink-0"
                  style={{ color: modeColor(day.leg[0].mode) }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function DayCard({
  day,
  dayNumber,
  currency,
  isToday,
  focused,
  isOpen,
  onToggle,
  onFocusHandled,
}) {
  const { t, dateLocale } = useI18n();
  const { attractions, reservations, accommodation } = day.entry;
  const totalItems = attractions.length + reservations.length;
  const doneItems =
    attractions.filter((a) => a.done).length +
    reservations.filter((r) => r.done).length;

  const cardRef = useRef(null);

  // Whichever day opens — by its own toggle, or by double-clicking a
  // destination — scrolls to the middle of the screen; only one is ever
  // open at once, so this always means "the one that just opened".
  useEffect(() => {
    if (!isOpen) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isOpen]);

  // Clears the double-click highlight/focus a beat after landing.
  useEffect(() => {
    if (!focused) return;
    const timer = setTimeout(() => onFocusHandled?.(), 2000);
    return () => clearTimeout(timer);
  }, [focused, onFocusHandled]);

  // Tailwind has no logical border-color utility, so the coloured start-edge
  // stripe (mirrors correctly in RTL) is set directly via CSS custom props.
  const railColor =
    focused || isToday || isOpen ? "var(--c-accent)" : "var(--c-line)";

  return (
    <div
      ref={cardRef}
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: railColor }}
      className={`card transition-all ${
        focused ? "ring-2 ring-accent" : isToday ? "ring-2 ring-accent/40" : ""
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <div className="tabular w-12 shrink-0 text-center">
          <p className="text-[11px] font-medium uppercase text-muted">
            {format(day.date, "EEE", { locale: dateLocale })}
          </p>
          <p className="text-xl font-semibold leading-tight">
            {format(day.date, "d", { locale: dateLocale })}
          </p>
          <p className="text-[11px] text-muted">
            {format(day.date, "MMM", { locale: dateLocale })}
          </p>
        </div>

        <div className="min-w-0 flex-1 border-s border-line ps-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {t("day.number", { n: dayNumber })}
          </p>
          <p className="truncate text-[15px] font-semibold">{day.dest.name}</p>

          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-muted">
            {/* The night's own accommodation wins over the destination's. */}
            {(accommodation?.name || day.dest.sleeping?.name) && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-1">
                <Bed size={13} className="text-cat-sleeping" />
                {accommodation?.name || day.dest.sleeping.name}
                {accommodation?.name && (
                  <span className="rounded-full bg-accent-soft px-1.5 text-[9px] font-bold uppercase text-accent">
                    {t("dayStay.badge")}
                  </span>
                )}
              </span>
            )}
            {accommodation?.documents.length > 0 && (
              <span className="tabular inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-1">
                <Paperclip size={13} /> {accommodation.documents.length}
              </span>
            )}
            {totalItems > 0 && (
              <span className="tabular inline-flex items-center gap-1.5 rounded-md bg-raised px-2 py-1">
                <CalendarCheck size={13} />{" "}
                {t("day.done", { done: doneItems, total: totalItems })}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggle(day.key)}
          aria-expanded={isOpen}
          aria-label={t("day.toggle", {
            action: isOpen ? t("day.hide") : t("day.show"),
            n: dayNumber,
          })}
          className="btn-ghost !px-2 shrink-0"
        >
          <ChevronDown
            size={18}
            className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {isOpen && (
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
  );
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
  const { t } = useI18n();

  const handleAdd = useCallback(
    (meta) => addDayAccommodationDoc(dayKeyValue, meta),
    [dayKeyValue],
  );
  const handleRemove = useCallback(
    (doc) => removeDayAccommodationDoc(dayKeyValue, doc.id),
    [dayKeyValue],
  );

  if (!accommodation) {
    return (
      <section className="rounded-xl border border-line bg-raised p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="col-head">
            <Bed size={13} className="text-cat-sleeping" /> {t("dayStay.title")}
          </h4>
          <button
            type="button"
            className="btn-soft !py-1 !text-xs"
            onClick={() => addDayAccommodation(dayKeyValue)}
          >
            <Plus size={14} /> {t("dayStay.add")}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-subtle">
          {inherited?.name
            ? t("dayStay.inherited", { name: inherited.name })
            : t("dayStay.inheritedNone")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="col-head">
          <Bed size={13} className="text-cat-sleeping" /> {t("dayStay.title")}
        </h4>
        <button
          type="button"
          className="btn-ghost !px-2 !py-0.5"
          onClick={() => removeDayAccommodation(dayKeyValue)}
          aria-label={t("dayStay.remove")}
          title={t("dayStay.remove")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <label className="text-[11px] font-medium text-muted">
          {t("dayStay.name")}
          <input
            className="field mt-1 !py-1 !text-xs"
            placeholder={t("sleeping.placeholder")}
            value={accommodation.name}
            onChange={(e) =>
              updateDayAccommodation(dayKeyValue, { name: e.target.value })
            }
          />
        </label>
        <label className="text-[11px] font-medium text-muted">
          {t("dayStay.cost")} ({currency})
          <input
            type="number"
            min="0"
            step="0.01"
            className="field tabular mt-1 !py-1 !text-xs"
            placeholder="0"
            value={accommodation.cost || ""}
            onChange={(e) =>
              updateDayAccommodation(dayKeyValue, { cost: num(e.target.value) })
            }
          />
        </label>
      </div>

      <label className="mt-2 block text-[11px] font-medium text-muted">
        {t("dayStay.address")}
        <input
          className="field mt-1 !py-1 !text-xs"
          placeholder={t("dayStay.addressPlaceholder")}
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
          label={t("dayStay.docs")}
          hint={t("dayStay.docsHint")}
          icon={Bed}
          compact
        />
      </div>
    </section>
  );
}

function AttractionsSection({ dayKeyValue, attractions, currency, center }) {
  const { t } = useI18n();
  const total = attractions.reduce((s, a) => s + num(a.cost), 0);

  const reorder = useCallback(
    (from, to) => reorderAttraction(dayKeyValue, from, to),
    [dayKeyValue],
  );
  const drag = useDragReorder(reorder);

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="col-head">
          <Landmark size={13} className="text-cat-attractions" />{" "}
          {t("attractions.title")}
        </h4>
        {total > 0 && (
          <span className="tabular text-xs font-semibold text-fg">
            {formatMoney(total, currency)}
          </span>
        )}
      </div>

      <ol className="mb-2">
        {attractions.map((a, i) => {
          const next = attractions[i + 1];
          const suggestedKm =
            next && isPlaced(a) && isPlaced(next) ? distanceShort(a, next) : 0;

          return (
            <Fragment key={a.id}>
              <li
                {...drag.itemProps(i)}
                className={`relative rounded-lg border border-transparent p-1.5 transition-colors hover:border-line hover:bg-surface ${
                  drag.dragIndex === i ? "opacity-40" : ""
                }`}
              >
                {drag.dragging && drag.overIndex === i && (
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent ${
                      drag.overAfter ? "-bottom-px" : "-top-px"
                    }`}
                  />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    {...drag.gripProps()}
                    title={t("attractions.dragHint")}
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

                  {a.photoUrl && (
                    <button
                      type="button"
                      onClick={() => openLightbox(a.photoUrl)}
                      aria-label={t("photo.view", {
                        name: a.name || t("attractions.fallback"),
                      })}
                      className="shrink-0 overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <img
                        src={a.photoUrl}
                        alt=""
                        aria-hidden
                        onError={(e) => {
                          e.currentTarget.parentElement.style.display = "none";
                        }}
                        className="h-10 w-14 object-cover transition hover:opacity-90"
                      />
                    </button>
                  )}

                  <DoneCheckbox
                    checked={a.done}
                    onChange={(done) =>
                      updateAttraction(dayKeyValue, a.id, { done })
                    }
                    label={a.name || t("attractions.fallback")}
                  />

                  <input
                    className={`field order-1 min-w-0 flex-1 lg:order-none ${a.done ? "text-subtle line-through" : ""}`}
                    placeholder={t("attractions.placeholder")}
                    value={a.name}
                    onChange={(e) =>
                      updateAttraction(dayKeyValue, a.id, {
                        name: e.target.value,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn-ghost order-2 !px-2 lg:order-none"
                    onClick={() => removeAttraction(dayKeyValue, a.id)}
                    aria-label={t("attractions.remove", {
                      name: a.name || t("attractions.fallback"),
                    })}
                  >
                    <Trash2 size={15} />
                  </button>
                  {/* Time + cost drop to their own full-width row on phones, so
                      neither is squeezed; on desktop they sit inline as before. */}
                  <div className="order-3 flex basis-full items-end gap-2 lg:order-none lg:basis-auto">
                    <TimeField
                      value={a.time}
                      onChange={(time) =>
                        updateAttraction(dayKeyValue, a.id, { time })
                      }
                      label={t("field.time")}
                      className="flex-1 lg:!w-20 lg:flex-none"
                    />
                    <label className="flex flex-1 flex-col gap-0.5 lg:!w-24 lg:flex-none">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">
                        {t("field.cost")}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="field tabular w-full"
                        placeholder="0"
                        value={a.cost || ""}
                        onChange={(e) =>
                          updateAttraction(dayKeyValue, a.id, {
                            cost: num(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
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
                <li
                  className={
                    drag.dragging ? "pointer-events-none opacity-30" : ""
                  }
                >
                  <AttractionLeg
                    dayKeyValue={dayKeyValue}
                    from={a}
                    suggestedKm={suggestedKm}
                  />
                </li>
              )}
            </Fragment>
          );
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
        <Plus size={15} /> {t("attractions.addBlank")}
      </button>
    </section>
  );
}

function ReservationsSection({ dayKeyValue, reservations, currency }) {
  const { t } = useI18n();
  const total = reservations.reduce((s, r) => s + num(r.cost), 0);

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="col-head">
          <CalendarCheck size={13} className="text-cat-reservations" />{" "}
          {t("reserved.title")}
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
        <Plus size={15} /> {t("reserved.add")}
      </button>
    </section>
  );
}

function ReservationRow({ dayKeyValue, reservation: r }) {
  const { t } = useI18n();
  const [showDocs, setShowDocs] = useState(false);
  const name = r.name || t("reserved.fallback");

  const handleAdd = useCallback(
    (meta) => addReservationDoc(dayKeyValue, r.id, meta),
    [dayKeyValue, r.id],
  );
  const handleRemove = useCallback(
    (doc) => removeReservationDoc(dayKeyValue, r.id, doc.id),
    [dayKeyValue, r.id],
  );

  return (
    <li
      className="rounded-lg border border-line bg-surface p-2"
      style={{
        borderInlineStartWidth: 3,
        borderInlineStartColor: "var(--color-cat-reservations)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DoneCheckbox
          checked={r.done}
          onChange={(done) => updateReservation(dayKeyValue, r.id, { done })}
          label={name}
        />
        <input
          className={`field order-1 min-w-0 flex-1 lg:order-none ${r.done ? "text-subtle line-through" : ""}`}
          placeholder={t("reserved.placeholder")}
          value={r.name}
          onChange={(e) =>
            updateReservation(dayKeyValue, r.id, { name: e.target.value })
          }
        />
        {/* Time + cost drop to their own full-width row on phones; inline on
            desktop as before. */}
        <div className="order-4 flex basis-full items-end gap-2 lg:order-none lg:basis-auto">
          <TimeField
            value={r.time}
            onChange={(time) => updateReservation(dayKeyValue, r.id, { time })}
            label={t("field.time")}
            className="flex-1 lg:!w-20 lg:flex-none"
          />
          <label className="flex flex-1 flex-col gap-0.5 lg:!w-24 lg:flex-none">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">
              {t("field.cost")}
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="field tabular w-full"
              placeholder="0"
              value={r.cost || ""}
              onChange={(e) =>
                updateReservation(dayKeyValue, r.id, {
                  cost: num(e.target.value),
                })
              }
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          aria-expanded={showDocs}
          aria-label={t("reserved.docs", { name })}
          title={t("reserved.docLabel")}
          className={`relative order-2 grid size-8 shrink-0 place-items-center rounded-full border transition lg:order-none
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              showDocs
                ? "border-accent bg-accent text-on-accent"
                : r.documents.length > 0
                  ? "border-line-strong bg-accent-soft text-fg"
                  : "border-line-strong bg-surface text-subtle hover:border-accent"
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
          className="btn-ghost order-3 !px-2 lg:order-none"
          onClick={() => removeReservation(dayKeyValue, r.id)}
          aria-label={t("reserved.remove", { name })}
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
            label={t("reserved.docLabel")}
            hint={t("reserved.docHint")}
            compact
          />
        </div>
      )}
    </li>
  );
}

function DoneCheckbox({ checked, onChange, label }) {
  const { t } = useI18n();
  return (
    <label className="grid shrink-0 cursor-pointer place-items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={t("reserved.markDone", { name: label })}
        className="size-4 cursor-pointer accent-[var(--color-accent)]"
      />
    </label>
  );
}
