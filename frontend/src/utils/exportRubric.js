import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import { planPageSlices } from './pdfPaging.js'

const CONTINUATION_MARGIN_MM = 10
// JPEG keeps a page around 150 KB; PNG at this size was ~15 MB per page,
// which made a whole-class PDF too large for the browser to build.
const RENDER_SCALE = 2
const JPEG_QUALITY = 0.85
// Space kept below the last row so the page doesn't end flush on a border.
const BOTTOM_PADDING_CSS = 8

// Render `element` onto as many A4 pages as needed. Page breaks are placed below
// the last element marked `data-pdf-block` that still fits, so table rows and
// goal blocks are never cut in half.
async function addElementPages(pdf, element, startOnNewPage) {
  const canvas = await html2canvas(element, { scale: RENDER_SCALE, useCORS: true, logging: false })
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  const pxPerMm = canvas.width / pdfWidth
  const pxPerCss = canvas.width / element.getBoundingClientRect().width

  const top = element.getBoundingClientRect().top
  const breaks = [...element.querySelectorAll('[data-pdf-block]')]
    .map(el => Math.round((el.getBoundingClientRect().bottom - top) * pxPerCss))

  // Sections that should start on a new page rather than be split
  const groups = [...element.querySelectorAll('[data-pdf-keep]')].map(el => {
    const r = el.getBoundingClientRect()
    return [Math.round((r.top - top) * pxPerCss), Math.round((r.bottom - top) * pxPerCss)]
  })

  const slices = planPageSlices({
    groups,
    breaks,
    canvasHeight: canvas.height,
    firstPageHeight: Math.floor(pdfHeight * pxPerMm),
    nextPageHeight: Math.floor((pdfHeight - CONTINUATION_MARGIN_MM) * pxPerMm),
    padding: Math.round(BOTTOM_PADDING_CSS * pxPerCss),
  })

  slices.forEach(([y, end], i) => {
    const first = i === 0
    const marginMm = first ? 0 : CONTINUATION_MARGIN_MM
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = end - y
    const ctx = slice.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height)

    if (startOnNewPage || !first) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, marginMm, pdfWidth, slice.height / pxPerMm)
    const label = element.dataset.pdfContinuation
    if (!first && label) {
      const text = `${label} · blad ${i + 1}`
      pdf.addImage(labelImage(text, canvas.width, Math.round(CONTINUATION_MARGIN_MM * pxPerMm)), 'JPEG', 0, 0, pdfWidth, CONTINUATION_MARGIN_MM)
    }
  })
}

// Text in the top margin of a continuation page, so a loose sheet still shows
// whose it is. Drawn on a canvas so names with any accent render correctly.
function labelImage(text, widthPx, heightPx) {
  const c = document.createElement('canvas')
  c.width = widthPx
  c.height = heightPx
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  ctx.fillStyle = '#6b7280'
  ctx.font = `${Math.round(heightPx * 0.32)}px system-ui, Arial, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.fillText(text, Math.round(widthPx * 0.04), Math.round(heightPx * 0.6))
  return c.toDataURL('image/jpeg', JPEG_QUALITY)
}

const pageCount = pdf => pdf.internal.getNumberOfPages()

const newPdf = () => new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

// A student's report consists of one or more `data-pdf-section` elements (front
// page, learning goals page); each starts on a new page so the goals page lands
// on the back when printed double-sided. Returns the number of pages added.
async function addStudentPages(pdf, element, startOnNewPage) {
  const before = startOnNewPage ? pageCount(pdf) : 0
  const sections = element.querySelectorAll('[data-pdf-section]')
  const parts = sections.length ? [...sections] : [element]
  for (let i = 0; i < parts.length; i++) {
    await addElementPages(pdf, parts[i], startOnNewPage || i > 0)
  }
  return pageCount(pdf) - before
}

// All reports in one PDF. Every student is padded to an even page count so each
// one starts on a new sheet when printed double-sided.
export async function exportRubricsPDF(elements, filename, onProgress) {
  const pdf = newPdf()
  const present = elements.filter(Boolean)
  for (let i = 0; i < present.length; i++) {
    onProgress?.(i, present.length)
    const added = await addStudentPages(pdf, present[i], i > 0)
    if (added % 2 === 1 && i < present.length - 1) pdf.addPage()
  }
  if (present.length) pdf.save(filename)
}

// One PDF per student, bundled into a single ZIP download.
export async function exportRubricsZip(pairs, zipName, onProgress) {
  const zip = new JSZip()
  const present = pairs.filter(p => p.element)
  for (let i = 0; i < present.length; i++) {
    onProgress?.(i, present.length)
    const pdf = newPdf()
    await addStudentPages(pdf, present[i].element, false)
    zip.file(present[i].name, pdf.output('blob'))
  }
  if (!present.length) return
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = zipName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
