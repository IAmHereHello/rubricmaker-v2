import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as api from '../api.js'

const ROUTES = ['oranje', 'geel', 'blauw']

function pctColor(pct) {
  if (pct === null || pct === undefined) return 'cell-empty'
  if (pct >= 75) return 'cell-green'
  if (pct >= 55) return 'cell-orange'
  return 'cell-red'
}

export default function ClassOverview() {
  const { class_name } = useParams()
  const [route, setRoute] = useState('oranje')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.getClassProgress(class_name, route)
      .then(d => { setData(d); setError('') })
      .catch(() => setError('Fout bij laden van klasoverzicht.'))
      .finally(() => setLoading(false))
  }, [class_name, route])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Klasoverzicht — {class_name}</h1>
        <Link to="/students" className="btn btn-secondary">← Terug</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Route filter */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>Route:</span>
        {ROUTES.map(r => (
          <button
            key={r}
            className={`btn btn-sm badge badge-${r}`}
            style={{
              opacity: route === r ? 1 : .5,
              border: route === r ? '2px solid #1e3a5f' : '2px solid transparent',
              cursor: 'pointer',
            }}
            onClick={() => setRoute(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {loading && <div className="card text-muted">Laden...</div>}

      {!loading && data && (
        <div className="card">
          {data.students.length === 0 ? (
            <p className="text-muted">Geen leerlingen gevonden voor route {route}.</p>
          ) : data.domain_pyramid_keys.length === 0 ? (
            <p className="text-muted">Nog geen beoordeelde toetsen voor deze route.</p>
          ) : (
            <div className="heatmap">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 160 }}>Leerling</th>
                    {data.domain_pyramid_keys.map(k => (
                      <th key={`${k.domain}|${k.pyramid_level}`} style={{ minWidth: 90, textAlign: 'center', fontWeight: 600 }}>
                        <div>{k.domain}</div>
                        <div style={{ fontWeight: 400, fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>{k.pyramid_level}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.data.map(row => (
                    <tr key={row.student.id}>
                      <td>
                        <Link
                          to={`/students/${row.student.id}/progress`}
                          style={{ color: '#1e3a5f', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {row.student.name}
                        </Link>
                      </td>
                      {data.domain_pyramid_keys.map(k => {
                        const cellKey = `${k.domain}|${k.pyramid_level}`
                        const pct = row.scores[cellKey]
                        return (
                          <td key={cellKey} className={pctColor(pct)} style={{ textAlign: 'center' }}>
                            {pct !== null && pct !== undefined ? `${pct}%` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Legend */}
          {data.domain_pyramid_keys.length > 0 && (
            <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13 }}>
              <span><span className="badge cell-green" style={{ borderRadius: 4 }}>≥ 75%</span> Goed</span>
              <span><span className="badge cell-orange" style={{ borderRadius: 4 }}>55–74%</span> Voldoende</span>
              <span><span className="badge cell-red" style={{ borderRadius: 4 }}>&lt; 55%</span> Onvoldoende</span>
              <span><span className="badge cell-empty" style={{ borderRadius: 4 }}>—</span> Geen data</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
