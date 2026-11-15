import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import BackButton from '../components/BackButton.jsx'
import RouteBadge from '../components/RouteBadge.jsx'
import OpdrachtRubric from '../components/OpdrachtRubric.jsx'
import { LevelChip } from '../components/OpdrachtCriterion.jsx'
import { gradeLabel } from '../utils/gradingLogic.js'
import { exportRubricsPDF, exportRubricsZip } from '../utils/exportRubric.js'
import { sectionsOf, partOf, applies, PART_LABELS } from '../utils/opdracht.js'
import MathText from '../components/MathText.jsx'

const GRADE_RANK = { expert: 3, beheerst: 2, in_ontwikkeling: 1 }
const GRADE_SHORT = { expert: 'E', beheerst: 'B', in_ontwikkeling: 'IO' }
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

const safeFilename = name => name.replace(/[\\/:*?"<>|]/g, '-')

function PartStatus({ part }) {
  if (!part || part.status === 'nvt') return <span className="text-muted">n.v.t.</span>
  const map = {
    none: { text: 'niet ingevoerd', color: '#9ca3af' },
    missing: { text: 'niet ingeleverd', color: '#b91c1c' },
    open: { text: `bezig (${part.graded}/${part.total})`, color: '#c07000' },
    complete: { text: '✓', color: '#15803d' },
  }
  const m = map[part.status] || { text: part.status, color: '#555' }
  return <span style={{ color: m.color, fontWeight: 600, fontSize: 13 }}>{m.text}</span>
}

function GradeBadge({ grade }) {
  if (!grade) return <span className="text-muted">—</span>
  return (
    <span title={gradeLabel(grade)} style={{ fontSize: 12, fontWeight: 700, borderRadius: 4, padding: '2px 8px', background: GRADE_BG[grade], color: GRADE_COLORS[grade] }}>
      {GRADE_SHORT[grade]}
    </span>
  )
}

function ExportMenuItem({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function ResultsView({ data, onEdit }) {
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const hasGroup = data.parts_present.includes('groep')
  const hasInd = data.parts_present.includes('individueel')

  const rows = data.students.map((s, i) => ({ student: s, order: i, summary: data.summaries[String(s.id)] }))
  const value = {
    name: r => r.student.name,
    points: r => (r.summary?.complete ? r.summary.points : null),
    result: r => (r.summary?.grade ? GRADE_RANK[r.summary.grade] * 1000 + r.summary.points : null),
  }[sort.key]
  const sorted = [...rows].sort((a, b) => {
    const va = value(a), vb = value(b)
    if (va == null || vb == null) return va == null && vb == null ? a.order - b.order : va == null ? 1 : -1
    const cmp = typeof va === 'string' ? va.localeCompare(vb, 'nl') : va - vb
    return cmp * sort.dir || a.order - b.order
  })
  const toggle = key => setSort(s => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === 'name' ? 1 : -1 }))
  const header = (key, label, align = 'left') => (
    <th onClick={() => toggle(key)} style={{ cursor: 'pointer', userSelect: 'none', textAlign: align, whiteSpace: 'nowrap' }} title="Klik om te sorteren">
      {label}<span style={{ marginLeft: 4, opacity: sort.key === key ? 1 : 0.25 }}>{sort.key === key && sort.dir === -1 ? '▼' : '▲'}</span>
    </th>
  )

  const counts = { expert: 0, beheerst: 0, in_ontwikkeling: 0 }
  rows.forEach(r => { if (r.summary?.grade) counts[r.summary.grade]++ })

  return (
    <div className="card">
      <div style={{ marginBottom: 14, fontSize: 14, fontWeight: 600 }}>
        {counts.expert} Expert · {counts.beheerst} Beheerst · {counts.in_ontwikkeling} In ontwikkeling
        {data.inhalers.length > 0 && <span className="text-muted" style={{ fontWeight: 400 }}> · {data.inhalers.length} bij Inhalers</span>}
      </div>
      <table>
        <thead>
          <tr>
            {header('name', 'Naam')}
            <th>Route</th>
            {hasGroup && <th>Gezamenlijk</th>}
            {hasInd && <th>Individueel</th>}
            {header('points', 'Punten', 'right')}
            {header('result', 'Resultaat', 'center')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.student.id} onClick={() => onEdit(r.student.id)} style={{ cursor: 'pointer' }} title="Klik om te bewerken">
              <td style={{ fontWeight: 600 }}>{r.student.name}</td>
              <td><RouteBadge route={r.student.route} /></td>
              {hasGroup && <td><PartStatus part={r.summary?.parts?.groep} /></td>}
              {hasInd && <td><PartStatus part={r.summary?.parts?.individueel} /></td>}
              <td style={{ textAlign: 'right' }}>
                {r.summary?.max > 0 ? <>{r.summary.points}<span className="text-muted">/{r.summary.max}</span></> : '—'}
              </td>
              <td style={{ textAlign: 'center' }}>
                <GradeBadge grade={r.summary?.grade} />
                {r.summary?.feedback_failed?.length > 0 && (
                  <span title={`Niet laten zien bij: ${r.summary.feedback_failed.join(', ')}`} style={{ marginLeft: 4, fontSize: 11, color: '#991b1b' }}>!</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClassView({ data }) {
  const colStyle = { textAlign: 'center', minWidth: 70, fontSize: 13 }
  const students = data.students.filter(s => {
    const parts = data.summaries[String(s.id)]?.parts || {}
    return Object.values(parts).some(p => p.status === 'open' || p.status === 'complete')
  })
  if (!students.length) return <div className="card text-muted">Nog niemand beoordeeld.</div>
  return (
    <div className="card">
      <div className="heatmap">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 200, textAlign: 'left' }}>Onderdeel</th>
              {students.map(s => (
                <th key={s.id} style={colStyle}>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <RouteBadge route={s.route} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionsOf(data.test).map(sec => (
              [
                <tr key={sec.id}>
                  <td colSpan={students.length + 1} style={{ background: '#f8f9fb', fontWeight: 700, color: '#1e3a5f', textAlign: 'left' }}>
                    {sec.name} <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>· {partOf(sec) === 'groep' ? 'gezamenlijk' : 'individueel'}</span>
                  </td>
                </tr>,
                ...(sec.criteria || []).map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}><MathText text={c.name} /></td>
                    {students.map(s => {
                      const summ = data.summaries[String(s.id)]
                      if (!applies(c, s.route)) return <td key={s.id} style={colStyle}><span style={{ color: '#bbb', fontSize: 12 }}>n.v.t.</span></td>
                      const part = summ?.parts?.[partOf(sec)]
                      if (part?.status === 'missing' || part?.status === 'none') return <td key={s.id} style={colStyle}><span style={{ color: '#bbb', fontSize: 12 }}>—</span></td>
                      const eff = summ?.effective?.[c.id]
                      return (
                        <td key={s.id} style={colStyle} title={eff?.comment || ''}>
                          <LevelChip level={eff?.level} />
                          {eff?.source === 'override' && <span title="Aangepast voor deze leerling" style={{ color: '#7c3aed', marginLeft: 2 }}>*</span>}
                        </td>
                      )
                    })}
                  </tr>
                )),
              ]
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #c9d1de' }}>
              <td style={{ fontWeight: 700 }}>Totaal</td>
              {students.map(s => {
                const summ = data.summaries[String(s.id)]
                return (
                  <td key={s.id} style={{ ...colStyle, fontWeight: 600 }}>
                    <div>{summ.points}<span className="text-muted">/{summ.max}</span></div>
                    <div style={{ marginTop: 3 }}><GradeBadge grade={summ.grade} /></div>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        N = Niet laten zien · V = Voldoende laten zien · G = Goed laten zien · * = aangepast voor één groepslid
      </div>
    </div>
  )
}

export default function OpdrachtReport({ sessionId }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setViewState] = useState(searchParams.get('view') || 'student')
  const [selectedId, setSelectedId] = useState(null)
  const [exportTarget, setExportTarget] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const refs = useRef({})
  const menuRef = useRef(null)

  function updateParams(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(changes)) next.set(k, String(v))
    setSearchParams(next, { replace: true })
  }
  const setView = v => { setViewState(v); updateParams({ view: v }) }
  const selectStudent = sid => { setSelectedId(sid); updateParams({ student: sid }) }
  const onEdit = sid => navigate(`/sessions/${sessionId}/grade?student=${sid}&from=report`)

  useEffect(() => {
    api.getOpdrachtSession(sessionId)
      .then(d => {
        setData(d)
        const param = searchParams.get('student') ? parseInt(searchParams.get('student')) : null
        const graded = d.students.filter(s => d.summaries[String(s.id)]?.max > 0)
        setSelectedId(param && d.students.some(s => s.id === param) ? param : (graded[0] ?? d.students[0])?.id ?? null)
      })
      .catch(() => setError('Fout bij laden van rapport.'))
  }, [sessionId])

  useEffect(() => {
    if (!menuOpen) return
    const close = e => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  // Students that have something to report on
  const reportable = useMemo(
    () => (data ? data.students.filter(s => data.summaries[String(s.id)]?.max > 0) : []),
    [data]
  )

  useEffect(() => {
    if (!exportTarget || !data) return
    const timer = setTimeout(async () => {
      const onProgress = (done, total) => setExportProgress({ done, total })
      onProgress(0, exportTarget.studentIds.length)
      try {
        const testName = data.test.name
        const className = data.session.class_name
        if (exportTarget.mode === 'zip') {
          const pairs = exportTarget.studentIds.map(sid => ({
            element: refs.current[sid],
            name: safeFilename(`rubric - ${data.students.find(s => s.id === sid)?.name ?? sid} - ${testName}.pdf`),
          }))
          await exportRubricsZip(pairs, safeFilename(`rubrics - ${className} - ${testName}.zip`), onProgress)
        } else {
          const elements = exportTarget.studentIds.map(sid => refs.current[sid])
          const filename = exportTarget.mode === 'student'
            ? `rubric - ${data.students.find(s => s.id === exportTarget.studentIds[0])?.name ?? 'leerling'} - ${testName}.pdf`
            : `rubrics - ${className} - ${testName}.pdf`
          await exportRubricsPDF(elements, safeFilename(filename), onProgress)
        }
      } finally {
        setExportTarget(null)
        setExportProgress(null)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [exportTarget])

  function startExport(mode) {
    setMenuOpen(false)
    refs.current = {}
    const studentIds = mode === 'student' ? [selectedId] : reportable.map(s => s.id)
    setExportTarget({ mode, studentIds })
  }

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  const student = data.students.find(s => s.id === selectedId)
  const summary = student ? data.summaries[String(student.id)] : null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{data.test.name}</h1>
          <div className="text-muted" style={{ marginTop: 4 }}>
            Grote opdracht · Klas {data.session.class_name}
            {data.session.created_at && ` · ${new Date(data.session.created_at).toLocaleDateString('nl-NL')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to={`/sessions/${sessionId}/grade`} className="btn btn-secondary">Nakijken</Link>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button className="btn btn-primary" onClick={() => setMenuOpen(o => !o)} disabled={!!exportTarget || !reportable.length}>
              {exportProgress ? `Bezig: ${exportProgress.done + 1} van ${exportProgress.total}` : 'Rubric exporteren ▾'}
            </button>
            {menuOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 10, background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', minWidth: 260, padding: 4 }}>
                {view === 'student' && student && summary?.max > 0 && (
                  <ExportMenuItem onClick={() => startExport('student')}>Huidige leerling ({student.name})</ExportMenuItem>
                )}
                <ExportMenuItem onClick={() => startExport('class')}>Hele klas, in 1 PDF</ExportMenuItem>
                <ExportMenuItem onClick={() => startExport('zip')}>Hele klas, PDF per leerling (ZIP)</ExportMenuItem>
              </div>
            )}
          </div>
          <BackButton fallback="/reports" />
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['student', 'Per leerling'], ['class', 'Klassenoverzicht'], ['results', 'Resultaten']].map(([k, label]) => (
          <button key={k} className={`btn ${view === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {data.students.length === 0 ? (
        <div className="card text-muted">Geen leerlingen gevonden voor klas {data.session.class_name}.</div>
      ) : view === 'results' ? (
        <ResultsView data={data} onEdit={onEdit} />
      ) : view === 'class' ? (
        <ClassView data={data} />
      ) : (
        <div className="card">
          <div className="form-row" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Leerling</label>
              <select value={selectedId || ''} onChange={e => selectStudent(Number(e.target.value))} style={{ minWidth: 220 }}>
                {data.students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.route})</option>)}
              </select>
            </div>
            {student && <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={() => onEdit(student.id)}>Bewerken</button>}
          </div>
          {student && (summary?.max > 0 ? (
            <div style={{ overflowX: 'auto', border: '1px solid #eef0f4', borderRadius: 6 }}>
              <OpdrachtRubric student={student} test={data.test} session={data.session} summary={summary} />
            </div>
          ) : (
            <p className="text-muted">
              {student.name} is nog niet beoordeeld
              {summary?.inhaler_parts?.length ? ` (inhaler: ${summary.inhaler_parts.map(p => PART_LABELS[p].toLowerCase()).join(', ')})` : ''}.
            </p>
          ))}
        </div>
      )}

      {exportTarget && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, zIndex: -1 }}>
          {exportTarget.studentIds.map(sid => {
            const s = data.students.find(x => x.id === sid)
            if (!s) return null
            return (
              <div key={sid} ref={el => { refs.current[sid] = el }}>
                <OpdrachtRubric student={s} test={data.test} session={data.session} summary={data.summaries[String(sid)]} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
