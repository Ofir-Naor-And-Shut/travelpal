import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  destinationCost,
  effectiveLastStop,
  legOf,
  legTotals,
  modeColor,
  modeLabel,
  tripDays,
  tripStats,
  withDates,
} from "./store.js";
import { getSession, sessionEmail } from "./auth.js";
import { currentDateLocale, currentLang, dirOf, translate } from "./i18n.js";
import { renderTripMapImage } from "./staticMap.js";
import hebrewFontUrl from "../assets/fonts/NotoSansHebrew.ttf?url";

const HEBREW_FONT = "NotoSansHebrew";
const HEBREW_RE = /[\u0590-\u05FF]/;

/** The document follows whatever language is currently selected in the app. */
const t = (key, vars) => translate(currentLang(), key, vars);
const fmtDate = (date, pattern) =>
  toVisualOrder(format(date, pattern, { locale: currentDateLocale() }));

/** One cohesive palette, used everywhere instead of ad-hoc colors per call. */
const THEME = {
  accent: [98, 96, 255], // brand purple — title, rules, section headings
  headerFill: [40, 38, 61], // dark slate table header, not saturated brand purple
  headerText: [255, 255, 255],
  bodyText: [26, 26, 32], // near-black — was reading too light, especially for Hebrew
  stripeFill: [243, 242, 250],
  muted: [110, 108, 122],
};

/**
 * Money as "1,234 EUR" rather than a symbol — the embedded font covers
 * Hebrew + Latin but currency glyphs (€, ₪, ¥…) are still unreliable outside
 * a full Unicode font, so the ISO code is clearer than a symbol anyway.
 */
function money(amount, code) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${code}`;
}

const containsHebrew = (text) => HEBREW_RE.test(String(text ?? ""));

/** "#RRGGBB" -> [r, g, b] for jsPDF's numeric colour setters. */
function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Only strips characters that are actually illegal in a filename
 * (`\ / : * ? " < > |`) plus trailing dots/spaces (Windows disallows
 * both). Anything else — including Hebrew, or any other script — is left
 * alone, so the save dialog shows the trip's real name instead of a
 * `\w`-stripped, Hebrew-erased placeholder.
 */
function sanitizeFilename(name) {
  const cleaned = (name || "trip")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/[. ]+$/, "");
  return cleaned || "trip";
}

/**
 * jsPDF draws glyphs in string order, left to right — it doesn't do Unicode
 * bidi reordering. Hebrew has no letter-shaping (unlike Arabic), so a simple
 * "reverse each Hebrew run, then reverse the run order" gets ordinary
 * Hebrew/Hebrew+digits text to render right-to-left correctly, while leaving
 * embedded numbers and Latin text in their own natural order.
 */
function toVisualOrder(text) {
  const str = String(text ?? "");
  if (!containsHebrew(str)) return str;
  // Whitespace must be its own run, not lumped into the adjacent Hebrew or
  // number run — otherwise reversing run order shifts a space from one side
  // of a number to the other (e.g. "דבש 2026" -> "2026שבד", eating the gap
  // and reading as if the space moved past the digits).
  const runs = str.match(/[\u0590-\u05FF]+|\s+|[^\u0590-\u05FF\s]+/g) ?? [];
  return runs
    .map((run) => (containsHebrew(run) ? [...run].reverse().join("") : run))
    .reverse()
    .join("");
}

let hebrewFontBase64Promise = null;

async function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Fetched once per session and reused for every export after that. */
function loadHebrewFontBase64() {
  if (!hebrewFontBase64Promise) {
    hebrewFontBase64Promise = fetch(hebrewFontUrl)
      .then((r) => r.arrayBuffer())
      .then(arrayBufferToBase64);
  }
  return hebrewFontBase64Promise;
}

