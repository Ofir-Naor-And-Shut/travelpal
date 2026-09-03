import { useState } from "react";
import { TransportIcon, DurationInputs } from "./TransportLeg.jsx";
import {
  TRANSPORT_MODES,
  modeColor,
  num,
  setAttractionLeg,
} from "../lib/store.js";
import { estimateDuration } from "../lib/places.js";
import { formatDuration } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

/** Modes that make sense for hopping between sights inside a city. */
const CITY_MODES = TRANSPORT_MODES.filter((m) =>
  ["walk", "bus", "car", "train", "ferry"].includes(m.id),
);

export default function AttractionLeg({ dayKeyValue, from, suggestedKm }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const leg = from.legOut;
  if (!leg) return null;

  const color = modeColor(leg.mode);
  const km = num(leg.distanceKm) || suggestedKm;
  const minutes =
    num(leg.durationMin) || (km ? estimateDuration(km, leg.mode) : 0);

  const summary = [
    minutes ? formatDuration(minutes) : null,
    km ? `${km} ${t("unit.km")}` : null,
  ].filter(Boolean);

  return (
    <div className="relative ps-2">
      <span
        aria-hidden
        className="absolute inset-y-0 start-[13px] w-0.5 rounded-full opacity-40"
        style={{ background: color }}
      />

      <div className="relative flex items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ms-[3px] inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-0.5
                     text-[11px] font-medium transition hover:shadow-sm
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ borderColor: `${color}66`, color }}
        >
          <TransportIcon mode={leg.mode} size={12} strokeWidth={2.4} />
          <span className="tabular">
            {summary.length ? summary.join(" · ") : t("attractions.addRoute")}
          </span>
        </button>
      </div>

      {open && (
        <div className="mb-2 ms-6 max-w-md rounded-lg border border-line bg-raised p-2.5">
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] font-medium text-muted">
              {t("transport.mode")}
              <select
                className="field mt-1 !py-1 !text-xs"
                value={leg.mode}
                onChange={(e) =>
                  setAttractionLeg(dayKeyValue, from.id, {
                    mode: e.target.value,
                  })
                }
              >
                {/* Not a real choice — a passively-created leg's placeholder
                    value, so the select reads correctly until a mode is
                    actually picked. */}
                <option value="none" hidden disabled>
                  {t("mode.none")}
                </option>
                {CITY_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(`mode.${m.id}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-[11px] font-medium text-muted">
              {t("transport.duration")}
              <DurationInputs
                minutes={leg.durationMin}
                onChange={(v) =>
                  setAttractionLeg(dayKeyValue, from.id, { durationMin: v })
                }
              />
            </label>

            <label className="text-[11px] font-medium text-muted">
              {t("transport.distance")}
              <input
                type="number"
                min="0"
                step="0.1"
                className="field tabular mt-1 !py-1 !text-xs"
                value={leg.distanceKm || ""}
                placeholder={String(suggestedKm || 0)}
                onChange={(e) =>
                  setAttractionLeg(dayKeyValue, from.id, {
                    distanceKm: num(e.target.value),
                  })
                }
              />
            </label>
          </div>

          {suggestedKm > 0 && (
            <button
              type="button"
              className="mt-2 text-[11px] font-medium text-muted underline underline-offset-2 hover:text-fg"
              onClick={() =>
                setAttractionLeg(dayKeyValue, from.id, {
                  distanceKm: suggestedKm,
                  durationMin: estimateDuration(suggestedKm, leg.mode),
                })
              }
            >
              {t("attractions.useEstimate", {
                km: suggestedKm,
                time: formatDuration(estimateDuration(suggestedKm, leg.mode)),
              })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
