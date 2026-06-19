import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import { DOMAINS, LEVELS, LEVEL_LABELS, STUDENT_COLORS } from '../constants.js'
import { exportPDF } from '../utils/exportPDF.js'

const DOMAIN_COLORS = ['#1e3a5f', '#059669', '#dc2626', '#7c3aed']
const LEVEL_COLORS  = ['#1a6ecc', '#e07820', '#a08b00']

function buildLineData(sessions, key) {
  return sessions.map(sess => {
    const row = { label: sess.test_name }
    const src = key === 'domain' ? sess.by_domain : sess.by_level
    const keys = key === 'domain' ? DOMAINS : LEVELS
    keys.forEach(k => {
      row[k] = src[k]?.pct ?? null
    })
    return row
  })
}

function ProgressTab({ sessions, studentId }) {
  const navigate = useNavigate()
  const [sub, setSub] = useState('domain')

  if (sessions.length === 0) {
    return <p className="text-muted">Geen sessiedata beschikbaar.</p>
  }

  const chartData = buildLineData(sessions, sub)
  const keys  = sub === 'domain' ? DOMAINS : LEVELS
  const colors = sub === 'domain' ? DOMAIN_COLORS : LEVEL_COLORS
  const labels = sub === 'domain' ? DOMAINS : LEVELS.map(l => LEVEL_LABELS[l])

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`btn btn-sm ${sub === 'domain' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSub('domain')}
        >
          Per domein
        </button>
        <button
          className={`btn btn-sm ${sub === 'level' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSub('level')}
        >
          Per niveaulaag
        </button>
      </div>

      {sessions.length === 1 && (
        <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>
          Slechts één sessie — lijndiagram niet beschikbaar, punten weergegeven.
        </p>
      )}

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e0e3ea" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(val, name, props) => {
            const idx = keys.indexOf(name)
            const displayName = idx >= 0 ? (sub === 'level' ? LEVEL_LABELS[name] : name) : name
            return [val === null ? 'Geen gegevens' : `${val}%`, displayName]
          }} />
          <Legend formatter={name => sub === 'level' ? LEVEL_LABELS[name] || name : name} />
          {keys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls={false}
              name={k}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Session table */}
      <div style={{ marginTop: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Sessie</th>
              {(sub === 'domain' ? DOMAINS : LEVELS).map(k => (
                <th key={k} style={{ textAlign: 'center' }}>
                  {sub === 'level' ? LEVEL_LABELS[k] : k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.map(sess => (
              <tr key={sess.session_id} style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/reports/session/${sess.session_id}?student=${studentId}`)}
              >
                <td>
                  <div style={{ fontWeight: 500, color: '#1a6ecc', textDecoration: 'underline' }}>{sess.test_name}</div>
                  <div className="text-muted">{new Date(sess.created_at).toLocaleDateString('nl-NL')}</div>
                </td>
                {(sub === 'domain' ? DOMAINS : LEVELS).map(k => {
                  const src = sub === 'domain' ? sess.by_domain : sess.by_level
                  const v = src[k]
                  return (
                    <td key={k} style={{ textAlign: 'center' }}>
                      {v ? (
                        <>
                          <strong>{v.pct !== null ? `${v.pct}%` : '—'}</strong>
                          <div className="text-muted" style={{ fontSize: 12 }}>{v.scored}/{v.max}</div>
                        </>
                      ) : (
                        <span className="text-muted">n.v.t.</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function buildRadarData(overlays, keyField, allKeys, getLabelFn) {
  return allKeys.map(k => {
    const row = { subject: getLabelFn(k) }
    overlays.forEach(({ student, data }) => {
      const list = keyField === 'domain' ? data.domain_scores : data.level_scores
      const match = list.find(d => (keyField === 'domain' ? d.domain : d.level) === k)
      row[`v_${student.id}`] = match?.pct ?? 0
      row[`_raw_${student.id}`] = match?.pct  // null = no data
    })
    return row
  })
}

function RadarPanel({ overlays, type }) {
  const keys   = type === 'domain' ? DOMAINS : LEVELS
  const getLbl = type === 'domain' ? k => k : k => LEVEL_LABELS[k] || k

  if (overlays.length === 0) return null

  // Check if any student has any data
  const hasData = overlays.some(({ data }) => {
    const list = type === 'domain' ? data.domain_scores : data.level_scores
    return list.some(item => item.pct !== null)
  })

  if (!hasData) {
    return <p className="text-muted">Geen gegevens beschikbaar voor dit diagram.</p>
  }

  const chartData = buildRadarData(overlays, type, keys, getLbl)

  return (
    <ResponsiveContainer width="100%" height={320}>
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickCount={5} />
        {overlays.map(({ student }, i) => (
          <Radar
            key={student.id}
            name={student.name}
            dataKey={`v_${student.id}`}
            stroke={STUDENT_COLORS[i % STUDENT_COLORS.length]}
            fill={STUDENT_COLORS[i % STUDENT_COLORS.length]}
            fillOpacity={0.15}
          />
        ))}
        <Tooltip
          formatter={(value, name, props) => {
            const overlay = overlays.find(o => o.student.name === name)
            if (!overlay) return [`${value}%`, name]
            const subject = props.payload?.subject
            const list = type === 'domain' ? overlay.data.domain_scores : overlay.data.level_scores
            const match = list.find(d => getLbl(type === 'domain' ? d.domain : d.level) === subject)
            return [match?.pct === null ? 'Geen gegevens' : `${match?.pct}%`, name]
          }}
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  )
}

function RadarTab({ primaryStudent, primaryRadar, classStudents }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [radarCache, setRadarCache] = useState({})

  const toggleStudent = useCallback(async (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(x => x !== id))
      return
    }
    if (!radarCache[id]) {
      try {
        const data = await api.getStudentRadar(id)
        setRadarCache(prev => ({ ...prev, [id]: data }))
      } catch {
        return
      }
    }
    setSelectedIds(prev => [...prev, id])
  }, [selectedIds, radarCache])

  const overlays = [
    { student: primaryStudent, data: primaryRadar },
    ...selectedIds.map(id => radarCache[id]).filter(Boolean).map(d => ({ student: d.student, data: d })),
  ]

  const others = classStudents.filter(s => s.id !== primaryStudent.id)

  return (
    <>
      {others.length > 0 && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Vergelijk met andere leerlingen uit {primaryStudent.class_name}:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {others.map(s => (
              <button
                key={s.id}
                className={`btn btn-sm ${selectedIds.includes(s.id) ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => toggleStudent(s.id)}
              >
                {s.name}
                {selectedIds.includes(s.id) && ' ✓'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1e3a5f' }}>
            Radar — Domein
          </h3>
          <RadarPanel overlays={overlays} type="domain" />
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1e3a5f' }}>
            Radar — Niveaulaag
          </h3>
          <RadarPanel overlays={overlays} type="level" />
        </div>
      </div>
    </>
  )
}

export default function StudentReport() {
  const { id } = useParams()
  const [timeline, setTimeline] = useState(null)
  const [radar, setRadar] = useState(null)
  const [classStudents, setClassStudents] = useState([])
  const [tab, setTab] = useState('progress')
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    Promise.all([
      api.getStudentTimeline(id),
      api.getStudentRadar(id),
    ])
      .then(([tl, rd]) => {
        setTimeline(tl)
        setRadar(rd)
        return api.getStudents(tl.student.class_name)
      })
      .then(setClassStudents)
      .catch(() => setError('Fout bij laden van rapport.'))
  }, [id])

  async function handleExport() {
    if (!reportRef.current || !timeline) return
    setExporting(true)
    try {
      await exportPDF(
        reportRef.current,
        `voortgang-${timeline.student.name}.pdf`
      )
    } finally {
      setExporting(false)
    }
  }

  if (!timeline || !radar) return <div className="page">{error || 'Laden...'}</div>

  const { student, sessions } = timeline

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Rapport — {student.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <RouteBadge route={student.route} />
            <span className="text-muted">Klas {student.class_name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Exporteren...' : 'Exporteer PDF'}
          </button>
          <Link to={`/students/${id}/progress`} className="btn btn-secondary">← Voortgang</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className={`btn ${tab === 'progress' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('progress')}
        >
          Voortgang over tijd
        </button>
        <button
          className={`btn ${tab === 'radar' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('radar')}
        >
          Radardiagram
        </button>
      </div>

      <div ref={reportRef}>
        {tab === 'progress' ? (
          <div className="card">
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>Voortgang over tijd</h2>
            <ProgressTab sessions={sessions} studentId={id} />
          </div>
        ) : (
          <RadarTab
            primaryStudent={student}
            primaryRadar={radar}
            classStudents={classStudents}
          />
        )}
      </div>
    </div>
  )
}