/**
 * Registers Noto Sans Hebrew (SIL OFL, see assets/fonts/NotoSansHebrew-OFL.txt)
 * on this document and makes it the active font. It covers Hebrew + Latin +
 * digits, so it's used for the whole document rather than switching fonts
 * per string.
 */
async function registerUnicodeFont(doc) {
  const base64 = await loadHebrewFontBase64();
  doc.addFileToVFS("NotoSansHebrew.ttf", base64);
  doc.addFont("NotoSansHebrew.ttf", HEBREW_FONT, "normal");
  doc.setFont(HEBREW_FONT);
}

/**
 * jsPDF runs every text() through its own bidi engine (postProcessText),
 * defaulting isInputVisual=true, which re-reorders our already-visual strings
 * and reverses embedded numbers ("2026" -> "6202"). We do our own logical->
 * visual conversion in toVisualOrder, so force the engine to an identity
 * (isInputVisual + isOutputVisual) on every call — including autoTable's
 * internal ones, which pass no options — by injecting the flags here.
 */
function neutralizeBuiltInBidi(doc) {
  const original = doc.text.bind(doc);
  doc.text = (text, x, y, options, transform) => {
    const opts = options && typeof options === "object" ? options : {};
    if (opts.isInputVisual === undefined) opts.isInputVisual = true;
    if (opts.isOutputVisual === undefined) opts.isOutputVisual = true;
    return original(text, x, y, opts, transform);
  };
}

/** Every line of free text (title, meta, footer) is centered on the page. */
function centerLine(doc, text, y, { color = THEME.bodyText, pageWidth } = {}) {
  doc.setTextColor(...color);
  doc.text(toVisualOrder(text), pageWidth / 2, y, { align: "center" });
}

function drawFooter(doc, { pageWidth, pageHeight }) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...THEME.accent);
    doc.setLineWidth(0.75);
    doc.line(
      pageWidth / 2 - 60,
      pageHeight - 38,
      pageWidth / 2 + 60,
      pageHeight - 38,
    );
    doc.setFontSize(9);
    centerLine(doc, t("pdf.footer", { app: t("app.name") }), pageHeight - 22, {
      color: THEME.muted,
      pageWidth,
    });
  }
}

/**
 * Builds and downloads a PDF summary: overview, destinations + transport,
 * every day of the trip, and a budget breakdown.
 */
