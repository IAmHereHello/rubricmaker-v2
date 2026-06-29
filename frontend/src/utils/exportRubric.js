import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

export async function exportRubricsPerStudentPDF(pairs) {
  for (const { element, name } of pairs) {
    if (!element) continue
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const canvas = await html2canvas(element, { scale: 3, useCORS: true, logging: false })
    const imgData = canvas.toDataURL('image/png')
    const imgHeight = (canvas.height * pdfWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
    heightLeft -= pdfHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
    }
    pdf.save(name)
  }
}

export async function exportRubricsPDF(elements, filename) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()

  let firstPage = true
  for (const el of elements) {
    if (!el) continue
    const canvas = await html2canvas(el, { scale: 3, useCORS: true, logging: false })
    const imgData = canvas.toDataURL('image/png')
    const imgHeight = (canvas.height * pdfWidth) / canvas.width

    if (!firstPage) pdf.addPage()
    firstPage = false

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
    heightLeft -= pdfHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight)
      heightLeft -= pdfHeight
    }
  }

  if (!firstPage) pdf.save(filename)
}
