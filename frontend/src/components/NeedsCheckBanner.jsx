import { useState, useEffect } from 'react'
import * as api from '../api.js'

// Students whose result changed through a rubric update from a colleague ("te controleren").
export default function NeedsCheckBanner({ sessionId, students, onSelect }) {
  const [ids, setIds] = useState([])

  useEffect(() => {
    if (!sessionId) return
    api.getNeedsCheck().then(m => setIds(m[String(sessionId)] || [])).catch(() => {})
  }, [sessionId])

  if (!ids.length) return null
  const byId = Object.fromEntries((students || []).map(s => [s.id, s]))

  async function checked(sid) {
    try { await api.markStudentChecked(sessionId, sid); setIds(l => l.filter(x => x !== sid)) } catch {}
  }
  async function allChecked() {
    try { await api.markSessionChecked(sessionId); setIds([]) } catch {}
  }

  return (
    <div className="alert" style={{ background: '#fff7e6', color: '#7a4a00', border: '1px solid #f3d19c' }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        Te controleren: {ids.length} {ids.length === 1 ? 'leerling' : 'leerlingen'}
      </div>
      <div style={{ fontSize: 13, marginBottom: 8 }}>
        Door een rubric-update van een collega is het resultaat veranderd (of een score afgetopt). Bekijk het resultaat en vink af als het klopt.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ids.map(sid => (
          <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #f3d19c', borderRadius: 14, padding: '2px 4px 2px 10px', fontSize: 13 }}>
            {onSelect && byId[sid]
              ? <button className="btn-link" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1e3a5f', textDecoration: 'underline' }} onClick={() => onSelect(sid)}>{byId[sid].name}</button>
              : (byId[sid]?.name || `Leerling ${sid}`)}
            <button className="btn btn-secondary btn-sm" style={{ padding: '1px 8px' }} onClick={() => checked(sid)}>Gecontroleerd</button>
          </span>
        ))}
        {ids.length > 1 && <button className="btn btn-secondary btn-sm" onClick={allChecked}>Alles gecontroleerd</button>}
      </div>
    </div>
  )
}
