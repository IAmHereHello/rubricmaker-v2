import { describe, it, expect } from 'vitest'
import { visit, backTarget, placeKey } from '../utils/backTrail.js'

const walk = (...urls) => urls.reduce((t, u) => {
  const [p, s] = u.split('?')
  return visit(t, p, s ? `?${s}` : '')
}, [])

describe('backTrail', () => {
  it('goes back to the page you came from', () => {
    const t = walk('/students', '/classes/2A/overview')
    expect(backTarget(t, '/students/5/progress')).toBe('/classes/2A/overview')
  })

  it('has no target when the page was opened directly', () => {
    expect(backTarget([], '/students/5/progress')).toBe(null)
  })

  it('treats all student pages as one place', () => {
    expect(placeKey('/students/5/progress')).toBe(placeKey('/students/9/report'))
    const t = walk('/students', '/classes/2A/overview', '/students/5/progress', '/students/6/progress', '/students/6/report')
    expect(t).toHaveLength(3)
    expect(backTarget(t, '/students/7/report')).toBe('/classes/2A/overview')
  })

  it('returns from a test report to the student, on the last student viewed', () => {
    const t = walk('/students', '/students/5/progress', '/students/6/report')
    expect(backTarget(t, '/reports/session/3', '?student=6')).toBe('/students/6/report')
  })

  it('remembers the tab and student of a report when coming back from grading', () => {
    const t = walk('/reports', '/reports/session/3', '/reports/session/3?view=results&student=4', '/sessions/3/grade?student=4&from=report')
    expect(t.map(e => e.url)).toEqual(['/reports', '/reports/session/3?view=results&student=4', '/sessions/3/grade?student=4&from=report'])
    // back on the report after grading: Terug leaves to the list, not back into grading
    expect(backTarget(t, '/reports/session/3', '?view=results')).toBe('/reports')
  })

  it('starts over at a menu page', () => {
    const t = walk('/reports', '/reports/session/3', '/students', '/students/5/progress')
    expect(backTarget(t, '/reports/session/3')).toBe('/students/5/progress')
  })
})
