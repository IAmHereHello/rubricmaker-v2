import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

const CONTINUATION_MARGIN_MM = 10

// Render `element` onto as many A4 pages as needed. Page breaks are placed below
// the last element marked `data-pdf-block` that still fits, so table rows and
// goal blocks are never cut in half.
async function addElementPages(pdf, element, startOnNewPage) {
  const canvas = await html2canvas(element, { scale: 3, useCORS: true, logging: false })
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  const pxPerMm = canvas.width / pdfWidth
  const pxPerCss = canvas.width / element.getBoundingClientRect().width

  const top = element.getBoundingClientRect().top
  const breaks = [...element.querySelectorAll('[data-pdf-block]')]
    .map(el => Math.round((el.getBoundingClientRect().bottom - top) * pxPerCss))

  let y = 0
  let first = true
  while (y < canvas.height - 1) {
    const marginMm = first ? 0 : CONTINUATION_MARGIN_MM
    let end = y + Math.floor((pdfHeight - marginMm) * pxPerMm)
    if (end >= canvas.height) {
      end = canvas.height
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
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, marginMm, pdfWidth, slice.height / pxPerMm)
    y = end
    first = false
  }
}

const pageCount = pdf => pdf.internal.getNumberOfPages()

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

export async function exportRubricsPerStudentPDF(pairs) {
  for (const { element, name } of pairs) {
    if (!element) continue
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    await addStudentPages(pdf, element, false)
    pdf.save(name)
  }
}

export async function exportRubricsPDF(elements, filename) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Pad every student to an even page count so each one starts on a new sheet
  // when printed double-sided.
  const present = elements.filter(Boolean)
  let firstPage = true
  for (let i = 0; i < present.length; i++) {
    const added = await addStudentPages(pdf, present[i], !firstPage)
    firstPage = false
    if (added % 2 === 1 && i < present.length - 1) pdf.addPage()
  }

  if (!firstPage) pdf.save(filename)
}
