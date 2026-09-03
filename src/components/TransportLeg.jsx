import { useCallback, useState } from "react";
import {
  Bus,
  Car,
  CircleDashed,
  Clock,
  Coins,
  Footprints,
  GripVertical,
  Paperclip,
  Plane,
  Plus,
  Ruler,
  Ship,
  TrainFront,
  Trash2,
  X,
} from "lucide-react";
import PlaceSearchInput from "./PlaceSearchInput.jsx";
import DocumentsPanel from "./DocumentsPanel.jsx";
import {
  TRANSPORT_MODES,
  addSegment,
  addSegmentDoc,
  legOf,
  legTotals,
  modeColor,
  num,
  removeSegment,
  removeSegmentDoc,
  reorderSegments,
  setSegmentStation,
  updateSegment,
} from "../lib/store.js";
import { formatDuration, formatMoney } from "../lib/money.js";
import { useDragReorder } from "../lib/useDragReorder.js";
import { useI18n } from "../lib/i18n.js";

const ICONS = {
  none: CircleDashed,
  plane: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
  ferry: Ship,
  walk: Footprints,
};

export function TransportIcon({ mode, ...props }) {
  const Icon = ICONS[mode] ?? TrainFront;
  return <Icon {...props} />;
}

export default function TransportLeg({ from, to, currency, suggestedKm }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const segments = legOf(from);
  const totals = legTotals(from);

  // The spine and collapsed chip take their colour from the first hop.
  const leadColor = modeColor(segments[0]?.mode);

  const drag = useDragReorder((a, b) => reorderSegments(from.id, a, b));

  const summary = [
    totals.durationMin ? formatDuration(totals.durationMin) : null,
    totals.distanceKm ? `${totals.distanceKm} ${t("unit.km")}` : null,
    totals.cost ? formatMoney(totals.cost, currency) : null,
  ].filter(Boolean);

  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute inset-y-0 start-[27px] w-0.5 rounded-full opacity-40"
        style={{ background: leadColor }}
      />

      <div className="relative flex items-center gap-2 py-2 ps-10">
        {/* Every mode in the journey, in order. */}
        <span
          className="flex shrink-0 items-center gap-0.5 rounded-full border-2 px-1.5 py-1"
          style={{ borderColor: leadColor, background: `${leadColor}17` }}
          title={segments.map((s) => t(`mode.${s.mode}`)).join(" → ")}
        >
          {segments.length === 0 ? (
            <Plus size={13} style={{ color: leadColor }} strokeWidth={2.4} />
          ) : (
            segments.map((s, i) => (
              <span key={s.id} className="flex items-center gap-0.5">
                {i > 0 && (
                  <span aria-hidden className="text-[9px] text-subtle">
                    ›
                  </span>
                )}
                <TransportIcon
                  mode={s.mode}
                  size={13}
                  strokeWidth={2.4}
                  style={{ color: modeColor(s.mode) }}
                />
              </span>
            ))
          )}
          <span className="sr-only">
            {segments.map((s) => t(`mode.${s.mode}`)).join(" → ")}
            {to ? ` — ${to.name}` : ""}
          </span>
        </span>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5
                     text-xs font-medium transition hover:shadow-sm
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{
            borderColor: `${leadColor}55`,
            color: leadColor,
            background: `${leadColor}17`,
          }}
        >
          <span className="tabular">
            {summary.length
              ? summary.join(" · ")
              : segments.length
                ? t("transport.addDetails")
                : t("transport.add")}
          </span>
          {segments.length > 1 && (
            <span className="tabular rounded-full bg-accent-soft px-1.5 text-[10px] font-bold text-accent">
              {segments.length === 2
                ? t("transport.change")
                : t("transport.changes", { n: segments.length - 1 })}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="mb-2 ms-10 max-w-2xl space-y-2 rounded-xl border border-line bg-raised p-3">
          <ol className="space-y-2">
            {segments.map((segment, i) => (
              <SegmentRow
                key={segment.id}
                destId={from.id}
                segment={segment}
                index={i}
                total={segments.length}
                currency={currency}
                originCenter={from}
                destinationCenter={to}
                suggestedKm={suggestedKm}
                dragProps={drag.itemProps(i)}
                gripProps={drag.gripProps()}
                isDragging={drag.dragIndex === i}
                dropBefore={
                  drag.dragging && drag.overIndex === i && !drag.overAfter
                }
                dropAfter={
                  drag.dragging && drag.overIndex === i && drag.overAfter
                }
              />
            ))}
          </ol>

          <button
            type="button"
            className="btn-soft !py-1 !text-xs"
            onClick={() => addSegment(from.id)}
          >
            <Plus size={14} /> {t("transport.addSegment")}
          </button>

          {segments.length === 1 && suggestedKm > 0 && (
            <button
              type="button"
              className="ms-2 text-[11px] font-medium text-muted underline underline-offset-2 hover:text-fg"
              onClick={() =>
                updateSegment(from.id, segments[0].id, {
                  distanceKm: suggestedKm,
                })
              }
            >
              {t("transport.useStraight", { km: suggestedKm })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SegmentRow({
  destId,
  segment,
  index,
  total,
  currency,
  originCenter,
  destinationCenter,
  dragProps,
  gripProps,
  isDragging,
  dropBefore,
  dropAfter,
}) {
  const { t } = useI18n();
  const color = modeColor(segment.mode);
  const [showDocs, setShowDocs] = useState(false);

  // Bias each lookup towards the end of the journey it belongs to: the first
  // hop starts near the origin city, the last one ends near the destination.
  const originBias = index === 0 ? originCenter : destinationCenter;
  const destinationBias =
    index === total - 1 ? destinationCenter : originCenter;

  const handleAddDoc = useCallback(
    (meta) => addSegmentDoc(destId, segment.id, meta),
    [destId, segment.id],
  );
  const handleRemoveDoc = useCallback(
    (doc) => removeSegmentDoc(destId, segment.id, doc.id),
    [destId, segment.id],
  );

  return (
    <li
      {...dragProps}
      className={`relative rounded-lg border border-line bg-surface p-2 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {(dropBefore || dropAfter) && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-accent ${
            dropBefore ? "-top-px" : "-bottom-px"
          }`}
        />
      )}

      <div className="mb-1.5 flex items-center gap-2">
        <span
          {...gripProps}
          title={t("transport.dragHint")}
          aria-hidden
          className="cursor-grab text-subtle transition hover:text-fg active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </span>
        <span
          aria-hidden
          className="tabular grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold"
          style={{ background: `${color}22`, color }}
        >
          {index + 1}
        </span>

        <select
          className="field !w-auto !py-1 !text-xs"
          value={segment.mode}
          onChange={(e) =>
            updateSegment(destId, segment.id, { mode: e.target.value })
          }
          aria-label={t("transport.mode")}
        >
          {/* Not a real choice — a passively-created leg's placeholder value,
              so the select reads correctly until a mode is actually picked. */}
          <option value="none" hidden disabled>
            {t("mode.none")}
          </option>
          {TRANSPORT_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {t(`mode.${m.id}`)}
            </option>
          ))}
        </select>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => setShowDocs((v) => !v)}
          aria-expanded={showDocs}
          aria-label={t("transport.docs", { n: index + 1 })}
          title={t("transport.docLabel")}
          className={`relative grid size-7 shrink-0 place-items-center rounded-full border transition
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              showDocs
                ? "border-accent bg-accent text-on-accent"
                : segment.documents.length > 0
                  ? "border-line-strong bg-accent-soft text-fg"
                  : "border-line-strong bg-surface text-subtle hover:border-accent"
            }`}
        >
          <Paperclip size={13} />
          {segment.documents.length > 0 && (
            <span className="tabular absolute -end-1 -top-1 grid size-4 place-items-center rounded-full bg-accent text-[9px] font-bold text-on-accent ring-2 ring-surface">
              {segment.documents.length}
            </span>
          )}
        </button>

        <button
          type="button"
          className="btn-ghost !px-1.5 !py-0.5"
          onClick={() => removeSegment(destId, segment.id)}
          aria-label={t("transport.removeSegment", { n: index + 1 })}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[11px] font-medium text-muted">
          {t("transport.originStation")}
          <PlaceSearchInput
            value={segment.origin}
            onChange={(station) =>
              setSegmentStation(destId, segment.id, "origin", station)
            }
            center={originBias}
            placeholder={t("transport.originPlaceholder")}
            label={t("transport.originStation")}
            className="mt-1"
          />
        </label>

        <label className="text-[11px] font-medium text-muted">
          {t("transport.destinationStation")}
          <PlaceSearchInput
            value={segment.destination}
            onChange={(station) =>
              setSegmentStation(destId, segment.id, "destination", station)
            }
            center={destinationBias}
            placeholder={t("transport.destinationPlaceholder")}
            label={t("transport.destinationStation")}
            className="mt-1"
          />
        </label>
      </div>

      <ExtraFields destId={destId} segment={segment} currency={currency} />

      {showDocs && (
        <div className="mt-2 border-t border-line pt-2">
          <DocumentsPanel
            docs={segment.documents}
            onAdd={handleAddDoc}
            onRemove={handleRemoveDoc}
            label={t("transport.docLabel")}
            hint={t("transport.docHint")}
            compact
          />
        </div>
      )}
    </li>
  );
}

