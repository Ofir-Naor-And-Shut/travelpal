import { Fragment } from 'react'
import { Compass, MapPin, Moon, Route } from 'lucide-react'
import DestinationRow from './DestinationRow.jsx'
import DestinationSearch from './DestinationSearch.jsx'
import TransportLeg from './TransportLeg.jsx'
import { addDestination, reorderDestinations } from '../lib/store.js'
import { distanceKm } from '../lib/places.js'
import { useDragReorder } from '../lib/useDragReorder.js'
import { useI18n } from '../lib/i18n.js'

export default function PlanView({
  trip,
  destinations,
  activeId,
  onHover,
  onOpenDay,
}) {
  const { t } = useI18n()
  const drag = useDragReorder(reorderDestinations)

  return (
    /* A container, not a plain wrapper: the rows must lay themselves out
       against this pane's width. Viewport breakpoints were wrong here — with
       the map dragged wide, a 1700px window can leave the pane at 414px, and
       the row would still take the wide layout and crush the name to nothing. */
    <div className="@container mx-auto max-w-3xl px-5 py-5 md:px-8">
      {/* Only shown once the row is wide enough to stay on one line. Every
          width here has a twin in DestinationRow so the columns line up. */}
      <div className="mb-2 hidden items-center gap-4 px-3 @[700px]:flex">
        <span className="col-head min-w-0 flex-1 basis-48 ps-10">
          <MapPin size={13} /> {t('plan.destination')}
        </span>
        <span className="col-head w-[116px] justify-center">
          <Moon size={13} /> {t('plan.nights')}
        </span>
        <span className="col-head w-[104px] justify-end">
          <Route size={13} /> {t('plan.order')}
        </span>
      </div>

      {destinations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mb-4">
          {destinations.map((dest, i) => {
            const next = destinations[i + 1]
            return (
              <Fragment key={dest.id}>
                <DestinationRow
                  dest={dest}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === destinations.length - 1}
                  active={activeId === dest.id}
                  onHover={onHover}
                  onOpenDay={onOpenDay}
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
                {/* Kept mounted while dragging: pulling these out mid-drag
                    shifted every row under the cursor and made the drop land
                    on the wrong one. */}
                {next && (
                  <li className={drag.dragging ? 'pointer-events-none opacity-30' : ''}>
                    <TransportLeg
                      from={dest}
                      to={next}
                      currency={trip.currency}
                      suggestedKm={distanceKm(dest, next)}
                    />
                  </li>
                )}
              </Fragment>
            )
          })}
        </ul>
      )}

      <DestinationSearch onSelect={(place) => addDestination(place)} />

      <p className="mt-3 px-1 text-xs text-subtle">{t('plan.autoDates')}</p>
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <div className="mb-4 flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-muted">
        <Compass size={20} />
      </span>
      <p className="text-sm font-semibold text-fg">{t('plan.emptyTitle')}</p>
      <p className="max-w-xs text-xs text-muted">{t('plan.emptyBody')}</p>
    </div>
  )
}
