import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { LogOut, Plus, Trash2 } from 'lucide-react'
import AppControls from './AppControls.jsx'
import { createTrip, deleteTrip, useTripList } from '../lib/store.js'
import {
  sessionEmail,
  setLocalOnly,
  signOut,
  useLocalOnly,
  useSession,
} from '../lib/auth.js'
import { hasSupabase } from '../lib/supabase.js'
import { useI18n } from '../lib/i18n.js'

/**
 * The landing screen: every trip the user has, as cards. Selecting one hands
 * its id up to App, which switches the store to it and drops into the editor.
 *
 * This is a pure list over the trip registry — it never reads a trip's full
 * contents — so it stays cheap no matter how many trips exist.
 */
export default function TripPicker({ onSelect }) {
  const { t, dateLocale } = useI18n()
  const { trips } = useTripList()
  const { session } = useSession()
  const localOnly = useLocalOnly()

  const range = (trip) => {
    const start = parseISO(trip.startDate)
    const end = parseISO(trip.endDate)
    const nights = Math.max(0, differenceInCalendarDays(end, start))
    const opts = { locale: dateLocale }
    return {
      label: `${format(start, 'dd MMM', opts)} – ${format(end, 'dd MMM yyyy', opts)}`,
      nights,
    }
  }

  const remove = (trip) => {
    if (!window.confirm(t('trips.confirmDelete', { name: trip.title }))) return
    deleteTrip(trip.id)
  }

  const startNew = () => onSelect(createTrip({ title: t('trips.newTitle') }))

  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
        {/* Account + app controls */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <AccountBar
            session={session}
            localOnly={localOnly}
            t={t}
          />
          <AppControls />
        </div>

        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            {t('picker.title')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('picker.subtitle')}</p>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => {
            const { label, nights } = range(trip)
            return (
              <li key={trip.id} className="relative">
                <button
                  type="button"
                  onClick={() => onSelect(trip.id)}
                  aria-label={t('picker.open', { name: trip.title })}
                  className="card h-full w-full p-5 text-start transition hover:border-accent
                             hover:shadow-lg hover:shadow-brand-950/10
                             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
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
                    {t('picker.nights', { count: nights })}
                  </span>
                </button>

                {/* The store keeps at least one trip, so the last can't go. */}
                {trips.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(trip)}
                    aria-label={t('trips.delete', { name: trip.title })}
                    className="absolute end-2 top-2 grid size-8 place-items-center rounded-full
                               text-subtle transition hover:bg-raised hover:text-fg
                               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            )
          })}

          <li>
            <button
              type="button"
              onClick={startNew}
              className="flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2
                         rounded-card border border-dashed border-line-strong p-5 text-muted transition
                         hover:border-accent hover:text-accent
                         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={22} />
              <span className="text-sm font-medium">{t('picker.new')}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  )
}

function AccountBar({ session, localOnly, t }) {
  const email = sessionEmail(session)

  if (email) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="truncate text-muted">
          {t('picker.signedInAs', { email })}
        </span>
        <button type="button" className="btn-ghost !py-1.5" onClick={signOut}>
          <LogOut size={14} />
          {t('picker.signOut')}
        </button>
      </div>
    )
  }

  // Local-only, but Supabase is available to sign into.
  if (localOnly && hasSupabase) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">{t('picker.localMode')}</span>
        <button
          type="button"
          className="btn-soft !py-1.5"
          onClick={() => setLocalOnly(false)}
        >
          {t('picker.signInToSync')}
        </button>
      </div>
    )
  }

  // No Supabase configured at all — nothing to say about accounts.
  return <span />
}
