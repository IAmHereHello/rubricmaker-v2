// Group read pages into rubrics: one per leerling per toets. Pure functions, so
// they can be tested without a browser.

// pages: [{ index, sheet, readings }] in scan order (sheet = print_sheets row).
// A page printed for a leerling joins that leerling's rubric for the toets.
// A blank page 2, 3, ... joins the blank rubric just before it (same toets and
// route, previous page number); otherwise it starts a new rubric.
export function groupPages(pages) {
  const rubrics = []
  const byStudent = new Map()
  let lastBlank = null
  for (const p of pages) {
    const s = p.sheet
    if (s.student_id != null) {
      const key = `s:${s.test_id}:${s.student_id}`
      let r = byStudent.get(key)
      if (!r) {
        r = { key, testId: s.test_id, route: s.route, studentId: s.student_id, blank: false, pages: [] }
        byStudent.set(key, r)
        rubrics.push(r)
      }
      if (r.pages.some(q => q.sheet.page === s.page)) r.duplicate = true
      r.pages = [...r.pages.filter(q => q.sheet.page !== s.page), p].sort((a, b) => a.sheet.page - b.sheet.page)
      continue
    }
    const prev = lastBlank && lastBlank.pages[lastBlank.pages.length - 1].sheet
    if (s.page > 1 && prev && prev.test_id === s.test_id && prev.route === s.route && prev.page === s.page - 1) {
      lastBlank.pages.push(p)
      continue
    }
    lastBlank = { key: `b:${p.index}`, testId: s.test_id, route: s.route, studentId: null, blank: true, pages: [p] }
    rubrics.push(lastBlank)
  }
  for (const r of rubrics) {
    const expected = r.pages[0].sheet.pages
    r.missingPages = []
    for (let n = 1; n <= expected; n++) if (!r.pages.some(q => q.sheet.page === n)) r.missingPages.push(n)
    r.items = {}
    for (const q of r.pages) Object.assign(r.items, q.readings)
  }
  return rubrics
}

// Items that still need the teacher's eye.
export const openItems = rubric => Object.values(rubric.items).filter(i => i.status !== 'ok')
