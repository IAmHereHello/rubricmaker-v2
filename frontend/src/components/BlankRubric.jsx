import RouteBadge from './RouteBadge.jsx'
import { GoalRequirement } from './LearningGoals.jsx'
import MathText from './MathText.jsx'
import { LEVEL_LABELS } from '../constants.js'
import { formatCijferFormula } from '../utils/gradingLogic.js'
import { LEVELS, sectionsOf, partOf, applies, levelsFor, levelPoints, routeMax } from '../utils/opdracht.js'
import { SHEET } from '../utils/printSheets.js'

// Rubrics to print and fill in on paper: for one leerling (name and klas printed)
// or blank (Naam and Klas written by hand). Every tick box carries `data-omr`, so
// its position can be stored when the PDF is made and read back from a scan.
// Toets:          data-omr="q:<question id>:<points>"
// Grote opdracht: data-omr="c:<criterion id>:<level>"; the whole cell has
//                 data-omr-cell with the same key (for marker highlighting).

const mmToCss = mm => Math.round(mm * SHEET.cssPerMm)

const PAGE_STYLE = {
  fontFamily: 'system-ui, Arial, sans-serif',
  fontSize: 13,
  color: '#111',
  background: '#ffffff',
  // Keep clear of the corner markers and the QR code (see printSheets.js)
  padding: `${mmToCss(SHEET.contentTopMm)}px ${mmToCss(SHEET.sideMm)}px ${mmToCss(SHEET.bottomMm)}px`,
  width: SHEET.widthCss,
  boxSizing: 'border-box',
}

// Questions that apply to a route; route null = all questions.
export const toetsQuestions = (test, route) =>
  (test.questions || []).filter(q => !route || (q.routes || []).includes(route))

// Routes that have at least one question (toets) or criterion (Grote opdracht).
export function routesInUse(test, allRoutes) {
  if (test.grading_method === 'opdracht') {
    const crits = sectionsOf(test).flatMap(s => s.criteria || [])
    return allRoutes.filter(r => crits.some(c => applies(c, r)))
  }
  return allRoutes.filter(r => (test.questions || []).some(q => (q.routes || []).includes(r)))
}

// Tick box; the number inside is light grey so it hardly counts when reading a scan.
function TickBox({ omr, label, size = 20 }) {
  return (
    <span data-omr={omr} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, border: '1.5px solid #111', borderRadius: 2, boxSizing: 'border-box',
      fontSize: 10, color: '#b0b6c0', background: '#fff', flex: 'none',
    }}>{label}</span>
  )
}

function WriteBox({ max }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-block', width: 52, height: 30, border: '1.5px solid #374151', borderRadius: 3 }} />
      <span style={{ fontWeight: 700, fontSize: 15 }}>/ {max}</span>
    </span>
  )
}

function Line({ label, value, width, omrName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, width }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      {value
        ? <span style={{ flex: 1, fontSize: 17, fontWeight: 700, borderBottom: '1.5px solid #d1d5db', paddingBottom: 1 }}>{value}</span>
        : <span data-omr-name={omrName ? '' : undefined} style={{ flex: 1, borderBottom: '1.5px solid #374151', height: 24 }} />}
    </div>
  )
}

function Header({ kind, test, route, student }) {
  return (
    <>
      <div style={{
        borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 14,
        paddingRight: mmToCss(SHEET.qrReserveMm), minHeight: mmToCss(SHEET.headerMinMm), boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{kind}</div>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{test.name}</div>
        {route && <RouteBadge route={route} />}
      </div>
      <div style={{ display: 'flex', gap: 24, background: '#f9fafb', borderRadius: 6, padding: '12px 14px 14px', marginBottom: 16 }}>
        <Line label="Naam" value={student?.name} width="62%" omrName />
        <Line label="Klas" value={student?.class_name} width="30%" />
      </div>
    </>
  )
}

function thresholdText(test, route) {
  const cfg = test.grade_config
  if (!test.grading_method || !cfg) return null
  if (test.grading_method === 'cijfer') return `Cijfer = ${formatCijferFormula(cfg)}`
  const r = route && cfg[route]
  if (!r) return null
  if (test.grading_method === 'points') return `Beheerst vanaf ${r.beheerst}%, Expert vanaf ${r.expert}%`
  if (test.grading_method === 'goals') {
    const label = n => `${n} leerdoel${n === 1 ? '' : 'en'}`
    return `Beheerst vanaf ${label(r.beheerst)}, Expert vanaf ${label(r.expert)}`
  }
  if (test.grading_method === 'opdracht') return `Beheerst vanaf ${r.beheerst} punten, Expert vanaf ${r.expert} punten`
  return null
}

function TotalRow({ max, note }) {
  return (
    <div data-pdf-block style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 4 }}>
      {note && <span style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>{note}</span>}
      <span style={{ fontSize: 14, fontWeight: 700 }}>Totaal</span>
      <WriteBox max={max} />
    </div>
  )
}

