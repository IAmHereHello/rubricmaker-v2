// Cijfer: the Dutch 1–10 grade, calculated as
//   behaalde punten / totaal punten × 9 + 1
// so 0 points is a 1,0, half the points a 5,5 and all points a 10,0.
//
// A confirmed cijfer is stored in StudentGrade.grade as a dot-decimal string with one
// decimal ("7.3"), next to the label grades ("expert" | "beheerst" | "in_ontwikkeling").
// isCijfer() tells the two kinds of stored grade apart, so no schema change is needed.

export const CIJFER_MIN = 1
export const CIJFER_MAX = 10
export const CIJFER_FORMULA = 'behaalde punten / totaal punten × 9 + 1'

// Neutral badge colours: a cijfer carries no beheerst/expert meaning.
export const CIJFER_COLORS = { color: '#1e3a5f', background: '#eef2f8' }

const CIJFER_INPUT = /^\d{1,2}(?:[.,]\d*)?$/

// Cijfer for scored/max points, rounded half up to one decimal and kept within 1–10.
// Null when there is nothing to divide by.
export function calcCijfer(scored, max) {
  if (!(max > 0) || !Number.isFinite(scored)) return null
  // Work in integer tenths: 9 × scored/max + 1 = (90 × scored/max + 10) / 10. Rounding the
  // quotient itself keeps an exact half (5.95 for 11/20) from tipping the wrong way through
  // floating-point noise in a naive `scored / max * 9 + 1`.
  const tenths = Math.round((scored * 90) / max) + 10
  return Math.min(CIJFER_MAX, Math.max(CIJFER_MIN, tenths / 10))
}

// Stored form of a cijfer: dot decimal, one decimal ("7.3").
export function toStoredCijfer(cijfer) {
  return (Math.round(cijfer * 10) / 10).toFixed(1)
}

// A cijfer as a number, from a stored value ("7.3") or teacher input ("7,3" or "7.3").
// Null for anything else, including numbers outside 1–10 and the label grades.
export function parseCijfer(value) {
  const text = String(value ?? '').trim()
  if (!CIJFER_INPUT.test(text)) return null
  const n = Number(text.replace(',', '.'))
  return n >= CIJFER_MIN && n <= CIJFER_MAX ? n : null
}

// True when a stored StudentGrade.grade is a cijfer rather than a label grade.
export function isCijfer(grade) {
  return parseCijfer(grade) !== null
}

// Display form: Dutch decimal comma ("7,3"), or a dash when there is no valid cijfer.
export function formatCijfer(value) {
  const n = parseCijfer(value)
  return n === null ? '—' : n.toFixed(1).replace('.', ',')
}

// The cijfer a student earned on a test as a stored string ("7.3"), or null when nothing
// has been graded. Same rule as the other grading methods: only questions that apply to the
// student's route count, and excluded or ungraded scores are ignored. `scoreMap` is keyed
// `${question.id}-${student.id}`.
export function computeCijferGrade(student, questions, scoreMap) {
  let scored = 0, max = 0
  for (const q of questions) {
    if (!(q.routes || []).includes(student.route)) continue
    const sc = scoreMap[`${q.id}-${student.id}`]
    if (sc && !sc.excluded && sc.points != null) {
      scored += sc.points
      max += q.max_score
    }
  }
  const cijfer = calcCijfer(scored, max)
  return cijfer === null ? null : toStoredCijfer(cijfer)
}
