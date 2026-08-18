import { Flag, Map as MapIcon, Trash2 } from "lucide-react";
import {
  isPlaced,
  removeLastStop,
  setLastStopSameAsOrigin,
  updateLastStop,
} from "../lib/store.js";
import { useI18n } from "../lib/i18n.js";

/**
 * The trip's optional final stop — the mirror of OriginRow. When
 * `sameAsOrigin` is on, the name/place mirror the trip origin live (the name
 * field is disabled) rather than keeping an independent, possibly-stale copy.
 */
export default function LastStopRow({ lastStop, effective, hasOrigin }) {
  const { t } = useI18n();
  const placed = isPlaced(effective);
  const locked = lastStop.sameAsOrigin && hasOrigin;

  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-line bg-canvas px-3 py-2.5">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-subtle"
      >
        <Flag size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <input
          value={effective?.name ?? ""}
          onChange={(e) => updateLastStop({ name: e.target.value })}
          disabled={locked}
          aria-label={t("plan.lastStopNameLabel")}
          className="w-full truncate rounded border-none bg-transparent p-0 text-[15px] font-medium text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:cursor-not-allowed"
        />
        {effective?.country && (
          <p className="truncate text-xs text-subtle">{effective.country}</p>
        )}
      </div>
      {hasOrigin && (
        <button
          type="button"
          onClick={() => setLastStopSameAsOrigin(!lastStop.sameAsOrigin)}
          aria-pressed={lastStop.sameAsOrigin}
          title={t("plan.sameAsOrigin")}
          className={`btn-ghost !px-2 !py-1 text-[11px] font-semibold ${
            lastStop.sameAsOrigin ? "text-accent" : ""
          }`}
        >
          {t("plan.sameAsOrigin")}
        </button>
      )}
      <button
        type="button"
        disabled={!placed}
        onClick={() => updateLastStop({ showOnMap: !lastStop.showOnMap })}
        aria-pressed={lastStop.showOnMap}
        aria-label={t("plan.originShowOnMap")}
        title={placed ? t("plan.originShowOnMap") : t("plan.originNotPlaced")}
        className={`btn-ghost !px-1.5 !py-1 disabled:cursor-not-allowed disabled:opacity-40 ${
          lastStop.showOnMap && placed ? "text-accent" : ""
        }`}
      >
        <MapIcon size={15} />
      </button>
      <button
        type="button"
        className="btn-ghost !px-1.5 !py-1"
        onClick={removeLastStop}
        aria-label={t("plan.removeLastStop")}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
