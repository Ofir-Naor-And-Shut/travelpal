import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import {
  destinationCost,
  legOf,
  modeLabel,
  tripDays,
  tripStats,
  withDates,
} from './store.js'
import { getSession, sessionEmail } from './auth.js'
import { currentDateLocale, currentLang, translate } from './i18n.js'
import hebrewFontUrl from '../assets/fonts/NotoSansHebrew.ttf?url'

const HEBREW_FONT = 'NotoSansHebrew'
const HEBREW_RE = /[\u0590-\u05FF]/

/** The document follows whatever language is currently selected in the app. */
const t = (key, vars) => translate(currentLang(), key, vars)
const fmtDate = (date, pattern) =>
  toVisualOrder(format(date, pattern, { locale: currentDateLocale() }))

/** One cohesive palette, used everywhere instead of ad-hoc colors per call. */
const THEME = {
  accent: [98, 96, 255], // brand purple — title, rules, section headings
  headerFill: [40, 38, 61], // dark slate table header, not saturated brand purple
  headerText: [255, 255, 255],
  bodyText: [26, 26, 32], // near-black — was reading too light, especially for Hebrew
  stripeFill: [243, 242, 250],
  muted: [110, 108, 122],
}

/**
 * Money as "1,234 EUR" rather than a symbol — the embedded font covers
 * Hebrew + Latin but currency glyphs (€, ₪, ¥…) are still unreliable outside
 * a full Unicode font, so the ISO code is clearer than a symbol anyway.
 */
function money(amount, code) {
  const value = Number.isFinite(amount) ? amount : 0
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${code}`
}

const containsHebrew = (text) => HEBREW_RE.test(String(text ?? ''))

/**
 * Only strips characters that are actually illegal in a filename
 * (`\ / : * ? " < > |`) plus trailing dots/spaces (Windows disallows
 * both). Anything else — including Hebrew, or any other script — is left
 * alone, so the save dialog shows the trip's real name instead of a
 * `\w`-stripped, Hebrew-erased placeholder.
 */
function sanitizeFilename(name) {
  const cleaned = (name || 'trip')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[. ]+$/, '')
  return cleaned || 'trip'
}

/**
 * jsPDF draws glyphs in string order, left to right — it doesn't do Unicode
 * bidi reordering. Hebrew has no letter-shaping (unlike Arabic), so a simple
 * "reverse each Hebrew run, then reverse the run order" gets ordinary
 * Hebrew/Hebrew+digits text to render right-to-left correctly, while leaving
 * embedded numbers and Latin text in their own natural order.
 */
function toVisualOrder(text) {
  const str = String(text ?? '')
  if (!containsHebrew(str)) return str
  const runs = str.match(/[\u0590-\u05FF]+|[^\u0590-\u05FF]+/g) ?? []
  return runs
    .map((run) => (containsHebrew(run) ? [...run].reverse().join('') : run))
    .reverse()
    .join('')
}

let hebrewFontBase64Promise = null

async function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Fetched once per session and reused for every export after that. */
function loadHebrewFontBase64() {
  if (!hebrewFontBase64Promise) {
    hebrewFontBase64Promise = fetch(hebrewFontUrl)
      .then((r) => r.arrayBuffer())
      .then(arrayBufferToBase64)
  }
  return hebrewFontBase64Promise
}

/**
 * Registers Noto Sans Hebrew (SIL OFL, see assets/fonts/NotoSansHebrew-OFL.txt)
 * on this document and makes it the active font. It covers Hebrew + Latin +
 * digits, so it's used for the whole document rather than switching fonts
 * per string.
 */
async function registerUnicodeFont(doc) {
  const base64 = await loadHebrewFontBase64()
  doc.addFileToVFS('NotoSansHebrew.ttf', base64)
  doc.addFont('NotoSansHebrew.ttf', HEBREW_FONT, 'normal')
  doc.setFont(HEBREW_FONT)
}

/** Every line of free text (title, meta, footer) is centered on the page. */
function centerLine(doc, text, y, { color = THEME.bodyText, pageWidth } = {}) {
  doc.setTextColor(...color)
  doc.text(toVisualOrder(text), pageWidth / 2, y, { align: 'center' })
}

function drawFooter(doc, { pageWidth, pageHeight }) {
  const totalPages = doc.internal.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...THEME.accent)
    doc.setLineWidth(0.75)
    doc.line(pageWidth / 2 - 60, pageHeight - 38, pageWidth / 2 + 60, pageHeight - 38)
    doc.setFontSize(9)
    centerLine(doc, t('pdf.footer', { app: t('app.name') }), pageHeight - 22, {
      color: THEME.muted,
      pageWidth,
    })
  }
}

/**
 * Builds and downloads a PDF summary: overview, destinations + transport,
 * every day of the trip, and a budget breakdown.
 */
