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
 * Slim, flat tab strip docked directly under the header — a plain row of
 * buttons, not a floating pill. All labels show at desktop width; below `lg`
 * the row collapses so only the active tab keeps its name (others icon-only),
 * to stay compact on a phone.
 */
export default function TabNav({ active, onChange }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("nav.main")}
      className="flex shrink-0 gap-1 border-b border-line bg-surface px-2 py-1"
    >
      {VIEWS.map(({ id, key, icon: Icon }) => {
        const isActive = active === id;
        const label = t(key);

        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={isActive ? "page" : undefined}
            title={label}
            className={`flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-xs font-medium transition-colors
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-fg"
              }`}
          >
            <Icon size={16} strokeWidth={2.1} className="shrink-0" />
            <span className={isActive ? "inline" : "hidden lg:inline"}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
