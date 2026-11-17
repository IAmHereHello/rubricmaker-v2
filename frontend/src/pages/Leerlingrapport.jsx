import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import StudentSwitcher from '../components/StudentSwitcher.jsx'
import RouteBadge from '../components/RouteBadge.jsx'
import MathText from '../components/MathText.jsx'
import { pyramidLabel, ROUTE_COLORS } from '../constants.js'
import { gradeLabel } from '../utils/gradingLogic.js'
import { exportRubricsPDF } from '../utils/exportRubric.js'
import {
  trendLabel, statements, splitGoals, openWorkLabel, showOpenWork, resultValue,
} from '../utils/leerlingrapport.js'

// One overview per student for the oudergesprek. Meant to be shown to a parent:
// no names of other students, and wording a parent can follow.
// Inline styles only inside ReportBody, so html2canvas renders the PDF the same.

const NAVY = '#1e3a5f'
const MUTED = '#6b7280'
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }
const TREND_STYLE = {
  stijgend: { symbol: '↗', color: '#15803d' },
  stabiel: { symbol: '→', color: NAVY },
  dalend: { symbol: '↘', color: '#b45309' },
}

const safeFilename = name => name.replace(/[\\/:*?"<>|]/g, '-')
const formatDate = iso => (iso ? new Date(iso).toLocaleDateString('nl-NL') : '')

function Section({ title, children, style }) {
  return (
    <div data-pdf-block style={{
      background: '#fff', border: '1px solid #e0e3ea', borderRadius: 8,
      padding: '16px 20px', marginBottom: 16, ...style,
    }}>
      {title && <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>{title}</h2>}
      {children}
    </div>
  )
}

function Tile({ label, children }) {
  return (
    <div style={{ flex: '1 1 140px', background: '#f6f7fa', borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginTop: 4 }}>{children}</div>
    </div>
  )
}

function GradeBadge({ grade }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 12, fontWeight: 600, borderRadius: 4, padding: '2px 8px',
      color: GRADE_COLORS[grade] ?? '#1a6ecc', background: GRADE_BG[grade] ?? '#e8f0fc',
    }}>
      {gradeLabel(grade)}
    </span>
  )
}

function Summary({ data }) {
  const { student, results, trend } = data
  const trendStyle = TREND_STYLE[trend]
  const latest = results.slice(-3).reverse()
  return (
    <Section title="Samenvatting">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Tile label="Route">
          <span style={{ color: ROUTE_COLORS[student.route] ?? NAVY, textTransform: 'capitalize' }}>{student.route}</span>
        </Tile>
        <Tile label="Toetsen gemaakt">{results.length}</Tile>
        <Tile label="Ontwikkeling">
          {trendStyle ? (
            <span style={{ color: trendStyle.color }}>{trendStyle.symbol} {trendLabel(trend)}</span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>{trendLabel(trend)}</span>
          )}
        </Tile>
      </div>
      {latest.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Laatste beoordelingen</div>
          {latest.map(r => (
            <div key={r.session_id} style={{
              display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0',
              borderTop: '1px solid #eef0f4', fontSize: 14,
            }}>
              <span style={{ flex: 1 }}>
                <strong>{r.test_name}</strong>
                <span style={{ color: MUTED, fontSize: 12, marginLeft: 8 }}>{formatDate(r.date)}</span>
              </span>
              <span style={{ color: MUTED, fontSize: 13 }}>{resultValue(r)}</span>
              {r.grade && <GradeBadge grade={r.grade} />}
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function OpenWork({ items }) {
  const anyOpen = items.some(i => i.status === 'open')
  return (
    <Section
      title="Openstaand werk"
      style={{
        background: anyOpen ? '#fff3e0' : '#f6f7fa',
        border: `1px solid ${anyOpen ? '#f0b866' : '#e0e3ea'}`,
        borderLeft: `5px solid ${anyOpen ? '#e07820' : '#c5cad3'}`,
      }}
    >
      {items.length === 0 ? (
        <div style={{ fontSize: 14, color: '#15803d', fontWeight: 600 }}>Geen openstaand werk</div>
      ) : (
        items.map(item => {
          const lapsed = item.status === 'vervallen'
          return (
            <div key={`${item.session_id}-${item.kind}`} style={{
              display: 'flex', alignItems: 'baseline', gap: 10, padding: '4px 0', fontSize: 14,
              color: lapsed ? MUTED : '#7a3d00',
            }}>
              <span style={{ flex: 1 }}>
                <strong style={{ textDecoration: lapsed ? 'line-through' : 'none' }}>{item.test_name}</strong>
                <span style={{ marginLeft: 8 }}>{openWorkLabel(item)}</span>
                <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.8 }}>{formatDate(item.date)}</span>
              </span>
              {lapsed && (
                <span style={{ fontSize: 12, fontWeight: 600, borderRadius: 4, padding: '2px 8px', background: '#e5e7eb', color: '#4b5563' }}>
                  Vervallen
                </span>
              )}
            </div>
          )
        })
      )}
    </Section>
  )
}

function StatementList({ title, color, bg, items, empty }) {
  return (
    <div style={{ flex: '1 1 260px', background: bg, borderRadius: 6, padding: '12px 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED }}>{empty}</div>
      ) : (
        items.map(text => <div key={text} style={{ fontSize: 14, color: '#1f2937', padding: '2px 0' }}>{text}</div>)
      )}
    </div>
  )
}

function ScoreRow({ label, row }) {
  const hasData = row.pct !== null && row.pct !== undefined
  const barColor = row.pct >= 75 ? '#34a853' : row.pct >= 55 ? '#f0a030' : '#e05a4f'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0', fontSize: 14 }}>
      <div style={{ width: 200, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, position: 'relative', height: 14, background: '#eef0f4', borderRadius: 7 }}>
        {hasData && (
          <div style={{ width: `${row.pct}%`, height: '100%', background: barColor, borderRadius: 7 }} />
        )}
        {hasData && row.route_avg !== null && row.route_avg !== undefined && (
          <div
            title="Gemiddelde van dezelfde route"
            style={{ position: 'absolute', top: -4, left: `calc(${row.route_avg}% - 1px)`, width: 3, height: 22, background: NAVY, borderRadius: 1 }}
          />
        )}
      </div>
      <div style={{ width: 48, textAlign: 'right', fontWeight: 700 }}>{hasData ? `${row.pct}%` : '—'}</div>
      <div style={{ width: 120, fontSize: 12, color: MUTED }}>
        {hasData && row.route_avg !== null && row.route_avg !== undefined ? `route: ${row.route_avg}%` : ''}
      </div>
    </div>
  )
}

function Scores({ data }) {
  const rows = [...data.domain_scores, ...data.level_scores]
  const anyAvg = rows.some(r => r.route_avg !== null && r.route_avg !== undefined)
  return (
    <Section title="Resultaten per domein en niveaulaag">
      <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>Domein</div>
      {data.domain_scores.map(r => <ScoreRow key={r.domain} label={r.domain} row={r} />)}
      <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 }}>Niveaulaag</div>
      {data.level_scores.map(r => <ScoreRow key={r.level} label={pyramidLabel(r.level)} row={r} />)}
      {anyAvg && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 10 }}>
          <span style={{ display: 'inline-block', width: 3, height: 12, background: NAVY, verticalAlign: 'middle', marginRight: 6 }} />
          Het streepje is het gemiddelde van leerlingen met dezelfde route in deze klas.
        </div>
      )}
    </Section>
  )
}

