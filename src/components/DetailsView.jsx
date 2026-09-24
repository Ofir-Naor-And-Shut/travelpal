import { useCallback, useEffect, useState } from "react";
import {
  Bed,
  CalendarDays,
  Download,
  Eye,
  Files,
  NotebookPen,
  Plus,
  Receipt,
  Ticket,
  Trash2,
  Trees,
  X,
} from "lucide-react";
import DocumentsPanel, { PreviewModal } from "./DocumentsPanel.jsx";
import {
  addDestDoc,
  addGeneralExpense,
  addGeneralExpenseDoc,
  dayKey,
  destinationDocuments,
  formatDay,
  getDay,
  num,
  removeDayAccommodationDoc,
  removeDestDoc,
  removeGeneralExpense,
  removeGeneralExpenseDoc,
  removeReservationDoc,
  removeSegmentDoc,
  updateDestination,
  updateGeneralExpense,
  useTrip,
} from "../lib/store.js";
import {
  ICON_FOR,
  deleteDocEverywhere,
  downloadDoc,
  formatBytes,
  kindOf,
} from "../lib/docs.js";
import { formatMoney } from "../lib/money.js";
import { useI18n } from "../lib/i18n.js";

// Sentinel tab value for the trip-wide expenses sub-tab (not a destination id).
const GENERAL = "__general__";

// Common trip-wide costs offered as one-tap starting points. i18n keys, so the
// button label localizes and the "already added" check compares by label.
const GENERAL_EXAMPLES = [
  "details.exInsurance",
  "details.exDriving",
  "details.exVisa",
  "details.exVaccination",
  "details.exSim",
  "details.exParking",
];

/** Every distinct accommodation name set across the stop's own nights (each
 * falling back to the destination's default when a night has no override of
 * its own), or a "not set"/"multiple" summary. */
