/**
 * Stand-in for `canvg`, which this app deliberately does not install.
 *
 * jspdf lists canvg as an *optional* dependency and reaches it through a lazy
 * `import("canvg")` from exactly one method, `addSvgAsImage` — which nothing
 * here calls (the PDF export draws text, tables and a raster map snapshot).
 *
 * npm skips that optional branch on install (npm 11's allow-scripts gate holds
 * back core-js, and canvg goes with it), so the specifier resolves to nothing.
 * Vite 8 treats that as a hard error in both dev and build, where older
 * versions only warned. Aliasing it here keeps one answer for both, instead of
 * installing a nine-package dependency tree to satisfy dead code.
 *
 * If SVG ever does need to go into a PDF, delete this file and its alias in
 * vite.config.js, then install canvg for real.
 */

const notInstalled = () => {
  throw new Error(
    "canvg is not installed — jspdf's addSvgAsImage is unavailable. " +
      "See src/lib/canvg-stub.js.",
  );
};

export const Canvg = { from: notInstalled, fromString: notInstalled };
export default Canvg;
