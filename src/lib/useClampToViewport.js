import { useLayoutEffect, useState } from "react";

const MARGIN = 8;

/**
 * Nudges an already-positioned popover back within the viewport when its
 * CSS-anchored spot (e.g. `start-0`/`end-0` on a trigger of unpredictable
 * position) would otherwise push part of it off-screen — in either axis, at
 * any window size. Returns a `translate()` offset to apply as inline style.
 */
export function useClampToViewport(open, ref) {
  const [shift, setShift] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!open) {
      setShift({ x: 0, y: 0 });
      return undefined;
    }

    const recalc = () => {
      const el = ref.current;
      if (!el) return;
      setShift((prev) => {
        const rect = el.getBoundingClientRect();
        // Undo the previously applied shift to find the natural, unshifted edges.
        const left = rect.left - prev.x;
        const right = rect.right - prev.x;
        const top = rect.top - prev.y;
        const bottom = rect.bottom - prev.y;

        let x = 0;
        const overflowRight = right - (window.innerWidth - MARGIN);
        const overflowLeft = MARGIN - left;
        if (overflowRight > 0) x = -overflowRight;
        else if (overflowLeft > 0) x = overflowLeft;

        let y = 0;
        const overflowBottom = bottom - (window.innerHeight - MARGIN);
        const overflowTop = MARGIN - top;
        if (overflowBottom > 0) y = -overflowBottom;
        else if (overflowTop > 0) y = overflowTop;

        return x === prev.x && y === prev.y ? prev : { x, y };
      });
    };

    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [open, ref]);

  return shift;
}
