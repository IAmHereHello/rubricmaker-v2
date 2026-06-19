import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'

export default function ReportHome() {
  const [sessions, setSessions] = useState([])
  const [testMap, setTestMap] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getSessions(), api.getTests()])
      .then(([sess, tests]) => {
        setSessions(sess)
        const m = {}
        tests.forEach(t => { m[t.id] = t.name })
        setTestMap(m)
      })
      .catch(() => setError('Fout bij laden van rapporten.'))
  }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Rapporten</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 14 }}>Toetssessies</h2>
        {sessions.length === 0 ? (
          <p className="text-muted">Nog geen sessies beschikbaar.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Toets</th>
                <th>Klas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(sess => (
                <tr key={sess.id}>
                  <td>{new Date(sess.created_at).toLocaleDateString('nl-NL')}</td>
                  <td>{testMap[sess.test_id] || `Toets ${sess.test_id}`}</td>
                  <td>{sess.class_name}</td>
                  <td>
                    <Link to={`/reports/session/${sess.id}`} className="btn btn-secondary btn-sm">
                      Rapport bekijken →
                    </Link>
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
