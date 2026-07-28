import { useCallback, useEffect, useState } from 'react'
import { Bed, NotebookPen, Ticket } from 'lucide-react'
import DocumentsPanel from './DocumentsPanel.jsx'
import {
  addDestDoc,
  formatDay,
  removeDestDoc,
  updateDestination,
} from '../lib/store.js'
import { useI18n } from '../lib/i18n.js'

export default function DetailsView({
  destinations,
  focusDestId,
  onFocusHandled,
}) {
  const { t } = useI18n()
  const [selectedId, setSelectedId] = useState(destinations[0]?.id ?? null)

  // Arriving from a map pin: jump to that stop, then release the request so a
  // later manual tab change isn't snapped back.
  useEffect(() => {
    if (!focusDestId) return
    setSelectedId(focusDestId)
    onFocusHandled?.()
  }, [focusDestId, onFocusHandled])

  // Follow along if the selected stop is renamed away, deleted or reordered.
  useEffect(() => {
    if (destinations.length === 0) {
      setSelectedId(null)
    } else if (!destinations.some((d) => d.id === selectedId)) {
      setSelectedId(destinations[0].id)
    }
  }, [destinations, selectedId])

  const dest = destinations.find((d) => d.id === selectedId)

  if (!dest) {
    return (
      <p className="px-8 py-12 text-center text-sm text-muted">
        {t('details.empty')}
      </p>
    )
  }

  const index = destinations.indexOf(dest)

  return (
    <div className="mx-auto max-w-3xl px-5 py-5 md:px-8">
      {/* Sub-tabs, one per destination */}
      <div
        role="tablist"
        aria-label={t('details.destinations')}
        className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {destinations.map((d, i) => {
          const selected = d.id === dest.id
          const count = d.travelDocs.length + d.sleepingDocs.length
          return (
            <button
              key={d.id}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setSelectedId(d.id)}
              className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line-strong bg-surface text-fg hover:border-accent'
                }`}
            >
              <span
                className={`tabular grid size-5 place-items-center rounded-full text-[10px] font-bold ${
                  selected ? 'bg-surface/20' : 'bg-accent-soft text-fg'
                }`}
              >
                {i + 1}
              </span>
              <span className="max-w-[10rem] truncate">{d.name}</span>
              {count > 0 && (
                <span
                  className={`tabular rounded-full px-1.5 text-[10px] font-bold ${
                    selected ? 'bg-surface/20' : 'bg-accent-soft text-fg'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{dest.name}</h2>
          <p className="tabular text-xs text-muted">
            {t('details.stop', { n: index + 1 })} · {formatDay(dest.startDate)} –{' '}
            {formatDay(dest.endDate)} · {dest.nights}{' '}
            {dest.nights === 1 ? t('plan.night') : t('plan.nightsPlural')}
          </p>
        </div>

        <section className="card p-4">
          <h3 className="col-head mb-2">
            <NotebookPen size={13} /> {t('details.notes')}
          </h3>
          <textarea
            rows={4}
            className="field resize-y"
            placeholder={t('details.notesPlaceholder')}
            value={dest.notes}
            onChange={(e) =>
              updateDestination(dest.id, { notes: e.target.value })
            }
          />
        </section>

        <DocSection
          destId={dest.id}
          slot="travelDocs"
          docs={dest.travelDocs}
          icon={Ticket}
          label={t('details.travelDocs')}
          hint={t('details.travelHint')}
        />

        <DocSection
          destId={dest.id}
          slot="sleepingDocs"
          docs={dest.sleepingDocs}
          icon={Bed}
          label={t('details.sleepingDocs')}
          hint={t('details.sleepingHint')}
        />
      </div>
    </div>
  )
}

function DocSection({ destId, slot, docs, icon: Icon, label, hint }) {
  // Stable callbacks so the uploader doesn't re-run its effect on every render.
  const handleAdd = useCallback(
    (meta) => addDestDoc(destId, slot, meta),
    [destId, slot],
  )
  const handleRemove = useCallback(
    (doc) => removeDestDoc(destId, slot, doc.id),
    [destId, slot],
  )

  return (
    <section className="card p-4">
      <DocumentsPanel
        docs={docs}
        onAdd={handleAdd}
        onRemove={handleRemove}
        label={label}
        hint={hint}
        icon={Icon}
      />
    </section>
  )
}
