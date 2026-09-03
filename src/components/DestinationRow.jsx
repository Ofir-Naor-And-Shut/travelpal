import { useCallback, useEffect, useState } from "react";
import {
  Bed,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  addDestDoc,
  ensureDestinationPhoto,
  moveDestination,
  num,
  removeDestDoc,
  removeDestination,
  setNights,
  updateDestination,
} from "../lib/store.js";
import { formatDay } from "../lib/store.js";
import DocumentsPanel from "./DocumentsPanel.jsx";
import { openLightbox } from "../lib/lightbox.js";
import { useI18n } from "../lib/i18n.js";

export default function DestinationRow({
  dest,
  index,
  isFirst,
  isLast,
  active,
  onHover,
  onOpenDay,
  dragProps = {},
  gripProps = {},
  isDragging = false,
  dropBefore = false,
  dropAfter = false,
}) {
  const { t } = useI18n();

  // The URL of a stored photo that failed to load — hides that image and
  // falls back to the order badge alone.
  const [failedPhoto, setFailedPhoto] = useState("");
  const [accOpen, setAccOpen] = useState(false);

  // Fill in a Pexels photo once the stop is placed; the store no-ops if it
  // already has one or there's no key.
  useEffect(() => {
    if (!dest.photoUrl) ensureDestinationPhoto(dest.id);
  }, [dest.id, dest.photoUrl]);

  const nightWord =
    dest.nights === 1 ? t("plan.night") : t("plan.nightsPlural");

  return (
    <li
      {...dragProps}
      onMouseEnter={() => onHover?.(dest.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`glass-card relative ${isDragging ? "opacity-40" : ""} ${
        active && !isDragging ? "glass-card-active" : ""
      }`}
    >
      {/* Insertion line: shows exactly where the row will land, which reads
          the same whether you came from above or below. */}
      {(dropBefore || dropAfter) && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent ${
            dropBefore ? "-top-px" : "-bottom-px"
          }`}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3 @[700px]:flex-nowrap">
        {/* Grip + order badge + name + derived dates */}
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
          <span
            {...gripProps}
            title={t("plan.dragHint")}
            aria-hidden
            className="-ms-1 cursor-grab text-subtle transition hover:text-fg active:cursor-grabbing"
          >
            <GripVertical size={15} />
          </span>
          <span
            aria-hidden
            className={`tabular grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition ${
              active ? "bg-accent text-on-accent" : "bg-accent-soft text-accent"
            }`}
          >
            {index + 1}
          </span>
          {dest.photoUrl && dest.photoUrl !== failedPhoto && (
            <button
              type="button"
              onClick={() => openLightbox(dest.photoUrl)}
              aria-label={t("photo.view", { name: dest.name })}
              className="shrink-0 overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <img
                src={dest.photoUrl}
                alt=""
                aria-hidden
                onError={() => {
                  setFailedPhoto(dest.photoUrl);
                }}
                className="h-12 w-16 object-cover transition hover:opacity-90"
              />
            </button>
          )}
          <div className="min-w-0">
            <input
              value={dest.name}
              onChange={(e) =>
                updateDestination(dest.id, { name: e.target.value })
              }
              onDoubleClick={(e) => {
                // Overrides the browser's select-a-word, which is the trade the
                // shortcut asks for.
                e.preventDefault();
                onOpenDay?.(dest.id);
              }}
              aria-label={t("plan.nameLabel", { n: index + 1 })}
              title={t("plan.openDayHint")}
              className="w-full truncate rounded border-none bg-transparent p-0 text-[15px] font-semibold text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            />
            <p className="tabular truncate text-xs text-muted">
              {formatDay(dest.startDate)} – {formatDay(dest.endDate)}
              {dest.country && ` · ${dest.country}`}
            </p>
            <button
              type="button"
              onClick={() => setAccOpen((v) => !v)}
              aria-expanded={accOpen}
              className={`mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-xs transition ${
                dest.sleeping?.name
                  ? "bg-raised text-muted hover:text-fg"
                  : "border border-dashed border-line text-subtle hover:border-line-strong hover:text-fg"
              }`}
            >
              <Bed size={12} className="shrink-0 text-cat-sleeping" />
              <span className="truncate">
                {dest.sleeping?.name || t("plan.addAccommodation")}
              </span>
            </button>
          </div>
        </div>

        {/* Nights stepper. The fixed width only applies once the pane is wide
            enough to show the column header, where alignment matters; below
            that the row wraps and natural sizing keeps it compact. */}
        <div className="flex shrink-0 items-center justify-center gap-2 @[700px]:w-[116px]">
          <div className="flex items-center gap-1.5 rounded-full bg-raised px-1.5 py-1">
            <button
              type="button"
              className="stepper-btn !size-6"
              onClick={() => setNights(dest.id, dest.nights - 1)}
              disabled={dest.nights <= 0}
              aria-label={t("plan.removeNight", { name: dest.name })}
            >
              <Minus size={13} />
            </button>
            <span className="tabular w-10 text-center text-sm font-semibold">
              {dest.nights}
              <span className="block text-[10px] font-normal text-muted">
                {nightWord}
              </span>
            </span>
            <button
              type="button"
              className="stepper-btn !size-6"
              onClick={() => setNights(dest.id, dest.nights + 1)}
              aria-label={t("plan.addNight", { name: dest.name })}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* Reorder + delete */}
        <div className="flex shrink-0 items-center justify-end gap-0.5 border-s border-line ps-2 @[700px]:w-[104px]">
          <button
            type="button"
            className="btn-ghost !px-1.5 !py-1"
            disabled={isFirst}
            onClick={() => moveDestination(dest.id, -1)}
            aria-label={t("plan.moveEarlier", { name: dest.name })}
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost !px-1.5 !py-1"
            disabled={isLast}
            onClick={() => moveDestination(dest.id, 1)}
            aria-label={t("plan.moveLater", { name: dest.name })}
          >
            <ChevronDown size={16} />
          </button>
          <button
            type="button"
            className="btn-ghost !px-1.5 !py-1"
            onClick={() => removeDestination(dest.id)}
            aria-label={t("plan.remove", { name: dest.name })}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {accOpen && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <DestinationAccommodation dest={dest} />
        </div>
      )}
    </li>
  );
}

/**
 * The destination's default accommodation — every night here uses it unless
 * that night sets its own (see the Daily planner's per-night card, which this
 * mirrors: same fields, same document panel). Its files land in `sleepingDocs`,
 * so they show up under the Details tab exactly like today.
 */
function DestinationAccommodation({ dest }) {
  const { t } = useI18n();
  const sleeping = dest.sleeping ?? { name: "", cost: 0, address: "" };

  const handleAdd = useCallback(
    (meta) => addDestDoc(dest.id, "sleepingDocs", meta),
    [dest.id],
  );
  const handleRemove = useCallback(
    (doc) => removeDestDoc(dest.id, "sleepingDocs", doc.id),
    [dest.id],
  );

  const patch = (fields) =>
    updateDestination(dest.id, { sleeping: { ...sleeping, ...fields } });

  return (
    <section className="rounded-xl border border-line bg-raised p-3">
      <h4 className="col-head">
        <Bed size={13} className="text-cat-sleeping" /> {t("dayStay.title")}
      </h4>
      <p className="mt-1 text-[11px] text-subtle">
        {t("plan.accommodationHint")}
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-[2fr_1fr]">
        <label className="text-[11px] font-medium text-muted">
          {t("dayStay.name")}
          <input
            className="field mt-1 !py-1 !text-xs"
            placeholder={t("sleeping.placeholder")}
            value={sleeping.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <label className="text-[11px] font-medium text-muted">
          {t("dayStay.cost")}
          <input
            type="number"
            min="0"
            step="0.01"
            className="field tabular mt-1 !py-1 !text-xs"
            placeholder="0"
            value={sleeping.cost || ""}
            onChange={(e) => patch({ cost: num(e.target.value) })}
          />
        </label>
      </div>

      <label className="mt-2 block text-[11px] font-medium text-muted">
        {t("dayStay.address")}
        <input
          className="field mt-1 !py-1 !text-xs"
          placeholder={t("dayStay.addressPlaceholder")}
          value={sleeping.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
      </label>

      <div className="mt-2 border-t border-line pt-2">
        <DocumentsPanel
          docs={dest.sleepingDocs}
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
