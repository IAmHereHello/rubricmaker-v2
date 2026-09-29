export function isApplicableForQuestion(student, question) {
  return (question.routes || []).includes(student.route)
}

export function getOrderedStudents(sess, studs) {
  if (sess?.student_order?.length) {
    return sess.student_order.map(sid => studs.find(s => s.id === sid)).filter(Boolean)
  }
  return [...studs].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
}

export function shouldEnterQ1Mode(sess, t, scoreMap) {
  if (!t?.questions.length) return false
  const order = sess.student_order || []
  if (order.length === 0) return true
  if (t.questions.length > 1) {
    const hasPostQ1Scores = t.questions
      .slice(1)
      .some(q => Object.keys(scoreMap).some(k => k.startsWith(`${q.id}-`)))
    return !hasPostQ1Scores
  }
  const q1 = t.questions[0]
  const allScored = order.every(sid => {
    const sc = scoreMap[`${q1.id}-${sid}`]
    return sc && (sc.points !== null || sc.excluded)
  })
  return !allScored
}

export function findResumePosition(t, orderedStudents, scoreMap) {
  for (let qi = 0; qi < t.questions.length; qi++) {
    const q = t.questions[qi]
    const applicable = orderedStudents.filter(s => isApplicableForQuestion(s, q))
    for (let si = 0; si < applicable.length; si++) {
      const key = `${q.id}-${applicable[si].id}`
      const sc = scoreMap[key]
      if (!sc || (sc.points === null && !sc.excluded)) return [qi, si]
    }
  }
  return [t.questions.length, 0]
}

// ── Cijfer (1-10) grading ────────────────────────────────────────────────────
// cijfer = punten / totaal * multiplier + offset  (default: * 9 + 1)
// Stored as a string in student_grades.grade, e.g. "7.4".

export const DEFAULT_CIJFER_CONFIG = { multiplier: 9, offset: 1 }

export function getCijferConfig(gradeConfig) {
  const c = gradeConfig?.cijfer
  const multiplier = Number(c?.multiplier)
  const offset = Number(c?.offset)
  return {
    multiplier: Number.isFinite(multiplier) && c?.multiplier !== undefined ? multiplier : DEFAULT_CIJFER_CONFIG.multiplier,
    offset: Number.isFinite(offset) && c?.offset !== undefined ? offset : DEFAULT_CIJFER_CONFIG.offset,
  }
}

export function calcCijfer(scored, max, gradeConfig) {
  if (!max) return null
  const { multiplier, offset } = getCijferConfig(gradeConfig)
  const value = (scored / max) * multiplier + offset
  return (Math.round(value * 10) / 10).toFixed(1)
}

export function isCijferGrade(grade) {
  return grade != null && grade !== '' && !isNaN(Number(grade))
}

// Dutch notation with a decimal comma
export function formatCijfer(grade) {
  return Number(grade).toFixed(1).replace('.', ',')
}

export function formatCijferFormula(gradeConfig) {
  const { multiplier, offset } = getCijferConfig(gradeConfig)
  return `punten / totaal × ${String(multiplier).replace('.', ',')} + ${String(offset).replace('.', ',')}`
}

const GRADE_LABELS = { expert: 'Expert', beheerst: 'Beheerst', in_ontwikkeling: 'In Ontwikkeling' }

// Label for any stored grade: category name or cijfer ("7,4")
export function gradeLabel(grade) {
  if (grade == null) return ''
  if (GRADE_LABELS[grade]) return GRADE_LABELS[grade]
  return isCijferGrade(grade) ? formatCijfer(grade) : String(grade)
}
