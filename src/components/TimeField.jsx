import { useEffect, useState } from 'react'

/**
 * A 24-hour time field.
 *
 * `<input type="time">` renders 12- or 24-hour according to the *browser's*
 * locale, and a page cannot override that — an en-US browser shows "02:30 PM"
 * no matter what the document or element `lang` says. Since the clock has to
 * be 24-hour everywhere, this is a plain text field with its own parsing.
 *
 * The committed value keeps the same `HH:MM` shape the native input produced,
 * so nothing downstream (storage, map popups) has to change.
 */

const clamp = (n, max) => Math.min(Math.max(n, 0), max)

/** Turn whatever was typed into `HH:MM`, or '' when the field is empty. */
function normalize(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length === 0) return ''

  let hours
  let minutes
  if (digits.length <= 2) {
    hours = Number(digits)
    minutes = 0
  } else {
    // 3 digits reads as H:MM, 4 as HH:MM.
    hours = Number(digits.slice(0, digits.length - 2))
    minutes = Number(digits.slice(-2))
  }

  return `${String(clamp(hours, 23)).padStart(2, '0')}:${String(
    clamp(minutes, 59),
  ).padStart(2, '0')}`
}

/** Live formatting while typing: drop the colon in once past two digits. */
function format(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export default function TimeField({
  value = '',
  onChange,
  label,
  className = '',
}) {
  const [draft, setDraft] = useState(value)

  // Follow the stored value when it changes elsewhere (reorder, undo, reload).
  useEffect(() => setDraft(value), [value])

  function commit(next) {
    const normalized = normalize(next)
    setDraft(normalized)
    if (normalized !== value) onChange(normalized)
  }

  function step(deltaMinutes) {
    const base = normalize(draft) || '00:00'
    const [h, m] = base.split(':').map(Number)
    // Wrap around midnight rather than clamping at the ends.
    const total = (h * 60 + m + deltaMinutes + 1440) % 1440
    const next = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(
      total % 60,
    ).padStart(2, '0')}`
    setDraft(next)
    onChange(next)
  }

  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">
        {label}
      </span>
      <input
        type="text"
        inputMode="numeric"
        // Always read left-to-right, even inside the Hebrew RTL layout.
        dir="ltr"
        value={draft}
        placeholder="--:--"
        maxLength={5}
        className="field tabular w-full"
        onChange={(e) => setDraft(format(e.target.value))}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(e.currentTarget.value)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            step(e.shiftKey ? 60 : 5)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            step(e.shiftKey ? -60 : -5)
          }
        }}
      />
    </label>
  )
}
