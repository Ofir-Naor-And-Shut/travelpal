import { useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Check, LogOut, MoreVertical, Plus, X } from "lucide-react";
import AppControls from "./AppControls.jsx";
import {
  acceptTripInvitation,
  createTrip,
  deleteTrip,
  leaveSharedTrip,
  useTripInvitations,
  useTripList,
} from "../lib/store.js";
import {
  sessionEmail,
  setLocalOnly,
  signOut,
  useLocalOnly,
  useSession,
} from "../lib/auth.js";
import { hasSupabase } from "../lib/supabase.js";
import { useI18n } from "../lib/i18n.js";

// No display name is stored anywhere — this is just a friendlier greeting
// than the raw address, derived from the part before the first separator.
const firstNameFrom = (email) => {
  if (!email) return null;
  const local = email.split("@")[0].split(/[._+-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : null;
};

/**
 * The landing screen: every trip the user has, as cards. Selecting one hands
 * its id up to App, which switches the store to it and drops into the editor.
 *
 * This is a pure list over the trip registry — it never reads a trip's full
 * contents — so it stays cheap no matter how many trips exist.
 */
export default function TripPicker({ onSelect }) {
  const { t, dateLocale } = useI18n();
  const { trips } = useTripList();
  const invitations = useTripInvitations();
  const { session } = useSession();
  const localOnly = useLocalOnly();
  const name = firstNameFrom(sessionEmail(session));
  const [filter, setFilter] = useState("upcoming");

  const range = (trip) => {
    const start = parseISO(trip.startDate);
    const end = parseISO(trip.endDate);
    const nights = Math.max(0, differenceInCalendarDays(end, start));
    const opts = { locale: dateLocale };
    return {
      label: `${format(start, "dd MMM", opts)} – ${format(end, "dd MMM yyyy", opts)}`,
      nights,
    };
  };

  // Time-based, from dates alone — no separate "trip status" is stored.
  const status = (trip) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = parseISO(trip.startDate);
    const end = parseISO(trip.endDate);
    if (end < today) return "past";
    if (start > today) return "upcoming";
    return "active";
  };

  const visibleTrips = trips.filter((trip) =>
    filter === "past" ? status(trip) === "past" : status(trip) !== "past",
  );

  const remove = (trip) => {
    if (!window.confirm(t("trips.confirmDelete", { name: trip.title }))) return;
    deleteTrip(trip.id);
  };

  const leave = (trip) => {
    if (!window.confirm(t("picker.confirmLeave", { name: trip.title }))) return;
    leaveSharedTrip(trip.id);
  };

  const startNew = () => onSelect(createTrip({ title: t("trips.newTitle") }));

  const STATUS_STYLE = {
    active: "bg-accent text-on-accent",
    upcoming: "bg-accent-soft text-accent",
    past: "bg-raised text-subtle border border-line",
  };

  return (
    <div className="bg-wander relative min-h-full overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-5 py-8 md:px-8">
        {/* Account + app controls */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt={t("app.name")}
              className="h-9 w-9 rounded-xl shadow-sm"
            />
            <AccountBar session={session} localOnly={localOnly} t={t} />
          </div>
          <AppControls />
        </div>

        {invitations.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              {t("picker.invitationsTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("picker.invitationsSubtitle")}
            </p>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {invitations.map((trip) => {
                const { label, nights } = range(trip);
                return (
                  <li key={trip.id} className="card p-5">
                    <span className="text-3xl" aria-hidden>
                      {trip.emoji}
                    </span>
                    <span className="mt-3 block truncate text-lg font-semibold text-fg">
                      {trip.title}
                    </span>
                    <span className="tabular mt-1 block text-sm text-muted">
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs text-subtle">
                      {t("picker.nights", { count: nights })}
                    </span>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => acceptTripInvitation(trip.id)}
                        aria-label={t("picker.acceptInvitation", {
                          name: trip.title,
                        })}
                        className="btn-primary flex-1 !py-1.5 text-sm"
                      >
                        <Check size={15} />
                        {t("picker.accept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => leaveSharedTrip(trip.id)}
                        aria-label={t("picker.declineInvitation", {
                          name: trip.title,
                        })}
                        className="btn-ghost !py-1.5 text-sm"
                      >
                        <X size={15} />
                        {t("picker.decline")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Welcome banner — the one prominent place to start a trip. */}
        <div className="card mb-8 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">
              {name ? t("picker.welcomeName", { name }) : t("picker.title")}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {name ? t("picker.welcomeSubtitle") : t("picker.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={startNew}
            className="btn-primary shrink-0 self-start sm:self-auto"
          >
            <Plus size={16} />
            {t("picker.new")}
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3">
          {/* The banner above already says "Your trips" when there's no name
              to greet — skip repeating it right below. */}
          {name ? (
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              {t("picker.title")}
            </h2>
          ) : (
            <span />
          )}
          <div className="inline-flex rounded-full border border-line p-1 text-sm">
            <button
              type="button"
              onClick={() => setFilter("upcoming")}
              aria-pressed={filter === "upcoming"}
              className={`rounded-full px-3 py-1 font-medium transition ${
                filter === "upcoming"
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-fg"
              }`}
            >
              {t("picker.filterUpcoming")}
            </button>
            <button
              type="button"
              onClick={() => setFilter("past")}
              aria-pressed={filter === "past"}
              className={`rounded-full px-3 py-1 font-medium transition ${
                filter === "past"
                  ? "bg-accent text-on-accent"
                  : "text-muted hover:text-fg"
              }`}
            >
              {t("picker.filterPast")}
            </button>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTrips.map((trip) => {
            const { label, nights } = range(trip);
            const tripStatus = status(trip);
            return (
              <li key={trip.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(trip.id)}
                  aria-label={t("picker.open", { name: trip.title })}
                  className="card h-full w-full overflow-hidden text-start transition hover:border-accent
                             hover:shadow-lg hover:shadow-brand-950/10
                             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-accent-soft via-raised to-canvas">
                    <span className="text-4xl" aria-hidden>
                      {trip.emoji}
                    </span>
                    <span
                      className={`absolute end-3 top-3 rounded-full px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider ${STATUS_STYLE[tripStatus]}`}
                    >
                      {t(
                        `picker.status${tripStatus[0].toUpperCase()}${tripStatus.slice(1)}`,
                      )}
                    </span>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="block truncate text-lg font-semibold text-fg">
                        {trip.title}
                      </span>
                      {trip.role === "editor" && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-medium text-accent">
                          {t("picker.sharedBadge")}
                        </span>
                      )}
                    </div>
                    <span className="tabular mt-1 block text-sm text-muted">
                      {label}
                    </span>
                    <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                      <span className="tabular inline-flex items-center rounded-full bg-raised px-2.5 py-1 text-xs font-medium text-muted">
                        {t("picker.nights", { count: nights })}
                      </span>
                      <span className="text-xs font-medium text-accent">
                        {t("picker.viewDetails")}
                      </span>
                    </div>
                  </div>
                </button>

                {/* The store keeps at least one trip, so the last can't go
                    either way — delete for the owner, leave for a collaborator. */}
                {trips.length > 1 && trip.role === "owner" && (
                  <button
                    type="button"
                    onClick={() => remove(trip)}
                    aria-label={t("trips.delete", { name: trip.title })}
                    className="absolute start-2 top-2 grid size-8 place-items-center rounded-full
                               bg-surface/70 text-fg backdrop-blur transition hover:bg-raised
                               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <MoreVertical size={15} />
                  </button>
                )}
                {trips.length > 1 && trip.role === "editor" && (
                  <button
                    type="button"
                    onClick={() => leave(trip)}
                    aria-label={t("picker.leaveTrip", { name: trip.title })}
                    className="absolute start-2 top-2 grid size-8 place-items-center rounded-full
                               bg-surface/70 text-fg backdrop-blur transition hover:bg-raised
                               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <LogOut size={15} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function AccountBar({ session, localOnly, t }) {
  const email = sessionEmail(session);

  // Signed in: the welcome banner's "Welcome back, {name}!" already says so,
  // so this just needs the sign-out action, not a redundant email label.
  if (email) {
    return (
      <button
        type="button"
        className="btn-ghost !py-1.5 text-sm"
        onClick={signOut}
      >
        <LogOut size={14} />
        {t("picker.signOut")}
      </button>
    );
  }

  // Local-only, but Supabase is available to sign into.
  if (localOnly && hasSupabase) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{t("picker.localMode")}</span>
        <button
          type="button"
          className="btn-soft !py-1.5"
          onClick={() => setLocalOnly(false)}
        >
          {t("picker.signInToSync")}
        </button>
      </div>
    );
  }

  // No Supabase configured at all — nothing to say about accounts.
  return <span />;
}
