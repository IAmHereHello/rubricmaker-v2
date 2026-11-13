import { describe, test, expect } from 'vitest'
import { planPageSlices } from '../utils/pdfPaging.js'

const page = { firstPageHeight: 1000, nextPageHeight: 950, padding: 16 }

describe('planPageSlices', () => {
  test('content that fits stays on one page, padding included', () => {
    expect(planPageSlices({ ...page, breaks: [100, 500, 800], canvasHeight: 900 }))
      .toEqual([[0, 816]])
  })

  test('last row just above the page end does not leave a blank page for the padding', () => {
    // Regression: the padding below the last row pushed 6px onto a second page.
    expect(planPageSlices({ ...page, breaks: [400, 990], canvasHeight: 1050 }))
      .toEqual([[0, 1000]])
  })

  test('breaks between rows when the table does not fit', () => {
    expect(planPageSlices({ ...page, breaks: [400, 900, 1200, 1500], canvasHeight: 1600 }))
      .toEqual([[0, 900], [900, 1516]])
  })

  test('without blocks the whole canvas is paged', () => {
    expect(planPageSlices({ ...page, breaks: [], canvasHeight: 1500 }))
      .toEqual([[0, 1000], [1000, 1500]])
  })

  test('a section that would run past the page end starts on the next page', () => {
    // section 1: 0-500, section 2: 520-1200 (fits on one page, not in what is left)
    expect(planPageSlices({ ...page, breaks: [100, 500, 700, 900, 1200], groups: [[0, 500], [520, 1200]], canvasHeight: 1300 }))
      .toEqual([[0, 520], [520, 1216]])
  })

  test('a section taller than a page starts on a new page, then splits at rows', () => {
    expect(planPageSlices({ ...page, breaks: [300, 600, 900, 1200, 1500, 1800], groups: [[0, 300], [310, 1800]], canvasHeight: 1900 }))
      .toEqual([[0, 310], [310, 1200], [1200, 1816]])
  })

  test('a section that fits on the page is left alone', () => {
    expect(planPageSlices({ ...page, breaks: [400, 800], groups: [[0, 400], [410, 800]], canvasHeight: 900 }))
      .toEqual([[0, 816]])
  })
})
