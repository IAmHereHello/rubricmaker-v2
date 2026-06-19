import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api.js'

export default function SessionNew() {
  const [tests, setTests] = useState([])
  const [students, setStudents] = useState([])
  const [testId, setTestId] = useState('')
  const [className, setClassName] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([api.getTests(), api.getStudents()]).then(([t, s]) => {
      setTests(t)
      setStudents(s)
      if (t.length) setTestId(String(t[0].id))
    }).catch(() => setError('Fout bij laden van gegevens.'))
  }, [])

  const classes = [...new Set(students.map(s => s.class_name))].sort()

  useEffect(() => {
    if (classes.length && !className) setClassName(classes[0])
  }, [classes.join(',')])

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

      <div className="card" style={{ maxWidth: 480 }}>
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
