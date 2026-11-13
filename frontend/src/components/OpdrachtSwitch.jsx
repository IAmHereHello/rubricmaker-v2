import { useState, useEffect } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import * as api from '../api.js'

// Opens the Grote opdracht version of a session page when the session's toets is a
// Grote opdracht, otherwise the normal page. `redirect(params)` sends opdracht
// sessions elsewhere instead (for pages that have no opdracht version).
export default function OpdrachtSwitch({ normal: Normal, opdracht: Opdracht, redirect }) {
  const params = useParams()
  const [kind, setKind] = useState(null)

  useEffect(() => {
    let alive = true
    setKind(null)
    api.getSession(params.id)
      .then(s => api.getTests().then(tests => {
        const t = tests.find(x => x.id === s.test_id)
        if (alive) setKind(t?.grading_method === 'opdracht' ? 'opdracht' : 'normal')
      }))
      .catch(() => { if (alive) setKind('normal') })
    return () => { alive = false }
  }, [params.id])

  if (!kind) return <div className="page">Laden...</div>
  if (kind === 'normal') return <Normal />
  if (redirect) return <Navigate to={redirect(params)} replace />
  return <Opdracht key={params.id} sessionId={parseInt(params.id)} />
}
