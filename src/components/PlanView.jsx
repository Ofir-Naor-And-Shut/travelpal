import { Fragment, useState } from "react";
import { Compass, MapPin, Moon, Plus, Route, X } from "lucide-react";
import DestinationRow from "./DestinationRow.jsx";
import DestinationSearch from "./DestinationSearch.jsx";
import OriginRow from "./OriginRow.jsx";
import LastStopRow from "./LastStopRow.jsx";
import TransportLeg from "./TransportLeg.jsx";
import {
  addDestination,
  addLastStop,
  addOrigin,
  effectiveLastStop,
  reorderDestinations,
} from "../lib/store.js";
import { distanceKm } from "../lib/places.js";
import { useDragReorder } from "../lib/useDragReorder.js";
import { useI18n } from "../lib/i18n.js";

export default function PlanView({
  trip,
  destinations,
  activeId,
  onHover,
  onOpenDay,
}) {
  const { t } = useI18n();
  const drag = useDragReorder(reorderDestinations);
  const [addingOrigin, setAddingOrigin] = useState(false);
  const [addingLastStop, setAddingLastStop] = useState(false);
  const lastStop = effectiveLastStop(trip);

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
          <MapPin size={13} /> {t("plan.destination")}
        </span>
        <span className="col-head w-[116px] justify-center">
          <Moon size={13} /> {t("plan.nights")}
        </span>
        <span className="col-head w-[104px] justify-end">
          <Route size={13} /> {t("plan.order")}
        </span>
      </div>

      {/* Optional and always ahead of the numbered stops: no nights, no
          map pin, just a place to leave from and the leg into stop 1. */}
      {trip.origin ? (
        <OriginRow origin={trip.origin} />
      ) : addingOrigin ? (
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DestinationSearch
              placeholder={t("plan.originPlaceholder")}
              label={t("plan.originSearchLabel")}
              onSelect={(place) => {
                addOrigin(place);
                setAddingOrigin(false);
              }}
            />
          </div>
          <button
            type="button"
            className="btn-ghost !px-2 !py-2"
            onClick={() => setAddingOrigin(false)}
            aria-label={t("plan.cancelAddOrigin")}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingOrigin(true)}
          className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-line-strong hover:text-fg"
        >
          <Plus size={13} /> {t("plan.addOrigin")}
        </button>
      )}

      {destinations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mb-4">
          {trip.origin && (
            <li>
              <TransportLeg
                from={trip.origin}
                to={destinations[0]}
                currency={trip.currency}
                suggestedKm={distanceKm(trip.origin, destinations[0])}
              />
            </li>
          )}
          {destinations.map((dest, i) => {
            const next = destinations[i + 1];
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
                  <li
                    className={
                      drag.dragging ? "pointer-events-none opacity-30" : ""
                    }
                  >
                    <TransportLeg
                      from={dest}
                      to={next}
                      currency={trip.currency}
                      suggestedKm={distanceKm(dest, next)}
                    />
                  </li>
                )}
              </Fragment>
            );
          })}
          {trip.lastStop && (
            <li>
              <TransportLeg
                from={destinations[destinations.length - 1]}
                to={lastStop}
                currency={trip.currency}
                suggestedKm={distanceKm(
                  destinations[destinations.length - 1],
                  lastStop,
                )}
              />
            </li>
          )}
        </ul>
      )}

      {/* Optional and always after the numbered stops: no nights, no map
          pin unless shown, just the leg leaving the last real destination. */}
      {trip.lastStop ? (
        <LastStopRow
          lastStop={trip.lastStop}
          effective={lastStop}
          hasOrigin={Boolean(trip.origin)}
        />
      ) : addingLastStop ? (
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <DestinationSearch
              placeholder={t("plan.lastStopPlaceholder")}
              label={t("plan.lastStopSearchLabel")}
              onSelect={(place) => {
                addLastStop(place);
                setAddingLastStop(false);
              }}
            />
            {trip.origin && (
              <button
                type="button"
                onClick={() => {
                  addLastStop({ sameAsOrigin: true });
                  setAddingLastStop(false);
                }}
                className="text-xs font-medium text-accent hover:underline"
              >
                {t("plan.useOriginAsLastStop", {
                  name: trip.origin.name || t("budget.origin"),
                })}
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost !px-2 !py-2"
            onClick={() => setAddingLastStop(false)}
            aria-label={t("plan.cancelAddLastStop")}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingLastStop(true)}
          className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs font-medium text-subtle transition hover:border-line-strong hover:text-fg"
        >
          <Plus size={13} /> {t("plan.addLastStop")}
        </button>
      )}

      <DestinationSearch onSelect={(place) => addDestination(place)} />

      <p className="mt-3 px-1 text-xs text-subtle">{t("plan.autoDates")}</p>
    </div>
  );
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-muted">
        <Compass size={20} />
      </span>
      <p className="text-sm font-semibold text-fg">{t("plan.emptyTitle")}</p>
      <p className="max-w-xs text-xs text-muted">{t("plan.emptyBody")}</p>
    </div>
  );
}
