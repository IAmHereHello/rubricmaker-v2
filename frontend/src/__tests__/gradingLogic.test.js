import { describe, test, expect } from 'vitest'
import {
  isApplicableForQuestion,
  shouldEnterQ1Mode,
  findResumePosition,
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
