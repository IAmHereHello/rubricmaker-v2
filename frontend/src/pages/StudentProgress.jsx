import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'

const LEVELS = ['reproductie', 'verbinding', 'reflectie']

function pctColor(pct) {
  if (pct === null || pct === undefined) return 'cell-empty'
  if (pct >= 75) return 'cell-green'
  if (pct >= 55) return 'cell-orange'
  return 'cell-red'
}

export default function StudentProgress() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getStudentProgress(id)
      .then(setData)
      .catch(() => setError('Fout bij laden van voortgang.'))
  }, [id])

  if (!data) return <div className="page">{error || 'Laden...'}</div>

  const { student, domain_pyramid, sessions } = data

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
        <Link to="/students" className="btn btn-secondary">← Terug</Link>
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
                  {LEVELS.map(l => <th key={l}>{l}</th>)}
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
                <th>Per domein</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(sess => (
                <tr key={sess.session_id}>
                  <td>{new Date(sess.created_at).toLocaleDateString('nl-NL')}</td>
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
