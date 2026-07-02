import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import * as api from '../api.js'
import RouteBadge from '../components/RouteBadge.jsx'

export default function Inhalers() {
  const [sessions, setSessions] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [undoInfo, setUndoInfo] = useState(null)
  const undoTimerRef = useRef(null)

  useEffect(() => {
    Promise.all([api.getSessions(), api.getStudents()])
      .then(([sess, studs]) => { setSessions(sess); setStudents(studs) })
      .catch(() => setError('Fout bij laden van gegevens.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }, [])

  const studentsByClass = useMemo(() => {
    const map = {}
    for (const s of students) {
      if (!map[s.class_name]) map[s.class_name] = []
      map[s.class_name].push(s)
    }
    return map
  }, [students])

  const sessionsWithInhalers = useMemo(() => {
    return sessions
      .map(sess => {
        const classStudents = studentsByClass[sess.class_name] || []
        const inOrder = new Set(sess.student_order || [])
        const dismissed = new Set(sess.dismissed_inhalers || [])
        const applicableRoutes = new Set(sess.applicable_routes || [])
        const absent = classStudents.filter(s =>
          !inOrder.has(s.id) && !dismissed.has(s.id) && applicableRoutes.has(s.route)
        )
        return { ...sess, absentStudents: absent }
      })
      .filter(sess => sess.absentStudents.length > 0)
  }, [sessions, studentsByClass])

  async function handleDismiss(sessionId, studentId, studentName, testName) {
    try {
      await api.dismissInhaler(sessionId, studentId)
      setSessions(prev => prev.map(s =>
        s.id !== sessionId ? s : { ...s, dismissed_inhalers: [...(s.dismissed_inhalers || []), studentId] }
      ))
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      const timer = setTimeout(() => setUndoInfo(null), 5000)
      undoTimerRef.current = timer
      setUndoInfo({ sessionId, studentId, studentName, testName })
    } catch {
      setError('Verwijderen mislukt.')
    }
  }

  async function handleUndo() {
    if (!undoInfo) return
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    const { sessionId, studentId } = undoInfo
    setUndoInfo(null)
    try {
      await api.undismissInhaler(sessionId, studentId)
      setSessions(prev => prev.map(s =>
        s.id !== sessionId ? s : { ...s, dismissed_inhalers: (s.dismissed_inhalers || []).filter(id => id !== studentId) }
      ))
    } catch {
      setError('Ongedaan maken mislukt.')
    }
  }

  if (loading) return <div className="page"><p>Laden...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Inhalers</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {undoInfo && (
        <div style={{
          background: '#1e3a5f', color: '#fff', borderRadius: 6, padding: '10px 16px',
          marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14 }}>
            <strong>{undoInfo.studentName}</strong> verwijderd uit {undoInfo.testName}
          </span>
          <button
            onClick={handleUndo}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 4, padding: '4px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Ongedaan maken
          </button>
        </div>
      )}

      {sessionsWithInhalers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          Geen leerlingen te herkansen.
        </div>
      ) : (
        sessionsWithInhalers.map(sess => (
          <div key={sess.id} className="card" style={{ marginBottom: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1e3a5f' }}>{sess.test_name}</span>
              <span className="text-muted" style={{ marginLeft: 10 }}>
                Klas {sess.class_name} · {new Date(sess.created_at).toLocaleDateString('nl-NL')}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Naam</th>
                  <th>Route</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sess.absentStudents.map(student => (
                  <tr key={student.id}>
                    <td style={{ fontWeight: 500 }}>{student.name}</td>
                    <td><RouteBadge route={student.route} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                          to={`/sessions/${sess.id}/inhaler/${student.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          Nakijken →
                        </Link>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDismiss(sess.id, student.id, student.name, sess.test_name)}
                        >
                          Verwijderen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
