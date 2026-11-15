// Wording and small decisions for the Leerlingrapport page (shown to parents).
import { pyramidLabel } from '../constants.js'
import { gradeLabel, isCijferGrade } from './gradingLogic.js'

const TREND_LABELS = { stijgend: 'Stijgend', stabiel: 'Stabiel', dalend: 'Dalend' }

export function trendLabel(trend) {
  return TREND_LABELS[trend] ?? 'Te weinig toetsen voor een trend'
}

// Plain sentences per domain and niveaulaag. The backend decides the verdict
// ('goed' | 'aandacht' | null): 75% and up, below 55%, and nothing in between or
// when too few points are behind the score.
export function statements(data) {
  const rows = [
    ...data.domain_scores.map(r => ({ ...r, label: r.domain })),
    ...data.level_scores.map(r => ({ ...r, label: pyramidLabel(r.level) })),
  ]
  return {
    good: rows.filter(r => r.verdict === 'goed').map(r => `${r.label} gaat goed (${r.pct}%)`),
    attention: rows.filter(r => r.verdict === 'aandacht').map(r => `${r.label} vraagt aandacht (${r.pct}%)`),
  }
}

export function splitGoals(goals) {
  return {
    achieved: goals.filter(g => g.achieved),
    notAchieved: goals.filter(g => !g.achieved),
  }
}

export function openWorkLabel(item) {
  if (item.kind === 'toets') return item.status === 'vervallen' ? 'toets gemist' : 'toets gemist, nog in te halen'
  if (item.all_parts) return 'niet ingeleverd'
  return item.parts[0] === 'groep' ? 'gezamenlijk deel niet ingeleverd' : 'individueel deel niet ingeleverd'
}

// On screen the block always shows ("Geen openstaand werk" when empty); in the PDF
// an empty block is left out.
export function showOpenWork(items, pdf) {
  return !pdf || items.length > 0
}

// Right-hand value of a result line: the points, unless the grade is a cijfer
// (then the badge already says it all, but points still help a parent).
export function resultValue(r) {
  if (r.pct === null || r.pct === undefined) return `${r.scored} van ${r.max} punten tot nu toe`
  if (r.grade && isCijferGrade(r.grade)) return `${r.scored} van ${r.max} punten`
  return `${r.scored} van ${r.max} punten (${r.pct}%)`
}

export { gradeLabel }
