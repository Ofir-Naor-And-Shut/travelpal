import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, ArrowRight, Check, Send, X } from "lucide-react";
import { markTourSeen, stopTour, useActiveTour } from "../lib/tour.js";
import { useI18n } from "../lib/i18n.js";

const SPOT_PAD = 8; // breathing room around the highlighted element
const TIP_GAP = 14; // distance between the spotlight and the tooltip
const EDGE = 10; // keep the tooltip this far from the viewport edge
const FLY_THRESHOLD = 260; // a hop longer than this earns a paper-plane flight
const FLY_MS = 1150; // how long the plane spends in the air

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** First currently-visible element matching the selector (handles the
 *  responsive twins — desktop card vs. phone widget — under one data-tour). */
function resolveTarget(selector) {
  if (!selector) return null;
  for (const el of document.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return null;
}

const sameRect = (a, b) =>
  a &&
  b &&
  Math.abs(a.top - b.top) < 0.5 &&
  Math.abs(a.left - b.left) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

/**
 * Spotlight coach-mark tour. Renders only while its named tour is active.
 *
 * A transparent veil blocks interaction with the app underneath; the dimming
 * comes from the spotlight box's huge box-shadow (targeted steps) or a full
 * scrim (centered intro/outro cards). The spotlight rectangle is measured
 * every frame while the tour is open, so it glides as tabs switch, the page
 * scrolls, or the window resizes — CSS transitions carry the movement, and
 * `prefers-reduced-motion` turns them off.
 *
 * `onNavigate(view)` lets the editor tour switch tabs before a step so the
 * element it describes is actually mounted.
 */
export default function TourGuide({ name, steps, onNavigate }) {
  const active = useActiveTour();
  const on = active === name;
  const { t } = useI18n();

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [tipSize, setTipSize] = useState({ w: 320, h: 160 });
  const tipRef = useRef(null);

  // Paper-plane flight between far-apart steps (and on the intro/outro).
  const [flight, setFlight] = useState(null);
  const [tipVisible, setTipVisible] = useState(false);
  const centerRef = useRef(null); // live resting centre of the tooltip
  const planeRef = useRef(null);
  const trailRef = useRef(null);
  const flightTokenRef = useRef(0);

  const total = steps.length;
  const step = steps[index] ?? steps[0];

  const finish = useCallback(() => {
    markTourSeen(name);
    stopTour();
  }, [name]);

  // Fresh start each time the tour opens; reset the plane on close.
  useEffect(() => {
    if (on) {
      setIndex(0);
    } else {
      setFlight(null);
      setTipVisible(false);
    }
  }, [on]);

  // Switch the editor to the tab this step describes before measuring it.
  useEffect(() => {
    if (on && step?.view) onNavigate?.(step.view);
  }, [on, index, step?.view, onNavigate]);

  // Bring the target into view once per step (the rAF loop below keeps the
  // spotlight glued to it afterwards). A short delay lets a just-switched tab
  // mount first.
  useEffect(() => {
    if (!on) return undefined;
    const smooth = !prefersReducedMotion();
    const id = window.setTimeout(() => {
      const el = resolveTarget(step?.target);
      el?.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: smooth ? "smooth" : "auto",
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [on, index, step?.target]);

  // Track the target's rectangle every frame so the spotlight follows any
  // layout change (tab switch, scroll, resize, the element's own animation).
  useEffect(() => {
    if (!on) return undefined;
    let raf = 0;
    const tick = () => {
      const el = resolveTarget(step?.target);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((prev) => (sameRect(prev, r) ? prev : r));
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, index, step?.target]);

  // Measure the tooltip so it can be clamped against the viewport edges.
  useLayoutEffect(() => {
    if (!on || !tipRef.current) return undefined;
    const measure = () => {
      const r = tipRef.current?.getBoundingClientRect();
      if (r) setTipSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(tipRef.current);
    return () => ro.disconnect();
  }, [on, index]);

  // Placement is plain computation the flight effects below also depend on, so
  // it lives above the early return rather than in the render tail.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { w: tipW, h: tipH } = tipSize;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  // Tooltip placement: below the spotlight, else above, else centered; always
  // clamped inside the viewport. Centered steps (no target) sit mid-screen.
  let tipTop;
  let tipLeft;
  if (rect) {
    const below = rect.top + rect.height + TIP_GAP;
    const above = rect.top - TIP_GAP - tipH;
    if (below + tipH <= vh - EDGE) tipTop = below;
    else if (above >= EDGE) tipTop = above;
    else
      tipTop = clamp(
        rect.top + rect.height / 2 - tipH / 2,
        EDGE,
        vh - tipH - EDGE,
      );
    tipLeft = clamp(
      rect.left + rect.width / 2 - tipW / 2,
      EDGE,
      vw - tipW - EDGE,
    );
  } else {
    tipTop = clamp(vh / 2 - tipH / 2, EDGE, vh - tipH - EDGE);
    tipLeft = clamp(vw / 2 - tipW / 2, EDGE, vw - tipW - EDGE);
  }

  // Keep the tooltip's live resting centre so a flight knows where it departs.
  useLayoutEffect(() => {
    centerRef.current = { x: tipLeft + tipW / 2, y: tipTop + tipH / 2 };
  });

  // Orchestrate a flight on each step change: hide the card, wait for the new
  // spot to settle, then — on a long hop or the intro/outro — fly the paper
  // plane from the old spot to the new one before revealing the card.
  useEffect(() => {
    if (!on) return undefined;
    if (prefersReducedMotion()) {
      setTipVisible(true);
      return undefined;
    }

    const token = (flightTokenRef.current += 1);
    const first = index === 0;
    const last = index === total - 1;
    // Depart the previous card, or swoop in from off-screen on the first step.
    const from = first
      ? { x: -60, y: vh + 60 }
      : centerRef.current
        ? { ...centerRef.current }
        : null;

    setFlight(null);
    setTipVisible(false);

    const startedAt = performance.now();
    let lastPos = null;
    let stableFrames = 0;
    let raf = 0;

    const launch = (to) => {
      if (token !== flightTokenRef.current) return;
      const dist = from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
      if (from && to && (first || last || dist > FLY_THRESHOLD)) {
        setFlight({ fromX: from.x, fromY: from.y, toX: to.x, toY: to.y });
        window.setTimeout(() => {
          if (token !== flightTokenRef.current) return;
          setFlight(null);
          setTipVisible(true);
        }, FLY_MS);
      } else {
        setTipVisible(true);
      }
    };

    // Wait for the new tooltip position to stop moving (the spotlight glide,
    // any tab switch and scroll), capped so a step is never left unrevealed.
    const settle = () => {
      if (token !== flightTokenRef.current) return;
      const cur = centerRef.current;
      if (
        cur &&
        lastPos &&
        Math.abs(cur.x - lastPos.x) < 1 &&
        Math.abs(cur.y - lastPos.y) < 1
      ) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
      }
      lastPos = cur ? { ...cur } : null;
      if ((cur && stableFrames >= 2) || performance.now() - startedAt > 900) {
        launch(cur);
      } else {
        raf = requestAnimationFrame(settle);
      }
    };

    raf = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(raf);
  }, [on, index, total, vh]);

  // Fly the plane (and draw its contrail) along the current flight path.
  useEffect(() => {
    if (!flight) return undefined;
    const { fromX, fromY, toX, toY } = flight;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const arc = Math.min(Math.hypot(dx, dy) * 0.18, 120); // upward bow midway
    // The Send glyph noses up-and-right (~ -45°); offset so it faces travel.
    const rot = (Math.atan2(dy, dx) * 180) / Math.PI + 45;
    const ease = "cubic-bezier(0.45, 0, 0.25, 1)";

    const planeAnim = planeRef.current?.animate(
      [
        {
          transform: `translate(-50%, -50%) rotate(${rot}deg) scale(0.3)`,
          opacity: 0,
          offset: 0,
        },
        { opacity: 1, offset: 0.16 },
        {
          transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${
            dy * 0.5 - arc
          }px)) rotate(${rot}deg) scale(1)`,
          opacity: 1,
          offset: 0.5,
        },
        { opacity: 1, offset: 0.85 },
        {
          transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg) scale(0.5)`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: FLY_MS, easing: ease, fill: "forwards" },
    );

    let trailAnim;
    if (trailRef.current) {
      const len = trailRef.current.getTotalLength();
      trailRef.current.style.strokeDasharray = `${len}`;
      trailAnim = trailRef.current.animate(
        [
          { strokeDashoffset: len, opacity: 0.85, offset: 0 },
          { strokeDashoffset: 0, opacity: 0.85, offset: 0.62 },
          { strokeDashoffset: 0, opacity: 0, offset: 1 },
        ],
        { duration: FLY_MS, easing: ease, fill: "forwards" },
      );
    }

    return () => {
      planeAnim?.cancel();
      trailAnim?.cancel();
    };
  }, [flight]);

  // Keyboard: Escape closes, arrows step through.
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight")
        setIndex((i) => (i < total - 1 ? i + 1 : i));
      else if (e.key === "ArrowLeft") setIndex((i) => (i > 0 ? i - 1 : i));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [on, total, finish]);

  if (!on) return null;

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const base = `tour.${name}.${step.id}`;

  // A quadratic contrail that bows upward, matching the plane's arc.
  const trailPath = flight
    ? `M ${flight.fromX} ${flight.fromY} Q ${(flight.fromX + flight.toX) / 2} ${
        (flight.fromY + flight.toY) / 2 -
        Math.min(
          Math.hypot(flight.toX - flight.fromX, flight.toY - flight.fromY) *
            0.18,
          120,
        )
      } ${flight.toX} ${flight.toY}`
    : null;

  return (
    <div
      className="tour-root"
      role="dialog"
      aria-modal="true"
      aria-label={t("tour.label")}
    >
      {/* Transparent click-blocker; the dim comes from the layers above it. */}
      <div className="tour-veil" onClick={(e) => e.stopPropagation()} />

      {rect ? (
        <div
          className="tour-spotlight"
          style={{
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
          }}
        />
      ) : (
        <div className="tour-scrim" />
      )}

      <div
        ref={tipRef}
        className={`tour-tip${tipVisible ? "" : " tour-tip-hidden"}`}
        style={{ top: tipTop, left: tipLeft }}
      >
        <div className="tour-tip-head">
          <span className="tour-progress">
            {t("tour.step", { current: index + 1, total })}
          </span>
          <button
            type="button"
            className="tour-close"
            onClick={finish}
            aria-label={t("tour.skip")}
          >
            <X size={16} />
          </button>
        </div>

        <h2 className="tour-title">{t(`${base}.title`)}</h2>
        <p className="tour-body">{t(`${base}.body`)}</p>

        <div className="tour-dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={`tour-dot${i === index ? " tour-dot-on" : ""}`}
            />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="btn-ghost !py-1.5" onClick={finish}>
            {t("tour.skip")}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-soft !py-1.5"
              onClick={() => setIndex((i) => i - 1)}
              disabled={isFirst}
            >
              <ArrowLeft size={15} className="tour-back-icon" />
              {t("tour.back")}
            </button>
            {isLast ? (
              <button
                type="button"
                className="btn-primary !py-1.5"
                onClick={finish}
              >
                <Check size={15} />
                {t("tour.done")}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary !py-1.5"
                onClick={() => setIndex((i) => i + 1)}
              >
                {t("tour.next")}
                <ArrowRight size={15} className="tour-fwd-icon" />
              </button>
            )}
          </div>
        </div>
      </div>

      {flight && (
        <>
          <svg
            className="tour-trail"
            viewBox={`0 0 ${vw} ${vh}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path ref={trailRef} d={trailPath} />
          </svg>
          <div
            ref={planeRef}
            className="tour-plane"
            style={{ left: flight.fromX, top: flight.fromY }}
            aria-hidden="true"
          >
            <Send size={32} />
          </div>
        </>
      )}
    </div>
  );
}
