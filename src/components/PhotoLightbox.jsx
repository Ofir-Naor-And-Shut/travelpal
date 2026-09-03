import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { closeLightbox, useLightbox } from "../lib/lightbox.js";
import { useI18n } from "../lib/i18n.js";

/**
 * Full-screen, centered preview of a single picture. Mounted once at the root;
 * shows whatever `openLightbox` last set. Closes on backdrop click, the button
 * or Escape.
 */
export default function PhotoLightbox() {
  const url = useLightbox();
  const { t } = useI18n();

  useEffect(() => {
    if (!url) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [url]);

  if (!url) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("photo.preview")}
      onClick={closeLightbox}
      className="fixed inset-0 z-[1200] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={closeLightbox}
        aria-label={t("photo.close")}
        className="absolute end-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <X size={20} />
      </button>
      <img
        src={url}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
      />
    </div>,
    document.body,
  );
}
