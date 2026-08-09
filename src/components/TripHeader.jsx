import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Check,
  Download,
  FileDown,
  LayoutGrid,
  LogOut,
  Pencil,
} from "lucide-react";
import ProgressRing from "./ProgressRing.jsx";
import AppControls from "./AppControls.jsx";
import TripSwitcher from "./TripSwitcher.jsx";
import {
  CURRENCIES,
  checkTripDownloaded,
  downloadTripOffline,
  updateTrip,
  useCloudMode,
} from "../lib/store.js";
import { signOut, useSession } from "../lib/auth.js";
import { currencySymbol, formatMoney } from "../lib/money.js";
import { exportTripPdf } from "../lib/exportPdf.js";
import { useI18n } from "../lib/i18n.js";

export default function TripHeader({ trip, stats, onBackToTrips }) {
  const [editing, setEditing] = useState(false);
  const { t, dateLocale } = useI18n();
  const { session } = useSession();
  const cloudMode = useCloudMode();
  const [downloaded, setDownloaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!cloudMode) return;
    let cancelled = false;
    checkTripDownloaded(trip.id).then((v) => {
      if (!cancelled) setDownloaded(v);
    });
    return () => {
      cancelled = true;
    };
  }, [cloudMode, trip.id]);

  const handleDownload = async () => {
    await downloadTripOffline(trip.id);
    setDownloaded(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportTripPdf(trip);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setExporting(false);
    }
  };

  const opts = { locale: dateLocale };
  const range = `${format(parseISO(trip.startDate), "dd MMM", opts)} – ${format(
    parseISO(trip.endDate),
    "dd MMM yyyy",
    opts,
  )}`;

  return (
    <header className="border-b border-line bg-surface px-5 pt-4 md:px-8">
      {/* Language + theme sit at the inline-start of the header. On phones the
          row wraps so the trip switcher drops to its own line rather than being
          clipped off the edge; on desktop it stays a single row. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:flex-nowrap">
        <div className="flex items-center gap-2">
          {onBackToTrips && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-2 text-xs lg:!py-1.5"
              onClick={onBackToTrips}
              aria-label={t("header.allTrips")}
            >
              <LayoutGrid size={14} />
              <span className="hidden lg:inline">{t("header.allTrips")}</span>
            </button>
          )}
          <AppControls />
          <button
            type="button"
            className="btn-ghost !px-2.5 !py-2 text-xs lg:!py-1.5"
            onClick={handleExport}
            disabled={exporting}
            aria-label={t("header.exportPdf")}
          >
            <FileDown size={14} />
            <span className="hidden lg:inline">{t("header.exportPdf")}</span>
          </button>
          {cloudMode && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-2 text-xs lg:!py-1.5"
              onClick={handleDownload}
              aria-label={t(
                downloaded ? "offline.downloaded" : "offline.download",
              )}
            >
              {downloaded ? <Check size={14} /> : <Download size={14} />}
              <span className="hidden lg:inline">
                {t(downloaded ? "offline.downloaded" : "offline.download")}
              </span>
            </button>
          )}
          {/* Only signed-in users have a session to end; local-only users sign
              in from the picker instead. */}
          {session && (
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-2 text-xs lg:!py-1.5"
              onClick={signOut}
              aria-label={t("picker.signOut")}
            >
              <LogOut size={14} />
              <span className="hidden lg:inline">{t("picker.signOut")}</span>
            </button>
          )}
        </div>
        {/* Full-width on its own wrapped line on phones; natural width inline
            on desktop. */}
        <div className="min-w-0 basis-full lg:basis-auto">
          <TripSwitcher />
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="field !w-auto max-w-[16rem] text-lg font-semibold"
                value={trip.title}
                autoFocus
                onChange={(e) => updateTrip({ title: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
                aria-label={t("header.title")}
              />
              <input
                type="date"
                className="field !w-auto"
                value={trip.startDate}
                max={trip.endDate}
                onChange={(e) => updateTrip({ startDate: e.target.value })}
                aria-label={t("header.startDate")}
              />
              <input
                type="date"
                className="field !w-auto"
                value={trip.endDate}
                min={trip.startDate}
                onChange={(e) => updateTrip({ endDate: e.target.value })}
                aria-label={t("header.endDate")}
              />
              <button
                type="button"
                className="btn-soft"
                onClick={() => setEditing(false)}
              >
                <Check size={16} /> {t("header.done")}
              </button>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-fg md:text-2xl">
                <span className="truncate">{trip.title}</span>
                <span aria-hidden>{trip.emoji}</span>
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-1"
                  onClick={() => setEditing(true)}
                  aria-label={t("header.editTrip")}
                >
                  <Pencil size={15} />
                </button>
              </h1>
              <p className="tabular mt-0.5 text-sm text-muted">{range}</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="text-end">
            <p className="tabular text-xl font-semibold text-fg">
              {formatMoney(stats.total, trip.currency)}
            </p>
            <label className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
              {t("header.costIn")}
              <select
                value={trip.currency}
                onChange={(e) => updateTrip({ currency: e.target.value })}
                className="cursor-pointer rounded border-none bg-transparent py-1 font-medium text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 lg:py-0"
                aria-label={t("header.currency")}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} {currencySymbol(c.code)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2.5 border-s border-line ps-6">
            <ProgressRing
              value={stats.plannedNights}
              total={stats.totalNights}
              over={stats.overplanned}
              label={t("header.nightsPlanned", {
                value: stats.plannedNights,
                total: stats.totalNights,
              })}
            />
            <div className="text-sm leading-tight">
              <p className="font-semibold text-fg">{t("header.nights")}</p>
              <p className="text-muted">{t("header.planned")}</p>
            </div>
          </div>
        </div>
      </div>

      {stats.overplanned && (
        <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs text-fg">
          {t("header.overplanned", {
            planned: stats.plannedNights,
            total: stats.totalNights,
          })}
        </p>
      )}
    </header>
  );
}
