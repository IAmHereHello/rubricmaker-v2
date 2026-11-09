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

// True when a stack member already has scores beyond question 1.
export function hasPostQ1Scores(t, scoreMap) {
  if (!t?.questions.length) return false
  return t.questions.slice(1).some(q => Object.keys(scoreMap).some(k => k.startsWith(`${q.id}-`)))
}

// Per vraag, after switching from per leerling with an open stack: the students not yet
// in the stack are typed in first (stack order, with their score for vraag 1).
export function needsRestEntry(sess, t, studs, scoreMap) {
  if (!sess || sess.stack_closed || !t?.questions.length) return false
  const order = sess.student_order || []
  if (!order.length || shouldEnterQ1Mode(sess, t, scoreMap)) return false
  const inOrder = new Set(order)
  return studs.some(s => !inOrder.has(s.id))
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

// ── Vertical grading (per student: A1, A2, A3, B1, ...) ──────────────────────

// Indices (into t.questions) of the questions that apply to this student, in test order.
export function getApplicableQuestionIndices(t, student) {
  if (!t || !student) return []
  return t.questions.reduce((acc, q, i) => {
    if (isApplicableForQuestion(student, q)) acc.push(i)
    return acc
  }, [])
}

// First (student, question) in the stack that still lacks a score, or null when everyone
// in the stack is complete. `pos` is an index into getApplicableQuestionIndices().
export function findVerticalResume(t, orderedStudents, scoreMap) {
  for (const student of orderedStudents) {
    const indices = getApplicableQuestionIndices(t, student)
    for (let pos = 0; pos < indices.length; pos++) {
      if (isMissingScore(scoreMap[`${t.questions[indices[pos]].id}-${student.id}`])) return { studentId: student.id, pos }
    }
  }
  return null
}

// ── Route changes during grading ─────────────────────────────────────────────
// A student's route can change while a session is being graded. Questions of the new
// route may then have been passed over or marked n.v.t. For a question that applies to
// the student's current route, a score is missing when it has no points or is n.v.t.
export function isMissingScore(sc) {
  return !sc || sc.excluded || sc.points === null || sc.points === undefined
}

// Missing { qIdx, studentId } pairs, in test order and then stack order.
export function findMissingScores(t, orderedStudents, scoreMap) {
  const missing = []
  t.questions.forEach((q, qIdx) => {
    for (const s of orderedStudents) {
      if (isApplicableForQuestion(s, q) && isMissingScore(scoreMap[`${q.id}-${s.id}`])) {
        missing.push({ qIdx, studentId: s.id })
      }
    }
  })
  return missing
}

// Scores that still count although the question no longer applies to the student's route.
export function findStaleScores(t, orderedStudents, scoreMap) {
  const stale = []
  for (const q of t.questions) {
    for (const s of orderedStudents) {
      const sc = scoreMap[`${q.id}-${s.id}`]
      if (sc && !sc.excluded && !isApplicableForQuestion(s, q)) stale.push({ question: q, student: s, score: sc })
    }
  }
  return stale
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

// Each "sterretje" (star) is a deduction for a mathematical inaccuracy.
export const STAR_VALUE = 0.5
export const MIN_CIJFER = 1

export function calcCijfer(scored, max, gradeConfig, stars = 0) {
  if (!max) return null
  const { multiplier, offset } = getCijferConfig(gradeConfig)
  const value = Math.max(MIN_CIJFER, (scored / max) * multiplier + offset - STAR_VALUE * (stars || 0))
  return (Math.round(value * 10) / 10).toFixed(1)
}

// Shift an already-set cijfer when the star count changes (keeps manual overrides in sync)
export function shiftCijfer(grade, starDelta) {
  const v = Math.min(10, Math.max(MIN_CIJFER, Number(grade) - STAR_VALUE * starDelta))
  return (Math.round(v * 10) / 10).toFixed(1)
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

// Cijfer for display on any toets. A cijfer toets uses its own formula (and the
// stored grade, which may be a manual override); other toetsen use the default 9 + 1.
export function displayCijfer(test, scored, max, storedGrade, stars = 0) {
  const isCijferTest = test?.grading_method === 'cijfer'
  if (isCijferTest && isCijferGrade(storedGrade)) return Number(storedGrade).toFixed(1)
  return calcCijfer(scored, max, isCijferTest ? test.grade_config : null, isCijferTest ? stars : 0)
}

// Result for one student from their scores. scoreMap is keyed `${question.id}-${student.id}`.
export function computeGrade(student, questions, scoreMap, gradingMethod, gradeConfig, stars = 0) {
  if (!gradingMethod || !gradeConfig) return null
  const applicable = questions.filter(q => (q.routes || []).includes(student.route))

  if (gradingMethod === 'cijfer') {
    let scored = 0, maxPts = 0
    for (const q of applicable) {
      const sc = scoreMap[`${q.id}-${student.id}`]
      if (sc && !sc.excluded && sc.points !== null) { scored += sc.points; maxPts += q.max_score }
    }
    return calcCijfer(scored, maxPts, gradeConfig, stars)
  }

  const routeCfg = gradeConfig[student.route]
  if (!routeCfg) return null

  if (gradingMethod === 'points') {
    let scored = 0, maxPts = 0
    for (const q of applicable) {
      const sc = scoreMap[`${q.id}-${student.id}`]
      if (sc && !sc.excluded && sc.points !== null) {
        scored += sc.points
        maxPts += q.max_score
      }
    }
    if (maxPts === 0) return null
    const pct = (scored / maxPts) * 100
    if (pct >= routeCfg.expert)   return 'expert'
    if (pct >= routeCfg.beheerst) return 'beheerst'
    return 'in_ontwikkeling'
  }

  if (gradingMethod === 'goals') {
    const goalGroups = {}
    for (const q of applicable) {
      if (!q.learning_goal || q.learning_goal_threshold == null) continue
      if (!goalGroups[q.learning_goal]) goalGroups[q.learning_goal] = []
      goalGroups[q.learning_goal].push(q)
    }
    let achieved = 0
    for (const goalQs of Object.values(goalGroups)) {
      const allMet = goalQs.every(q => {
        const sc = scoreMap[`${q.id}-${student.id}`]
        return sc && !sc.excluded && sc.points !== null && sc.points >= q.learning_goal_threshold
      })
      if (allMet) achieved++
    }
    if (achieved >= routeCfg.expert)   return 'expert'
    if (achieved >= routeCfg.beheerst) return 'beheerst'
    return 'in_ontwikkeling'
  }

  return null
}

// Per learning goal: the applicable questions with their score and whether the
// threshold is met. A goal is achieved only when every one of its questions is.
// `scores` is keyed `${studentId}|${questionId}` (report payload format).
export function learningGoalResults(questions, scores, studentId) {
  const goals = []
  const byName = {}
  questions.forEach(q => {
    if (!q.learning_goal || q.learning_goal_threshold == null) return
    const sc = scores[`${studentId}|${q.id}`]
    if (sc?.excluded) return
    const points = sc && sc.points !== null && sc.points !== undefined ? sc.points : null
    if (!byName[q.learning_goal]) {
      byName[q.learning_goal] = { name: q.learning_goal, items: [] }
      goals.push(byName[q.learning_goal])
    }
    byName[q.learning_goal].items.push({ question: q, points, passed: points !== null && points >= q.learning_goal_threshold })
  })
  goals.forEach(g => { g.achieved = g.items.every(it => it.passed) })
  return goals
}

const GRADE_CONCLUSIONS = {
  in_ontwikkeling: 'is nog in ontwikkeling',
  beheerst: 'beheerst de stof',
  expert: 'is een expert',
}

// Student-facing explanation of the In ontwikkeling / Beheerst / Expert label.
// `routeConfig` is the test's grade_config for the student's route. Returns null
// for cijfer tests or when the test has no usable grading config.
export function gradeExplanation({ gradingMethod, routeConfig, name, goalsAchieved, goalsTotal, scored, max, grade }) {
  if (!routeConfig) return null
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  let result, thresholds
  if (gradingMethod === 'goals') {
    if (!goalsTotal) return null
    result = `${name} heeft in deze toets ${goalsAchieved} van de ${plural(goalsTotal, 'leerdoel', 'leerdoelen')} aangetoond.`
    thresholds = `Vanaf ${plural(routeConfig.beheerst, 'leerdoel', 'leerdoelen')} beheers je de stof, vanaf ${plural(routeConfig.expert, 'leerdoel', 'leerdoelen')} ben je een expert.`
  } else if (gradingMethod === 'points') {
    if (!max) return null
    const points = pct => Math.ceil(pct / 100 * max - 1e-9)
    result = `${name} heeft in deze toets ${scored} van de ${max} punten gehaald (${Math.round(scored / max * 100)}%).`
    thresholds = `Vanaf ${plural(points(routeConfig.beheerst), 'punt', 'punten')} (${routeConfig.beheerst}%) beheers je de stof, vanaf ${plural(points(routeConfig.expert), 'punt', 'punten')} (${routeConfig.expert}%) ben je een expert.`
  } else {
    return null
  }
  const conclusion = GRADE_CONCLUSIONS[grade] ? ` ${name} ${GRADE_CONCLUSIONS[grade]}.` : ''
  return `${result} ${thresholds}${conclusion}`
}
