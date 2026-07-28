import { useEffect } from 'react'
import { GripVertical } from 'lucide-react'
import { useI18n } from '../lib/i18n.js'

/**
 * Vertical splitter between the itinerary and the map. Reports the requested
 * map width as a percentage of the container; the parent owns clamping and
 * persistence.
 *
 * Tracking happens on `window` rather than via pointer capture so a fast drag
 * that outruns the 6px strip — or one that leaves the viewport entirely — still
 * follows the cursor and still ends cleanly.
 */
export default function ResizeHandle({
  widthPct,
  onResize,
  onCommit,
  onReset,
  containerRef,
  dragging,
  setDragging,
  rtl = false,
}) {
  const { t } = useI18n()
  const label = t('map.resize')
  const hint = t('map.resizeHint')

  useEffect(() => {
    if (!dragging) return undefined

    // The map panel sits at the inline-end, so in RTL it renders on the left
    // and the width has to be measured from the container's left edge instead.
    const pctFromClientX = (clientX) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.width === 0) return null
      const px = rtl ? clientX - rect.left : rect.right - clientX
      return (px / rect.width) * 100
    }

    const onMove = (e) => {
      const pct = pctFromClientX(e.clientX)
      if (pct !== null) onResize(pct)
    }

    const onUp = () => {
      setDragging(false)
      onCommit()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [dragging, onResize, onCommit, setDragging, containerRef, rtl])

  function handleKeyDown(e) {
    const step = e.shiftKey ? 8 : 2
    // Arrow keys follow the screen, not the text direction: in RTL the map is
    // on the left, so ArrowLeft has to grow it rather than shrink it.
    const grow = rtl ? 'ArrowRight' : 'ArrowLeft'
    const shrink = rtl ? 'ArrowLeft' : 'ArrowRight'

    if (e.key === grow) {
      e.preventDefault()
      onResize(widthPct + step)
      onCommit()
    } else if (e.key === shrink) {
      e.preventDefault()
      onResize(widthPct - step)
      onCommit()
    } else if (e.key === 'Home' || e.key === 'Enter') {
      e.preventDefault()
      onReset()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(widthPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title={hint}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        setDragging(true)
      }}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
      className={`group relative hidden w-1.5 shrink-0 cursor-col-resize touch-none lg:block
        focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
        ${dragging ? 'bg-accent' : 'bg-accent-soft hover:bg-line-strong'}`}
    >
      {/* Widen the grab area beyond the visible 6px without shifting layout. */}
      <span aria-hidden className="absolute inset-y-0 -left-1.5 -right-1.5" />
      <span
        aria-hidden
        className={`absolute left-1/2 top-1/2 grid h-9 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center
          rounded-full border border-line-strong bg-surface shadow-sm transition
          ${dragging ? 'text-fg' : 'text-subtle group-hover:text-fg'}`}
      >
        <GripVertical size={12} />
      </span>
    </div>
  )
}
