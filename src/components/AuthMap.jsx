import { useEffect, useRef, useState } from "react";

/**
 * Decorative dotted-world-map canvas with a few animated route arcs, shown on
 * the sign-in card's side panel. Purely ornamental — no interactivity, no data.
 *
 * Unlike the design it's adapted from (hardcoded blue on white) this reads its
 * colours from the app's semantic tokens, so it follows light/dark and the
 * brand hue. It re-reads them when the theme flips via a `data-theme` observer.
 */

// "#6260ff" -> [98, 96, 255]; tolerant of shorthand and stray whitespace.
function hexToRgb(hex) {
  const h = hex.trim().replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full || "6260ff", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function readAccent() {
  const styles = getComputedStyle(document.documentElement);
  return hexToRgb(styles.getPropertyValue("--c-accent") || "#6260ff");
}

export default function AuthMap() {
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  // Bumped by the theme observer to force the draw effect to re-read colours.
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return undefined;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
      canvas.width = width;
      canvas.height = height;
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, []);

  // Re-run the draw loop when the theme attribute changes so colours follow.
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const { width, height } = dimensions;
    if (!width || !height) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    const [r, g, b] = readAccent();

    // Continents laid out as fractional bands of the panel, so the silhouette
    // holds its shape at any panel size.
    const bands = [
      [0.05, 0.25, 0.1, 0.4], // North America
      [0.15, 0.25, 0.4, 0.8], // South America
      [0.3, 0.45, 0.15, 0.35], // Europe
      [0.35, 0.5, 0.35, 0.65], // Africa
      [0.45, 0.7, 0.1, 0.5], // Asia
      [0.65, 0.8, 0.6, 0.8], // Australia
    ];
    const gap = 12;
    const dots = [];
    for (let x = 0; x < width; x += gap) {
      for (let y = 0; y < height; y += gap) {
        const inShape = bands.some(
          ([x0, x1, y0, y1]) =>
            x > width * x0 &&
            x < width * x1 &&
            y > height * y0 &&
            y < height * y1,
        );
        if (inShape && Math.random() > 0.3) {
          dots.push({ x, y, opacity: Math.random() * 0.5 + 0.2 });
        }
      }
    }

    // Route arcs travel across the silhouette in the panel's own pixels.
    const routes = [
      [0.28, 0.25, 0.55, 0.14, 0],
      [0.55, 0.14, 0.72, 0.2, 2],
      [0.14, 0.1, 0.42, 0.32, 1],
      [0.78, 0.1, 0.5, 0.32, 0.5],
    ].map(([sx, sy, ex, ey, delay]) => ({
      sx: sx * width,
      sy: sy * height,
      ex: ex * width,
      ey: ey * height,
      delay,
    }));

    let raf;
    let start = Date.now();
    const accent = `${r}, ${g}, ${b}`;

    const draw = () => {
      const now = (Date.now() - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      dots.forEach((d) => {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, ${d.opacity})`;
        ctx.fill();
      });

      routes.forEach((route) => {
        const elapsed = now - route.delay;
        if (elapsed <= 0) return;
        const progress = Math.min(elapsed / 3, 1);
        const x = route.sx + (route.ex - route.sx) * progress;
        const y = route.sy + (route.ey - route.sy) * progress;

        ctx.beginPath();
        ctx.moveTo(route.sx, route.sy);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgb(${accent})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(route.sx, route.sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${accent})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${accent}, 0.35)`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${accent})`;
        ctx.fill();
      });

      if (now > 15) start = Date.now();
      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [dimensions, themeTick]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
