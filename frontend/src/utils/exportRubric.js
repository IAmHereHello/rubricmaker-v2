import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'

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

  // Drop the whitespace below the last block; on its own it would become a blank page.
  const contentHeight = breaks.length
    ? Math.min(canvas.height, Math.max(...breaks) + Math.round(BOTTOM_PADDING_CSS * pxPerCss))
    : canvas.height

  let y = 0
  let first = true
  while (y < contentHeight - 1) {
    const marginMm = first ? 0 : CONTINUATION_MARGIN_MM
    let end = y + Math.floor((pdfHeight - marginMm) * pxPerMm)
    if (end >= contentHeight) {
      end = contentHeight
    } else {
      const fitting = breaks.filter(b => b > y && b <= end)
      if (fitting.length) end = Math.max(...fitting)
    }

    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = end - y
    const ctx = slice.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height)

    if (startOnNewPage || !first) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, marginMm, pdfWidth, slice.height / pxPerMm)
    y = end
    first = false
  }
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
