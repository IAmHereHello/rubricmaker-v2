import { describe, test, expect } from 'vitest'
import {
  isApplicableForQuestion,
  shouldEnterQ1Mode,
  findResumePosition,
  calcCijfer,
  shiftCijfer,
  formatCijfer,
  gradeLabel,
  getApplicableQuestionIndices,
  findVerticalResume,
} from '../utils/gradingLogic.js'

const orangeQ1 = { id: 1, routes: ['oranje'], max_score: 10 }
const yellowQ2 = { id: 2, routes: ['geel'], max_score: 5 }
const yellowStudent = { id: 10, route: 'geel' }
const orangeStudent = { id: 11, route: 'oranje' }

describe('Q1 route-skip: orange Q1 with yellow student', () => {
  test('yellow student is NOT applicable for orange-only Q1', () => {
    expect(isApplicableForQuestion(yellowStudent, orangeQ1)).toBe(false)
  })

  test('orange student IS applicable for orange-only Q1', () => {
    expect(isApplicableForQuestion(orangeStudent, orangeQ1)).toBe(true)
  })

  test('with only a yellow student in the stack, orange Q1 has zero applicable students', () => {
    const applicable = [yellowStudent].filter(s => isApplicableForQuestion(s, orangeQ1))
    expect(applicable).toHaveLength(0)
  })

  test('shouldEnterQ1Mode is false once yellow student has excluded Q1 score (single-question test)', () => {
    const sess = { student_order: [yellowStudent.id] }
    const t = { questions: [orangeQ1] }
    const scoreMap = {
      [`${orangeQ1.id}-${yellowStudent.id}`]: { points: null, excluded: true },
    }
    expect(shouldEnterQ1Mode(sess, t, scoreMap)).toBe(false)
  })

  test('findResumePosition skips orange Q1 (no applicable students) and resumes at yellow Q2', () => {
    const t = { questions: [orangeQ1, yellowQ2] }
    const scoreMap = {
      [`${orangeQ1.id}-${yellowStudent.id}`]: { points: null, excluded: true },
    }
    const [qIdx, sIdx] = findResumePosition(t, [yellowStudent], scoreMap)
    expect(qIdx).toBe(1)
    expect(sIdx).toBe(0)
  })

  test('findResumePosition returns done when all questions are orange-only and stack is yellow-only', () => {
    const allOrangeQ2 = { id: 2, routes: ['oranje'], max_score: 5 }
    const t = { questions: [orangeQ1, allOrangeQ2] }
    const scoreMap = {
      [`${orangeQ1.id}-${yellowStudent.id}`]: { points: null, excluded: true },
      [`${allOrangeQ2.id}-${yellowStudent.id}`]: { points: null, excluded: true },
    }
    const [qIdx] = findResumePosition(t, [yellowStudent], scoreMap)
    expect(qIdx).toBe(t.questions.length)
  })
})

describe('cijfer grading', () => {
  test('default formula punten/totaal * 9 + 1', () => {
    expect(calcCijfer(0, 20, {})).toBe('1.0')
    expect(calcCijfer(20, 20, null)).toBe('10.0')
    expect(calcCijfer(15, 20, { cijfer: { multiplier: 9, offset: 1 } })).toBe('7.8')
  })
  test('custom formula', () => {
    expect(calcCijfer(10, 20, { cijfer: { multiplier: 9.5, offset: 0.5 } })).toBe('5.3')
  })
  test('sterretjes: half a point off each, never below 1', () => {
    expect(calcCijfer(20, 20, {}, 2)).toBe('9.0')
    expect(calcCijfer(15, 20, {}, 1)).toBe('7.3')
    expect(calcCijfer(0, 20, {}, 3)).toBe('1.0')
    expect(shiftCijfer('8.0', 2)).toBe('7.0')
    expect(shiftCijfer('8.0', -1)).toBe('8.5')
  })
  test('no points possible gives null', () => {
    expect(calcCijfer(0, 0, {})).toBeNull()
  })
  test('formatting and labels', () => {
    expect(formatCijfer('7.4')).toBe('7,4')
    expect(gradeLabel('7.4')).toBe('7,4')
    expect(gradeLabel('expert')).toBe('Expert')
  })
})

describe('vertical grading', () => {
  const t = {
    questions: [
      { id: 1, routes: ['oranje', 'geel'] },
      { id: 2, routes: ['oranje'] },
      { id: 3, routes: ['oranje', 'geel'] },
    ],
  }
  const A = { id: 10, route: 'oranje' }
  const B = { id: 11, route: 'geel' }

  test('applicable question indices follow the student route', () => {
    expect(getApplicableQuestionIndices(t, A)).toEqual([0, 1, 2])
    expect(getApplicableQuestionIndices(t, B)).toEqual([0, 2])
  })

  test('resume starts at the first unscored question of the first incomplete student', () => {
    const scores = { '1-10': { points: 2 }, '2-10': { points: 1 } }
    expect(findVerticalResume(t, [A, B], scores)).toEqual({ studentId: 10, pos: 2 })
  })

  test('resume moves on to the next student when the first is complete', () => {
    const scores = { '1-10': { points: 2 }, '2-10': { points: 1 }, '3-10': { points: 0 } }
    expect(findVerticalResume(t, [A, B], scores)).toEqual({ studentId: 11, pos: 0 })
  })

  test('excluded scores count as done, 0 points counts as graded', () => {
    const scores = { '1-11': { points: 0 }, '3-11': { points: null, excluded: true } }
    expect(findVerticalResume(t, [B], scores)).toBeNull()
  })

  test('empty stack has nothing to resume', () => {
    expect(findVerticalResume(t, [], {})).toBeNull()
  })
})
