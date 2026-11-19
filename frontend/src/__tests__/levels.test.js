import { describe, it, expect } from 'vitest'
import { guessLevel, levelLabel, sortLabels, nextYearLevel, parseLabel } from '../utils/levels.js'

describe('leerjaar groups', () => {
  it('guesses leerjaar and niveau from a class name', () => {
    expect(guessLevel('2mhv1')).toEqual({ leerjaar: 2, niveaus: 'mhv' })
    expect(guessLevel('4H2')).toEqual({ leerjaar: 4, niveaus: 'h' })
    expect(guessLevel('3vh')).toEqual({ leerjaar: 3, niveaus: 'hv' })
    expect(guessLevel('2k')).toEqual({ leerjaar: 2, niveaus: '' })
    expect(guessLevel('Brugklas')).toEqual({ leerjaar: null, niveaus: '' })
    expect(guessLevel('7a')).toEqual({ leerjaar: null, niveaus: '' })
  })
  it('makes labels', () => {
    expect(levelLabel({ leerjaar: 2, niveaus: 'vhm' })).toBe('2mhv')
    expect(levelLabel({ leerjaar: 3, niveaus: '' })).toBe('3')
    expect(levelLabel(null)).toBe(null)
    expect(parseLabel('4hv')).toEqual({ leerjaar: 4, niveaus: 'hv' })
  })
  it('sorts by leerjaar, then m, mh, mhv, h, hv, v', () => {
    expect(sortLabels(['4v', '2mhv', '4h', '1', '4hv', '4h'])).toEqual(['1', '2mhv', '4h', '4hv', '4v'])
  })
  it('goes up one year, dropping past 6', () => {
    expect(nextYearLevel({ leerjaar: 3, niveaus: 'h' })).toEqual({ leerjaar: 4, niveaus: 'h' })
    expect(nextYearLevel({ leerjaar: 6, niveaus: 'v' })).toBe(null)
  })
})
