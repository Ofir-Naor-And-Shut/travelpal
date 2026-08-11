import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  FileDown,
  FolderOpen,
  LayoutGrid,
  LogOut,
  MapPinned,
  PlayCircle,
  Share2,
  Wallet,
} from "lucide-react";
import {
  checkTripDownloaded,
  downloadTripOffline,
  useCloudMode,
  useTripRole,
} from "../lib/store.js";
import { signOut, useSession } from "../lib/auth.js";
import { exportTripPdf } from "../lib/exportPdf.js";
import ShareModal from "./ShareModal.jsx";
import { useI18n } from "../lib/i18n.js";

// The section links, in the same order as the desktop tab bar. Icons match the
// floating bottom nav so a view reads the same wherever it's reached from.
const SECTIONS = [
  { id: "plan", key: "tab.destinations", icon: MapPinned },
  { id: "details", key: "tab.details", icon: FolderOpen },
  { id: "view", key: "tab.dayByDay", icon: PlayCircle },
  { id: "budget", key: "tab.budget", icon: Wallet },
];

/**
 * The header's four-blocks button, opened out into a collapsible menu.
 *
 * It gathers what used to be a row of separate header buttons — jump to a
 * section, back to all trips, export, download, sign out — behind one toggle,
 * so the header stays uncluttered (and doesn't overflow on a phone). Mirrors the
 * click-away + Escape dismissal of AppControls/TripSwitcher, and uses logical
 * properties so it anchors to the inline-start edge in both languages.
 */
export default function TripMenu({ trip, view, onChangeView, onBackToTrips }) {
  const { t } = useI18n();
  const { session } = useSession();
  const cloudMode = useCloudMode();
  const role = useTripRole(trip.id);

  const [open, setOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!cloudMode) return undefined;
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

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm transition " +
    "text-muted hover:bg-raised hover:text-fg disabled:opacity-60";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("header.menu")}
        className="btn-ghost !px-2.5 !py-2 text-xs lg:!py-1.5"
      >
        <LayoutGrid size={14} />
        <span className="hidden lg:inline">{t("header.menu")}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("header.menu")}
          className="absolute top-full z-50 mt-1 min-w-[13rem] overflow-hidden rounded-xl
                     border border-line bg-surface shadow-lg shadow-brand-950/20 start-0"
        >
          <p className="px-3 pb-1 pt-2.5 text-[0.7rem] font-semibold uppercase tracking-wide text-subtle">
            {t("header.goTo")}
          </p>
          {SECTIONS.map(({ id, key, icon: Icon }) => {
            const current = view === id;
            return (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChangeView(id);
                  setOpen(false);
                }}
                aria-current={current ? "page" : undefined}
                className={
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm transition " +
                  (current
                    ? "bg-accent-soft font-semibold text-fg"
                    : "text-muted hover:bg-raised hover:text-fg")
                }
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{t(key)}</span>
                {current && <Check size={14} className="ms-auto shrink-0" />}
              </button>
            );
          })}

          <div className="my-1 border-t border-line" />

          {onBackToTrips && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onBackToTrips();
              }}
              className={itemClass}
            >
              <LayoutGrid size={16} className="shrink-0" />
              {t("header.allTrips")}
            </button>
          )}

          {/* Sharing needs an account (to attribute the invite/link) and is
              owner-only — a collaborator can edit content but not manage who
              else can. */}
          {cloudMode && role === "owner" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSharing(true);
              }}
              className={itemClass}
            >
              <Share2 size={16} className="shrink-0" />
              {t("nav.share")}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleExport}
            disabled={exporting}
            className={itemClass}
          >
            <FileDown size={16} className="shrink-0" />
            {t("header.exportPdf")}
          </button>

          {cloudMode && (
            <button
              type="button"
              role="menuitem"
              onClick={handleDownload}
              className={itemClass}
            >
              {downloaded ? (
                <Check size={16} className="shrink-0 text-accent" />
              ) : (
                <Download size={16} className="shrink-0" />
              )}
              {t(downloaded ? "offline.downloaded" : "offline.download")}
            </button>
          )}

          {/* Only signed-in users have a session to end; local-only users sign
              in from the picker instead. */}
          {session && (
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className={itemClass}
            >
              <LogOut size={16} className="shrink-0" />
              {t("picker.signOut")}
            </button>
          )}
        </div>
      )}

      {sharing && <ShareModal trip={trip} onClose={() => setSharing(false)} />}
    </div>
  );
}
