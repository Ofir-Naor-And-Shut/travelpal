import { useState } from 'react'
import { MailCheck, Send } from 'lucide-react'
import AppControls from './AppControls.jsx'
import { sendMagicLink, setLocalOnly } from '../lib/auth.js'
import { useI18n } from '../lib/i18n.js'

// Deliberately forgiving — the real check is Supabase sending the mail. This
// just catches an obviously empty or malformed entry before a round-trip.
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/**
 * Passwordless sign-in / sign-up. One email field: the first link for an
 * address creates the account, every later one just logs in — so there's no
 * separate "sign up" to get wrong. "Continue without an account" drops into the
 * local-only path the whole app still supports.
 */
export default function AuthScreen() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const sent = status === 'sent'

  const submit = async (e) => {
    e.preventDefault()
    if (status === 'sending') return
    if (!looksLikeEmail(email)) {
      setStatus('error')
      return
    }
    setStatus('sending')
    try {
      await sendMagicLink(email.trim())
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="absolute inset-x-0 top-0 flex justify-center p-4">
        <AppControls />
      </div>

      <div className="card w-full max-w-sm p-7 shadow-xl shadow-brand-950/10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-soft text-2xl">
            🌍
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            {t('app.name')}
          </h1>
          <p className="mt-1 text-sm text-muted">{t('auth.tagline')}</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-line bg-raised px-4 py-5 text-center">
            <MailCheck size={22} className="mx-auto mb-2 text-accent" />
            <p className="font-medium text-fg">{t('auth.sentTitle')}</p>
            <p className="mt-1 text-sm text-muted">
              {t('auth.sentBody', { email: email.trim() })}
            </p>
            <button
              type="button"
              className="btn-ghost mt-3 !py-1 text-xs"
              onClick={() => {
                setStatus('idle')
                setEmail('')
              }}
            >
              {t('auth.differentEmail')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <label
              htmlFor="auth-email"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              {t('auth.emailLabel')}
            </label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              className="field"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (status === 'error') setStatus('idle')
              }}
              aria-invalid={status === 'error'}
            />
            {status === 'error' && (
              <p role="alert" className="mt-1.5 text-sm text-accent">
                {looksLikeEmail(email)
                  ? t('auth.error')
                  : t('auth.invalidEmail')}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary mt-4 w-full"
              disabled={status === 'sending'}
            >
              <Send size={15} />
              {status === 'sending' ? t('auth.sending') : t('auth.send')}
            </button>
          </form>
        )}

        <div className="mt-5 border-t border-line pt-4 text-center">
          <button
            type="button"
            className="text-sm font-medium text-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => setLocalOnly(true)}
          >
            {t('auth.localOnly')}
          </button>
          <p className="mt-1 text-xs text-subtle">{t('auth.localOnlyHint')}</p>
        </div>
      </div>
    </div>
  )
}
