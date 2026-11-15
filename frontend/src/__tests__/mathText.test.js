import { describe, it, expect } from 'vitest'
import katex from 'katex'
import { splitMath, prepareLatex, hasMath } from '../utils/mathText.js'

describe('splitMath', () => {
  it('leaves text without formulas alone', () => {
    expect(splitMath('Los de vergelijking op')).toEqual([{ type: 'text', value: 'Los de vergelijking op' }])
    expect(splitMath('')).toEqual([])
    expect(splitMath(null)).toEqual([])
  })

  it('finds a formula in a sentence', () => {
    expect(splitMath('Los op: $x^2 = 9$ voor x')).toEqual([
      { type: 'text', value: 'Los op: ' },
      { type: 'inline', value: 'x^2 = 9' },
      { type: 'text', value: ' voor x' },
    ])
  })

  it('finds a formula on its own line', () => {
    expect(splitMath('Gebruik $$a^2+b^2=c^2$$ hier')).toEqual([
      { type: 'text', value: 'Gebruik ' },
      { type: 'display', value: 'a^2+b^2=c^2' },
      { type: 'text', value: ' hier' },
    ])
  })

  it('keeps a single dollar sign as a dollar sign', () => {
    expect(splitMath('Het kost $5')).toEqual([{ type: 'text', value: 'Het kost $5' }])
    expect(splitMath('$$ half open')).toEqual([{ type: 'text', value: '$$ half open' }])
  })

  it('reads \\$ as a dollar sign, also inside a formula', () => {
    expect(splitMath('\\$5 en \\$10')).toEqual([{ type: 'text', value: '$5 en $10' }])
    expect(splitMath('$a \\$ b$')).toEqual([{ type: 'inline', value: 'a \\$ b' }])
  })

  it('handles several formulas', () => {
    expect(splitMath('$a$ en $b$').map(p => p.type)).toEqual(['inline', 'text', 'inline'])
    expect(hasMath('$a$')).toBe(true)
    expect(hasMath('geen formule')).toBe(false)
  })
})

describe('prepareLatex', () => {
  it('shows % as a percent sign', () => {
    expect(prepareLatex('p = 25% van 80')).toBe('p = 25\\% van 80')
    expect(prepareLatex('25\\%')).toBe('25\\%')
  })

  it('treats a comma between digits as a decimal comma', () => {
    expect(prepareLatex('3,5')).toBe('3{,}5')
    expect(prepareLatex('(1, 2)')).toBe('(1, 2)')
    expect(prepareLatex('a,b')).toBe('a,b')
    expect(prepareLatex('1,25 + 0,5')).toBe('1{,}25 + 0{,}5')
  })

  it('gives KaTeX something it can render', () => {
    const html = katex.renderToString(prepareLatex('p = 25% van 3,5'), { throwOnError: true })
    expect(html).toContain('%')
    expect(html).toContain('van')
  })
})
