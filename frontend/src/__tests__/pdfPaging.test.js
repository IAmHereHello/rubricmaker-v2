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
})
