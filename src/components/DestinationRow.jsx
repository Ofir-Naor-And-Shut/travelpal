import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import {
  moveDestination,
  removeDestination,
  setNights,
  updateDestination,
} from "../lib/store.js";
import { formatDay } from "../lib/store.js";
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

  const nightWord =
    dest.nights === 1 ? t("plan.night") : t("plan.nightsPlural");

  return (
    <li
      {...dragProps}
      onMouseEnter={() => onHover?.(dest.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`relative rounded-xl border transition-all ${
        isDragging ? "opacity-40" : ""
      } ${
        active && !isDragging
          ? "border-accent bg-raised shadow-sm"
          : "border-line bg-surface shadow-sm hover:shadow-md"
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
    </li>
  );
}
