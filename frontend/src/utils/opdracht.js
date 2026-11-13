// Shared helpers for Grote opdrachten (grading_method 'opdracht').
// The rubric lives in test.grade_config.opdracht.sections; thresholds per route in
// test.grade_config[route] = { beheerst, expert } (points). Mirrors backend/opdracht_logic.py.

export const ROUTES = ['oranje', 'geel', 'blauw']

export const LEVELS = [
  { key: 'niet', label: 'Niet laten zien', short: 'N', color: '#b91c1c', bg: '#fee2e2', border: '#fca5a5' },
  { key: 'voldoende', label: 'Voldoende laten zien', short: 'V', color: '#b45309', bg: '#ffedd5', border: '#fdba74' },
  { key: 'goed', label: 'Goed laten zien', short: 'G', color: '#15803d', bg: '#dcfce7', border: '#86efac' },
]
export const LEVEL_BY_KEY = Object.fromEntries(LEVELS.map(l => [l.key, l]))

export const PART_LABELS = { groep: 'Gezamenlijk deel', individueel: 'Individueel deel' }

export const MODE_LABELS = {
  samen: 'Individueel + Gezamenlijk samen',
  apart: 'Individueel - Gezamenlijk apart',
  individueel: 'Alleen individueel',
  groep: 'Alleen gezamenlijk',
}

export const sectionsOf = test => test?.grade_config?.opdracht?.sections || []

export const partOf = section => (section.group ? 'groep' : 'individueel')

export const allCriteria = test =>
  sectionsOf(test).flatMap(s => (s.criteria || []).map(c => ({ section: s, criterion: c })))

export const partsPresent = test =>
  ['groep', 'individueel'].filter(p => sectionsOf(test).some(s => partOf(s) === p && (s.criteria || []).length))

export const applies = (criterion, route) => (criterion.routes || []).includes(route)

export function levelsFor(criterion, route) {
  if (criterion.per_route && route && criterion.route_levels?.[route]) return criterion.route_levels[route]
  return criterion.levels || {}
}

export function levelPoints(criterion, route, level) {
  const n = parseInt(levelsFor(criterion, route)?.[level]?.points)
  return isNaN(n) ? 0 : n
}

export const criterionMax = (criterion, route) =>
  Math.max(...LEVELS.map(l => levelPoints(criterion, route, l.key)))

export const routeMax = (test, route) =>
  allCriteria(test).filter(({ criterion }) => applies(criterion, route))
    .reduce((acc, { criterion }) => acc + criterionMax(criterion, route), 0)

export const newId = () => Math.random().toString(36).slice(2, 10)

export const emptyLevels = () => ({
  niet: { text: '', points: 0 },
  voldoende: { text: '', points: 1 },
  goed: { text: '', points: 2 },
})

export const thresholdsFor = (test, route) => {
  const cfg = test?.grade_config?.[route]
  return cfg && cfg.beheerst != null && cfg.expert != null ? cfg : null
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

const GRADE_CONCLUSIONS = {
  in_ontwikkeling: 'is nog in ontwikkeling',
  beheerst: 'beheerst de stof',
  expert: 'is een expert',
}

// Student-facing explanation of the result on the report
export function opdrachtExplanation(test, student, summary) {
  if (!summary?.complete) return null
  const cfg = thresholdsFor(test, student.route)
  const parts = [`${student.name} heeft ${summary.points} van de ${plural(summary.max, 'punt', 'punten')} gehaald.`]
  if (cfg) {
    parts.push(`Vanaf ${plural(cfg.beheerst, 'punt', 'punten')} beheers je de stof, vanaf ${plural(cfg.expert, 'punt', 'punten')} ben je een expert.`)
  }
  if (summary.feedback_failed?.length) {
    const names = summary.feedback_failed.map(n => `"${n}"`).join(', ')
    parts.push(`Bij ${names} moet je minimaal Voldoende laten zien om de stof te beheersen.`)
  }
  if (GRADE_CONCLUSIONS[summary.grade]) parts.push(`${student.name} ${GRADE_CONCLUSIONS[summary.grade]}.`)
  return parts.join(' ')
}
