import { useI18n } from "../lib/i18n.js";

/**
 * App logo: a teal gradient tile holding a map-pin outline and a coral paper
 * plane, beside the "TravelPal" wordmark and a small tagline. The brand name
 * is a fixed wordmark; only the tagline is localized.
 */
export default function TripLogo({ className = "" }) {
  const { t } = useI18n();
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="relative flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-500/25">
        <svg
          className="size-7 text-white"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Map-pin outline (soft) with a coral paper plane on top. */}
          <path
            d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-40"
          />
          <path d="M16 6L7 11l3.5 1.5L16 6z" fill="#FF6B6B" />
          <path d="M16 6l-5.5 6.5L13 16l3-10z" fill="#FF8C42" />
        </svg>
      </span>
      <div className="flex flex-col">
        <span className="text-2xl font-black leading-none tracking-tight text-fg">
          Travel<span className="text-brand-600">Pal</span>
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-orange-500">
          {t("app.tagline")}
        </span>
      </div>
    </div>
  );
}
