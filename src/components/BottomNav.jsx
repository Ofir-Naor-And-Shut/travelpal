import {
  Compass,
  FolderOpen,
  MapPinned,
  PlayCircle,
  Wallet,
} from "lucide-react";
import { useI18n } from "../lib/i18n.js";

const VIEWS = [
  { id: "plan", key: "nav.plan", icon: MapPinned },
  { id: "view", key: "nav.view", icon: PlayCircle },
  { id: "details", key: "nav.details", icon: FolderOpen },
  { id: "budget", key: "nav.budget", icon: Wallet },
  { id: "discover", key: "nav.discover", icon: Compass },
];

/**
 * Bottom navigation, docked as a real layout element (not a floating overlay) —
 * it reserves its own strip so nothing else has to compensate for it.
 *
 * Only the current view carries its label; the rest are icons. The label is
 * always in the DOM but collapsed to zero width, so switching tabs animates the
 * pill open instead of snapping — and screen readers still read every item.
 */
export default function BottomNav({ active, onChange }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.main")}
      className="flex shrink-0 justify-center border-t border-line bg-surface px-3 py-2"
    >
      <ul className="nav-bar flex items-center gap-0.5 rounded-full p-1.5">
        {VIEWS.map(({ id, key, icon: Icon }) => {
          const isActive = active === id;
          const label = t(key);

          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? "page" : undefined}
                title={label}
                className={`flex items-center rounded-full text-sm font-semibold transition-all duration-300
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isActive
                      ? "nav-pill-active gap-2 px-4 py-2.5"
                      : "nav-item-idle gap-0 px-3 py-2.5"
                  }`}
              >
                <Icon size={20} strokeWidth={2.1} className="shrink-0" />
                <span
                  className={`grid transition-all duration-300 ${
                    isActive
                      ? "grid-cols-[1fr] opacity-100"
                      : "grid-cols-[0fr] opacity-0"
                  }`}
                >
                  <span className="overflow-hidden whitespace-nowrap">
                    {label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
