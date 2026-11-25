import { describe, it, expect } from 'vitest'
import { compileFunction, parseGraph, formatGraph, findGraphs, samplePieces, gridValues, parseNumber, formatNumber } from '../utils/graph.js'
import { splitMath } from '../utils/mathText.js'

const at = (text, x) => compileFunction(text).fn(x)

describe('compileFunction', () => {
  it('reads the usual ways of writing a function', () => {
    expect(at('y = x^2 - 3', 2)).toBe(1)
    expect(at('f(x) = 2x + 1', 3)).toBe(7)
    expect(at('-x^2', 3)).toBe(-9)
    expect(at('2(x+1)(x-1)', 2)).toBe(6)
    expect(at('x(x+1)', 2)).toBe(6)
    expect(at('1/2x', 4)).toBe(2)
    expect(at('\\frac{1}{2}x^2', 2)).toBe(2)
    expect(at('0,5x', 4)).toBe(2)
    expect(at('2^x', 3)).toBe(8)
    expect(at('2^-x', 1)).toBe(0.5)
    expect(at('x²', 3)).toBe(9)
    expect(at('|x - 2|', 0)).toBe(2)
    expect(at('sqrt(x)', 9)).toBe(3)
    expect(at('\\sqrt{x+7}', 9)).toBe(4)
    expect(at('3·x', 2)).toBe(6)
    expect(at('x^(1/3)', -8)).toBeCloseTo(-2)
    expect(at('2sin(x)', Math.PI / 2)).toBeCloseTo(2)
    expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI)
    expect(at('e^x', 0)).toBe(1)
    expect(at('log(x)', 100)).toBe(2)
  })

  it('keeps the label apart', () => {
    expect(compileFunction('g(x) = x').label).toBe('g(x)')
    expect(compileFunction('y = x').label).toBe('y')
    expect(compileFunction('x + 1').label).toBe('')
  })

  it('refuses nonsense', () => {
    expect(() => compileFunction('x^')).toThrow()
    expect(() => compileFunction('(x+1')).toThrow()
    expect(() => compileFunction('x + q')).toThrow()
    expect(() => compileFunction('')).toThrow()
  })
})

describe('parseGraph', () => {
  it('reads functions, window and step', () => {
    const g = parseGraph(': y = x^2 - 3; g(x) = 2x; x: -5 tot 5; y: -2,5 tot 10; stap: 0,5')
    expect(g.errors).toEqual([])
    expect(g.functions).toEqual(['y = x^2 - 3', 'g(x) = 2x'])
    expect([g.xmin, g.xmax, g.ymin, g.ymax, g.step]).toEqual([-5, 5, -2.5, 10, 0.5])
  })

  it('reports what is wrong', () => {
    expect(parseGraph(': y = x; x: 5 tot -5; y: -5 tot 5; stap: 1').errors).toContain('xmin moet kleiner zijn dan xmax')
    expect(parseGraph(': x: -5 tot 5; y: -5 tot 5; stap: 1').errors).toContain('geen functie')
    expect(parseGraph(': y = x; x: -5 tot 5; y: -5 tot 5; stap: 0').errors).toContain('stapgrootte moet groter dan 0 zijn')
    expect(parseGraph(': y = x; x: -500 tot 500; y: -5 tot 5; stap: 1').errors).toContain('stapgrootte is te klein voor dit bereik')
  })

  it('round-trips through formatGraph', () => {
    const spec = { functions: ['y = x^2'], xmin: -2.5, xmax: 2.5, ymin: -1, ymax: 6, step: 0.5 }
    const code = formatGraph(spec)
    expect(code).toBe('[[grafiek: y = x^2; x: -2,5 tot 2,5; y: -1 tot 6; stap: 0,5]]')
    const back = parseGraph(findGraphs(code)[0].body)
    expect(back.errors).toEqual([])
    expect(back.functions).toEqual(spec.functions)
    expect(back.step).toBe(0.5)
  })
})

describe('graphs inside rubric text', () => {
  it('splits a graph out of the text', () => {
    expect(splitMath('Teken $f$:\n[[grafiek: y = x; x: -1 tot 1; y: -1 tot 1; stap: 1]]\nKlaar')).toEqual([
      { type: 'text', value: 'Teken ' },
      { type: 'inline', value: 'f' },
      { type: 'text', value: ':\n' },
      { type: 'graph', value: ': y = x; x: -1 tot 1; y: -1 tot 1; stap: 1' },
      { type: 'text', value: 'Klaar' },
    ])
  })

  it('leaves an unfinished block as text', () => {
    expect(splitMath('[[grafiek: y = x')).toEqual([{ type: 'text', value: '[[grafiek: y = x' }])
  })

  it('finds every graph with its position', () => {
    const t = 'a [[grafiek: y=x; x: 0 tot 1; y: 0 tot 1; stap: 1]] b [[grafiek: y=2x; x: 0 tot 1; y: 0 tot 2; stap: 1]]'
    const gs = findGraphs(t)
    expect(gs.length).toBe(2)
    expect(t.slice(gs[1].start, gs[1].end)).toMatch(/^\[\[grafiek: y=2x.*\]\]$/)
  })
})

describe('drawing helpers', () => {
  it('breaks the line at an asymptote', () => {
    const pieces = samplePieces(compileFunction('1/x').fn, -5, 5, -5, 5, 601)
    expect(pieces.length).toBe(2)
  })

  it('skips where the function does not exist', () => {
    const pieces = samplePieces(compileFunction('sqrt(x)').fn, -5, 5, -5, 5)
    expect(pieces.length).toBe(1)
    expect(pieces[0][0][0]).toBeGreaterThanOrEqual(0)
  })

  it('places grid lines on multiples of the step', () => {
    expect(gridValues(-2, 2, 1)).toEqual([-2, -1, 0, 1, 2])
    expect(gridValues(-1.2, 1.2, 0.5)).toEqual([-1, -0.5, 0, 0.5, 1])
  })

  it('reads and writes Dutch numbers', () => {
    expect(parseNumber('-2,5')).toBe(-2.5)
    expect(parseNumber('−3')).toBe(-3)
    expect(Number.isNaN(parseNumber('abc'))).toBe(true)
    expect(formatNumber(0.1 + 0.2)).toBe('0,3')
  })
})
