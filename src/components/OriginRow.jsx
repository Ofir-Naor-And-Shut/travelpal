import { Home, Map as MapIcon, Trash2 } from 'lucide-react'
import { isPlaced, removeOrigin, updateOrigin } from '../lib/store.js'
import { useI18n } from '../lib/i18n.js'

/**
 * The trip's optional starting point. Deliberately unlike DestinationRow: no
 * order badge (it isn't a numbered stop), no nights stepper, no reorder
 * controls (it's always first) — just a name and a way to remove it, styled
 * a flat, blank gray so it reads as "before the itinerary" rather than as
 * stop zero.
 */
export default function OriginRow({ origin }) {
  const { t } = useI18n()
  const placed = isPlaced(origin)

  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-dashed border-line bg-canvas px-3 py-2.5">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-subtle"
      >
        <Home size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <input
          value={origin.name}
          onChange={(e) => updateOrigin({ name: e.target.value })}
          aria-label={t('plan.originNameLabel')}
          className="w-full truncate rounded border-none bg-transparent p-0 text-[15px] font-medium text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        />
        {origin.country && (
          <p className="truncate text-xs text-subtle">{origin.country}</p>
        )}
      </div>
      <button
        type="button"
        disabled={!placed}
        onClick={() => updateOrigin({ showOnMap: !origin.showOnMap })}
        aria-pressed={origin.showOnMap}
        aria-label={t('plan.originShowOnMap')}
        title={placed ? t('plan.originShowOnMap') : t('plan.originNotPlaced')}
        className={`btn-ghost !px-1.5 !py-1 disabled:cursor-not-allowed disabled:opacity-40 ${
          origin.showOnMap && placed ? 'text-accent' : ''
        }`}
      >
        <MapIcon size={15} />
      </button>
      <button
        type="button"
        className="btn-ghost !px-1.5 !py-1"
        onClick={removeOrigin}
        aria-label={t('plan.removeOrigin')}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}
