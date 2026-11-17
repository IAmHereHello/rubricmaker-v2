import { describe, it, expect } from 'vitest'
import { trendLabel, statements, splitGoals, openWorkLabel, showOpenWork, resultValue } from '../utils/leerlingrapport.js'
import { placeKey } from '../utils/backTrail.js'

describe('leerlingrapport wording', () => {
  it('names the trend, or says there are too few tests', () => {
    expect(trendLabel('stijgend')).toBe('Stijgend')
    expect(trendLabel(null)).toBe('Te weinig toetsen voor een trend')
  })

  it('turns verdicts into sentences and skips scores without a verdict', () => {
    const data = {
      domain_scores: [
        { domain: 'Rekenen', pct: 82, verdict: 'goed' },
        { domain: 'Algebra', pct: 60, verdict: null },
      ],
      level_scores: [{ level: 'verbinding', pct: 48, verdict: 'aandacht' }],
    }
    expect(statements(data)).toEqual({
      good: ['Rekenen gaat goed (82%)'],
      attention: ['Wiskundig gereedschap kiezen vraagt aandacht (48%)'],
    })
  })

  it('splits goals into behaald and nog niet behaald', () => {
    const { achieved, notAchieved } = splitGoals([{ name: 'a', achieved: true }, { name: 'b', achieved: false }])
    expect(achieved.map(g => g.name)).toEqual(['a'])
    expect(notAchieved.map(g => g.name)).toEqual(['b'])
  })

  it('describes open work', () => {
    expect(openWorkLabel({ kind: 'toets', status: 'open' })).toBe('toets gemist, nog in te halen')
    expect(openWorkLabel({ kind: 'toets', status: 'vervallen' })).toBe('toets gemist')
    expect(openWorkLabel({ kind: 'opdracht', all_parts: true, parts: ['individueel'] })).toBe('niet ingeleverd')
    expect(openWorkLabel({ kind: 'opdracht', all_parts: false, parts: ['groep'] })).toBe('gezamenlijk deel niet ingeleverd')
  })

  it('leaves an empty Openstaand werk block out of the PDF only', () => {
    expect(showOpenWork([], false)).toBe(true)
    expect(showOpenWork([], true)).toBe(false)
    expect(showOpenWork([{ status: 'vervallen' }], true)).toBe(true)
  })

  it('shows points, with a percentage unless the grade is a cijfer', () => {
    expect(resultValue({ scored: 14, max: 24, pct: 58, grade: 'beheerst' })).toBe('14 van 24 punten (58%)')
    expect(resultValue({ scored: 14, max: 24, pct: 58, grade: '6.3' })).toBe('14 van 24 punten')
    expect(resultValue({ scored: 2, max: 8, pct: null, grade: null })).toBe('2 van 8 punten tot nu toe')
  })

  it('counts the leerlingrapport as one of the student pages for Terug', () => {
    expect(placeKey('/students/3/leerlingrapport')).toBe('student')
  })
})
