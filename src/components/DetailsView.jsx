import { useCallback, useEffect, useState } from "react";
import {
  Bed,
  Download,
  Eye,
  Files,
  NotebookPen,
  Ticket,
  Trash2,
} from "lucide-react";
import DocumentsPanel, { PreviewModal } from "./DocumentsPanel.jsx";
import {
  addDestDoc,
  destinationDocuments,
  formatDay,
  removeDayAccommodationDoc,
  removeDestDoc,
  removeReservationDoc,
  removeSegmentDoc,
  updateDestination,
  useTrip,
} from "../lib/store.js";
import {
  ICON_FOR,
  deleteDocEverywhere,
  downloadDoc,
  formatBytes,
  kindOf,
} from "../lib/docs.js";
import { useI18n } from "../lib/i18n.js";

export default function DetailsView({
  destinations,
  focusDestId,
  onFocusHandled,
}) {
  const { t } = useI18n();
  const trip = useTrip();
  const [selectedId, setSelectedId] = useState(destinations[0]?.id ?? null);

  // Arriving from a map pin: jump to that stop, then release the request so a
  // later manual tab change isn't snapped back.
  useEffect(() => {
    if (!focusDestId) return;
    setSelectedId(focusDestId);
    onFocusHandled?.();
  }, [focusDestId, onFocusHandled]);

  // Follow along if the selected stop is renamed away, deleted or reordered.
  useEffect(() => {
    if (destinations.length === 0) {
      setSelectedId(null);
    } else if (!destinations.some((d) => d.id === selectedId)) {
      setSelectedId(destinations[0].id);
    }
  }, [destinations, selectedId]);

  const dest = destinations.find((d) => d.id === selectedId);

  if (!dest) {
    return (
      <p className="px-8 py-12 text-center text-sm text-muted">
        {t("details.empty")}
      </p>
    );
  }

  const index = destinations.indexOf(dest);

  return (
    <div className="mx-auto max-w-3xl px-5 py-5 md:px-8">
      {/* Sub-tabs, one per destination */}
      <div
        role="tablist"
        aria-label={t("details.destinations")}
        className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {destinations.map((d, i) => {
          const selected = d.id === dest.id;
          const count = destinationDocuments(trip, d).length;
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
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line-strong bg-surface text-fg hover:border-accent"
                }`}
            >
              <span
                className={`tabular grid size-5 place-items-center rounded-full text-[10px] font-bold ${
                  selected ? "bg-surface/20" : "bg-accent-soft text-fg"
                }`}
              >
                {i + 1}
              </span>
              <span className="max-w-[10rem] truncate">{d.name}</span>
              {count > 0 && (
                <span
                  className={`tabular rounded-full px-1.5 text-[10px] font-bold ${
                    selected ? "bg-surface/20" : "bg-accent-soft text-fg"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{dest.name}</h2>
          <p className="tabular text-xs text-muted">
            {t("details.stop", { n: index + 1 })} · {formatDay(dest.startDate)}{" "}
            – {formatDay(dest.endDate)} · {dest.nights}{" "}
            {dest.nights === 1 ? t("plan.night") : t("plan.nightsPlural")}
          </p>
        </div>

        <section className="card p-4">
          <h3 className="col-head mb-2">
            <NotebookPen size={13} /> {t("details.notes")}
          </h3>
          <textarea
            rows={4}
            className="field resize-y"
            placeholder={t("details.notesPlaceholder")}
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
          label={t("details.travelDocs")}
          hint={t("details.travelHint")}
        />

        <DocSection
          destId={dest.id}
          slot="sleepingDocs"
          docs={dest.sleepingDocs}
          icon={Bed}
          label={t("details.sleepingDocs")}
          hint={t("details.sleepingHint")}
        />

        <AllDocumentsSection trip={trip} dest={dest} />
      </div>
    </div>
  );
}

function AllDocumentsSection({ trip, dest }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const items = destinationDocuments(trip, dest);

  function tagFor(item) {
    switch (item.kind) {
      case "travel":
        return t("details.travelDocs");
      case "sleeping":
        return t("details.sleepingDocs");
      case "accommodation":
        return t("details.tagAccommodation", { n: item.nightIndex + 1 });
      case "reservation":
        return t("details.tagReservation", {
          n: item.nightIndex + 1,
          name: item.reservationName || t("reserved.fallback"),
        });
      case "transport":
        return t("details.tagTransport", { mode: t(`mode.${item.mode}`) });
      default:
        return "";
    }
  }

  function remove(item) {
    if (item.kind === "travel" || item.kind === "sleeping") {
      removeDestDoc(
        dest.id,
        item.kind === "travel" ? "travelDocs" : "sleepingDocs",
        item.doc.id,
      );
    } else if (item.kind === "accommodation") {
      removeDayAccommodationDoc(item.key, item.doc.id);
    } else if (item.kind === "reservation") {
      removeReservationDoc(item.key, item.reservationId, item.doc.id);
    } else if (item.kind === "transport") {
      removeSegmentDoc(dest.id, item.segmentId, item.doc.id);
    }
    deleteDocEverywhere(item.doc);
  }

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="col-head">
          <Files size={13} /> {t("details.allDocuments")}
        </h3>
        <span className="text-xs text-muted">
          {items.length || t("docs.none")}{" "}
          {items.length === 1 ? t("docs.file") : t("docs.files")}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted">{t("details.allDocumentsEmpty")}</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {items.map((item) => {
            const doc = item.doc;
            const kind = kindOf(doc.type, doc.name);
            const Icon = ICON_FOR[kind];
            return (
              <li
                key={doc.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-fg">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">
                    {doc.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-1 text-xs text-muted">
                    <span className="tabular">{formatBytes(doc.size)}</span>
                    <span aria-hidden>·</span>
                    <span className="rounded-full bg-accent-soft px-1.5 text-[10px] font-semibold text-fg">
                      {tagFor(item)}
                    </span>
                  </span>
                </span>

                {kind !== "file" && (
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1"
                    onClick={() => setPreview(doc)}
                    aria-label={t("docs.preview", { name: doc.name })}
                  >
                    <Eye size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  onClick={() => downloadDoc(doc.id, doc.name, doc.storagePath)}
                  aria-label={t("docs.download", { name: doc.name })}
                >
                  <Download size={15} />
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 hover:!bg-accent-soft"
                  onClick={() => remove(item)}
                  aria-label={t("docs.delete", { name: doc.name })}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}

function DocSection({ destId, slot, docs, icon: Icon, label, hint }) {
  // Stable callbacks so the uploader doesn't re-run its effect on every render.
  const handleAdd = useCallback(
    (meta) => addDestDoc(destId, slot, meta),
    [destId, slot],
  );
  const handleRemove = useCallback(
    (doc) => removeDestDoc(destId, slot, doc.id),
    [destId, slot],
  );

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
  );
}