const th = { padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', textTransform: 'none', letterSpacing: 0 }

export function BlankToetsRubric({ test, route, student, showAnswers = false, showGoals = false }) {
  const questions = toetsQuestions(test, route)
  const totalMax = questions.reduce((n, q) => n + (q.max_score || 0), 0)
  return (
    <div data-pdf-section data-pdf-continuation={[student?.name, test.name, route].filter(Boolean).join(' · ')} style={PAGE_STYLE}>
      <Header kind="Toets" test={test} route={route} student={student} />
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
        Kruis per opgave één hokje aan met het aantal punten. Vergist? Kleur het foute hokje helemaal zwart en kruis het goede aan.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
        <thead>
          <tr data-pdf-block style={{ background: '#f3f4f6' }}>
            <th style={th}>Opgave</th>
            <th style={{ ...th, width: 80 }}>Domein</th>
            <th style={{ ...th, width: 110 }}>Niveau</th>
            <th style={{ ...th, width: 196 }}>Punten</th>
          </tr>
        </thead>
        <tbody>
          {questions.map(q => (
            <tr key={q.id} data-pdf-block style={{ borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' }}>
              <td style={{ padding: '9px 10px' }}>
                <div style={{ fontWeight: 600 }}><MathText text={q.description} /></div>
                {showGoals && <GoalRequirement question={q} />}
                {showAnswers && q.answer && (
                  <div style={{ fontSize: 11, color: '#374151', marginTop: 3, whiteSpace: 'pre-wrap' }}>
                    <span style={{ fontWeight: 600 }}>Antwoord: </span><MathText text={q.answer} />
                  </div>
                )}
              </td>
              <td style={{ padding: '9px 10px', color: '#6b7280' }}>{q.domain || '—'}</td>
              <td style={{ padding: '9px 10px', color: '#6b7280' }}>{LEVEL_LABELS[q.pyramid_level] || q.pyramid_level || '—'}</td>
              <td style={{ padding: '9px 10px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: (q.max_score || 0) + 1 }, (_, p) => (
                    <TickBox key={p} omr={`q:${q.id}:${p}`} label={p} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {questions.length > 0 && <TotalRow max={totalMax} note={thresholdText(test, route)} />}
    </div>
  )
}

const cell = { padding: '7px 8px', border: '1px solid #d1d5db', verticalAlign: 'top', lineHeight: 1.35 }
const head = { ...cell, fontSize: 11, textTransform: 'none', letterSpacing: 0, background: '#f3f4f6' }

export function BlankOpdrachtRubric({ test, route, student }) {
  const max = routeMax(test, route)
  return (
    <div data-pdf-section data-pdf-continuation={[student?.name, test.name, route].filter(Boolean).join(' · ')} style={{ ...PAGE_STYLE, fontSize: 12 }}>
      <Header kind="Grote opdracht" test={test} route={route} student={student} />
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
        Markeer per onderdeel het hokje dat past en zet een kruisje in het vakje.
      </div>
      {sectionsOf(test).map(sec => {
        const crits = (sec.criteria || []).filter(c => applies(c, route))
        if (!crits.length) return null
        const part = partOf(sec)
        return (
          <div key={sec.id} data-pdf-keep style={{ marginBottom: 16 }}>
            <div data-pdf-block style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{sec.name}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{part === 'groep' ? 'gezamenlijk' : 'individueel'}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
              <thead>
                <tr data-pdf-block>
                  <th style={{ ...head, width: 120, textAlign: 'left', fontWeight: 600, color: '#374151' }}>Onderdeel</th>
                  {LEVELS.map(l => (
                    <th key={l.key} style={{ ...head, textAlign: 'left', fontWeight: 600, color: l.color }}>{l.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crits.map(c => {
                  const texts = levelsFor(c, route)
                  return (
                    <tr key={c.id} data-pdf-block>
                      <td style={{ ...cell, fontWeight: 600 }}>
                        <MathText text={c.name} />
                        {c.feedback && (
                          <span style={{ display: 'inline-block', marginLeft: 4, fontSize: 9, fontWeight: 700, background: '#fee2e2', color: '#991b1b', borderRadius: 3, padding: '0 4px', verticalAlign: 'middle' }}>
                            Verplicht
                          </span>
                        )}
                      </td>
                      {LEVELS.map(l => (
                        <td key={l.key} data-omr-cell={`c:${c.id}:${l.key}`} style={{ ...cell, color: '#374151' }}>
                          <MathText text={texts?.[l.key]?.text || ''} />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }}>
                            <span style={{ fontSize: 10, color: '#6b7280' }}>{levelPoints(c, route, l.key)} pt</span>
                            <TickBox omr={`c:${c.id}:${l.key}`} label="" size={15} />
                          </div>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
      {max > 0 && <TotalRow max={max} note={thresholdText(test, route)} />}
    </div>
  )
}