function accommodationSummary(trip, dest, t) {
  const names = new Set();
  for (let n = 0; n < dest.nights; n += 1) {
    const name = (
      getDay(trip, dayKey(dest.id, n)).accommodation?.name ||
      dest.sleeping?.name ||
      ""
    ).trim();
    if (name) names.add(name);
  }
  if (names.size === 0) return t("details.accommodationNone");
  if (names.size === 1) return [...names][0];
  return t("details.accommodationMultiple", { n: names.size });
}

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

  // Follow along if the selected stop is renamed away, deleted or reordered —
  // but never yank the user off the trip-wide "General" tab.
  useEffect(() => {
    if (selectedId === GENERAL) return;
    if (destinations.length === 0) {
      setSelectedId(null);
    } else if (!destinations.some((d) => d.id === selectedId)) {
      setSelectedId(destinations[0].id);
    }
  }, [destinations, selectedId]);

  const isGeneral = selectedId === GENERAL;
  const dest = destinations.find((d) => d.id === selectedId);
  const index = dest ? destinations.indexOf(dest) : -1;
  const generalCount = (trip.generalExpenses ?? []).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-5 md:px-8">
      {/* Destination sub-tabs on one end; the trip-wide "General" tab pinned
          to the other, set apart from the stops it doesn't belong to. */}
      <div
        role="tablist"
        aria-label={t("details.destinations")}
        className="mb-5 flex items-center gap-2"
      >
        <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1">
          {destinations.map((d, i) => {
            const selected = d.id === selectedId;
            const count = destinationDocuments(trip, d).length;
            return (
              <button
                key={d.id}
                role="tab"
                type="button"
                aria-selected={selected}
                onClick={() => setSelectedId(d.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    selected
                      ? "bg-accent text-on-accent shadow-sm"
                      : "bg-raised text-muted hover:text-fg"
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

        <span aria-hidden className="h-6 w-px shrink-0 bg-line" />

        <button
          role="tab"
          type="button"
          aria-selected={isGeneral}
          onClick={() => setSelectedId(GENERAL)}
          className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isGeneral
                ? "bg-accent text-on-accent shadow-sm"
                : "bg-raised text-muted hover:text-fg"
            }`}
        >
          <span
            className={`grid size-5 place-items-center rounded-full ${
              isGeneral ? "bg-surface/20" : "bg-accent-soft text-fg"
            }`}
          >
            <Receipt size={12} />
          </span>
          <span>{t("details.general")}</span>
          {generalCount > 0 && (
            <span
              className={`tabular rounded-full px-1.5 text-[10px] font-bold ${
                isGeneral ? "bg-surface/20" : "bg-accent-soft text-fg"
              }`}
            >
              {generalCount}
            </span>
          )}
        </button>
      </div>

      {isGeneral ? (
        <GeneralExpensesPanel trip={trip} />
      ) : dest ? (
        <DestinationDetails trip={trip} dest={dest} index={index} />
      ) : (
        <p className="px-8 py-12 text-center text-sm text-muted">
          {t("details.empty")}
        </p>
      )}
    </div>
  );
}

/** One destination's notes, accommodation summary and documents. */
function DestinationDetails({ trip, dest, index }) {
  const { t } = useI18n();
  const [openDocs, setOpenDocs] = useState(null); // "travelDocs" | "sleepingDocs" | null

  // The Lodging summary counts every accommodation file, wherever it was added
  // — the destination's default (sleepingDocs) plus any per-night override's.
  const accommodationDocs = destinationDocuments(trip, dest).filter(
    (i) => i.kind === "sleeping" || i.kind === "accommodation",
  );

  return (
    <>
      <div role="tabpanel" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section
            className="card relative overflow-hidden p-5"
            style={{
              borderInlineStartWidth: 4,
              borderInlineStartColor: "var(--color-cat-attractions)",
            }}
          >
            <Trees
              size={64}
              aria-hidden
              className="pointer-events-none absolute end-4 top-4 text-cat-attractions opacity-10"
            />
            <h2 className="text-base font-semibold tracking-tight text-fg">
              {dest.name}
            </h2>
            <p className="tabular mt-1 flex items-center gap-1.5 text-sm text-muted">
              <CalendarDays size={14} />
              {t("details.stop", { n: index + 1 })} ·{" "}
              {formatDay(dest.startDate)} – {formatDay(dest.endDate)} ·{" "}
              {dest.nights}{" "}
              {dest.nights === 1 ? t("plan.night") : t("plan.nightsPlural")}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  {t("details.accommodation")}
                </span>
                <p className="mt-1 truncate text-sm font-medium text-fg">
                  {accommodationSummary(trip, dest, t)}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  {t("details.country")}
                </span>
                <p className="mt-1 truncate text-sm font-medium text-fg">
                  {dest.country || "—"}
                </p>
              </div>
            </div>
          </section>

          <section className="card flex flex-1 flex-col p-5">
            <h3 className="col-head mb-3">
              <NotebookPen size={13} /> {t("details.notes")}
            </h3>
            <textarea
              rows={8}
              className="field min-h-[220px] flex-1 resize-y"
              placeholder={t("details.notesPlaceholder")}
              value={dest.notes}
              onChange={(e) =>
                updateDestination(dest.id, { notes: e.target.value })
              }
            />
          </section>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setOpenDocs("travelDocs")}
              className="card flex flex-col items-start gap-3 p-4 text-start transition hover:border-accent hover:shadow-sm"
            >
              <span className="grid size-10 place-items-center rounded-full bg-cat-transport/20 text-fg">
                <Ticket size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-fg">
                  {t("details.travelShort")}
                </span>
                <span className="tabular text-xs text-muted">
                  {dest.travelDocs.length}{" "}
                  {dest.travelDocs.length === 1
                    ? t("docs.file")
                    : t("docs.files")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOpenDocs("sleepingDocs")}
              className="card flex flex-col items-start gap-3 p-4 text-start transition hover:border-accent hover:shadow-sm"
            >
              <span className="grid size-10 place-items-center rounded-full bg-cat-sleeping/25 text-fg">
                <Bed size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-fg">
                  {t("details.lodgingShort")}
                </span>
                <span className="tabular text-xs text-muted">
                  {accommodationDocs.length}{" "}
                  {accommodationDocs.length === 1
                    ? t("docs.file")
                    : t("docs.files")}
                </span>
              </span>
            </button>
          </div>

          <AllDocumentsSection trip={trip} dest={dest} />
        </div>
      </div>

      {openDocs && (
        <DocsModal
          label={
            openDocs === "travelDocs"
              ? t("details.travelDocs")
              : t("details.sleepingDocs")
          }
          onClose={() => setOpenDocs(null)}
        >
          <DocSlot
            destId={dest.id}
            slot={openDocs}
            docs={dest[openDocs]}
            icon={openDocs === "travelDocs" ? Ticket : Bed}
            label={
              openDocs === "travelDocs"
                ? t("details.travelDocs")
                : t("details.sleepingDocs")
            }
            hint={
              openDocs === "travelDocs"
                ? t("details.travelHint")
                : t("details.sleepingHint")
            }
          />
          {openDocs === "sleepingDocs" && (
            <PerNightAccommodationDocs trip={trip} dest={dest} />
          )}
        </DocsModal>
      )}
    </>
  );
}

function DocsModal({ label, onClose, children }) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="btn-ghost absolute end-3 top-3 z-10 !px-2"
          onClick={onClose}
          aria-label={t("docs.closePreview")}
        >
          <X size={18} />
        </button>
        <div className="min-h-0 flex-1 overflow-auto pe-8">{children}</div>
      </div>
    </div>
  );
}

/**
 * Trip-wide costs that belong to no single stop — insurance, visas, an
 * international driving licence. Each rolls into the budget total and can keep
 * its own paperwork, exactly like a reservation or a stay. Shown as its own
 * Details sub-tab, alongside the destinations.
 */
function GeneralExpensesPanel({ trip }) {
  const { t } = useI18n();
  const expenses = trip.generalExpenses ?? [];
  const total = expenses.reduce((sum, e) => sum + num(e.cost), 0);

  // Don't re-offer an example that's already been added by name.
  const taken = new Set(
    expenses.map((e) => e.name.trim().toLowerCase()).filter(Boolean),
  );
  const suggestions = GENERAL_EXAMPLES.filter(
    (key) => !taken.has(t(key).toLowerCase()),
  );

  return (
    <div role="tabpanel" className="mx-auto max-w-3xl">
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="col-head">
            <Receipt size={13} /> {t("details.general")}
          </h2>
          {expenses.length > 0 && (
            <span className="tabular text-sm font-semibold text-fg">
              {formatMoney(total, trip.currency)}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-subtle">{t("details.generalDesc")}</p>

        {suggestions.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t("details.generalExamples")}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => addGeneralExpense({ name: t(key) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium text-fg transition hover:border-accent hover:text-accent"
                >
                  <Plus size={13} /> {t(key)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {expenses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-surface px-4 py-8 text-center text-sm text-muted">
              {t("details.generalEmpty")}
            </p>
          ) : (
            expenses.map((expense) => (
              <GeneralExpenseRow
                key={expense.id}
                expense={expense}
                currency={trip.currency}
              />
            ))
          )}
        </div>

        <button
          type="button"
          className="btn-soft mt-3 !py-1.5 text-sm"
          onClick={() => addGeneralExpense()}
        >
          <Plus size={15} /> {t("details.generalAdd")}
        </button>
      </section>
    </div>
  );
}

function GeneralExpenseRow({ expense, currency }) {
  const { t } = useI18n();

  // Stable callbacks so the uploader doesn't re-run its effect on every render.
  const handleAdd = useCallback(
    (meta) => addGeneralExpenseDoc(expense.id, meta),
    [expense.id],
  );
  const handleRemove = useCallback(
    (doc) => removeGeneralExpenseDoc(expense.id, doc.id),
    [expense.id],
  );

  function remove() {
    expense.documents.forEach((doc) => deleteDocEverywhere(doc));
    removeGeneralExpense(expense.id);
  }

  return (
    <div className="rounded-xl border border-line bg-raised p-3">
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[11px] font-medium text-muted">
          {t("details.generalName")}
          <input
            className="field mt-1 !py-1 !text-xs"
            placeholder={t("details.generalNamePlaceholder")}
            value={expense.name}
            onChange={(e) =>
              updateGeneralExpense(expense.id, { name: e.target.value })
            }
          />
        </label>
        <label className="w-24 shrink-0 text-[11px] font-medium text-muted">
          {t("dayStay.cost")} ({currency})
          <input
            type="number"
            min="0"
            step="0.01"
            className="field tabular mt-1 !py-1 !text-xs"
            placeholder="0"
            value={expense.cost || ""}
            onChange={(e) =>
              updateGeneralExpense(expense.id, { cost: num(e.target.value) })
            }
          />
        </label>
        <button
          type="button"
          className="btn-ghost !px-2 !py-1.5 hover:!bg-accent-soft"
          onClick={remove}
          aria-label={t("details.generalRemove")}
          title={t("details.generalRemove")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-2 border-t border-line pt-2">
        <DocumentsPanel
          docs={expense.documents}
          onAdd={handleAdd}
          onRemove={handleRemove}
          label={t("details.generalDocs")}
          hint={t("dayStay.docsHint")}
          icon={Receipt}
          compact
        />
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
    <section className="card flex-1 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="col-head">
          <Files size={13} /> {t("details.allDocuments")}
        </h3>
        <span className="tabular text-xs text-muted">
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
                className="group flex items-center gap-3 border border-transparent px-3 py-2 text-sm transition hover:border-line hover:bg-raised"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-fg">
                  <Icon size={16} />
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
                    className="btn-ghost !px-2 !py-1 opacity-0 group-hover:opacity-100"
                    onClick={() => setPreview(doc)}
                    aria-label={t("docs.preview", { name: doc.name })}
                  >
                    <Eye size={15} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 opacity-0 group-hover:opacity-100"
                  onClick={() => downloadDoc(doc.id, doc.name, doc.storagePath)}
                  aria-label={t("docs.download", { name: doc.name })}
                >
                  <Download size={15} />
                </button>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1 opacity-0 hover:!bg-accent-soft group-hover:opacity-100"
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

/**
 * The destination's per-night accommodation files — added a night at a time in
 * the daily planner — surfaced read-only inside the Lodging documents modal so
 * every place a stay's paperwork can live shows up together. New uploads still
 * belong to the night, so they stay in the planner card.
 */
function PerNightAccommodationDocs({ trip, dest }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const items = destinationDocuments(trip, dest).filter(
    (i) => i.kind === "accommodation",
  );

  if (items.length === 0) return null;

  function remove(item) {
    removeDayAccommodationDoc(item.key, item.doc.id);
    deleteDocEverywhere(item.doc);
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <h4 className="col-head mb-2">
        <Bed size={13} /> {t("details.perNightDocs")}
      </h4>
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
                    {t("details.tagAccommodation", { n: item.nightIndex + 1 })}
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

      {preview && (
        <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function DocSlot({ destId, slot, docs, icon: Icon, label, hint }) {
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
    <DocumentsPanel
      docs={docs}
      onAdd={handleAdd}
      onRemove={handleRemove}
      label={label}
      hint={hint}
      icon={Icon}
    />
  );
}
