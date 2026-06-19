import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import { LEVEL_LABELS } from '../constants.js'
import { exportPDF } from '../utils/exportPDF.js'

function ScoreCell({ sc, maxScore }) {
  if (!sc) return <span className="text-muted">—</span>
  if (sc.excluded) return <span style={{ color: '#aaa', fontSize: 12 }}>n.v.t.</span>
  if (sc.points === null || sc.points === undefined) return <span className="text-muted">—</span>
  return <>{sc.points}<span className="text-muted">/{maxScore}</span></>
}

function StudentView({ data, selectedId, setSelectedId }) {
  const student = data.students.find(s => s.id === selectedId)

  let totalScored = 0, totalMax = 0
  if (student) {
    data.questions.forEach(q => {
      const sc = data.scores[`${student.id}|${q.id}`]
      if (sc && !sc.excluded && sc.points !== null && sc.points !== undefined) {
        totalScored += sc.points
        totalMax += q.max_score
      }
    })
  }

  return (
    <div className="card">
      <div className="form-row" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>Leerling</label>
          <select
            value={selectedId || ''}
            onChange={e => setSelectedId(Number(e.target.value))}
            style={{ minWidth: 200 }}
          >
            {data.students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.route})</option>
            ))}
          </select>
        </div>
        {student && <div style={{ alignSelf: 'flex-end' }}><RouteBadge route={student.route} /></div>}
        {totalMax > 0 && (
          <div style={{ alignSelf: 'flex-end', fontSize: 14 }}>
            Totaal: <strong>{totalScored}/{totalMax}</strong>
            <span className="text-muted" style={{ marginLeft: 6 }}>
              ({Math.round(totalScored / totalMax * 100)}%)
            </span>
          </div>
        )}
      </div>

      {student && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Vraag</th>
              <th>Domein</th>
              <th>Niveau</th>
              <th style={{ textAlign: 'center', width: 90 }}>Score / Max</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q, i) => {
              const sc = data.scores[`${student.id}|${q.id}`]
              return (
                <tr key={q.id}>
                  <td style={{ color: '#888' }}>{i + 1}</td>
                  <td>{q.description}</td>
                  <td>{q.domain || '—'}</td>
                  <td>
                    <span className={`level-pill level-${q.pyramid_level}`}>
                      {LEVEL_LABELS[q.pyramid_level] || q.pyramid_level}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 500 }}>
                    <ScoreCell sc={sc} maxScore={q.max_score} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function ClassView({ data }) {
  const colStyle = { textAlign: 'center', minWidth: 76, fontSize: 13 }

  return (
    <div className="card">
      <div className="heatmap">
        <table>
          <thead>
            <tr>
              <th style={{ minWidth: 220, textAlign: 'left' }}>Vraag</th>
              {data.students.map(s => (
                <th key={s.id} style={colStyle}>
                  <div style={{ fontWeight: 700 }}>{s.name}</div>
                  <RouteBadge route={s.route} />
                </th>
              ))}
              <th style={{ ...colStyle, background: '#eef2f8', fontWeight: 700 }}>Gem.</th>
            </tr>
          </thead>
          <tbody>
            {data.questions.map((q, i) => {
              const avg = data.class_averages[String(q.id)]
              return (
                <tr key={q.id}>
                  <td>
                    <span style={{ color: '#888', marginRight: 6, fontSize: 12 }}>{i + 1}.</span>
                    <span style={{ fontWeight: 500 }}>{q.description}</span>
                    {(q.domain || q.pyramid_level) && (
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {q.domain}{q.domain && q.pyramid_level ? ' · ' : ''}
                        {LEVEL_LABELS[q.pyramid_level] || q.pyramid_level}
                      </div>
                    )}
                  </td>
                  {data.students.map(s => (
                    <td key={s.id} style={colStyle}>
                      <ScoreCell sc={data.scores[`${s.id}|${q.id}`]} maxScore={q.max_score} />
                    </td>
                  ))}
                  <td style={{ ...colStyle, background: '#eef2f8', fontWeight: 600 }}>
                    {avg?.avg_points !== null && avg?.avg_points !== undefined
                      ? `${avg.avg_points}/${q.max_score}`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SessionReport() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('student')
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    api.getSessionReport(id)
      .then(d => {
        setData(d)
        if (d.students.length > 0) setSelectedStudentId(d.students[0].id)
      })
      .catch(() => setError('Fout bij laden van rapport.'))
  }, [id])

  async function handleExport() {
    if (!reportRef.current || !data) return
    setExporting(true)
    try {
      const date = data.session.created_at.slice(0, 10)
      await exportPDF(
        reportRef.current,
        `rapport-${data.test.name}-${data.session.class_name}-${date}.pdf`
      )
    } finally {
      setExporting(false)
    }
  }

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{data.test.name}</h1>
          <div className="text-muted" style={{ marginTop: 4 }}>
            Klas {data.session.class_name} · {new Date(data.session.created_at).toLocaleDateString('nl-NL')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporteren...' : 'Exporteer PDF'}
          </button>
          <Link to="/reports" className="btn btn-secondary">← Terug</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn ${view === 'student' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('student')}
        >
          Per leerling
        </button>
        <button
          className={`btn ${view === 'class' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setView('class')}
        >
          Klassenoverzicht
        </button>
      </div>

      <div ref={reportRef}>
        {data.students.length === 0 ? (
          <div className="card"><p className="text-muted">Geen leerlingen gevonden voor klas {data.session.class_name}.</p></div>
        ) : view === 'student' ? (
          <StudentView
            data={data}
            selectedId={selectedStudentId}
            setSelectedId={setSelectedStudentId}
          />
        ) : (
          <ClassView data={data} />
        )}
      </div>
    </div>
  )
}
