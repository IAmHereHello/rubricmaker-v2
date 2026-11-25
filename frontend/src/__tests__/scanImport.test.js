import { solveHomography, applyHomography } from '../utils/homography.js'
import { groupPages, openItems } from '../utils/scanGroups.js'
import { pickOne } from '../utils/scanReader.js'

describe('homography', () => {
  it('maps the four points exactly and keeps lines straight', () => {
    const src = [[9, 9], [201, 9], [201, 288], [9, 288]]
    const dst = [[50, 40], [1500, 70], [1480, 2150], [30, 2100]]
    const H = solveHomography(src, dst)
    src.forEach((p, i) => {
      const q = applyHomography(H, p)
      expect(q[0]).toBeCloseTo(dst[i][0], 6)
      expect(q[1]).toBeCloseTo(dst[i][1], 6)
    })
  })
  it('returns null for degenerate points', () => {
    expect(solveHomography([[0, 0], [0, 0], [0, 0], [0, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toBeNull()
  })
})

describe('pickOne', () => {
  it('reads one cross', () => {
    expect(pickOne({ 0: 0.03, 1: 0.35, 2: 0.04 })).toEqual({ value: '1', status: 'ok' })
  })
  it('ignores a box that is coloured in completely (cancelled)', () => {
    expect(pickOne({ 0: 0.9, 1: 0.03, 2: 0.3 })).toEqual({ value: '2', status: 'ok' })
  })
  it('flags two crosses', () => {
    expect(pickOne({ 0: 0.3, 1: 0.03, 2: 0.4 }).status).toBe('check')
  })
  it('reports an empty row', () => {
    expect(pickOne({ 0: 0.02, 1: 0.03 }).status).toBe('empty')
  })
  it('falls back to a coloured highlight, then a grey shade', () => {
    expect(pickOne({ niet: 0, voldoende: 0, goed: 0 }, { niet: 0.01, voldoende: 0.6, goed: 0.02 })).toEqual({ value: 'voldoende', status: 'ok' })
    const grey = pickOne({ niet: 0, voldoende: 0, goed: 0 }, { niet: 0, voldoende: 0, goed: 0 }, { niet: 0.12, voldoende: 0.02, goed: 0.01 })
    expect(grey.value).toBe('niet')
    expect(grey.status).toBe('check')
  })
})

describe('groupPages', () => {
  const page = (index, sheet, readings = {}) => ({ index, sheet: { test_id: 1, route: 'geel', pages: 1, page: 1, student_id: null, ...sheet }, readings })
  it('joins pages of one leerling in any order and spots missing pages', () => {
    const rs = groupPages([
      page(1, { student_id: 5, page: 2, pages: 3 }, { 2: { status: 'ok', value: 1 } }),
      page(2, { student_id: 6 }),
      page(3, { student_id: 5, page: 1, pages: 3 }, { 1: { status: 'check', value: 0 } }),
    ])
    expect(rs).toHaveLength(2)
    expect(rs[0].pages.map(p => p.sheet.page)).toEqual([1, 2])
    expect(rs[0].missingPages).toEqual([3])
    expect(openItems(rs[0])).toHaveLength(1)
  })
  it('chains blank page 2 to the blank page 1 before it', () => {
    const rs = groupPages([
      page(1, { page: 1, pages: 2 }),
      page(2, { page: 2, pages: 2 }),
      page(3, { page: 1, pages: 2 }),
    ])
    expect(rs.map(r => r.pages.length)).toEqual([2, 1])
    expect(rs[1].missingPages).toEqual([2])
  })
  it('marks a page scanned twice', () => {
    const rs = groupPages([page(1, { student_id: 5 }), page(2, { student_id: 5 })])
    expect(rs).toHaveLength(1)
    expect(rs[0].duplicate).toBe(true)
  })
})
