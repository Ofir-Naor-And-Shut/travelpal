import { CURRENCIES } from './store.js'
import { currentLocale } from './i18n.js'

export function currencySymbol(code) {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code
}

const formatters = new Map()

function formatterFor(locale, code, options) {
  const key = `${locale}:${code}:${options.maximumFractionDigits}`
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: code,
        ...options,
      }),
    )
  }
  return formatters.get(key)
}

export function formatMoney(amount, code = 'EUR', { compact = false } = {}) {
  const value = Number.isFinite(amount) ? amount : 0
  const locale = currentLocale()
  try {
    return formatterFor(locale, code, {
      maximumFractionDigits: compact || Number.isInteger(value) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value)
  } catch {
    // Unknown ISO code — fall back to a plain symbol + number.
    return `${currencySymbol(code)}${Math.round(value)}`
  }
}

export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes || 0))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}
