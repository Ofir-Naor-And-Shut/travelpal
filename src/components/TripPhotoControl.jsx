import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Smile,
  Upload,
  ZoomIn,
} from "lucide-react";
import TripAvatar from "./TripAvatar.jsx";
import { updateTrip, useCloudMode, useTripRole } from "../lib/store.js";
import {
  MAX_FILE_BYTES,
  deleteDocEverywhere,
  formatBytes,
} from "../lib/docs.js";
import { saveTripCover } from "../lib/tripCover.js";
import { openLightbox } from "../lib/lightbox.js";
import { PEXELS_URL, fetchPexelsPhotos, hasPexelsKey } from "../lib/pexels.js";
import { useClampToViewport } from "../lib/useClampToViewport.js";
import { useI18n } from "../lib/i18n.js";

/**
 * The trip picture in the header, with a small popover to change it: shuffle a
 * Pexels photo of the first destination's country, upload your own cover, or
 * fall back to the emoji. Upload and emoji work with no Pexels key; only the
 * automatic photo needs one.
 */
export default function TripPhotoControl({ trip }) {
  const { t } = useI18n();
  const cloudMode = useCloudMode();
  const role = useTripRole(trip.id);
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The picture actually shown (a live object URL for an uploaded cover, or
  // the remote photo) — what the preview opens.
  const [displayUrl, setDisplayUrl] = useState("");
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const shift = useClampToViewport(open, menuRef);

  const first = trip.destinations?.[0];
  const query = first?.country || first?.name || "";
  const canShuffle = hasPexelsKey() && Boolean(query);

  // A different first stop means a different set of candidate photos.
  useEffect(() => {
    setPhotos([]);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onAway);
    return () => document.removeEventListener("mousedown", onAway);
  }, [open]);

  async function shuffle() {
    if (!query) return;
    setLoading(true);
    try {
      let list = photos;
      if (list.length === 0) {
        list = await fetchPexelsPhotos(query, { perPage: 10 });
        setPhotos(list);
      }
      if (list.length === 0) return;
      // Step to the photo after the current one, wrapping around.
      const idx = list.indexOf(trip.photoUrl);
      updateTrip({ photoUrl: list[(idx + 1) % list.length], coverDoc: null });
      // A Places photo supersedes any uploaded cover — free its bytes.
      if (trip.coverDoc) deleteDocEverywhere(trip.coverDoc);
    } catch {
      /* leave the current picture */
    } finally {
      setLoading(false);
    }
  }

  async function ingest(file) {
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(t("cover.imageOnly"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        t("docs.tooBig", {
          name: file.name,
          size: formatBytes(file.size),
          max: formatBytes(MAX_FILE_BYTES),
        }),
      );
      return;
    }
    setBusy(true);
    try {
      await saveTripCover({ tripId: trip.id, role, file, cloudMode });
      setOpen(false);
    } catch (err) {
      console.error("Cover upload failed", err);
      setError(t("cover.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("header.editPicture")}
        className="group relative grid place-items-center overflow-hidden rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <TripAvatar trip={trip} size={26} onUrl={setDisplayUrl} />
        <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
          <ImageIcon size={13} className="text-white" />
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}
          className="absolute start-0 top-full z-40 mt-2 w-60 rounded-xl border border-line bg-surface p-3 text-fg shadow-lg shadow-brand-950/20"
        >
          <p className="mb-2 text-xs font-medium text-muted">
            {t("header.picture")}
          </p>
          <div className="flex flex-col gap-1.5">
            {displayUrl && (
              <button
                type="button"
                onClick={() => {
                  openLightbox(displayUrl);
                  setOpen(false);
                }}
                className="btn-soft w-full justify-start"
              >
                <ZoomIn size={14} /> {t("header.previewPhoto")}
              </button>
            )}
            {canShuffle && (
              <button
                type="button"
                onClick={shuffle}
                disabled={loading || busy}
                className="btn-soft w-full justify-start disabled:opacity-60"
              >
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
                {t("header.shufflePhoto")}
              </button>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || loading}
              className="btn-ghost w-full justify-start disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              {t("header.uploadPhoto")}
            </button>
            {(trip.photoUrl || trip.coverDoc) && (
              <button
                type="button"
                onClick={() => {
                  updateTrip({ photoUrl: "", coverDoc: null });
                  if (trip.coverDoc) deleteDocEverywhere(trip.coverDoc);
                }}
                className="btn-ghost w-full justify-start"
              >
                <Smile size={14} /> {t("header.useEmoji")}
              </button>
            )}
          </div>

          <p className="mt-2 text-[11px] text-subtle">
            {canShuffle
              ? t("header.pictureFromFirst", { place: query })
              : hasPexelsKey()
                ? t("header.pictureHint")
                : t("header.pictureUploadOnly")}
          </p>

          {canShuffle && (
            <p className="mt-1 text-[11px] text-subtle">
              <a
                href={PEXELS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-fg"
              >
                {t("photo.pexels")}
              </a>
            </p>
          )}

          {error && (
            <p role="alert" className="mt-2 text-[11px] font-medium text-fg">
              {error}
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              ingest(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>
  );
}