function GoalList({ title, color, bg, mark, goals, empty }) {
  return (
    <div style={{ flex: '1 1 260px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>{title} ({goals.length})</div>
      {goals.length === 0 ? (
        <div style={{ fontSize: 13, color: MUTED }}>{empty}</div>
      ) : (
        goals.map(g => (
          <div key={g.name} style={{ background: bg, borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontSize: 14 }}>
            <span style={{ fontWeight: 700, color, marginRight: 6 }}>{mark}</span>
            <strong><MathText text={g.name} /></strong>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {g.test_name}{g.earlier_failed ? ' · eerder niet behaald' : ''}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function NotesText({ label, value }) {
  if (!value.trim()) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', color: '#1f2937' }}>{value}</div>
    </div>
  )
}

// `pdf`: the version for the PDF export. Differences: a header with the name, no empty
// "Openstaand werk" block, and the notes as plain text instead of input fields.
function ReportBody({ data, notes, pdf = false, notesEditor = null }) {
  const { student, results } = data
  const { good, attention } = statements(data)
  const { achieved, notAchieved } = splitGoals(data.goals)
  const hasResults = results.length > 0
  const hasNotes = notes.gesprekspunten.trim() || notes.afspraken.trim()

  return (
    <>
      {pdf && (
        <div data-pdf-block style={{ marginBottom: 16, borderBottom: `3px solid ${NAVY}`, paddingBottom: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: NAVY }}>Leerlingrapport: {student.name}</div>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Klas {student.class_name} · route {student.route} · {new Date().toLocaleDateString('nl-NL')}
          </div>
        </div>
      )}

      <Summary data={data} />

      {showOpenWork(data.open_work, pdf) && <OpenWork items={data.open_work} />}

      {!hasResults ? (
        <Section>
          <div style={{ fontSize: 14, color: MUTED }}>Nog geen beoordeelde toetsen.</div>
        </Section>
      ) : (
        <>
          <Section title="In het kort">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <StatementList
                title="Gaat goed" color="#15803d" bg="#f0fdf4" items={good}
                empty="Nog geen onderdeel met 75% of meer."
              />
              <StatementList
                title="Aandachtspunten" color="#b45309" bg="#fff7ed" items={attention}
                empty="Geen onderdeel onder de 55%."
              />
            </div>
          </Section>

          <Scores data={data} />

          {data.goals.length > 0 && (
            <Section title="Leerdoelen">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                <GoalList
                  title="Behaald" color="#15803d" bg="#f0fdf4" mark="✓" goals={achieved}
                  empty="Nog geen leerdoelen behaald."
                />
                <GoalList
                  title="Nog niet behaald" color="#b91c1c" bg="#fef2f2" mark="✗" goals={notAchieved}
                  empty="Alle getoetste leerdoelen zijn behaald."
                />
              </div>
            </Section>
          )}
        </>
      )}

      {pdf ? (
        hasNotes && (
          <Section title="Notities">
            <NotesText label="Gesprekspunten" value={notes.gesprekspunten} />
            <NotesText label="Afspraken" value={notes.afspraken} />
          </Section>
        )
      ) : notesEditor}
    </>
  )
}

const SAVE_DELAY_MS = 800

export default function Leerlingrapport() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [classStudents, setClassStudents] = useState([])
  const [notes, setNotes] = useState({ gesprekspunten: '', afspraken: '' })
  const [saveState, setSaveState] = useState('')   // '' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const pdfRef = useRef(null)
  // Notes typed but not yet saved: { id, notes }. Kept with the student id they belong
  // to, so switching student never saves them under the next student.
  const pending = useRef(null)
  const timer = useRef(null)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const p = pending.current
    if (!p) return Promise.resolve()
    pending.current = null
    setSaveState('saving')
    return api.saveStudentNotes(p.id, p.notes)
      .then(() => setSaveState('saved'))
      .catch(() => { pending.current = pending.current ?? p; setSaveState('error') })
  }, [])

  useEffect(() => {
    // `alive`: when switching student quickly, a slow earlier answer must not win
    let alive = true
    setSaveState('')
    api.getLeerlingrapport(id)
      .then(d => {
        if (!alive) return
        setData(d)
        setNotes(d.notes)
        setError('')
      })
      .catch(() => { if (alive) setError('Fout bij laden van het leerlingrapport.') })
    // Leaving this student (or the page): save what was typed
    return () => { alive = false; flush() }
  }, [id, flush])

  // Closing the tab while a save is still waiting
  useEffect(() => {
    const onHide = () => { flush() }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flush])

  const className = data?.student.class_name
  useEffect(() => {
    if (!className) return
    let alive = true
    api.getStudents(className).then(l => { if (alive) setClassStudents(l) }).catch(() => {})
    return () => { alive = false }
  }, [className])

  function changeNote(field, value) {
    const next = { ...notes, [field]: value }
    setNotes(next)
    pending.current = { id: data.student.id, notes: next }
    setSaveState('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
  }

  // The PDF version is rendered off-screen at a fixed width, so the A4 looks the same
  // on every screen size.
  useEffect(() => {
    if (!exporting) return
    let cancelled = false
    const run = async () => {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      try {
        if (!cancelled && pdfRef.current) {
          await exportRubricsPDF([pdfRef.current], safeFilename(`Leerlingrapport - ${data.student.name}.pdf`))
        }
      } catch {
        setError('PDF maken mislukt.')
      } finally {
        if (!cancelled) setExporting(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [exporting]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only show data of the student in the address bar (not the previous one while loading)
  if (!data || String(data.student.id) !== String(id)) return <div className="page">{error || 'Laden...'}</div>

  const { student } = data

  const notesEditor = (
    <Section title="Notities">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {[
          ['gesprekspunten', 'Gesprekspunten', 'Wat wil je bespreken?'],
          ['afspraken', 'Afspraken', 'Wat spreek je af met ouders en leerling?'],
        ].map(([field, label, placeholder]) => (
          <label key={field} style={{ flex: '1 1 280px', display: 'block' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
            <textarea
              value={notes[field]}
              onChange={e => changeNote(field, e.target.value)}
              onBlur={flush}
              placeholder={placeholder}
              rows={5}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }}
            />
          </label>
        ))}
      </div>
      <div style={{ fontSize: 12, color: saveState === 'error' ? '#c0392b' : MUTED, marginTop: 6, minHeight: 16 }}>
        {saveState === 'saving' && 'Opslaan...'}
        {saveState === 'saved' && 'Opgeslagen'}
        {saveState === 'error' && 'Opslaan mislukt. Controleer de verbinding; je tekst staat nog hier.'}
      </div>
    </Section>
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Leerlingrapport: <StudentSwitcher student={student} students={classStudents} page="leerlingrapport" /></h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <RouteBadge route={student.route} />
            <span className="text-muted">Klas {student.class_name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => flush().then(() => setExporting(true))} disabled={exporting}>
            {exporting ? 'Exporteren...' : 'Exporteer PDF'}
          </button>
          <Link to={`/students/${id}/progress`} replace className="btn btn-secondary">Voortgang</Link>
          <Link to={`/students/${id}/report`} replace className="btn btn-secondary">Rapport & Radar</Link>
          <BackButton fallback="/students" />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <ReportBody data={data} notes={notes} notesEditor={notesEditor} />

      {exporting && (
        <div style={{ position: 'absolute', left: -10000, top: 0 }} aria-hidden="true">
          <div
            ref={pdfRef}
            data-pdf-continuation={`Leerlingrapport · ${student.name}`}
            style={{ width: 794, padding: '36px 40px', background: '#fff', boxSizing: 'border-box' }}
          >
            <ReportBody data={data} notes={notes} pdf />
          </div>
        </div>
      )}
    </div>
  )
}
