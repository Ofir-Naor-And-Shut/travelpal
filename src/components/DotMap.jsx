import { useEffect, useRef } from "react";
import { useTheme } from "../lib/theme.js";

/**
 * Decorative animated "world map" for the sign-in hero: a dotted continent
 * silhouette with a few travel routes tracing across it. Purely cosmetic — it
 * carries no meaning, so it's aria-hidden and degrades to a static frame when
 * the viewer prefers reduced motion.
 *
 * Colours come from the live theme tokens (read off the canvas' computed style
 * and re-read whenever `theme` flips), so it tracks light/dark like everything
 * else instead of shipping its own palette.
 */

// Route legs, in the canvas' own 320×240 design space; scaled to fit at draw
// time. Staggered delays make the hops light up in sequence rather than at once.
const ROUTES = [
  { start: { x: 70, y: 150, delay: 0 }, end: { x: 150, y: 70 } },
  { start: { x: 150, y: 70, delay: 1.4 }, end: { x: 210, y: 110 } },
  { start: { x: 40, y: 60, delay: 0.8 }, end: { x: 120, y: 170 } },
  { start: { x: 250, y: 55, delay: 2.1 }, end: { x: 180, y: 165 } },
];

const DESIGN_W = 320;
const DESIGN_H = 240;
const LEG_DURATION = 3; // seconds per hop
const CYCLE = 15; // seconds before the whole sequence restarts

// The continent silhouette, as fractional bands of the design space. A dot is
// kept only if it falls in one of these boxes (and survives a density cull).
const LANDMASSES = [
  [0.05, 0.1, 0.25, 0.4], // North America
  [0.15, 0.4, 0.25, 0.8], // South America
  [0.3, 0.15, 0.45, 0.35], // Europe
  [0.35, 0.35, 0.5, 0.65], // Africa
  [0.45, 0.1, 0.7, 0.5], // Asia
  [0.65, 0.6, 0.8, 0.8], // Australia
];

function readColors(el) {
  const cs = getComputedStyle(el);
  return {
    accent: cs.getPropertyValue("--c-accent").trim() || "#6260ff",
    dot: cs.getPropertyValue("--c-subtle").trim() || "#908fb8",
    onAccent: cs.getPropertyValue("--c-on-accent").trim() || "#ffffff",
  };
}

// Deterministic pseudo-random so the dot field is stable across redraws (and
// theme flips) instead of reshuffling every time.
function seeded(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function generateDots(width, height) {
  const dots = [];
  const gap = 12;
  let i = 0;
  for (let x = 0; x < width; x += gap) {
    for (let y = 0; y < height; y += gap) {
      const fx = x / width;
      const fy = y / height;
      const onLand = LANDMASSES.some(
        ([x0, y0, x1, y1]) => fx > x0 && fx < x1 && fy > y0 && fy < y1,
      );
      if (onLand && seeded(i) > 0.32) {
        dots.push({ x, y, opacity: seeded(i * 2.3) * 0.45 + 0.2 });
      }
      i += 1;
    }
  }
  return dots;
}

export default function DotMap() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    const ctx = canvas.getContext("2d");
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let colors = readColors(canvas);
    let dots = [];
    let scaleX = 1;
    let scaleY = 1;
    let raf = 0;
    let start = performance.now();

    const withAlpha = (hex, a) => {
      ctx.globalAlpha = a;
      ctx.fillStyle = hex;
      ctx.strokeStyle = hex;
    };

    const sync = () => {
      // Back the canvas with real device pixels so dots stay crisp on HiDPI.
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scaleX = width / DESIGN_W;
      scaleY = height / DESIGN_H;
      dots = generateDots(width, height);
      colors = readColors(canvas);
    };

    const drawDots = () => {
      dots.forEach((d) => {
        withAlpha(colors.dot, d.opacity);
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const point = (x, y, r, color, alpha) => {
      withAlpha(color, alpha);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawRoute = (route, progress) => {
      const sx = route.start.x * scaleX;
      const sy = route.start.y * scaleY;
      const ex = route.end.x * scaleX;
      const ey = route.end.y * scaleY;
      const cx = sx + (ex - sx) * progress;
      const cy = sy + (ey - sy) * progress;

      withAlpha(colors.accent, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx, cy);
      ctx.stroke();

      point(sx, sy, 3, colors.accent, 1);
      point(cx, cy, 6, colors.accent, 0.25); // glow
      point(cx, cy, 3, colors.accent, 1);
      if (progress >= 1) point(ex, ey, 3, colors.accent, 1);
    };

    const render = (t) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawDots();
      ROUTES.forEach((route) => {
        const elapsed = t - route.start.delay;
        if (elapsed <= 0) return;
        drawRoute(route, Math.min(elapsed / LEG_DURATION, 1));
      });
      ctx.globalAlpha = 1;
    };

    const frame = () => {
      const t = (performance.now() - start) / 1000;
      render(reduced ? CYCLE : t % CYCLE);
      if (!reduced) raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => {
      sync();
      if (reduced) frame(); // no loop to pick the resize up otherwise
    });
    ro.observe(parent);

    sync();
    frame();

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
    />
  );
}