export async function exportTripPdf(trip) {
  const destinations = withDates(trip)
  const days = tripDays(trip, destinations)
  const stats = tripStats(trip)
  const doc = new jsPDF({ unit: 'pt' })
  await registerUnicodeFont(doc)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 40
  const username = sessionEmail(getSession()) || t('pdf.localDevice')

  let y = 46

  // --- Generated-on / by, then the trip title + range, all centered ------
  doc.setFontSize(9)
  centerLine(
    doc,
    t('pdf.generatedBy', {
      date: format(new Date(), 'd MMM yyyy, HH:mm', { locale: currentDateLocale() }),
      username,
    }),
    y,
    { color: THEME.muted, pageWidth },
  )
  y += 24

  doc.setFontSize(20)
  centerLine(doc, trip.title || t('pdf.untitledTrip'), y, { color: THEME.accent, pageWidth })
  y += 8

  doc.setDrawColor(...THEME.accent)
  doc.setLineWidth(1.5)
  doc.line(pageWidth / 2 - 50, y, pageWidth / 2 + 50, y)
  y += 22

  doc.setFontSize(11)
  centerLine(
    doc,
    `${fmtDate(new Date(trip.startDate), 'd MMM yyyy')} - ${fmtDate(new Date(trip.endDate), 'd MMM yyyy')}`,
    y,
    { color: THEME.bodyText, pageWidth },
  )
  y += 30

  const ensureSpace = (needed) => {
    if (y + needed <= pageHeight - 60) return
    doc.addPage()
    y = 50
  }

  const sectionTitle = (text) => {
    ensureSpace(60)
    doc.setFontSize(13)
    centerLine(doc, text, y, { color: THEME.accent, pageWidth })
    y += 10
  }

  const tableTheme = {
    margin: { left: marginX, right: marginX },
    styles: { font: HEBREW_FONT, fontSize: 9, halign: 'center', textColor: THEME.bodyText },
    // autotable's default theme bolds headers; only the "normal" weight of the
    // Hebrew font is registered, so bold silently fell back to a font with no
    // Hebrew glyphs — hence headers alone rendering garbled.
    headStyles: { fillColor: THEME.headerFill, textColor: THEME.headerText, fontStyle: 'normal' },
    alternateRowStyles: { fillColor: THEME.stripeFill },
  }

  // --- Destinations + transport -----------------------------------------
  sectionTitle(t('tab.destinations'))
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    head: [
      [
        toVisualOrder(t('plan.destination')),
        toVisualOrder(t('pdf.country')),
        toVisualOrder(t('plan.nights')),
        toVisualOrder(t('pdf.from')),
        toVisualOrder(t('pdf.to')),
        toVisualOrder(t('pdf.cost')),
        toVisualOrder(t('pdf.onwardTransport')),
      ],
    ],
    body: destinations.map((d) => {
      const leg = legOf(d)
      return [
        toVisualOrder(d.name) || '-',
        toVisualOrder(d.country) || '-',
        String(d.nights),
        fmtDate(d.startDate, 'd MMM'),
        fmtDate(d.endDate, 'd MMM'),
        money(destinationCost(trip, d), trip.currency),
        leg.length ? leg.map((s) => modeLabel(s.mode)).join(' + ') : '-',
      ]
    }),
  })
  y = doc.lastAutoTable.finalY + 26

  // --- Day-by-day plan — every night of the trip, plans or not ------------
  sectionTitle(t('tab.dayByDay'))
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    columnStyles: { 3: { cellWidth: pageWidth - marginX * 2 - 260 } },
    head: [
      [
        toVisualOrder(t('pdf.date')),
        toVisualOrder(t('pdf.stop')),
        toVisualOrder(t('plan.accommodationCol')),
        toVisualOrder(t('pdf.plan')),
      ],
    ],
    body: days.map((d) => {
      const items = [
        ...d.entry.attractions.map(
          (a) =>
            `${a.time ? `${a.time} ` : ''}${toVisualOrder(a.name) || toVisualOrder(t('pdf.attraction'))}`,
        ),
        ...d.entry.reservations.map(
          (r) =>
            `${r.time ? `${r.time} ` : ''}${toVisualOrder(r.name) || toVisualOrder(t('pdf.reservation'))}`,
        ),
      ]
      const sleepingName = d.entry.accommodation?.name || d.dest.sleeping?.name
      return [
        fmtDate(d.date, 'EEE d MMM'),
        toVisualOrder(d.dest.name) || '-',
        toVisualOrder(sleepingName) || '-',
        items.length > 0 ? items.join('\n') : toVisualOrder(t('pdf.noPlans')),
      ]
    }),
  })
  y = doc.lastAutoTable.finalY + 26

  // --- Budget ---------------------------------------------------------------
  sectionTitle(t('tab.budget'))
  autoTable(doc, {
    ...tableTheme,
    startY: y,
    styles: { ...tableTheme.styles, fontSize: 10 },
    head: [[toVisualOrder(t('pdf.category')), toVisualOrder(t('pdf.cost'))]],
    body: [
      [toVisualOrder(t('budget.sleeping')), money(stats.sleeping, trip.currency)],
      [toVisualOrder(t('budget.transport')), money(stats.transport, trip.currency)],
      [toVisualOrder(t('budget.attractions')), money(stats.attractions, trip.currency)],
      [toVisualOrder(t('budget.reserved')), money(stats.reservations, trip.currency)],
      [toVisualOrder(t('budget.total')), money(stats.total, trip.currency)],
    ],
  })

  drawFooter(doc, { pageWidth, pageHeight })

  const filename = `${sanitizeFilename(trip.title)}.pdf`
  doc.save(filename)
}
