import { useEffect, useRef, useState } from 'react'
import * as api from '../api.js'
import RouteBadge from './RouteBadge.jsx'
import MathText from './MathText.jsx'
import { GoalRequirement } from './LearningGoals.jsx'
import { routesInUse, toetsQuestions } from './BlankRubric.jsx'
import { exportRubricsPDF } from '../utils/exportRubric.js'
import { ROUTES } from '../utils/opdracht.js'
import { safeFileName } from '../utils/shareFiles.js'

const ALL = '__all__'

const PAGE_STYLE = {
  fontFamily: 'system-ui, Arial, sans-serif',
  fontSize: 13,
  color: '#111',
  background: '#ffffff',
  padding: '28px 36px',
  width: 794,
  boxSizing: 'border-box',
}
const th = { padding: '7px 10px', fontWeight: 600, color: '#374151', textAlign: 'left', textTransform: 'none', letterSpacing: 0 }
const td = { padding: '9px 10px', verticalAlign: 'top' }

// Answer model for the teacher: every opgave with its answer and points.
// route null = all opgaven, with the routes they belong to.
export function AnswerModel({ test, route, showGoals }) {
  const questions = toetsQuestions(test, route)
  const total = questions.reduce((n, q) => n + (q.max_score || 0), 0)
  return (
    <div data-pdf-section data-pdf-continuation={`Antwoordenmodel · ${test.name}${route ? ` · ${route}` : ''}`} style={PAGE_STYLE}>
      <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 10, marginBottom: 16, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Antwoordenmodel</div>
          <div style={{ fontSize: 19, fontWeight: 700 }}>{test.name}</div>
        </div>
        {route ? <RouteBadge route={route} /> : <span style={{ fontSize: 12, color: '#6b7280' }}>Alle routes</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 12 }}>
        <thead>
          <tr data-pdf-block style={{ background: '#f3f4f6' }}>
            <th style={{ ...th, width: '34%' }}>Opgave</th>
            <th style={th}>Antwoord</th>
            {!route && <th style={{ ...th, width: 175 }}>Routes</th>}
            <th style={{ ...th, width: 60, textAlign: 'center' }}>Punten</th>
          </tr>
        </thead>
        <tbody>
          {questions.map(q => (
            <tr key={q.id} data-pdf-block style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={td}>
                <div style={{ fontWeight: 600 }}><MathText text={q.description} /></div>
                {showGoals && <GoalRequirement question={q} />}
              </td>
              <td style={{ ...td, whiteSpace: 'pre-wrap' }}>
                {q.answer ? <MathText text={q.answer} /> : <span style={{ color: '#9ca3af' }}>—</span>}
              </td>
              {!route && (
                <td style={td}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {ROUTES.filter(r => (q.routes || []).includes(r)).map(r => <RouteBadge key={r} route={r} />)}
                  </div>
                </td>
              )}
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{q.max_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {route && questions.length > 0 && (
        <div data-pdf-block style={{ textAlign: 'right', fontSize: 14, fontWeight: 700 }}>Totaal {total} punten</div>
      )}
    </div>
  )
}

// "Print antwoordenmodel" (⋮ menu at Toetsen, toetsen only).
export default function AnswerModelDialog({ testId, onClose }) {
  const [test, setTest] = useState(null)
  const [routes, setRoutes] = useState([])
  const [which, setWhich] = useState(ALL)     // ALL or a route
  const [showGoals, setShowGoals] = useState(false)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    api.getTest(testId)
      .then(t => { setTest(t); setRoutes(routesInUse(t, ROUTES)) })
      .catch(e => setError(api.errorText(e, 'Laden mislukt.')))
  }, [testId])

  useEffect(() => {
    if (!rendering) return
    const timer = setTimeout(async () => {
      try {
        const suffix = which === ALL ? '' : ` - ${which}`
        await exportRubricsPDF([ref.current], `${safeFileName(`Antwoordenmodel - ${test.name}${suffix}`)}.pdf`)
        onClose()
      } catch {
        setError('PDF maken mislukt.')
        setRendering(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [rendering])

  const missing = test ? (test.questions || []).filter(q => !q.answer).length : 0

  return (
    <div className="modal-backdrop">
      <div className="card modal-card" style={{ maxWidth: 500 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Print antwoordenmodel</h2>
        <p className="text-muted" style={{ marginBottom: 12 }}>
          Alle opgaven met het antwoord en de punten, om mee na te kijken.
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        {!test ? (!error && <div className="text-muted">Laden...</div>) : !(test.questions || []).length ? (
          <div className="text-muted" style={{ marginBottom: 12 }}>Deze toets heeft nog geen opgaven.</div>
        ) : (
          <>
            {routes.length > 1 && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Routes</label>
                <select value={which} onChange={e => setWhich(e.target.value)} disabled={rendering}>
                  <option value={ALL}>Alle routes samen (per opgave staan de routes erbij)</option>
                  {routes.map(r => <option key={r} value={r}>Alleen route {r}</option>)}
                </select>
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={showGoals} onChange={e => setShowGoals(e.target.checked)} disabled={rendering} />
              Leerdoelen bij de opgaven
            </label>
            {missing > 0 && (
              <div className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
                Bij {missing} opgave{missing === 1 ? '' : 'n'} is nog geen antwoord ingevuld (te doen bij Bewerken).
              </div>
            )}
          </>
        )}
        <div className="gap-8" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={rendering}>Annuleren</button>
          <button className="btn btn-primary" onClick={() => { setError(''); setRendering(true) }}
            disabled={rendering || !test || !(test.questions || []).length}>
            {rendering ? 'PDF maken...' : 'Download PDF'}
          </button>
        </div>
      </div>
      {rendering && test && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
          <div ref={ref}><AnswerModel test={test} route={which === ALL ? null : which} showGoals={showGoals} /></div>
        </div>
      )}
    </div>
  )
}