/**
 * Duration, distance and cost are optional. Most hops only need a mode and a
 * pair of stations, so the numbers stay out of the way until asked for: a
 * field appears once it holds a value or the user adds it, and removing it
 * clears the value rather than leaving a stray zero in the totals.
 */
const EXTRAS = [
  {
    key: "durationMin",
    labelKey: "transport.duration",
    chipKey: "transport.durationShort",
    icon: Clock,
    step: "1",
  },
  {
    key: "distanceKm",
    labelKey: "transport.distance",
    chipKey: "transport.distanceShort",
    icon: Ruler,
    step: "0.1",
  },
  {
    key: "cost",
    labelKey: "transport.cost",
    chipKey: "transport.cost",
    icon: Coins,
    step: "0.01",
  },
];

function ExtraFields({ destId, segment, currency }) {
  const { t } = useI18n();
  // Fields added in this session that are still empty; a value of its own is
  // enough to keep a field on screen across renders.
  const [pinned, setPinned] = useState(() => new Set());

  const isShown = (key) => num(segment[key]) > 0 || pinned.has(key);

  const show = (key) => setPinned((prev) => new Set(prev).add(key));

  const hide = (key) => {
    setPinned((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (num(segment[key]) !== 0)
      updateSegment(destId, segment.id, { [key]: 0 });
  };

  const shown = EXTRAS.filter((f) => isShown(f.key));
  const hidden = EXTRAS.filter((f) => !isShown(f.key));

  return (
    <>
      {shown.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {shown.map((field) => {
            const label =
              field.key === "cost"
                ? `${t(field.labelKey)} (${currency})`
                : t(field.labelKey);
            return (
              <label
                key={field.key}
                className="text-[11px] font-medium text-muted"
              >
                <span className="flex items-center justify-between gap-1">
                  {t(field.labelKey)}
                  <button
                    type="button"
                    onClick={() => hide(field.key)}
                    aria-label={t("transport.removeField", {
                      field: t(field.labelKey),
                    })}
                    className="rounded-full p-0.5 text-subtle transition hover:bg-raised hover:text-fg"
                  >
                    <X size={11} />
                  </button>
                </span>
                {field.key === "durationMin" ? (
                  <DurationInputs
                    minutes={segment.durationMin}
                    onChange={(v) =>
                      updateSegment(destId, segment.id, { durationMin: v })
                    }
                    autoFocus={pinned.has(field.key) && !segment[field.key]}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    step={field.step}
                    className="field tabular mt-1 !py-1 !text-xs"
                    value={segment[field.key] || ""}
                    placeholder="0"
                    autoFocus={pinned.has(field.key) && !segment[field.key]}
                    aria-label={label}
                    onChange={(e) =>
                      updateSegment(destId, segment.id, {
                        [field.key]: num(e.target.value),
                      })
                    }
                  />
                )}
              </label>
            );
          })}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {hidden.map((field) => {
            const Icon = field.icon;
            return (
              <button
                key={field.key}
                type="button"
                onClick={() => show(field.key)}
                className="inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-0.5
                           text-[11px] font-medium text-muted transition hover:border-accent hover:text-fg"
              >
                <Plus size={11} />
                <Icon size={11} />
                {t(field.chipKey)}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Hours + minutes side by side, easier to reason about than one raw minutes
 * total. Store-agnostic — the caller decides what `onChange(totalMinutes)`
 * does, so both a transport segment and an attraction leg can reuse it.
 */
export function DurationInputs({ minutes, onChange, autoFocus }) {
  const { t } = useI18n();
  const total = num(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;

  const commit = (h, m) => {
    const clampedH = Math.max(0, Math.round(h) || 0);
    const clampedM = Math.min(59, Math.max(0, Math.round(m) || 0));
    onChange(clampedH * 60 + clampedM);
  };

  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="1"
        className="field tabular !w-14 !py-1 !text-xs"
        value={hours || ""}
        placeholder="0"
        autoFocus={autoFocus}
        aria-label={t("transport.hours")}
        onChange={(e) => commit(e.target.value, mins)}
      />
      <span className="text-[10px] text-subtle">
        {t("transport.hoursShort")}
      </span>
      <input
        type="number"
        min="0"
        max="59"
        step="1"
        className="field tabular !w-14 !py-1 !text-xs"
        value={mins || ""}
        placeholder="0"
        aria-label={t("transport.minutes")}
        onChange={(e) => commit(hours, e.target.value)}
      />
      <span className="text-[10px] text-subtle">
        {t("transport.minutesShort")}
      </span>
    </div>
  );
}
