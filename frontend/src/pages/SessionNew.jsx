import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import * as api from '../api.js'

export default function SessionNew() {
  const [tests, setTests] = useState([])
  const [students, setStudents] = useState([])
  const [sessions, setSessions] = useState([])
  const [testId, setTestId] = useState('')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.getTests(), api.getStudents(), api.getSessions()])
      .then(([t, s, sess]) => {
        setTests(t)
        setStudents(s)
        setSessions(sess)
        if (t.length) setTestId(String(t[0].id))
      })
      .catch(() => setError('Fout bij laden van gegevens.'))
  }, [])

  const classes = [...new Set(students.map(s => s.class_name))].sort()

  useEffect(() => {
    if (classes.length && !className) setClassName(classes[0])
  }, [classes.join(',')])

  function sessionState(s) {
    if (s.total_count === 0 || s.graded_count < s.total_count) return 'grading'
    if (s.has_grading && s.review_count < s.student_count) return 'review'
    return 'complete'
  }

  const inProgress = sessions.filter(s => sessionState(s) !== 'complete')

  async function handleDelete(sess) {
    if (!window.confirm(`Sessie "${sess.test_name} – ${sess.class_name}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    try {
      await api.deleteSession(sess.id)
      setSessions(prev => prev.filter(s => s.id !== sess.id))
    } catch { setError('Sessie verwijderen mislukt.') }
  }

  async function start() {
    if (!testId || !className) { setError('Selecteer een toets en een klas.'); return }
    try {
      const session = await api.createSession({ test_id: parseInt(testId), class_name: className })
      navigate(`/sessions/${session.id}/grade`)
    } catch { setError('Sessie starten mislukt.') }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Nakijksessie starten</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {inProgress.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14, color: '#1e3a5f' }}>
            Lopende sessies
          </h2>
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Toets</th>
                <th>Klas</th>
                <th>Voortgang</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inProgress.map(sess => {
                const state = sessionState(sess)
                const progressLabel = state === 'review'
                  ? `Nakijken klaar – beoordelingsronde (${sess.review_count}/${sess.student_count})`
                  : sess.total_count === 0
                    ? 'Nog niet gestart'
                    : `${sess.graded_count} / ${sess.total_count} beoordeeld`
                const resumeUrl = state === 'review'
                  ? `/sessions/${sess.id}/review`
                  : `/sessions/${sess.id}/grade`
                return (
                  <tr key={sess.id}>
                    <td>{new Date(sess.created_at).toLocaleDateString('nl-NL')}</td>
                    <td>{sess.test_name}</td>
                    <td>{sess.class_name}</td>
                    <td>
                      <span style={{ color: state === 'review' ? '#1a6ecc' : sess.total_count === 0 ? '#888' : '#c07000', fontSize: 13 }}>
                        {progressLabel}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Link to={resumeUrl} className="btn btn-primary btn-sm">
                        Hervat →
                      </Link>
                      <button
                        className="btn btn-sm"
                        style={{ color: '#b00', background: 'none', border: '1px solid #ddd' }}
                        onClick={() => handleDelete(sess)}
                        title="Sessie verwijderen"
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: '#1e3a5f' }}>
          Nieuwe sessie
        </h2>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Toets</label>
          <select value={testId} onChange={e => setTestId(e.target.value)}>
            {tests.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 24 }}>
          <label>Klas</label>
          <select value={className} onChange={e => setClassName(e.target.value)}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn-primary" onClick={start} disabled={!testId || !className}>
          Nakijksessie starten →
        </button>
      </div>
    </div>
  )
}
