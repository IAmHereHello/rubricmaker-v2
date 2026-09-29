import { describe, test, expect } from 'vitest'
import {
  calcCijfer,
  toStoredCijfer,
  parseCijfer,
  isCijfer,
  formatCijfer,
  computeCijferGrade,
} from '../utils/cijfer.js'

describe('calcCijfer: punten / totaal × 9 + 1', () => {
  test('no points is a 1, half the points a 5,5, all points a 10', () => {
    expect(calcCijfer(0, 20)).toBe(1)
    expect(calcCijfer(10, 20)).toBe(5.5)
    expect(calcCijfer(20, 20)).toBe(10)
  })

  test('rounds to one decimal', () => {
    expect(calcCijfer(1, 7)).toBe(2.3)     // 2.2857…
    expect(calcCijfer(13, 24)).toBe(5.9)   // 5.875
    expect(calcCijfer(18, 24)).toBe(7.8)   // 7.75 → up
  })

  test('rounds an exact half up, where a naive scored / max * 9 + 1 rounds down', () => {
    expect(calcCijfer(3, 20)).toBe(2.4)    // 2.35
    expect(calcCijfer(17, 20)).toBe(8.7)   // 8.65
    expect(calcCijfer(19, 20)).toBe(9.6)   // 9.55
    expect(calcCijfer(11, 20)).toBe(6)     // 5.95
  })

  test('is null when there are no points to divide by', () => {
    expect(calcCijfer(0, 0)).toBeNull()
    expect(calcCijfer(5, 0)).toBeNull()
    expect(calcCijfer(NaN, 10)).toBeNull()
  })

  test('stays within 1 and 10 even for out-of-range points', () => {
    expect(calcCijfer(12, 10)).toBe(10)
    expect(calcCijfer(-3, 10)).toBe(1)
  })
})

describe('stored, parsed and displayed cijfers', () => {
  test('toStoredCijfer keeps one dot-decimal', () => {
    expect(toStoredCijfer(7.3)).toBe('7.3')
    expect(toStoredCijfer(10)).toBe('10.0')
    expect(toStoredCijfer(1)).toBe('1.0')
    expect(toStoredCijfer(7.25)).toBe('7.3')
  })

  test('parseCijfer accepts a comma or a dot and stays within 1–10', () => {
    expect(parseCijfer('7,5')).toBe(7.5)
    expect(parseCijfer('7.5')).toBe(7.5)
    expect(parseCijfer(' 8 ')).toBe(8)
    expect(parseCijfer('10')).toBe(10)
    expect(parseCijfer('1')).toBe(1)
    expect(parseCijfer('0,9')).toBeNull()
    expect(parseCijfer('10,1')).toBeNull()
    expect(parseCijfer('11')).toBeNull()
    expect(parseCijfer('')).toBeNull()
    expect(parseCijfer('abc')).toBeNull()
    expect(parseCijfer('1e1')).toBeNull()
    expect(parseCijfer(null)).toBeNull()
  })

  test('isCijfer separates cijfers from the label grades', () => {
    expect(isCijfer('7.3')).toBe(true)
    expect(isCijfer('10.0')).toBe(true)
    expect(isCijfer('expert')).toBe(false)
    expect(isCijfer('beheerst')).toBe(false)
    expect(isCijfer('in_ontwikkeling')).toBe(false)
    expect(isCijfer(null)).toBe(false)
    expect(isCijfer(undefined)).toBe(false)
  })

  test('formatCijfer shows a Dutch decimal comma', () => {
    expect(formatCijfer('7.3')).toBe('7,3')
    expect(formatCijfer('10.0')).toBe('10,0')
    expect(formatCijfer(6)).toBe('6,0')
    expect(formatCijfer('expert')).toBe('—')
    expect(formatCijfer(null)).toBe('—')
  })
})

describe('computeCijferGrade', () => {
  const geel = { id: 1, route: 'geel' }
  const oranje = { id: 2, route: 'oranje' }
  const q1 = { id: 10, routes: ['oranje', 'geel'], max_score: 4 }
  const q2 = { id: 11, routes: ['oranje'], max_score: 6 }
  const questions = [q1, q2]
  const key = (q, s) => `${q.id}-${s.id}`

  test('uses the points of the questions that apply to the student\'s route', () => {
    const scoreMap = {
      [key(q1, geel)]: { points: 2, excluded: false },
      [key(q2, geel)]: { points: null, excluded: true },
      [key(q1, oranje)]: { points: 3, excluded: false },
      [key(q2, oranje)]: { points: 6, excluded: false },
    }
    expect(computeCijferGrade(geel, questions, scoreMap)).toBe('5.5')     // 2/4
    expect(computeCijferGrade(oranje, questions, scoreMap)).toBe('9.1')   // 9/10
  })

  test('ignores a route-excluded score even if it still carries points', () => {
    const scoreMap = {
      [key(q1, geel)]: { points: 4, excluded: false },
      [key(q2, geel)]: { points: 6, excluded: true },
    }
    expect(computeCijferGrade(geel, questions, scoreMap)).toBe('10.0')
  })

  test('ignores ungraded questions instead of counting them as zero', () => {
    const scoreMap = {
      [key(q1, oranje)]: { points: 4, excluded: false },
      [key(q2, oranje)]: { points: null, excluded: false },
    }
    expect(computeCijferGrade(oranje, questions, scoreMap)).toBe('10.0')
  })

  test('counts a real zero', () => {
    const scoreMap = {
      [key(q1, oranje)]: { points: 0, excluded: false },
      [key(q2, oranje)]: { points: 0, excluded: false },
    }
    expect(computeCijferGrade(oranje, questions, scoreMap)).toBe('1.0')
  })

  test('is null when nothing has been graded', () => {
    expect(computeCijferGrade(geel, questions, {})).toBeNull()
    expect(computeCijferGrade({ id: 3, route: 'blauw' }, questions, {})).toBeNull()
  })
})
