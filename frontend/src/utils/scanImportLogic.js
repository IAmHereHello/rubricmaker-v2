// Shared logic for Importeer scans: building the list of steps from the read pages,
// warnings, and storing one checked leerling in a nakijkronde.
import * as api from '../api.js'
import { computeGrade, withSessionRoutes } from './gradingLogic.js'
import { allCriteria, partOf, partsPresent } from './opdracht.js'

export const NEW = 'new'

// Pages the rubric expects but the scan doesn't have.
export function missingOf(pages) {
  const expected = pages[0].sheet.pages
  const out = []
  for (let n = 1; n <= expected; n++) if (!pages.some(q => q.sheet.page === n)) out.push(n)
  return out
}

export const firstIndex = step => (step.kind === 'rubric' ? Math.min(...step.pages.map(p => p.index)) : step.index)
export const isDone = step => step.status === 'saved' || step.status === 'skipped'

// The rubric was changed after this sheet was printed: say what doesn't match.
export function rubricChanges(r, test, student) {
  if (!test || r.fallback === 'none') return []
  const out = []
  const onSheet = new Set(Object.keys(r.items))
  if (test.grading_method === 'opdracht') {
    const crits = allCriteria(test)
    const known = new Set(crits.map(({ criterion }) => String(criterion.id)))
    for (const { criterion } of crits) if (!onSheet.has(String(criterion.id))) out.push(`Criterium "${criterion.name}" staat niet op dit blad (toegevoegd na het printen).`)
    if ([...onSheet].some(id => !known.has(id))) out.push('Een criterium op dit blad bestaat niet meer in de rubric en wordt overgeslagen.')
    return out
  }
  const route = student?.route ?? r.route
  const known = new Set(test.questions.map(q => String(q.id)))
  test.questions.forEach((q, i) => {
    const it = r.items[q.id]
    if (!it) {
      if (!route || (q.routes || []).includes(route)) out.push(`Opgave ${i + 1} staat niet op dit blad (toegevoegd na het printen).`)
    } else if (it.value != null && it.value > q.max_score) {
      out.push(`Opgave ${i + 1}: ${it.value} aangekruist, het maximum is nu ${q.max_score}.`)
    }
  })
  if ([...onSheet].some(id => !known.has(id))) out.push('Een opgave op dit blad bestaat niet meer in de rubric en wordt overgeslagen.')
  return out
}

// Readings for a page that couldn't be read automatically: every item empty.
export function emptyReadings(test, student) {
  const out = {}
  const why = { status: 'empty', reason: 'Niet automatisch gelezen', value: null }
  if (test.grading_method === 'opdracht') for (const { criterion } of allCriteria(test)) out[criterion.id] = { ...why, kind: 'c' }
  else for (const q of test.questions) if ((q.routes || []).includes(student.route)) out[q.id] = { ...why, kind: 'q' }
  return out
}

// Create the nakijkronde for a toets × klas.
export async function createTargetSession(test, className) {
  const s = await api.createSession({ test_id: test.id, class_name: className, grading_mode: 'vertical' })
  if (test.grading_method === 'opdracht') {
    const parts = partsPresent(test)
    await api.setOpdrachtState(s.id, { mode: parts.length === 2 ? 'samen' : parts[0] })
  }
  return s
}

// Store one checked leerling: what is in the fields is saved (empty fields leave
// existing points alone). The beoordeling is recalculated unless it was set by hand.
export async function saveStep(sid, test, step, student) {
  if (test.grading_method === 'opdracht') return saveOpdracht(sid, test, step)
  const [session, scores, grades] = await Promise.all([api.getSession(sid), api.getSessionScores(sid), api.getSessionGrades(sid)])
  const scoreMap = {}
  for (const s of scores) scoreMap[`${s.question_id}-${s.student_id}`] = s
  const [st] = withSessionRoutes([student], session)
  for (const q of test.questions) {
    const k = `${q.id}-${st.id}`
    const prev = scoreMap[k]
    if ((q.routes || []).includes(st.route)) {
      const read = step.items[q.id]
      if (!read || read.value === null || read.value === undefined || read.value > q.max_score) continue
      if (prev && prev.points === read.value && !prev.excluded) continue
      scoreMap[k] = await api.upsertScore({
        session_id: sid, student_id: st.id, question_id: q.id, points: read.value, excluded: false, comment: prev?.comment ?? null,
      })
    } else if (!prev) {
      scoreMap[k] = await api.upsertScore({ session_id: sid, student_id: st.id, question_id: q.id, points: null, excluded: true, comment: null })
    }
  }
  const old = grades.find(g => g.student_id === st.id)
  if (test.grading_method && !(old?.is_manual)) {
    const grade = computeGrade(st, test.questions, scoreMap, test.grading_method, test.grade_config, old?.stars || 0)
    if (grade != null) {
      await api.upsertStudentGrade(sid, st.id, {
        grade, is_manual: false, review_done: true, stars: test.grading_method === 'cijfer' ? (old?.stars || 0) : 0,
      })
    }
  }
  const order = [...(session.student_order || [])]
  if (!order.includes(st.id)) {
    order.push(st.id)
    await api.setSessionOrder(sid, { student_order: order })
  }
}

async function saveOpdracht(sid, test, step) {
  let data = await api.getOpdrachtSession(sid)
  const crits = allCriteria(test)
  const sid2 = String(step.studentId)
  for (const part of ['groep', 'individueel']) {
    const read = crits.filter(({ section, criterion }) => partOf(section) === part && step.items[criterion.id]?.value)
    if (!read.length) continue
    const status = data.summaries?.[sid2]?.parts?.[part]?.status
    if (!status || status === 'none' || status === 'missing') data = await api.setOpdrachtEntry(sid, step.studentId, part)
    for (const { criterion } of read) {
      const level = step.items[criterion.id].value
      if (data.summaries?.[sid2]?.effective?.[criterion.id]?.level === level) continue
      data = await api.setOpdrachtLevel(sid, { criterion_id: criterion.id, student_id: step.studentId, level })
    }
  }
}

// What is already stored for a leerling: { itemId: value } (points or level).
export async function existingValues(sid, test, studentId) {
  if (test.grading_method === 'opdracht') {
    const data = await api.getOpdrachtSession(sid)
    const eff = data.summaries?.[String(studentId)]?.effective || {}
    return Object.fromEntries(Object.entries(eff).filter(([, v]) => v?.level).map(([k, v]) => [k, v.level]))
  }
  const scores = await api.getSessionScores(sid)
  return Object.fromEntries(scores.filter(s => s.student_id === studentId && !s.excluded && s.points != null).map(s => [s.question_id, s.points]))
}

// Short text for the Lopende sessies list.
export function summarize(steps, tests, studentById) {
  const byTest = new Map()   // toets name → klassen
  for (const s of steps) {
    if (s.kind !== 'rubric') continue
    const name = tests[s.testId]?.name ?? 'Toets'
    if (!byTest.has(name)) byTest.set(name, new Set())
    const st = s.studentId ? studentById[s.studentId] : null
    if (st) byTest.get(name).add(st.class_name)
  }
  return [...byTest.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'nl', { numeric: true }))
    .map(([name, cls]) => (cls.size ? `${name} ${[...cls].sort().join(', ')}` : name))
    .join(' · ')
}

export function counts(steps) {
  return { done_count: steps.filter(isDone).length, total_count: steps.length }
}
