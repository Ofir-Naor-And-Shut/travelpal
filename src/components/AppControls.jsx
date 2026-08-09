import { useEffect, useRef, useState } from 'react'
import { Check, Globe, Laptop, Moon, Sun } from 'lucide-react'
import { LANGUAGES, setLanguage, useI18n } from '../lib/i18n.js'
import { THEMES, setTheme, useTheme } from '../lib/theme.js'

const THEME_ICON = { light: Sun, dark: Moon, system: Laptop }

/**
 * Language and theme controls. Anchored to the inline-start of the header, so
 * they sit top-left in English and top-right in Hebrew — the mirrored position
 * a reader of each script expects.
 */
export default function AppControls() {
  const { t, lang } = useI18n()
  const { preference, theme } = useTheme()

  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onAway = (e) => {
      if (!boxRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onAway)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onAway)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const active = LANGUAGES.find((l) => l.code === lang)

  return (
    <div className="flex items-center gap-1.5">
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={t('lang.change')}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5 py-2
                     text-xs font-semibold text-fg transition hover:border-accent lg:py-1.5
                     focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Globe size={14} />
          <span className="hidden lg:inline">{active?.native}</span>
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label={t('lang.label')}
            className="absolute top-full z-50 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-line
                       bg-surface shadow-lg shadow-brand-950/20 start-0"
          >
            {LANGUAGES.map((l) => (
              <li key={l.code} role="option" aria-selected={l.code === lang}>
                <button
                  type="button"
                  onClick={() => {
                    setLanguage(l.code)
                    setOpen(false)
                  }}
                  dir={l.dir}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition ${
                    l.code === lang
                      ? 'bg-accent-soft font-semibold text-fg'
                      : 'text-muted hover:bg-raised hover:text-fg'
                  }`}
                >
                  {l.native}
                  {l.code === lang && <Check size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        role="group"
        aria-label={t('theme.label')}
        className="flex items-center rounded-full border border-line-strong bg-surface p-0.5"
      >
        {THEMES.map((mode) => {
          const Icon = THEME_ICON[mode]
          const selected = preference === mode
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setTheme(mode)}
              aria-pressed={selected}
              title={t(`theme.${mode}`)}
              aria-label={t(`theme.${mode}`)}
              className={`grid size-8 place-items-center rounded-full transition lg:size-6
                focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? 'bg-accent text-on-accent'
                    : 'text-subtle hover:text-fg'
                }`}
            >
              <Icon size={13} />
            </button>
          )
        })}
        <span className="sr-only">
          {t('theme.switchTo', { mode: t(`theme.${theme}`) })}
        </span>
      </div>
    </div>
  )
}
