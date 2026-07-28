import { useCallback, useRef, useState } from 'react'

const ROW_ATTR = 'data-drag-row'

/**
 * Drag-to-reorder for a vertical list.
 *
 * Two details matter for this to feel right in both directions:
 *
 * 1. Arming is done by writing the `draggable` attribute straight to the DOM on
 *    pointerdown rather than through React state. The browser decides whether a
 *    drag starts during the very same gesture, so a state update — which lands
 *    after the next render — can easily be too late and the drag silently never
 *    begins. Keeping the attribute off until the grip is pressed is what lets
 *    text selection inside the row's inputs keep working.
 *
 * 2. The drop position comes from which half of the target row the cursor is
 *    in, then is corrected for the fact that removing the dragged item shifts
 *    every later index down by one. Dropping "onto index N" is ambiguous when
 *    moving up versus down; insert-before/insert-after is not.
 */
export function useDragReorder(onReorder) {
  const armedRef = useRef(false)
  // Mirrored in a ref because the first dragover events arrive before React has
  // re-rendered with the new state, and they must already know a drag is live
  // in order to preventDefault and allow a drop.
  const dragIndexRef = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)
  const [overAfter, setOverAfter] = useState(false)

  const disarm = useCallback((el) => {
    armedRef.current = false
    el?.closest?.(`[${ROW_ATTR}]`)?.removeAttribute('draggable')
  }, [])

  const reset = useCallback(() => {
    armedRef.current = false
    dragIndexRef.current = null
    setDragIndex(null)
    setOverIndex(null)
    setOverAfter(false)
    document
      .querySelectorAll(`[${ROW_ATTR}][draggable]`)
      .forEach((el) => el.removeAttribute('draggable'))
  }, [])

  const gripProps = useCallback(
    () => ({
      onPointerDown: (e) => {
        armedRef.current = true
        // Synchronous: the attribute is in place before the browser evaluates
        // whether this gesture is a drag.
        e.currentTarget.closest(`[${ROW_ATTR}]`)?.setAttribute('draggable', 'true')
      },
      // A press with no drag shouldn't leave the row armed and unselectable.
      onPointerUp: (e) => disarm(e.currentTarget),
    }),
    [disarm],
  )

  const itemProps = useCallback(
    (index) => ({
      [ROW_ATTR]: '',
      onDragStart: (e) => {
        if (!armedRef.current) {
          // Started from somewhere other than the grip — let the browser do
          // its normal thing (text/selection drag) instead.
          e.preventDefault()
          return
        }
        dragIndexRef.current = index
        setDragIndex(index)
        e.dataTransfer.effectAllowed = 'move'
        // Firefox refuses to start a drag unless some data is set.
        e.dataTransfer.setData('text/plain', String(index))
      },
      onDragOver: (e) => {
        if (dragIndexRef.current === null) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        setOverIndex(index)
        setOverAfter(e.clientY > rect.top + rect.height / 2)
      },
      onDragLeave: (e) => {
        // Ignore moves between a row's own children.
        if (e.currentTarget.contains(e.relatedTarget)) return
        setOverIndex((current) => (current === index ? null : current))
      },
      onDrop: (e) => {
        e.preventDefault()
        e.stopPropagation()

        const raw = e.dataTransfer.getData('text/plain')
        const from = dragIndexRef.current ?? (raw === '' ? NaN : Number(raw))
        if (!Number.isInteger(from)) {
          reset()
          return
        }

        const rect = e.currentTarget.getBoundingClientRect()
        const after = e.clientY > rect.top + rect.height / 2
        let to = after ? index + 1 : index
        // Pulling the item out first shifts everything after it down one slot.
        if (from < to) to -= 1

        if (to !== from) onReorder(from, to)
        reset()
      },
      onDragEnd: reset,
    }),
    [onReorder, reset],
  )

  return {
    itemProps,
    gripProps,
    dragIndex,
    overIndex,
    overAfter,
    dragging: dragIndex !== null,
  }
}
