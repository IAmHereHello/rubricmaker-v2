import { describe, it, expect } from 'vitest'
import { levelPoints, criterionMax, routeMax, partsPresent, opdrachtExplanation } from '../utils/opdracht.js'

const L = (n, v, g) => ({ niet: { text: '', points: n }, voldoende: { text: '', points: v }, goed: { text: '', points: g } })
const test = {
  grade_config: {
    opdracht: {
      sections: [
        { id: 's1', name: 'Diagrammen', group: true, criteria: [
          { id: 'c1', name: 'Staaf', routes: ['oranje', 'geel', 'blauw'], levels: L(0, 1, 2) },
          { id: 'c2', name: 'Beeld', routes: ['geel', 'blauw'], per_route: true, levels: L(0, 1, 2), route_levels: { blauw: L(0, 2, 4) } },
        ] },
        { id: 's2', name: 'Uitleg', group: false, criteria: [] },
      ],
    },
    geel: { beheerst: 3, expert: 4 },
  },
}

describe('Grote opdracht helpers', () => {
  it('uses route-specific points only when the onderdeel differs per route', () => {
    const beeld = test.grade_config.opdracht.sections[0].criteria[1]
    expect(levelPoints(beeld, 'blauw', 'goed')).toBe(4)
    expect(levelPoints(beeld, 'geel', 'goed')).toBe(2)
    expect(criterionMax(beeld, 'blauw')).toBe(4)
  })

  it('adds up the maximum per route over applicable onderdelen', () => {
    expect(routeMax(test, 'oranje')).toBe(2)
    expect(routeMax(test, 'geel')).toBe(4)
    expect(routeMax(test, 'blauw')).toBe(6)
  })

  it('ignores groups without onderdelen', () => {
    expect(partsPresent(test)).toEqual(['groep'])
  })

  it('explains a verplicht onderdeel that forces In ontwikkeling', () => {
    const text = opdrachtExplanation(test, { name: 'Bram', route: 'geel' }, {
      complete: true, points: 3, max: 4, grade: 'in_ontwikkeling', feedback_failed: ['Staaf'],
    })
    expect(text).toContain('3 van de 4 punten')
    expect(text).toContain('"Staaf"')
    expect(text).toContain('nog in ontwikkeling')
  })
})
