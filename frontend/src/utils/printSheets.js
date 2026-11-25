// Printable rubrics that can be scanned back in (see components/BlankRubric.jsx
// and utils/scanReader.js). Every A4 page gets four black corner markers and a QR
// code holding the id of a print_sheets row; that row stores where each tick box
// is on the page, in mm from the top-left corner of the paper.
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import QRCode from 'qrcode'
import { planPageSlices } from './pdfPaging.js'

export const SHEET = {
  widthMm: 210,
  heightMm: 297,
  widthCss: 794,
  get cssPerMm() { return this.widthCss / this.widthMm },
  markerMm: 6,          // black square in each corner
  markerInsetMm: 6,     // distance from the paper edge (inside most printers' margins)
  qr: { x: 172, y: 6, size: 22 },
  sideMm: 15,           // left/right page padding: clear of the markers
  contentTopMm: 8,      // first page: top padding of the rubric
  headerMinMm: 21,      // header tall enough to sit next to the QR code
  qrReserveMm: 27,      // header keeps this much free on the right for the QR code
  bottomMm: 4,
  contentEndMm: 289,    // nothing is placed below this line
  continuationTopMm: 30,// later pages: QR code and name label above the content
}

export const QR_PREFIX = 'RM:'

// Centres of the four markers: top-left, top-right, bottom-right, bottom-left.
export function markerCentres() {
  const { widthMm: W, heightMm: H, markerMm: m, markerInsetMm: i } = SHEET
  const a = i + m / 2
  return [[a, a], [W - a, a], [W - a, H - a], [a, H - a]]
}

const RENDER_SCALE = 2
const JPEG_QUALITY = 0.85
const r1 = n => Math.round(n * 10) / 10

// Page slices (in CSS px of the element) and, per page, the tick box positions in mm.
export function planSheet(element) {
  const base = element.getBoundingClientRect()
  const mmPerCss = SHEET.widthMm / base.width
  const rel = el => {
    const r = el.getBoundingClientRect()
    return { top: r.top - base.top, bottom: r.bottom - base.top, left: r.left - base.left, width: r.width, height: r.height }
  }
  const breaks = [...element.querySelectorAll('[data-pdf-block]')].map(el => Math.round(rel(el).bottom))
  const groups = [...element.querySelectorAll('[data-pdf-keep]')].map(el => { const r = rel(el); return [Math.round(r.top), Math.round(r.bottom)] })
  const slices = planPageSlices({
    groups,
    breaks,
    canvasHeight: Math.ceil(base.height),
    firstPageHeight: Math.floor(SHEET.contentEndMm / mmPerCss),
    nextPageHeight: Math.floor((SHEET.contentEndMm - SHEET.continuationTopMm) / mmPerCss),
    padding: Math.round(SHEET.bottomMm / mmPerCss),
  })

  const boxes = [...element.querySelectorAll('[data-omr]')].map(el => ({ key: el.dataset.omr, r: rel(el) }))
  const cells = [...element.querySelectorAll('[data-omr-cell]')].map(el => ({ key: el.dataset.omrCell, r: rel(el) }))
  const nameEl = element.querySelector('[data-omr-name]')
  const name = nameEl ? rel(nameEl) : null

  const pages = slices.map(([y0, y1], i) => {
    const offsetMm = i === 0 ? 0 : SHEET.continuationTopMm
    const inSlice = r => r.top >= y0 - 1 && r.bottom <= y1 + 1
    const toMm = r => [r1(r.left * mmPerCss), r1(offsetMm + (r.top - y0) * mmPerCss), r1(r.width * mmPerCss), r1(r.height * mmPerCss)]
    return {
      v: 1,
      boxes: boxes.filter(b => inSlice(b.r)).map(b => [b.key, ...toMm(b.r)]),
      cells: cells.filter(c => inSlice(c.r)).map(c => [c.key, ...toMm(c.r)]),
      name: name && inSlice(name) ? toMm({ ...name, top: name.top - 16, height: name.height + 18 }) : null,
    }
  })
  return { slices, pages }
}

function drawMarks(pdf, qrDataUrl) {
  const { markerMm: m } = SHEET
  pdf.setFillColor(0, 0, 0)
  for (const [cx, cy] of markerCentres()) pdf.rect(cx - m / 2, cy - m / 2, m, m, 'F')
  const { x, y, size } = SHEET.qr
  pdf.addImage(qrDataUrl, 'PNG', x, y, size, size)
}

const qrImage = id => QRCode.toDataURL(`${QR_PREFIX}${id}`, { errorCorrectionLevel: 'H', margin: 2, width: 300 })

// Label at the top of a later page so a loose sheet still shows whose it is.
// Drawn on a canvas so names with any accent come out right.
function labelImage(text) {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 60
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#4b5563'
  ctx.font = '30px system-ui, Arial, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 32)
  return c.toDataURL('image/jpeg', JPEG_QUALITY)
}

// items: [{ element, student_id, route }]. saveSheets(sheets) stores the layouts
// and returns their ids in the same order. Every leerling starts on a new sheet
// of paper when printed double-sided (padding pages carry no QR code).
export async function exportSheetsPDF({ items, filename, saveSheets, onProgress }) {
  const plans = items.map(it => planSheet(it.element))
  const sheets = plans.flatMap((p, i) => p.pages.map((layout, k) => ({
    student_id: items[i].student_id ?? null,
    route: items[i].route ?? null,
    page: k + 1,
    pages: p.pages.length,
    layout,
  })))
  const ids = await saveSheets(sheets)

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let n = 0
  let first = true
  for (let i = 0; i < items.length; i++) {
    onProgress?.(i, items.length)
    const { element } = items[i]
    const canvas = await html2canvas(element, { scale: RENDER_SCALE, useCORS: true, logging: false })
    const pxPerCss = canvas.width / element.getBoundingClientRect().width
    const pxPerMm = canvas.width / SHEET.widthMm
    const { slices } = plans[i]
    for (let k = 0; k < slices.length; k++) {
      const y = Math.round(slices[k][0] * pxPerCss)
      const end = Math.min(canvas.height, Math.round(slices[k][1] * pxPerCss))
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.max(1, end - y)
      const ctx = slice.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, slice.width, slice.height)
      ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      if (!first) pdf.addPage()
      first = false
      const top = k === 0 ? 0 : SHEET.continuationTopMm
      pdf.addImage(slice.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, top, SHEET.widthMm, slice.height / pxPerMm)
      const label = element.dataset.pdfContinuation
      if (k > 0 && label) {
        pdf.addImage(labelImage(`${label} · blad ${k + 1}`), 'JPEG', SHEET.sideMm, 14, 100, 5)
      }
      drawMarks(pdf, await qrImage(ids[n++]))
    }
    if (slices.length % 2 === 1 && i < items.length - 1) pdf.addPage()
  }
  pdf.save(filename)
}
