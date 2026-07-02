import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'
import { PYRAMID_LEVELS, pyramidLabel } from '../constants.js'

const LEVELS = PYRAMID_LEVELS.map(l => l.value)

const GRADE_LABELS = { expert: 'Expert', beheerst: 'Beheerst', in_ontwikkeling: 'In Ontwikkeling' }
const GRADE_COLORS = { expert: '#2e7d32', beheerst: '#1a6ecc', in_ontwikkeling: '#c07000' }
const GRADE_BG    = { expert: '#e8f5e9', beheerst: '#e8f0fc', in_ontwikkeling: '#fff3e0' }

function GradeBadge({ grade }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 12, fontWeight: 600, borderRadius: 4,
      padding: '2px 8px', color: GRADE_COLORS[grade], background: GRADE_BG[grade],
    }}>
      {GRADE_LABELS[grade] || grade}
    </span>
  )
}

function pctColor(pct) {
  if (pct === null || pct === undefined) return 'cell-empty'
  if (pct >= 75) return 'cell-green'
  if (pct >= 55) return 'cell-orange'
  return 'cell-red'
}

export default function StudentProgress() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStudentProgress(id)
      .then(setData)
      .catch(() => setError('Fout bij laden van voortgang.'))
  }, [id])

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  const { student, domain_pyramid, sessions, historical_snapshots = [] } = data

  // Build unique domains
  const domains = [...new Set(domain_pyramid.map(r => r.domain))].sort()

  // Build heatmap: domain × level → percentage
  const heatmap = {}
  for (const r of domain_pyramid) {
    heatmap[`${r.domain}|${r.pyramid_level}`] = r
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{student.name}</h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <RouteBadge route={student.route} />
            <span className="text-muted">Klas {student.class_name}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/students/${id}/report`} className="btn btn-secondary">Rapport & Radar</Link>
          <Link to="/students" className="btn btn-secondary">← Terug</Link>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Domain × Pyramid heatmap */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Resultaten per domein en niveaulaag</h2>
        {domains.length === 0 ? (
          <p className="text-muted">Nog geen beoordeelde toetsen.</p>
        ) : (
          <div className="heatmap">
            <table>
              <thead>
                <tr>
                  <th>Domein</th>
                  {LEVELS.map(l => <th key={l}>{pyramidLabel(l)}</th>)}
                </tr>
              </thead>
              <tbody>
                {domains.map(domain => (
                  <tr key={domain}>
                    <td>{domain}</td>
                    {LEVELS.map(level => {
                      const cell = heatmap[`${domain}|${level}`]
                      return (
                        <td key={level} className={pctColor(cell?.percentage)}>
                          {cell ? `${cell.percentage}%` : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historical snapshots */}
      {historical_snapshots.map(snap => {
        const snapDomains = [...new Set(snap.domain_pyramid.map(r => r.domain))].sort()
        const snapHeatmap = {}
        for (const r of snap.domain_pyramid) snapHeatmap[`${r.domain}|${r.pyramid_level}`] = r
        return (
          <div key={snap.school_year} className="card" style={{ opacity: 0.85 }}>
            <h2 style={{ fontSize: 15, marginBottom: 4, color: '#555' }}>
              Schooljaar {snap.school_year}
              <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8, color: '#aaa' }}>historisch</span>
            </h2>
            {snapDomains.length === 0 ? (
              <p className="text-muted">Geen data opgeslagen voor dit schooljaar.</p>
            ) : (
              <div className="heatmap">
                <table>
                  <thead>
                    <tr>
                      <th>Domein</th>
                      {LEVELS.map(l => <th key={l}>{pyramidLabel(l)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {snapDomains.map(domain => (
                      <tr key={domain}>
                        <td>{domain}</td>
                        {LEVELS.map(level => {
                          const cell = snapHeatmap[`${domain}|${level}`]
                          return (
                            <td key={level} className={pctColor(cell?.percentage)}>
                              {cell ? `${cell.percentage}%` : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {snap.grades && snap.grades.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {snap.grades.map((g, i) => (
                  <span key={i} style={{
                    fontSize: 12, padding: '2px 8px', borderRadius: 4,
                    background: g.grade === 'expert' ? '#e8f5e9' : g.grade === 'beheerst' ? '#e8f0fc' : '#fff3e0',
                    color: g.grade === 'expert' ? '#2e7d32' : g.grade === 'beheerst' ? '#1a6ecc' : '#c07000',
                    fontWeight: 600,
                  }}>
                    {g.test_name}: {g.grade === 'expert' ? 'Expert' : g.grade === 'beheerst' ? 'Beheerst' : 'In Ontwikkeling'}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Session timeline */}
      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Overzicht per toetssessie</h2>
        {sessions.length === 0 ? (
          <p className="text-muted">Nog geen sessies.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Klas</th>
                <th>Totaal</th>
                <th>Beoordeling</th>
                <th>Per domein</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(sess => (
                <tr key={sess.session_id} style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/reports/session/${sess.session_id}?student=${id}`)}
                >
                  <td>
                    <span style={{ color: '#1a6ecc', textDecoration: 'underline' }}>
                      {new Date(sess.created_at).toLocaleDateString('nl-NL')}
                    </span>
                  </td>
                  <td>{sess.class_name}</td>
                  <td>
                    <strong>{sess.total_scored}</strong> / {sess.total_max}
                    {sess.total_max > 0 && (
                      <span className="text-muted" style={{ marginLeft: 6 }}>
                        ({Math.round(sess.total_scored / sess.total_max * 100)}%)
                      </span>
                    )}
                  </td>
                  <td>
                    {sess.grade ? <GradeBadge grade={sess.grade} /> : <span className="text-muted">—</span>}
                  </td>
                  <td>
                    {Object.entries(sess.domains).map(([dom, v]) => (
                      <span key={dom} style={{ marginRight: 10, fontSize: 13 }}>
                        <strong>{dom}</strong>: {v.scored}/{v.max}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
