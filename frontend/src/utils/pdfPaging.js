// Decide where to cut a rendered report into pages. All values are canvas pixels.
// `breaks` are the bottoms of elements that must not be cut (table rows, goal
// blocks); a page ends at the last break that fits. After the last block only
// `padding` whitespace is kept, and only if it still fits on that page, so
// trailing whitespace can never become a page of its own.
// Returns [start, end] pairs, one per page.
export function planPageSlices({ breaks, canvasHeight, firstPageHeight, nextPageHeight, padding = 0 }) {
  const lastBlock = breaks.length ? Math.min(canvasHeight, Math.max(...breaks)) : canvasHeight
  const contentHeight = breaks.length ? Math.min(canvasHeight, lastBlock + padding) : canvasHeight

  const slices = []
  let y = 0
  while (y < lastBlock - 1) {
    let end = y + (slices.length ? nextPageHeight : firstPageHeight)
    if (end >= lastBlock) {
      end = Math.min(end, contentHeight)
    } else {
      const fitting = breaks.filter(b => b > y && b <= end)
      if (fitting.length) end = Math.max(...fitting)
    }
    slices.push([y, end])
    y = end
  }
  return slices
}