export async function exportTripPdf(trip) {
  const destinations = withDates(trip);
  const days = tripDays(trip, destinations);
  const stats = tripStats(trip);
  const doc = new jsPDF({ unit: "pt" });
  await registerUnicodeFont(doc);
  neutralizeBuiltInBidi(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const username = sessionEmail(getSession()) || t("pdf.localDevice");

  let y = 46;

  // --- Generated-on / by, then the trip title + range, all centered ------
  doc.setFontSize(9);
  centerLine(
    doc,
    t("pdf.generatedBy", {
      date: format(new Date(), "d MMM yyyy, HH:mm", {
        locale: currentDateLocale(),
      }),
      username,
    }),
    y,
    { color: THEME.muted, pageWidth },
  );
  y += 24;

  doc.setFontSize(20);
  centerLine(doc, trip.title || t("pdf.untitledTrip"), y, {
    color: THEME.accent,
    pageWidth,
  });
  y += 8;

  doc.setDrawColor(...THEME.accent);
  doc.setLineWidth(1.5);
  doc.line(pageWidth / 2 - 50, y, pageWidth / 2 + 50, y);
  y += 22;

  doc.setFontSize(11);
  // centerLine already runs toVisualOrder on the whole line — using fmtDate
  // (which does the same) here would reorder each date twice and scramble
  // the digits, so format the raw dates instead.
  centerLine(
    doc,
    `${format(new Date(trip.startDate), "d MMM yyyy", { locale: currentDateLocale() })} - ${format(new Date(trip.endDate), "d MMM yyyy", { locale: currentDateLocale() })}`,
    y,
    { color: THEME.bodyText, pageWidth },
  );
  y += 30;

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - 60) return;
    doc.addPage();
    y = 50;
  };

  const sectionTitle = (text) => {
    ensureSpace(60);
    doc.setFontSize(13);
    centerLine(doc, text, y, { color: THEME.accent, pageWidth });
    y += 10;
  };

  // A centered row of swatch + label per transport mode used on the map, so the
  // arc colours can be read back. Mirrors the layout direction of the language.
  const drawLegend = (modes) => {
    if (!modes?.length) return;
    const rtl = dirOf(currentLang()) === "rtl";
    const sw = 11; // swatch size
    const gap = 5; // swatch-to-label
    const itemGap = 18; // between legend items
    doc.setFontSize(9);
    const items = modes.map((m) => {
      const label = toVisualOrder(t(`mode.${m}`));
      return {
        color: modeColor(m),
        label,
        width: sw + gap + doc.getTextWidth(label),
      };
    });
    const total =
      items.reduce((sum, it) => sum + it.width, 0) +
      itemGap * (items.length - 1);
    ensureSpace(sw + 20);
    doc.setTextColor(...THEME.bodyText);
    let x = (pageWidth - total) / 2;
    for (const it of rtl ? [...items].reverse() : items) {
      const [r, g, b] = hexToRgb(it.color);
      const labelW = doc.getTextWidth(it.label);
      const baseline = y + sw - 1.5;
      if (rtl) {
        doc.text(it.label, x, baseline);
        doc.setFillColor(r, g, b);
        doc.roundedRect(x + labelW + gap, y, sw, sw, 2, 2, "F");
      } else {
        doc.setFillColor(r, g, b);
        doc.roundedRect(x, y, sw, sw, 2, 2, "F");
        doc.text(it.label, x + sw + gap, baseline);
      }
      x += it.width + itemGap;
    }
    y += sw + 16;
  };

  const tableTheme = {
    margin: { left: marginX, right: marginX },
    styles: {
      font: HEBREW_FONT,
      fontSize: 9,
      halign: "center",
      textColor: THEME.bodyText,
    },
    // autotable's default theme bolds headers; only the "normal" weight of the
    // Hebrew font is registered, so bold silently fell back to a font with no
    // Hebrew glyphs — hence headers alone rendering garbled.
    headStyles: {
      fillColor: THEME.headerFill,
      textColor: THEME.headerText,
      fontStyle: "normal",
    },
    alternateRowStyles: { fillColor: THEME.stripeFill },
  };

  // --- Destinations + transport -----------------------------------------
  sectionTitle(t("tab.destinations"));
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [
      [
        toVisualOrder(t("plan.destination")),
        toVisualOrder(t("pdf.country")),
        toVisualOrder(t("plan.nights")),
        toVisualOrder(t("pdf.from")),
        toVisualOrder(t("pdf.to")),
        toVisualOrder(t("pdf.cost")),
        toVisualOrder(t("pdf.onwardTransport")),
      ],
    ],
    body: [
      // The optional starting point, if any — no nights/dates of its own,
      // just the leg that carries into destination 1.
      ...(trip.origin
        ? [
            [
              toVisualOrder(trip.origin.name) ||
                toVisualOrder(t("budget.origin")),
              toVisualOrder(trip.origin.country) || "-",
              "-",
              "-",
              "-",
              money(legTotals(trip.origin).cost, trip.currency),
              legOf(trip.origin).length
                ? legOf(trip.origin)
                    .map((s) => modeLabel(s.mode))
                    .join(" + ")
                : "-",
            ],
          ]
        : []),
      ...destinations.map((d) => {
        const leg = legOf(d);
        return [
          toVisualOrder(d.name) || "-",
          toVisualOrder(d.country) || "-",
          String(d.nights),
          fmtDate(d.startDate, "d MMM"),
          fmtDate(d.endDate, "d MMM"),
          money(destinationCost(trip, d), trip.currency),
          leg.length ? leg.map((s) => modeLabel(s.mode)).join(" + ") : "-",
        ];
      }),
      // The optional final stop, if any — nothing leaves it, and its own
      // leg cost already sits on the destination before it.
      ...(trip.lastStop
        ? [
            [
              toVisualOrder(effectiveLastStop(trip)?.name) ||
                toVisualOrder(t("budget.lastStop")),
              toVisualOrder(effectiveLastStop(trip)?.country) || "-",
              "-",
              "-",
              "-",
              "-",
              "-",
            ],
          ]
        : []),
    ],
  });
  y = doc.lastAutoTable.finalY + 26;

  // --- Day-by-day plan — every night of the trip, plans or not ------------
  sectionTitle(t("tab.dayByDay"));
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    columnStyles: { 3: { cellWidth: pageWidth - marginX * 2 - 260 } },
    head: [
      [
        toVisualOrder(t("pdf.date")),
        toVisualOrder(t("pdf.stop")),
        toVisualOrder(t("plan.accommodationCol")),
        toVisualOrder(t("pdf.plan")),
      ],
    ],
    body: days.map((d) => {
      const items = [
        ...d.entry.attractions.map(
          (a) =>
            `${a.time ? `${a.time} ` : ""}${toVisualOrder(a.name) || toVisualOrder(t("pdf.attraction"))}`,
        ),
        ...d.entry.reservations.map(
          (r) =>
            `${r.time ? `${r.time} ` : ""}${toVisualOrder(r.name) || toVisualOrder(t("pdf.reservation"))}`,
        ),
      ];
      const sleepingName = d.entry.accommodation?.name || d.dest.sleeping?.name;
      return [
        fmtDate(d.date, "EEE d MMM"),
        toVisualOrder(d.dest.name) || "-",
        toVisualOrder(sleepingName) || "-",
        items.length > 0 ? items.join("\n") : toVisualOrder(t("pdf.noPlans")),
      ];
    }),
  });
  y = doc.lastAutoTable.finalY + 26;

  // --- Budget ---------------------------------------------------------------
  sectionTitle(t("tab.budget"));
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    styles: { ...tableTheme.styles, fontSize: 10 },
    head: [[toVisualOrder(t("pdf.category")), toVisualOrder(t("pdf.cost"))]],
    body: [
      [
        toVisualOrder(t("budget.sleeping")),
        money(stats.sleeping, trip.currency),
      ],
      [
        toVisualOrder(t("budget.transport")),
        money(stats.transport, trip.currency),
      ],
      [
        toVisualOrder(t("budget.attractions")),
        money(stats.attractions, trip.currency),
      ],
      [
        toVisualOrder(t("budget.reserved")),
        money(stats.reservations, trip.currency),
      ],
      [toVisualOrder(t("budget.total")), money(stats.total, trip.currency)],
    ],
  });
  y = doc.lastAutoTable.finalY + 26;

  // --- Route map snapshot + leg-colour legend (best-effort: a failed tile
  // fetch or canvas export must never abort the rest of the summary) --------
  try {
    const map = await renderTripMapImage(trip, destinations);
    if (map) {
      sectionTitle(t("pdf.map"));
      let imgW = pageWidth - marginX * 2;
      let imgH = (map.height / map.width) * imgW;
      const capH = 300;
      if (imgH > capH) {
        imgH = capH;
        imgW = (map.width / map.height) * imgH;
      }
      ensureSpace(imgH + 40);
      doc.addImage(map.dataUrl, "PNG", (pageWidth - imgW) / 2, y, imgW, imgH);
      y += imgH + 18;
      drawLegend(map.modes);
    }
  } catch {
    // Snapshot is a nice-to-have; keep the rest of the export intact.
  }

  drawFooter(doc, { pageWidth, pageHeight });

  const filename = `${sanitizeFilename(trip.title)}.pdf`;
  doc.save(filename);
}
